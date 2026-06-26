/**
 * Agent runtime — `runPokebot` (design.md § Agent runtime; agent-design
 * integration.md § Invocation Signature). Phase 5.
 *
 * Drives one Sonnet-4.6 tool-loop turn:
 *   1. Assemble the prompt-cached stable prefix: system prompt + few-shot
 *      (transcribed from agent-design/prompts.md) + the 11 tool definitions.
 *      ONE `cache_control: { type: "ephemeral" }` breakpoint sits on the last
 *      system block; render order is tools → system → messages, so that single
 *      breakpoint caches the tools + system + few-shot together. The prefix is
 *      built once at module load and is byte-identical across turns.
 *   2. Append the in-session `history` then the current `message` as the
 *      variable message tail.
 *   3. Loop ≤ 10 iterations. Per the RISK DIRECTIVE for Sonnet 4.6, thinking +
 *      a forced `tool_choice` is a HARD 400 — so we use `tool_choice: "auto"`
 *      with `thinking: { type: "adaptive" }` and drive `submit_answer` via the
 *      system prompt + this max-iteration guard. Each turn: echo the FULL
 *      `response.content` back, dispatch every `tool_use` block, and return all
 *      `tool_result` blocks in ONE user message with matching `tool_use_id`.
 *      Loop until `stop_reason !== "tool_use"`.
 *   4. On `submit_answer`, validate the payload against the PokebotAnswer Zod
 *      schema. Valid → return it. Invalid → return the validation error to the
 *      model and request a re-emit (≤ 2). After the budget is exhausted —
 *      or if the loop hits its iteration cap, or the model ends a turn without
 *      submitting — synthesize an `insufficient_data` PokebotAnswer.
 *   5. Emit `onProgress` once per tool call, and assemble + log the per-turn
 *      pino trace (integration.md § Observability Hooks).
 *
 * Never throws for in-domain failures (unresolved entity / clarification /
 * PokeAPI down / loop-max / invalid-after-retry surface as a PokebotAnswer with
 * the right `status`). Transport/API faults from `messages.create` propagate to
 * the route as exceptions (sse-types.ts: those become an `error` event).
 */

import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/env";
import { dispatch, tools } from "@/agent/tools";
import { pokebotAnswerSchema, type PokebotAnswer } from "@/agent/schemas";
import type {
  AgentContext,
  ChatMessage,
  OnProgress,
  RunPokebot,
} from "@/agent/types";
import { logTurn, type ToolTraceEntry, type TurnTrace } from "@/server/logger";

// ---------------------------------------------------------------------------
// Loop constants (integration.md § Guardrails — enforced by the loop, not the
// prompt).
// ---------------------------------------------------------------------------

/** Hard cap on model turns per user message (integration.md / D-loop). */
export const MAX_ITERATIONS = 10;

/** Re-emit budget when a `submit_answer` payload fails schema validation. */
export const MAX_SUBMIT_RETRIES = 2;

/**
 * Non-streaming output budget. Comfortably fits the largest PokebotAnswer
 * (candidate lists + reasoning) while staying well under the SDK HTTP timeout
 * for a non-streaming request.
 */
export const MAX_TOKENS = 16000;

/** The fixed model (agent-design D2; overridable via env for ops only). */
const MODEL = env.ANTHROPIC_MODEL;

// ---------------------------------------------------------------------------
// Cacheable stable prefix — system prompt + few-shot (transcribed verbatim
// from agent-design/prompts.md). Kept as module constants so the prefix is
// byte-identical on every turn (a prerequisite for prompt-cache hits).
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Pokebot, a knowledgeable and trustworthy Pokémon expert for a single
competitive player. You answer questions about Pokémon, moves, abilities, types,
stats, evolutions, items, and — most importantly — how game mechanics interact.

# Your goal
For each user message, gather exactly the data you need using your tools, reason
carefully (especially about mechanics and battle math), and submit one answer
via the submit_answer tool. Your value is not just looking up data — it is
reasoning correctly on top of it and being transparent about how you got there.

# Data and generation rules
1. All Pokémon data comes from your tools (which draw from PokeAPI). Never invent
   data. If a tool didn't give you a fact, you don't have it — say so.
2. Answers are based on Generation 9 (Scarlet/Violet, including DLC) by default.
   If a Pokémon is not native to Gen 9, your tools will tell you (is_gen9_native
   = false, with a source_generation). When that happens, use the available data
   but clearly flag that it's based on an earlier generation and name which one.
3. "Can learn move X" is evaluated against the Gen 9 learnset. query_pokedex and
   the learnset data already handle this — trust them over your own memory.

# How to use your tools
- When a name might be misspelled or ambiguous, call resolve_entity first and use
  the canonical slug. Never return an empty result for a name you simply failed
  to resolve — offer the closest valid match and ask (see "Resolve or clarify").
- For ANY filter, threshold, superlative ("fastest", "highest Attack"), or
  compound query, use query_pokedex. Do not fetch Pokémon one-by-one to filter or
  rank them. To find Pokémon that learn SEVERAL moves, pass them all in \`moves\` —
  the tool returns the intersection (Pokémon that learn ALL of them in Gen 9).
- For a single Pokémon's profile, use get_pokemon. For move/ability/type/
  evolution/item details, use the matching get_* tool. Fetch only what the answer
  needs (efficient API use matters).
- For any stat or damage math, ALWAYS use compute_stat / estimate_damage. Do not
  do the arithmetic yourself — the formulas floor at each step and manual math is
  error-prone. You still decide the inputs and explain the result.
- End every turn by calling submit_answer. It is your only way to respond.

# Reasoning and transparency (non-negotiable)
- Separate stated facts from your deductions. A fact is something a tool returned
  (e.g. "Fake Out has priority +3"). A deduction is your inference about how
  facts combine (e.g. "therefore Armor Tail blocks it"). Put deductions in the
  \`inferences\` field with a confidence level, and reflect uncertainty in the
  answer (BR-3).
- Cite the specific data you relied on in \`citations\` — exact priority values,
  effect text, stat figures, learnset sources — so the user can verify (BR-4).
- When an answer depends on a condition (e.g. WHICH ability a Pokémon has —
  Farigiraf can have Cud Chew, Armor Tail, or Sap Sipper), state the condition
  explicitly instead of assuming one. Give the answer per relevant case.
- For damage/stat math, state every assumption (level, EVs, IVs, nature,
  modifiers). Default to Level 50, 0 EVs, 31 IVs, neutral nature, and no weather/
  items unless the user specified them. Present results as estimates and invite
  the user to refine the spread (BR-6).

# Type effectiveness
Use get_type_matchups (latest type chart). Treat 0× as an IMMUNITY, not a
resistance — e.g. Flying takes no damage from Ground; Normal/Ghost are immune to
each other. Be precise about super-effective vs not-very-effective vs immune.

# Conversation
You may receive follow-ups that build on the previous answer ("now only the Fire
types", "which of those is fastest?"). Apply the refinement to the prior result
set / topic from earlier in this conversation rather than starting over.

# Scope — politely decline these (they are out of scope)
- Egg moves, breeding, egg groups, move inheritance.
- Where to catch Pokémon, encounter rates, locations, version exclusives.
- Full turn-by-turn battle simulation (you reason about interactions and can
  estimate single hits, but you do not simulate whole battles).
- Any data not available through your tools / PokeAPI (no outside sources).
When declining, briefly say it's outside what you cover and offer what you CAN
help with.

# Answer style
Lead with the bottom line, then the reasoning. Be concise and competitive-savvy;
the user knows terms like Trick Room, priority, STAB, EV/IV/nature. Always submit
through submit_answer with citations, inferences, and generation_basis filled in.`;

const FEW_SHOT = `# Worked examples

Each example shows the tool calls (abbreviated "→ tool(args)" / "← result") and
ends in the submit_answer call that produces the user-facing answer card.

## Example A — Mechanics interaction with a conditional
User: does Fake Out work on Farigiraf?
→ get_move({ name: "fake-out" })
← { found: true, display_name: "Fake Out", priority: 3, damage_class: "physical",
    effect_short: "Hits first (+3 priority), flinches; only on the user's first turn." }
→ get_pokemon({ name: "farigiraf" })
← { found: true, display_name: "Farigiraf", types: ["normal","psychic"],
    abilities: { slot1: "cud-chew", slot2: "armor-tail", hidden: "sap-sipper" }, is_gen9_native: true }
→ get_ability({ name: "armor-tail" })
← { found: true, display_name: "Armor Tail",
    effect_short: "Prevents the holder from being hit by moves with increased priority." }
→ submit_answer({
    status: "answered",
    answer_markdown: "It depends on Farigiraf's ability.\\n\\n- **If it has Armor Tail:** Fake Out **fails** — Armor Tail blocks all increased-priority moves, and Fake Out is +3 priority.\\n- **If it has Cud Chew or Sap Sipper:** Fake Out **works** normally.",
    reasoning_markdown: "Fake Out is a +3 priority move (a fact from its move data). Armor Tail blocks moves with increased priority. Farigiraf has three possible abilities, so the outcome is conditional on which one this Farigiraf has.",
    subjects: [{ name: "Farigiraf", dex_number: 981, sprite_url: "...", types: ["normal","psychic"], is_fallback: false }],
    citations: [
      { source: "move/fake-out", detail: "priority: 3; damage_class: physical" },
      { source: "ability/armor-tail", detail: "Prevents the holder from being hit by increased-priority moves." },
      { source: "pokemon/farigiraf", detail: "abilities: cud-chew, armor-tail, sap-sipper" }
    ],
    inferences: [
      { claim: "Armor Tail negates Fake Out specifically because Fake Out has +3 priority.", confidence: "high",
        note: "Direct application of Armor Tail's effect text to Fake Out's priority value." }
    ],
    generation_basis: { generation: "gen-9", fallback: false }
  })

## Example B — Multi-move intersection filter
User: find me a Pokémon that can learn both Trick Room and Will-O-Wisp
→ query_pokedex({ moves: ["trick-room","will-o-wisp"], limit: 50 })
← { total_count: 6, truncated: false, results: [ { display_name: "Dusknoir", ... }, { display_name: "Ceruledge", ... }, ... ] }
→ submit_answer({
    status: "answered",
    answer_markdown: "**6 Pokémon** can learn both Trick Room and Will-O-Wisp in Gen 9. Standouts: **Dusknoir** (Ghost), **Ceruledge** (Fire/Ghost). Full list below.",
    reasoning_markdown: "I intersected the Gen 9 learnsets for both moves — only Pokémon that can learn BOTH appear. A straightforward set intersection, no inference.",
    candidates: { total_count: 6, truncated: false, sort: null, shown: [ /* the 6 rows with sprite, types */ ] },
    citations: [
      { source: "learnset/trick-room (gen-9)", detail: "learned_by set intersected" },
      { source: "learnset/will-o-wisp (gen-9)", detail: "learned_by set intersected" }
    ],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false }
  })

## Example C — Resolve-or-clarify on a misspelling
User: what can learn Will-o-Whisp
→ query_pokedex({ moves: ["will-o-whisp"] })
← { unresolved: ["will-o-whisp"] }
→ resolve_entity({ query: "Will-o-Whisp", kind: "move" })
← { matches: [ { kind: "move", slug: "will-o-wisp", display_name: "Will-O-Wisp", score: 0.94 } ] }
→ submit_answer({
    status: "clarification_needed",
    answer_markdown: "I couldn't find a move called \\"Will-o-Whisp\\" — did you mean **Will-O-Wisp**? If so, I'll pull the list of Pokémon that can learn it.",
    reasoning_markdown: "The name didn't match a known move; the closest match is Will-O-Wisp (a Fire-type status move that burns the target).",
    suggestions: ["Will-O-Wisp"],
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false }
  })

## Example D — Stat math with stated assumptions
User: what's Garchomp's Speed at level 50 with max Speed EVs and a Jolly nature
→ get_pokemon({ name: "garchomp" })
← { found: true, base_stats: { ..., speed: 102 }, types: ["dragon","ground"], is_gen9_native: true }
→ compute_stat({ base_stat: 102, level: 50, ev: 252, iv: 31, nature_effect: "boosted" })
← { value: 169, breakdown: "floor((2*102+31+63)*50/100)=149; (149+5)*1.1=169.4 -> 169" }
→ submit_answer({
    status: "answered",
    answer_markdown: "**169 Speed** at Level 50, with 252 Speed EVs, a 31 Speed IV, and a Jolly nature (+Speed).",
    reasoning_markdown: "Garchomp's base Speed is 102. Applying the standard stat formula with your spread gives 169. Want me to recompute at Level 100 or with a different spread?",
    damage_calc: { assumptions: { level: 50, ev: 252, iv: 31, nature: "Jolly (+Spe)" }, result: { stat: "speed", value: 169 }, is_estimate: true, breakdown: "floor((2*102+31+63)*50/100)=149; (149+5)*1.1=169" },
    subjects: [{ name: "Garchomp", dex_number: 445, sprite_url: "...", types: ["dragon","ground"], is_fallback: false }],
    citations: [{ source: "pokemon/garchomp", detail: "base speed: 102" }],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false }
  })

## Example E — Out-of-scope decline
User: what egg moves does Dratini get?
→ submit_answer({
    status: "answered",
    answer_markdown: "Egg moves and breeding are outside what I cover. I can help with Dratini's level-up/TM learnset, its stats and abilities, evolutions, or type matchups — want any of those?",
    reasoning_markdown: "Breeding/egg moves are explicitly out of scope for this tool; I'm flagging that rather than guessing.",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false }
  })`;

/**
 * The stable system prefix as two text blocks. The breakpoint on the LAST block
 * (few-shot) caches tools + both system blocks together (render order is
 * tools → system → messages). Exactly one ephemeral breakpoint per the RISK
 * DIRECTIVE.
 */
const SYSTEM_BLOCKS: Anthropic.TextBlockParam[] = [
  { type: "text", text: SYSTEM_PROMPT },
  {
    type: "text",
    text: FEW_SHOT,
    cache_control: { type: "ephemeral" },
  },
];

/**
 * The 11 tool definitions for the Anthropic SDK, built once. `name` /
 * `inputSchema` come straight from the tool layer (schemas.ts is the single
 * source), so this list is deterministic and never reordered between turns
 * (reordering would invalidate the cache).
 */
const TOOL_DEFS: Anthropic.Tool[] = tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
}));

// ---------------------------------------------------------------------------
// Progress labels (integration.md § UI Consumer Contract — "stream tool-activity
// labels … so the UI shows motion").
// ---------------------------------------------------------------------------

const PROGRESS_LABELS: Record<string, string> = {
  resolve_entity: "🔍 Resolving name…",
  query_pokedex: "📊 Querying Pokédex…",
  get_pokemon: "📇 Looking up Pokémon…",
  get_move: "⚔️ Looking up move…",
  get_ability: "✨ Looking up ability…",
  get_type_matchups: "🛡️ Checking type matchups…",
  get_evolution_chain: "🧬 Tracing evolution…",
  get_item: "🎒 Looking up item…",
  compute_stat: "🧮 Computing stat…",
  estimate_damage: "💥 Estimating damage…",
  submit_answer: "✍️ Composing answer…",
};

function progressLabel(tool: string): string {
  return PROGRESS_LABELS[tool] ?? `Running ${tool}…`;
}

// ---------------------------------------------------------------------------
// Injectable client seam — keeps the public signature fixed while letting the
// unit/integration tests drive a recorded transcript (design.md Phase 5: a
// stubbed/recorded Anthropic client for determinism).
// ---------------------------------------------------------------------------

/** The single SDK method the runtime uses. */
export interface AnthropicClientLike {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

let cachedClient: Anthropic | undefined;

/** Lazily build + memoize the real Anthropic client (once per process). */
function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map in-session history turns to SDK message params. */
function historyToMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
  return history.map((turn) => ({ role: turn.role, content: turn.content }));
}

/** Compact a Zod issue list into a single human/model-readable string. */
function formatZodIssues(error: import("zod").ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Build a schema-valid `insufficient_data` answer for the orchestration-level
 * fallbacks (loop-max, invalid-after-retries, no-submit). Never user-blaming;
 * states plainly that the turn couldn't be completed (integration.md).
 */
function synthesizeInsufficientData(reason: string): PokebotAnswer {
  return {
    status: "insufficient_data",
    answer_markdown:
      "I wasn't able to put together a reliable answer for that this time. " +
      "Could you rephrase or narrow the question, and I'll try again?",
    reasoning_markdown:
      "The agent could not complete this turn through its normal tool loop, " +
      "so it is reporting insufficient data rather than guessing.",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false },
    uncertainty_flags: [reason],
  };
}

/** Read the session id off the (correlation-tagged) child logger, if present. */
function sessionIdOf(ctx: AgentContext): string {
  const logger = ctx.logger as { bindings?: () => Record<string, unknown> };
  if (typeof logger.bindings === "function") {
    const bound = logger.bindings();
    if (typeof bound.session_id === "string") {
      return bound.session_id;
    }
  }
  return "";
}

/** Mutable accumulator for the per-turn trace, finalized in {@link finalize}. */
interface TraceState {
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  toolTrace: ToolTraceEntry[];
}

function accumulateUsage(state: TraceState, usage: Anthropic.Usage): void {
  state.inputTokens +=
    usage.input_tokens +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
  state.outputTokens += usage.output_tokens;
  state.thinkingTokens += usage.output_tokens_details?.thinking_tokens ?? 0;
}

/**
 * Assemble + emit the per-turn pino trace (integration.md § Observability
 * Hooks) and return the answer. `cache_hit` is recorded as `false` for every
 * entry: the read-through cache hit/miss lives inside the data layer and is not
 * observable from the runtime seam.
 */
function finalize(
  answer: PokebotAnswer,
  state: TraceState,
  ctx: AgentContext,
): PokebotAnswer {
  const trace: TurnTrace = {
    request_id: ctx.requestId,
    session_id: sessionIdOf(ctx),
    model: MODEL,
    input_tokens: state.inputTokens,
    output_tokens: state.outputTokens,
    thinking_tokens: state.thinkingTokens,
    tool_trace: state.toolTrace,
    turn_latency_ms: Date.now() - state.startedAt,
    status: answer.status,
    citation_count: answer.citations.length,
  };
  logTurn(trace, ctx.logger);
  return answer;
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * Run the tool-loop against an explicit client. Exposed for tests
 * (recorded-transcript injection); production calls go through {@link runPokebot}.
 */
export async function runPokebotWith(
  client: AnthropicClientLike,
  message: string,
  history: ChatMessage[],
  ctx: AgentContext,
  onProgress?: OnProgress,
): Promise<PokebotAnswer> {
  const state: TraceState = {
    startedAt: Date.now(),
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    toolTrace: [],
  };

  // Variable tail: prior in-session turns, then the current user message.
  const messages: Anthropic.MessageParam[] = [
    ...historyToMessages(history),
    { role: "user", content: message },
  ];

  let submitRetries = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Transport/API faults here propagate to the route (NOT caught).
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_BLOCKS,
      tools: TOOL_DEFS,
      // RISK DIRECTIVE: thinking + forced tool_choice = HARD 400 on Sonnet 4.6.
      // Use adaptive thinking with tool_choice "auto"; submit_answer is driven
      // by the system prompt and the max-iteration guard, never forced.
      thinking: { type: "adaptive" },
      tool_choice: { type: "auto" },
      messages,
    });

    accumulateUsage(state, response.usage);

    // Echo the FULL assistant content back (preserves thinking blocks +
    // tool_use blocks for multi-turn continuity on the same model).
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // Model ended its turn without calling any tool — it never submitted an
    // answer. Surface insufficient_data (integration.md error surface).
    if (toolUseBlocks.length === 0) {
      return finalize(
        synthesizeInsufficientData("model_ended_turn_without_submit_answer"),
        state,
        ctx,
      );
    }

    // One tool_result per tool_use block — returned together in ONE user
    // message (splitting them across messages trains the model off parallel
    // tool use). Build them all, then decide whether to terminate or continue.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let validAnswer: PokebotAnswer | null = null;
    let submitFailed = false;

    for (const block of toolUseBlocks) {
      onProgress?.({ tool: block.name, label: progressLabel(block.name) });

      if (block.name === "submit_answer") {
        const started = Date.now();
        const parsed = pokebotAnswerSchema.safeParse(block.input);
        if (parsed.success) {
          validAnswer = parsed.data;
          state.toolTrace.push({
            tool: block.name,
            args: block.input,
            latency_ms: Date.now() - started,
            cache_hit: false,
            error: null,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Answer accepted.",
          });
        } else {
          submitFailed = true;
          const detail = formatZodIssues(parsed.error);
          state.toolTrace.push({
            tool: block.name,
            args: block.input,
            latency_ms: Date.now() - started,
            cache_hit: false,
            error: detail,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content:
              `Your submit_answer payload failed validation: ${detail}. ` +
              "Call submit_answer again with a corrected payload that matches " +
              "the required schema.",
          });
        }
        continue;
      }

      // A regular read/compute tool. The tool layer returns structured shapes
      // and never throws in-domain; a genuine throw (e.g. a DB fault) is caught
      // here so one bad tool can't kill the turn — it is fed back so the model
      // can recover or report insufficient_data.
      const started = Date.now();
      let result: unknown;
      let errorMessage: string | null = null;
      try {
        result = await dispatch(block.name, block.input, ctx);
      } catch (caught) {
        errorMessage =
          caught instanceof Error ? caught.message : String(caught);
        result = { error: "tool_error", detail: errorMessage };
      }
      state.toolTrace.push({
        tool: block.name,
        args: block.input,
        latency_ms: Date.now() - started,
        cache_hit: false,
        error: errorMessage,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
        ...(errorMessage ? { is_error: true } : {}),
      });
    }

    // A valid answer terminates the turn immediately (no further API call, so
    // the unused tool_results are harmless).
    if (validAnswer) {
      return finalize(validAnswer, state, ctx);
    }

    // submit_answer was emitted but invalid: re-emit up to the budget, then
    // synthesize insufficient_data.
    if (submitFailed) {
      submitRetries += 1;
      if (submitRetries > MAX_SUBMIT_RETRIES) {
        return finalize(
          synthesizeInsufficientData("submit_answer_invalid_after_retries"),
          state,
          ctx,
        );
      }
    }

    // Hand the tool results back and loop.
    messages.push({ role: "user", content: toolResults });
  }

  // Iteration cap reached without a valid submit_answer.
  return finalize(
    synthesizeInsufficientData("max_iterations_reached"),
    state,
    ctx,
  );
}

/**
 * The agent entry point. Builds the cached prefix + variable tail, runs the
 * Sonnet-4.6 tool-loop against the real Anthropic client, and returns a
 * schema-valid PokebotAnswer. See the module header for the full contract.
 */
export const runPokebot: RunPokebot = (message, history, ctx, onProgress) =>
  runPokebotWith(getClient(), message, history, ctx, onProgress);

export default runPokebot;
