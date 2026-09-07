/**
 * eval/deterministic.ts — the CI subset of the golden suite (design.md Phase 8;
 * evaluation.md § Regression Approach: "a fast subset … G3 suggestion, G11
 * immunity, G15 stat value, tool-efficiency asserts").
 *
 * Owned by: phase "Eval" / assembly seam.
 *
 * WHAT THIS IS
 * ------------
 * The deterministic subset is everything that can be asserted WITHOUT a live
 * Sonnet call. It runs in Vitest on every PR (eval/deterministic.test.ts) and is
 * runnable from the CLI via `tsx eval/run.ts --deterministic`.
 *
 * HOW IT STAYS DETERMINISTIC ("MOCKED model client / pure tools")
 * -------------------------------------------------------------------
 * Each case is driven through the REAL agent runtime but with a *scripted*
 * model client injected in place of the model. Two providers are exercised over
 * the SAME provider-agnostic plans (T1): the Anthropic content-block path
 * (`runOakWith` + a scripted `messages.stream`) AND the native Grok Responses
 * path (`runWithProvider` + a scripted `responses.create`) — Grok is the
 * production default (`DEFAULT_MODEL_KEY`), so its stream adaptation, the
 * single-shot `function_call_arguments.done` fallback, and the echo/.flat()
 * transcript logic are regression-gated through the real loop, not just unit
 * tests. The scripted client:
 *   1. On its first turn, emits the exact `tool_use` block(s) a correct agent
 *      would issue for the case (e.g. one `query_pokedex` call).
 *   2. The runtime dispatches those calls against the REAL tool layer + the
 *      fixture SQLite DB — so the tool outputs, the tool-call trace, and the
 *      tool-efficiency guard are all genuinely exercised (no hard-coded data).
 *   3. On its second turn, it reads the real `tool_result` blocks the runtime
 *      fed back, and composes the `submit_answer` payload DIRECTLY FROM THAT
 *      REAL TOOL DATA (the candidate count, the resolved suggestion, the "immune"
 *      verdict, the computed stat value). Nothing the structural assertions check
 *      is faked — only the natural-language authoring the LLM would otherwise do
 *      is replaced by a fixed template.
 *
 * Because the answer text is derived from live tool output, a regression in the
 * tools (e.g. Flying stops being immune to Ground, or compute_stat stops
 * returning 169) makes the composed answer fail the structural assertion — which
 * is the whole point of the deterministic subset.
 *
 * No real model client is ever constructed here (a fake is injected into each
 * provider), so this module never reaches the network.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

import { normalizeBoxSpecies } from "@/agent/box-build";
import { GrokProvider } from "@/agent/providers/grok-provider";
import type { GrokResponsesClientLike } from "@/agent/providers/grok-provider";
import {
  runOakWith,
  runWithProvider,
  type AnthropicClientLike,
  type MessageStreamLike,
} from "@/agent/runtime";
import type { AgentContext } from "@/agent/types";
import type {
  Candidates,
  LookupBoxOutput,
  OakAnswer,
  QueryPokedexResult,
  ResolveEntityOutput,
  TypeMatchupsDetail,
  TypeName,
} from "@/agent/schemas";
import type { TeamMember } from "@/data/teams/team-schema";

import { runStructural, type AssertResult, type GoldenCase } from "./judge";

// ---------------------------------------------------------------------------
// Scripted-client plumbing
// ---------------------------------------------------------------------------

/** A `tool_use` block as the runtime expects to read it off an assistant turn. */
interface ToolUseBlockLike {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/**
 * A deterministic plan for one case: the read-phase tool calls, plus a
 * `compose` that builds the final answer from the (real) tool outputs, keyed by
 * tool name.
 */
interface DeterministicPlan {
  reads: Array<{ name: string; input: unknown }>;
  compose: (outputs: Record<string, unknown>) => OakAnswer;
}

/** Build a minimal-but-valid Anthropic.Message carrying the given blocks. */
function scriptedMessage(content: unknown[]): Anthropic.Message {
  return {
    id: "msg_deterministic",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content,
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

/**
 * Pull the real tool outputs out of the `tool_result` blocks the runtime placed
 * in the last user message, keyed by the tool name (resolved via the id map the
 * read phase recorded).
 */
function extractToolOutputs(
  params: Anthropic.MessageStreamParams,
  idToName: Map<string, string>,
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  const last = params.messages[params.messages.length - 1];
  const content = last?.content;
  if (!Array.isArray(content)) return outputs;

  for (const block of content) {
    const b = block as {
      type?: string;
      tool_use_id?: string;
      content?: unknown;
    };
    if (b.type !== "tool_result" || !b.tool_use_id) continue;
    const name = idToName.get(b.tool_use_id);
    if (!name) continue;
    let parsed: unknown = b.content;
    if (typeof b.content === "string") {
      try {
        parsed = JSON.parse(b.content);
      } catch {
        parsed = b.content;
      }
    }
    outputs[name] = parsed;
  }
  return outputs;
}

/** Wrap a scripted message in a (no-events) MessageStreamLike. */
function streamOf(message: Anthropic.Message): MessageStreamLike {
  return {
    // No incremental events are needed for the deterministic eval — the runtime
    // just reads finalMessage(). An empty iterator keeps the for-await a no-op.
    [Symbol.asyncIterator](): AsyncIterator<Anthropic.RawMessageStreamEvent> {
      return { next: () => Promise.resolve({ done: true, value: undefined }) };
    },
    finalMessage: () => Promise.resolve(message),
  };
}

/**
 * A scripted Anthropic client that replays a {@link DeterministicPlan}: read
 * phase first, then a single `submit_answer` composed from the real tool data.
 */
function makeScriptedClient(plan: DeterministicPlan): AnthropicClientLike {
  const idToName = new Map<string, string>();
  let call = 0;

  return {
    messages: {
      stream(params: Anthropic.MessageStreamParams): MessageStreamLike {
        call += 1;

        // Turn 1 — issue the planned read tool calls (real dispatch follows).
        if (call === 1 && plan.reads.length > 0) {
          const content: ToolUseBlockLike[] = plan.reads.map((read, i) => {
            const id = `read-${i}`;
            idToName.set(id, read.name);
            return { type: "tool_use", id, name: read.name, input: read.input };
          });
          return streamOf(scriptedMessage(content));
        }

        // Turn 2 — compose submit_answer from the real tool outputs.
        const outputs = extractToolOutputs(params, idToName);
        let answer: OakAnswer;
        try {
          answer = plan.compose(outputs);
        } catch (err) {
          // A compose throw means the tool output wasn't the expected shape;
          // surface it as a clearly-failing answer rather than a transport fault.
          answer = {
            status: "insufficient_data",
            answer_markdown: `deterministic compose failed: ${String(err)}`,
            reasoning_markdown: "",
            citations: [],
            inferences: [],
            generation_basis: { generation: "champions", fallback: false },
          };
        }
        return streamOf(
          scriptedMessage([
            {
              type: "tool_use",
              id: "submit",
              name: "submit_answer",
              input: answer,
            },
          ]),
        );
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Scripted native-Grok client (T1 — drive the production-default provider
// through the REAL loop, not only the Anthropic path). Same DeterministicPlan,
// but shaped as xAI Responses-API stream events feeding grok-provider.ts.
// ---------------------------------------------------------------------------

type RStreamEvent = OpenAI.Responses.ResponseStreamEvent;

/**
 * Token usage the scripted Grok stream reports. `normalizeUsage`
 * (grok-provider.ts) reads exactly these three fields.
 */
const GROK_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  output_tokens_details: { reasoning_tokens: 0 },
};

/**
 * The minimal subset of Responses-API stream events the scripted client emits —
 * only the fields `adaptGrokStream` actually reads. Typed so the file stays
 * `any`-free; a single localized `as unknown as RStreamEvent` cast rides at the
 * yield seam (mirroring the provider's own casts).
 */
type ScriptedGrokEvent =
  | {
      type: "response.output_item.added";
      output_index: number;
      sequence_number: number;
      item: {
        type: "function_call";
        id: string;
        call_id: string;
        name: string;
        arguments: string;
        status: string;
      };
    }
  | {
      type: "response.function_call_arguments.done";
      output_index: number;
      item_id: string;
      name: string;
      sequence_number: number;
      arguments: string;
    }
  | {
      type: "response.completed";
      sequence_number: number;
      response: { output: unknown[]; usage: typeof GROK_USAGE };
    };

/** A completed function_call item, as it appears in `response.completed.output`. */
function grokFnCall(callId: string, name: string, args: string) {
  return {
    type: "function_call",
    id: `fc-${callId}`,
    call_id: callId,
    name,
    arguments: args,
    status: "completed",
  };
}

/**
 * A single-shot tool call as two Responses events: `output_item.added` (the
 * function_call in-progress) → `function_call_arguments.done` carrying the WHOLE
 * argument string. Omitting the incremental `...delta` is the
 * production-representative xAI shape, and deliberately drives the
 * `function_call_arguments.done` fallback → AnswerMarkdownExtractor.
 */
function grokCallEvents(
  outputIndex: number,
  callId: string,
  name: string,
  args: string,
  startSeq: number,
): ScriptedGrokEvent[] {
  return [
    {
      type: "response.output_item.added",
      output_index: outputIndex,
      sequence_number: startSeq,
      item: {
        type: "function_call",
        id: `fc-${callId}`,
        call_id: callId,
        name,
        arguments: "",
        status: "in_progress",
      },
    },
    {
      type: "response.function_call_arguments.done",
      output_index: outputIndex,
      item_id: `fc-${callId}`,
      name,
      sequence_number: startSeq + 1,
      arguments: args,
    },
  ];
}

/** The terminal `response.completed` carrying the echoed output items + usage. */
function grokCompleted(output: unknown[], seq: number): ScriptedGrokEvent {
  return {
    type: "response.completed",
    sequence_number: seq,
    response: { output, usage: GROK_USAGE },
  };
}

/** Replay scripted events as a fresh Responses stream (a consumed generator can't be reused). */
function grokStream(events: ScriptedGrokEvent[]): AsyncIterable<RStreamEvent> {
  return (async function* () {
    for (const e of events) yield e as unknown as RStreamEvent;
  })();
}

/**
 * Pull the real tool outputs out of the `function_call_output` items the loop
 * placed in `body.input` (the flattened transcript), keyed by tool name via the
 * id map the read phase recorded. The Grok twin of {@link extractToolOutputs}.
 */
function grokExtractToolOutputs(
  body: OpenAI.Responses.ResponseCreateParamsStreaming,
  idToName: Map<string, string>,
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  const input = body.input;
  if (!Array.isArray(input)) return outputs;

  for (const item of input) {
    const it = item as { type?: string; call_id?: string; output?: unknown };
    if (it.type !== "function_call_output" || !it.call_id) continue;
    const name = idToName.get(it.call_id);
    if (!name) continue;
    let parsed: unknown = it.output;
    if (typeof it.output === "string") {
      try {
        parsed = JSON.parse(it.output);
      } catch {
        parsed = it.output;
      }
    }
    outputs[name] = parsed;
  }
  return outputs;
}

/**
 * A scripted native-Grok client that replays a {@link DeterministicPlan}: read
 * phase first (a reasoning item echoed alongside each function_call), then a
 * single `submit_answer` composed from the real tool data read off `body.input`.
 */
function makeScriptedGrokClient(plan: DeterministicPlan): GrokResponsesClientLike {
  const idToName = new Map<string, string>();
  let call = 0;

  return {
    responses: {
      create(
        body: OpenAI.Responses.ResponseCreateParamsStreaming,
      ): AsyncIterable<RStreamEvent> {
        call += 1;

        // Turn 1 — issue the planned read tool calls (real dispatch follows).
        if (call === 1 && plan.reads.length > 0) {
          // An encrypted reasoning item echoed back exercises the reasoning
          // round-trip + the depth-1 `.flat()` of the echoed output[] array.
          const reasoningItem = {
            type: "reasoning",
            id: "rs_1",
            encrypted_content: "enc",
            summary: [],
          };
          const events: ScriptedGrokEvent[] = [];
          const outputItems: unknown[] = [reasoningItem];
          plan.reads.forEach((read, i) => {
            const callId = `call-${i}`;
            idToName.set(callId, read.name);
            const args = JSON.stringify(read.input);
            events.push(
              ...grokCallEvents(i, callId, read.name, args, events.length + 1),
            );
            outputItems.push(grokFnCall(callId, read.name, args));
          });
          events.push(grokCompleted(outputItems, events.length + 1));
          return grokStream(events);
        }

        // Turn 2 — compose submit_answer from the real tool outputs.
        const outputs = grokExtractToolOutputs(body, idToName);
        let answer: OakAnswer;
        try {
          answer = plan.compose(outputs);
        } catch (err) {
          answer = {
            status: "insufficient_data",
            answer_markdown: `deterministic compose failed: ${String(err)}`,
            reasoning_markdown: "",
            citations: [],
            inferences: [],
            generation_basis: { generation: "champions", fallback: false },
          };
        }
        const args = JSON.stringify(answer);
        const events: ScriptedGrokEvent[] = [
          ...grokCallEvents(0, "call-submit", "submit_answer", args, 1),
          grokCompleted(
            [grokFnCall("call-submit", "submit_answer", args)],
            3,
          ),
        ];
        return grokStream(events);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Compose helpers
// ---------------------------------------------------------------------------

const CHAMPIONS_BASIS: OakAnswer["generation_basis"] = {
  generation: "champions",
  fallback: false,
};

/** Is this a successful query_pokedex result (vs. an error/unresolved shape)? */
function isQueryResult(o: unknown): o is QueryPokedexResult {
  return (
    typeof o === "object" &&
    o !== null &&
    Array.isArray((o as { results?: unknown }).results)
  );
}

/** Map a query_pokedex result to the OakAnswer `candidates` block. */
function candidatesFrom(q: QueryPokedexResult): Candidates {
  return {
    total_count: q.total_count,
    truncated: q.truncated,
    sort: q.sort,
    shown: q.results.map((r) => ({
      name: r.display_name,
      dex_number: r.national_dex_number,
      sprite_url: r.sprite_url,
      types: r.types as TypeName[],
      base_stats: r.base_stats,
      ability: r.abilities.slot1,
    })),
  };
}

/** Total match count for a query result, or 0 for a non-result shape. */
function totalOf(o: unknown): number {
  return isQueryResult(o) ? o.total_count : 0;
}

/** Is this a successful lookup_box result? */
function isLookupBoxOutput(o: unknown): o is LookupBoxOutput {
  return (
    typeof o === "object" &&
    o !== null &&
    Array.isArray((o as { results?: unknown }).results)
  );
}

const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

function boxMember(species: string): TeamMember {
  return {
    species,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { ...ZERO_EVS },
    ivs: { ...MAX_IVS },
    tera_type: null,
    level: 50,
  };
}

// ---------------------------------------------------------------------------
// Per-case deterministic plans (only the `deterministic: true` cases)
// ---------------------------------------------------------------------------

const PLANS: Record<string, DeterministicPlan> = {
  // G1 — multi-move intersection in ONE query_pokedex call (no per-mon fetches).
  G1: {
    reads: [
      {
        name: "query_pokedex",
        input: { moves: ["trick-room", "will-o-wisp"], limit: 50 },
      },
    ],
    compose: (o) => {
      const q = o.query_pokedex;
      const total = totalOf(q);
      return {
        status: "answered",
        answer_markdown: `**${total}** Pokémon can learn both Trick Room and Will-O-Wisp in Champions.`,
        reasoning_markdown:
          "Intersected the Champions learnsets for both moves in a single query — only Pokémon that learn BOTH appear.",
        candidates: isQueryResult(q) ? candidatesFrom(q) : undefined,
        citations: [
          {
            source: "learnset/trick-room",
            detail: "Champions learnset, intersected",
          },
          {
            source: "learnset/will-o-wisp",
            detail: "Champions learnset, intersected",
          },
        ],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G3 — misspelling resolves to a suggestion (resolve_entity quality).
  G3: {
    reads: [
      {
        name: "resolve_entity",
        input: { query: "Will-o-Whisp", kind: "move" },
      },
    ],
    compose: (o) => {
      const r = o.resolve_entity as ResolveEntityOutput | undefined;
      const matches = r?.matches ?? [];
      const top = matches[0]?.display_name ?? "(no match)";
      return {
        status: "clarification_needed",
        answer_markdown: `I couldn't find a move with that exact name — did you mean **${top}**? If so, I'll pull the list of Pokémon that can learn it.`,
        reasoning_markdown:
          "The name didn't match a known move; offering the closest valid match rather than returning a silent empty result (BR-9).",
        suggestions: matches.map((m) => m.display_name),
        citations: [],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G5 — combined type + ability + move filter in ONE query_pokedex call.
  G5: {
    reads: [
      {
        name: "query_pokedex",
        input: {
          types: ["fire"],
          abilities: ["flash-fire"],
          moves: ["will-o-wisp"],
        },
      },
    ],
    compose: (o) => {
      const q = o.query_pokedex;
      const total = totalOf(q);
      return {
        status: "answered",
        answer_markdown: `**${total}** Fire-type Pokémon with Flash Fire can learn Will-O-Wisp in Champions.`,
        reasoning_markdown:
          "Single query intersecting type, ability, and Champions learnset — no per-Pokémon fetching.",
        candidates: isQueryResult(q) ? candidatesFrom(q) : undefined,
        citations: [
          {
            source: "learnset/will-o-wisp",
            detail: "Champions learnset filter",
          },
        ],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G6 — superlative via sort, not N fetches.
  G6: {
    reads: [
      {
        name: "query_pokedex",
        input: { sort_by: "speed", order: "desc", limit: 20 },
      },
    ],
    compose: (o) => {
      const q = o.query_pokedex;
      const top = isQueryResult(q) ? q.results[0]?.display_name : undefined;
      return {
        status: "answered",
        answer_markdown:
          `Ranked by base **speed** (descending).` +
          (top ? ` Fastest in the index: **${top}**.` : ""),
        reasoning_markdown:
          "Sorted the Pokédex index by base speed — a ranked superlative query, no per-Pokémon fetching.",
        candidates: isQueryResult(q) ? candidatesFrom(q) : undefined,
        citations: [
          { source: "Pokédex index", detail: "sorted by base speed (desc)" },
        ],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G8 — type + stat threshold + move filter in ONE query_pokedex call.
  G8: {
    reads: [
      {
        name: "query_pokedex",
        input: {
          types: ["fire"],
          stat_filters: [{ stat: "speed", op: ">", value: 100 }],
          moves: ["will-o-wisp"],
        },
      },
    ],
    compose: (o) => {
      const q = o.query_pokedex;
      const total = totalOf(q);
      return {
        status: "answered",
        answer_markdown: `**${total}** Fire-type Pokémon with base Speed over 100 can learn Will-O-Wisp in Champions.`,
        reasoning_markdown:
          "One combined query over type + a Speed threshold + the Champions learnset.",
        candidates: isQueryResult(q) ? candidatesFrom(q) : undefined,
        citations: [
          {
            source: "learnset/will-o-wisp",
            detail: "Champions learnset filter",
          },
        ],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G11 — immunity must be reported as immune (0×), derived from the type chart.
  G11: {
    reads: [{ name: "get_type_matchups", input: { types: ["ground"] } }],
    compose: (o) => {
      const t = o.get_type_matchups as TypeMatchupsDetail | undefined;
      const noEffect = t?.offensive?.no_effect_against ?? [];
      const flyingImmune = noEffect.includes("flying");
      const verdict = flyingImmune
        ? "No — **Flying is immune (0×) to Ground**: Ground deals zero damage to Flying. That is a full immunity, not a partial resistance."
        : "Flying is **not immune** to Ground in the current type chart.";
      return {
        status: "answered",
        answer_markdown: verdict,
        reasoning_markdown:
          "Read the Ground type's offensive profile from the latest type chart; Flying appears under no_effect_against (0×).",
        citations: [
          {
            source: "type/ground",
            detail: "Ground has no effect (0×) on Flying",
          },
        ],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G15 — exact Champions Speed from compute_stat (32 Stat Points, Jolly).
  G15: {
    reads: [
      {
        name: "compute_stat",
        input: {
          base_stat: 102,
          ev: 32,
          nature_effect: "boosted",
        },
      },
    ],
    compose: (o) => {
      const c = o.compute_stat as
        | { value?: number; breakdown?: string }
        | undefined;
      const value = c?.value;
      return {
        status: "answered",
        answer_markdown: `Garchomp's Speed is **${value}** at Level 50 with 32 Speed Stat Points and a Jolly (+Speed) nature.`,
        reasoning_markdown:
          "Garchomp's base Speed is 102. Champions uses Stat Points (IVs fixed at 31, everything Level 50); compute_stat applies the exact formula.",
        damage_calc: {
          assumptions: {
            level: 50,
            stat_points: 32,
            iv: 31,
            nature: "Jolly (+Spe)",
          },
          result: { stat: "speed", value: value ?? 0 },
          is_estimate: true,
          breakdown: c?.breakdown ?? "",
        },
        citations: [{ source: "pokemon/garchomp", detail: "base Speed 102" }],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // G17 — off-roster / other-game decline (Excadrill is not on the Champions roster).
  G17: {
    reads: [
      {
        name: "resolve_entity",
        input: { query: "Excadrill", kind: "pokemon" },
      },
    ],
    compose: (o) => {
      const r = o.resolve_entity as ResolveEntityOutput | undefined;
      const matches = r?.matches ?? [];
      return {
        status: "answered",
        answer_markdown:
          matches.length === 0
            ? `**Excadrill** is **not in the Champions roster**, and Oak covers Pokémon Champions only — I don't have Gen 5 facts for it. Ask me about a Champions-legal species instead.`
            : `**Excadrill** is **not in the Champions roster**. Oak covers Pokémon Champions only and cannot answer Gen 5 questions.`,
        reasoning_markdown:
          "resolve_entity against the Champions index did not find Excadrill (or only a near-miss). Decline other-game / off-roster questions by name; do not invent Gen-5 facts.",
        citations: [],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },

  // -------------------------------------------------------------------------
  // Team-from-box (G61) — one lookup_box over a pasted owned list that
  // includes Mega Kangaskhan. Keep the named form even if the fixture (or
  // live index) has no learnset / no row; never call removed wiki/SQL tools.
  // -------------------------------------------------------------------------

  G61: {
    reads: [
      {
        name: "lookup_box",
        input: {
          names: [
            "Mega Kangaskhan",
            "Garchomp",
            "Farigiraf",
            "Ninetales",
            "Talonflame",
            "Tauros",
          ],
        },
      },
    ],
    compose: (o) => {
      const KEEP = normalizeBoxSpecies("Mega Kangaskhan");
      const results = isLookupBoxOutput(o.lookup_box)
        ? o.lookup_box.results
        : [];
      const slugOf = (r: (typeof results)[number]): string =>
        r.found
          ? normalizeBoxSpecies(r.pokemon.display_name)
          : normalizeBoxSpecies(r.query);
      // Named form stays even on a miss or empty/unavailable learnset
      // (BOX-AC-1.2 / BOX-BR-2). Inspect each row; do not drop or substitute.
      const members: TeamMember[] = [boxMember(KEEP)];
      const seen = new Set<string>([KEEP]);
      for (const r of results) {
        if (members.length >= 6) break;
        const slug = slugOf(r);
        if (!slug) continue;
        if (slug === KEEP) continue;
        if (!r.found) continue;
        if (seen.has(slug)) continue;
        seen.add(slug);
        members.push(boxMember(slug));
      }
      const warning =
        "Learnset unavailable for this form in this scope; species kept because you named it.";
      return {
        status: "answered",
        answer_markdown: `Keeping **${KEEP}** on the proposed team with a warning: ${warning}`,
        reasoning_markdown:
          "One lookup_box call over the pasted names. Mega Kangaskhan is named-for-party, so a missing or empty learnset is a warning, not a drop or substitute.",
        proposed_team: {
          name: "Box party",
          format: "champions",
          members,
        },
        proposed_team_warnings: [
          {
            code: "learnset_unavailable",
            message: warning,
            slot: 0,
          },
        ],
        citations: [],
        inferences: [],
        generation_basis: CHAMPIONS_BASIS,
      };
    },
  },
};

/** Case IDs that have a registered deterministic plan. */
export const PLANNED_CASE_IDS: readonly string[] = Object.keys(PLANS);

/**
 * Read-only accessor for a plan's read-phase `query` strings, keyed by case
 * ID. Champions-first plans do not issue SQL; kept so tests can inspect any
 * remaining query-shaped reads without exposing the function-valued `PLANS` map.
 */
export function planQueries(caseId: string): string[] {
  const plan = PLANS[caseId];
  if (!plan) return [];
  return plan.reads
    .map((r) => (r.input as { query?: unknown }).query)
    .filter((q): q is string => typeof q === "string");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** First (or only) user input of a case. Deterministic cases are single-turn. */
function primaryInput(gc: GoldenCase): string {
  return Array.isArray(gc.input) ? (gc.input[0] ?? "") : gc.input;
}

/**
 * Which scripted model transport to drive a case through. Both replay the SAME
 * {@link DeterministicPlan} over the real loop + real tools; only the wire shape
 * differs. `"grok"` covers the production default (`DEFAULT_MODEL_KEY`) — T1.
 */
export type DeterministicProvider = "anthropic" | "grok";

/**
 * Drive one plan through the real runtime with the scripted transport for the
 * chosen provider, collecting the tool-call trace. The Anthropic path injects a
 * fake `messages.stream` via `runOakWith`; the Grok path injects a fake
 * `responses.create` into the NATIVE `GrokProvider` via `runWithProvider`.
 */
function driveCase(
  plan: DeterministicPlan,
  input: string,
  ctx: AgentContext,
  provider: DeterministicProvider,
  onTool: (tool: string) => void,
): Promise<OakAnswer> {
  if (provider === "grok") {
    const grok = new GrokProvider(
      { apiModelId: "grok-4.3", apiKey: "test" },
      makeScriptedGrokClient(plan),
    );
    return runWithProvider(grok, input, [], ctx, (event) => onTool(event.tool));
  }
  return runOakWith(
    makeScriptedClient(plan),
    input,
    [],
    ctx,
    (event) => onTool(event.tool),
  );
}

/**
 * Run the deterministic subset against the supplied {@link AgentContext} (which
 * must be bound to the fixture DB — see eval/fixtures/seed-fixture-db.ts).
 *
 * For each case: drive the real runtime with a scripted (mocked) model client
 * for `provider` + the real tool layer, then apply the shared structural
 * assertions (runStructural — the same checks the judged suite uses). No LLM is
 * called. `provider` defaults to `"anthropic"`; the CI gate + CLI run BOTH so
 * the production-default Grok path is regression-covered through the loop (T1).
 *
 * A case without a registered plan is reported as a failure (so the subset can
 * never silently shrink), not skipped.
 */
export async function runDeterministic(
  cases: GoldenCase[],
  ctx: AgentContext,
  provider: DeterministicProvider = "anthropic",
): Promise<AssertResult[]> {
  const results: AssertResult[] = [];

  for (const gc of cases) {
    const plan = PLANS[gc.id];

    if (!plan) {
      results.push({
        caseId: gc.id,
        pass: false,
        failures: [
          `no deterministic plan registered for ${gc.id} — add one to eval/deterministic.ts PLANS or remove deterministic:true from the case`,
        ],
        answer: {
          status: "insufficient_data",
          answer_markdown: "",
          reasoning_markdown: "",
          citations: [],
          inferences: [],
          generation_basis: CHAMPIONS_BASIS,
        },
      });
      continue;
    }

    const toolCalls: string[] = [];
    // Per-case scope override (parity with the judged harness): a case that needs
    // a non-default scope sets gc.mode; input text does not drive scope here.
    const caseCtx: AgentContext = { ...ctx, mode: gc.mode ?? ctx.mode };
    const answer = await driveCase(
      plan,
      primaryInput(gc),
      caseCtx,
      provider,
      (tool) => toolCalls.push(tool),
    );

    const failures = runStructural(answer, gc, toolCalls);
    results.push({
      caseId: gc.id,
      pass: failures.length === 0,
      failures,
      answer,
    });
  }

  return results;
}
