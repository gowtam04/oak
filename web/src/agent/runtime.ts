/**
 * Agent runtime — `runOak` (design.md § Agent runtime; agent-design
 * integration.md § Invocation Signature). Phase 5.
 *
 * Drives one provider-NEUTRAL tool-loop turn. The transport (which model/SDK
 * answers, the request shape, the streaming vocabulary, the message shaping)
 * lives behind an {@link LLMProvider} — `ctx.model` selects xAI Grok (default),
 * Claude, or OpenAI GPT-5.5 via the provider factory. The loop itself is
 * model-agnostic:
 *   1. Build the provider-tuned system prompt for `(provider, mode)` via
 *      `buildSystemSegments`, and the provider-owned opaque transcript (prior
 *      in-session `history` then the current `message`). The provider-neutral
 *      tool defs are built once at module load.
 *   2. Loop ≤ MAX_ITERATIONS times. The provider opens a streaming turn; the loop reads
 *      NORMALIZED stream events, feeding the submit_answer arg-JSON into the
 *      AnswerMarkdownExtractor for token-by-token deltas. (Claude uses adaptive
 *      thinking + tool_choice "auto" — the Sonnet-4.6 forced-tool_choice-400
 *      gotcha; submit_answer is driven by the prompt + this max-iteration guard,
 *      never forced. OpenAI/xAI map effort to reasoning_effort.)
 *   3. Echo the assistant content back opaquely, dispatch every tool call, and
 *      hand the provider-shaped tool results back in the next message(s).
 *   4. On `submit_answer`, validate the payload against the OakAnswer Zod
 *      schema. Valid → return it. Invalid → return the validation error and
 *      request a re-emit (≤ 2). After the budget is exhausted — or the iteration
 *      cap, or a turn with no tool call — synthesize an `insufficient_data`
 *      OakAnswer.
 *   5. Emit `onProgress` once per tool call, and assemble + log the per-turn
 *      pino trace (integration.md § Observability Hooks).
 *
 * Never throws for in-domain failures (unresolved entity / clarification /
 * PokeAPI down / loop-max / invalid-after-retry surface as a OakAnswer with
 * the right `status`). Transport/API faults from the provider stream propagate to
 * the route as exceptions (sse-types.ts: those become an `error` event).
 */

import {
  extractBoxNames,
  isBoxBuildMessage,
  namedForParty,
  normalizeBoxSpecies,
} from "@/agent/box-build";
import { dispatch, tools } from "@/agent/tools";
import { buildSystemSegments } from "@/agent/prompts";
import { MAX_TOKENS } from "@/agent/providers/constants";
import type { ZodType } from "zod";
import {
  AnthropicProvider,
  type AnthropicClientLike,
  type MessageStreamLike,
} from "@/agent/providers/anthropic-provider";
import { providerFor } from "@/agent/providers/factory";
import type {
  FinalTurn,
  LLMProvider,
  NormalizedUsage,
  ProviderToolDef,
  SystemSegment,
  ToolResult,
} from "@/agent/providers/types";
import {
  oakAnswerSchema,
  type OakAnswer,
  type PokemonProfile,
} from "@/agent/schemas";
import { enrichAnswer } from "@/agent/enrich-answer";
import { sanitizeCitationAnchors } from "@/agent/sanitize-citation-anchors";
import type {
  AgentContext,
  AgentMode,
  ChatMessage,
  OnAnswerDelta,
  OnAnswerStart,
  OnProgress,
  RunOak,
  ToolDef,
  ToolDispatch,
} from "@/agent/types";
import type { OakDb } from "@/data/db";
import { basisForFormat, formatForMode } from "@/data/formats";
import {
  validateTeamDetailed,
  isHardViolation,
  type TeamWarning,
} from "@/server/teams/validate-team";
import {
  formatRepairsNote,
  legalizeTeam,
} from "@/server/teams/legalize-team";
import { logTurn, type ToolTraceEntry, type TurnTrace } from "@/server/logger";

// Re-exported for back-compat (was previously declared here). The value lives in
// the provider constants module so adapters can read it without an import cycle;
// the Anthropic client-seam types moved to the provider but stay re-exported here
// because the eval harness + tests inject a scripted client through this module.
export { MAX_TOKENS };
export type { AnthropicClientLike, MessageStreamLike };

// ---------------------------------------------------------------------------
// Loop constants (integration.md § Guardrails — enforced by the loop, not the
// prompt).
// ---------------------------------------------------------------------------

/**
 * Hard cap on model turns per user message (integration.md / D-loop).
 *
 * Raised from 14 to 20 for the T17 `get_learnset` tool (B-13): an honest team
 * build now makes a legitimate per-member learnset read (6 members → ~6 extra
 * tool calls) on top of normal discovery, and Grok makes ~1 tool call per
 * iteration — the old cap made a correct build hit the submit nudge mid-gathering
 * and give up. Ordinary turns terminate at 2–6 iterations on their own, so the
 * higher ceiling costs nothing for non-build turns; it's only a backstop.
 *
 * Team-build turns use {@link MAX_ITERATIONS_TEAM_BUILD} instead (see
 * {@link isTeamBuildMessage}) so learnsets + submit fit under the cap.
 * Roster/catalog turns ({@link isTeamRosterMessage}) stay on this default cap —
 * they should finish with one pool query, not a full 6-mon build sequence.
 */
export const MAX_ITERATIONS = 20;

/**
 * Higher iteration cap for explicit team-build turns. Grok often does one tool
 * call per iteration; a full 6-mon build (anchor + pool + learnsets + submit)
 * regularly exhausts {@link MAX_ITERATIONS} before `submit_answer`.
 */
export const MAX_ITERATIONS_TEAM_BUILD = 28;

/**
 * Box-build iteration cap (BOX-AC-3.3, BOX-AD-7). A pasted owned list / “make a
 * party from these” must not run the 20/28 team-build budget.
 */
export const MAX_ITERATIONS_BOX_BUILD = 6;

/**
 * Overall wall-clock budget for a single turn (issue #6). The loop is otherwise
 * ONLY iteration-capped (MAX_ITERATIONS): nothing bounds elapsed time, so a turn
 * whose provider calls each return but slowly — or a single very long call — can
 * run for minutes (a TestFlight turn ran 300s+). Past the deadline the turn
 * degrades to an honest in-domain OakAnswer (never a transport `error`, never a
 * `stopped` — those are user Stop only). Overridable per-deploy via
 * OAK_TURN_DEADLINE_MS, read at CALL TIME (logger.ts LOG_LEVEL style, so tests
 * can stub it); NaN/≤0 falls back to the default.
 */
export const DEFAULT_TURN_DEADLINE_MS = 180_000;

/**
 * Per-provider-call timeout (issue #6). Bounds ONE streaming turn (stream
 * consumption + `stream.final()`) so a hung or crawling model call can't stall
 * the loop indefinitely. Composed with `ctx.signal` (user Stop) AND clamped to
 * the remaining turn budget, so {@link DEFAULT_TURN_DEADLINE_MS} is always the
 * harder ceiling — even when a late iteration starts a fresh call. Overridable
 * via OAK_PROVIDER_TIMEOUT_MS.
 */
export const DEFAULT_PROVIDER_CALL_TIMEOUT_MS = 90_000;

/**
 * A positive-number env override read at call time (logger.ts's LOG_LEVEL
 * pattern — NOT via the memoized `env`, so it stays per-test stubbable). A
 * missing, non-numeric, NaN, or ≤0 value falls back to `fallback`.
 */
function positiveEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** The turn wall-clock budget in ms, read at call time (OAK_TURN_DEADLINE_MS). */
export function turnDeadlineMs(): number {
  return positiveEnvMs("OAK_TURN_DEADLINE_MS", DEFAULT_TURN_DEADLINE_MS);
}

/** The per-provider-call timeout in ms, read at call time (OAK_PROVIDER_TIMEOUT_MS). */
export function providerCallTimeoutMs(): number {
  return positiveEnvMs(
    "OAK_PROVIDER_TIMEOUT_MS",
    DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
  );
}

/**
 * Soft time-budget nudge: when this much wall-clock remains on the turn deadline,
 * inject a once-per-turn submit nudge so the model ships a partial answer before
 * the hard cut (issue #6). Default leaves ~60s of a 180s turn — under the 90s
 * per-call timeout so one more streamTurn + submit_answer can still fit.
 * Overridable via OAK_TIME_NUDGE_REMAINING_MS (test-stubbable).
 */
export const TIME_NUDGE_REMAINING_MS = 60_000;

/** Soft time-nudge remaining ms, read at call time (OAK_TIME_NUDGE_REMAINING_MS). */
export function timeNudgeRemainingMs(): number {
  return positiveEnvMs("OAK_TIME_NUDGE_REMAINING_MS", TIME_NUDGE_REMAINING_MS);
}

/** Re-emit budget when a `submit_answer` payload fails schema validation. */
export const MAX_SUBMIT_RETRIES = 2;

/**
 * After this many hard-illegal `proposed_team` rejections, the gate legalizes
 * the latest proposal and accepts it (complete legal card + honesty note).
 * Earlier rejections still feed legal move/ability/item lists so the model can
 * self-correct. Never reintroduces accept-with-warnings for hard violations.
 */
export const MAX_PROPOSED_TEAM_HARD_REJECTIONS = 2;

/**
 * @deprecated Alias of {@link MAX_PROPOSED_TEAM_HARD_REJECTIONS} for callers/tests.
 * Not "infinite rejections" anymore — hard-illegal teams are rejected this many
 * times, then legalized-and-accepted.
 */
export const MAX_PROPOSED_TEAM_RETRIES = MAX_PROPOSED_TEAM_HARD_REJECTIONS;

/** Cap how many legal item slugs we embed in a rejection tool_result. */
const LEGAL_ITEMS_FEEDBACK_CAP = 120;

/**
 * Re-prompt budget when the model ends a turn with no tool call at all (it wrote
 * prose instead of calling submit_answer). `tool_choice` is never forced (the
 * Sonnet-4.6 thinking + forced-tool_choice 400), so the model occasionally skips
 * the tool — especially on a terse follow-up after a clarification turn, where the
 * plain-text history makes the exchange look like an ordinary chat. We nudge it
 * back to submit_answer rather than discarding the answer.
 */
export const MAX_EMPTY_TURN_NUDGES = 2;

/** The corrective user turn appended after an empty (no-tool) model turn. */
const EMPTY_TURN_NUDGE =
  "You ended your turn without calling submit_answer. submit_answer is the " +
  "ONLY way to reply. Call submit_answer now with your complete answer (or a " +
  "clarification_needed payload if you genuinely still need to ask). Do not " +
  "reply with plain text.";

/**
 * How many iterations from the iteration cap to start nudging the model to
 * wrap up (non-build turns). Firing once at cap − N leaves a couple of
 * iterations for the model to act on the nudge before the backstop hits.
 */
export const SUBMIT_NUDGE_REMAINING = 3;

/**
 * Earlier wrap-up window for team-build turns (with
 * {@link MAX_ITERATIONS_TEAM_BUILD}). Leaves ~10 iterations after the nudge so
 * a late submit (and one legalize-reject cycle) still fit.
 */
export const SUBMIT_NUDGE_REMAINING_TEAM_BUILD = 10;

/** Wrap-up window for box-build turns ({@link MAX_ITERATIONS_BOX_BUILD}). */
export const SUBMIT_NUDGE_REMAINING_BOX_BUILD = 2;

/**
 * High-precision check: does this user message ask Oak to BUILD / suggest a
 * team? Used only to raise the iteration cap and fire an earlier submit nudge —
 * not for routing or scope. Prefers build/suggest verbs so "analyze my team"
 * stays on the default budget. When {@link isTeamRosterMessage} also matches,
 * the loop treats the turn as roster (catalog) instead — see runWithProvider.
 */
export function isTeamBuildMessage(message: string): boolean {
  const m = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!m) return false;
  if (
    /\b(build|make|create|craft|suggest|propose)\b.{0,48}\b(team|party)\b/.test(
      m,
    )
  ) {
    return true;
  }
  if (
    /\b(team|party)\b.{0,40}\b(with|around|for|built|including)\b/.test(m)
  ) {
    return true;
  }
  if (/\bhelp me (build|make)\b/.test(m)) return true;
  if (
    /\b(want|need|give me|gimme)\b.{0,24}\b(a |an )?(team|party)\b/.test(m)
  ) {
    return true;
  }
  if (
    /\b(hyper\s*offense|balanced team|stall team|rain team|sun team|offense team|defensive team)\b/.test(
      m,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Full-build override cues: if the user asks for a complete team artifact
 * (sets/moves/full six), roster classification loses even when list language
 * is present. Precision: only clear complete-team language.
 */
function hasFullBuildOverride(m: string): boolean {
  if (
    /\b(complete|full|entire)\s+(team|party|six|6)\b/.test(m) ||
    /\b(6|six)[-\s]?(mon|member|pokemon|pokémon)\b/.test(m) ||
    /\bwith\s+(full\s+)?(sets|movesets|moves|items)\b/.test(m) ||
    /\b(movesets?|held items?|ev spreads?|stat points?)\b/.test(m) ||
    /\bproposed_team\b/.test(m)
  ) {
    return true;
  }
  // "build me a team with Torkoal" / "team built around X" = full build intent.
  if (
    /\b(build|make|create|craft)\b.{0,40}\b(team|party)\b.{0,40}\b(with|around|including)\b/.test(
      m,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * High-precision check: does this user message ask for a ROSTER / catalog /
 * role list for an archetype (sun options, who fits rain, staples + roles) —
 * not a complete legal six with sets? Used to keep the default iteration cap
 * and fire a roster-specific submit nudge instead of the full-build path.
 *
 * Precedence: when both this and {@link isTeamBuildMessage} match, roster wins
 * unless {@link hasFullBuildOverride} fires. Ambiguous "build me a sun team"
 * alone stays full-build (this returns false without list/catalog cues).
 */
export function isTeamRosterMessage(message: string): boolean {
  const m = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!m) return false;
  if (hasFullBuildOverride(m)) return false;

  // Strong catalog / shortlist cues.
  if (
    /\b(list of|list all|give me a list|gimme a list)\b/.test(m) ||
    /\bwho (fits|works|belongs|goes)\b/.test(m) ||
    /\b(options|candidates|staples)\b/.test(m) ||
    /\bpokemon that (could |can )?(fit|work|run)\b/.test(m) ||
    /\bpokémon that (could |can )?(fit|work|run)\b/.test(m) ||
    /\bwhat pokemon\b/.test(m) ||
    /\bwhat pokémon\b/.test(m)
  ) {
    return true;
  }
  // Roles catalog for a team/archetype — not a single-species "what is X's role".
  if (
    /\b(roles? they play|what roles?|and (their |why\/?what )?roles?)\b/.test(
      m,
    ) &&
    /\b(team|party|sun|rain|sand|snow|trick room|hyper offense|stall|balanced)\b/.test(
      m,
    )
  ) {
    return true;
  }
  // "who could fit on a sun team" style without explicit "list".
  if (
    /\b(fit|fits|fitting)\b.{0,24}\b(on |in |for )?(a |an |the )?(sun|rain|sand|snow|trick room|team|party)\b/.test(
      m,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * The corrective user turn appended (once) when the loop is within
 * SUBMIT_NUDGE_REMAINING iterations of the cap and the model is still gathering
 * data rather than submitting. It does NOT force a premature answer — it tells
 * the model to submit IF it already has enough, or to report insufficient_data
 * cleanly otherwise, instead of letting the cap synthesize a generic apology.
 */
const SUBMIT_NUDGE =
  "You are close to the tool-call limit for this turn. If you already have " +
  "enough information to answer, call submit_answer NOW with what you have — " +
  "do not gather or recompute more data. If you genuinely cannot answer, call " +
  "submit_answer with an insufficient_data payload explaining what's missing. " +
  "EXCEPTION: if the user asked you to BUILD a team, do NOT report " +
  "insufficient_data and do NOT ship a known-illegal or incomplete set — " +
  "submit a COMPLETE legal proposed_team (every battle-ready member has a " +
  "legal held item, four legal moves, a legal ability; no species/item " +
  "clause clashes). Use the legal move/ability/item lists from any prior " +
  "rejection. The server will legalize remaining hard violations on give-up, " +
  "but you should get it right first. Either way, submit_answer on your next turn.";

/**
 * Stronger wrap-up for explicit team-build turns. Fired earlier so the model
 * stops item/learnset thrash and submits a complete card.
 */
const BUILD_SUBMIT_NUDGE =
  "TEAM BUILD — stop gathering. Do NOT call get_pokemon, get_learnset, " +
  "get_item, get_usage_stats, query_pokedex, or any other read tool again. " +
  "Call submit_answer NOW with a COMPLETE 6-member proposed_team: every " +
  "battle-ready member needs a legal ability, a held item (competitive " +
  "staples are fine — Sitrus Berry, Leftovers, Focus Sash, Life Orb, Choice " +
  "Specs/Scarf when format-legal; Mega formes hold their mega stone only), " +
  "four legal moves from the learnsets you already fetched, and no " +
  "species/item clause clashes. Do NOT report insufficient_data. Do NOT " +
  "verify each item with get_item. If a prior rejection listed legal " +
  "moves/abilities/items, use those lists. The server will legalize remaining " +
  "hard violations if needed — your job is to submit a complete team on this " +
  "turn.";

/**
 * Wrap-up for roster/catalog turns (list who fits + roles). Does NOT demand a
 * proposed_team — a shortlist with one-line roles is the deliverable.
 */
const ROSTER_SUBMIT_NUDGE =
  "TEAM ROSTER — stop gathering. Do NOT call get_learnset, get_item, " +
  "get_pokemon, query_pokedex, or any other read tool again. Call " +
  "submit_answer NOW with status answered and a SHORTLIST of up to 8–12 " +
  "staples (from tool results you already have) with a one-line role each. " +
  "Do NOT emit a full 6-member proposed_team unless the user explicitly asked " +
  "for complete sets. Do NOT invent species outside tool results. A partial " +
  "high-signal list beats an empty insufficient_data — ship what you have.";

/**
 * Wrap-up for box-build turns. Demand a proposed_team from the named box;
 * do not drop named species.
 */
const BOX_BUILD_SUBMIT_NUDGE =
  "BOX BUILD — stop gathering. Call submit_answer NOW with a proposed_team " +
  "drawn from the named box. Do not drop named species — keep every Pokémon " +
  "the user named for the party and warn if data is missing. Do not call " +
  "run_sql or search_wiki. Members must come from the listed names.";

const BOX_FORBIDDEN_TOOLS = new Set(["run_sql", "search_wiki"]);

/** Hard codes that become warnings (not rejects) on named-for-party members. */
const BOX_SOFT_ON_NAMED = new Set([
  "species_illegal",
  "move_not_in_learnset",
  "learnset_unavailable",
]);

type BoxBuildTurn = {
  message: string;
  historyTexts: string[];
};

function boxNameSlugs(box: BoxBuildTurn): Set<string> {
  const slugs = new Set<string>();
  for (const text of [box.message, ...box.historyTexts]) {
    for (const name of extractBoxNames(text)) {
      const slug = normalizeBoxSpecies(name);
      if (slug) slugs.add(slug);
    }
  }
  for (const name of namedForParty(box.message, box.historyTexts)) {
    const slug = normalizeBoxSpecies(name);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

function keepSpeciesFor(answer: OakAnswer, box: BoxBuildTurn): string[] {
  const slugs = new Set<string>();
  for (const name of namedForParty(box.message, box.historyTexts)) {
    const slug = normalizeBoxSpecies(name);
    if (slug) slugs.add(slug);
  }
  const inBox = new Set<string>();
  for (const text of [box.message, ...box.historyTexts]) {
    for (const name of extractBoxNames(text)) {
      const slug = normalizeBoxSpecies(name);
      if (slug) inBox.add(slug);
    }
  }
  for (const member of answer.proposed_team?.members ?? []) {
    if (!member.species) continue;
    const slug = normalizeBoxSpecies(member.species);
    if (slug && inBox.has(slug)) slugs.add(slug);
  }
  return [...slugs];
}

function isNamedMemberSlot(
  warning: TeamWarning,
  members: { species: string | null }[] | undefined,
  namedSlugs: Set<string>,
): boolean {
  if (warning.slot === undefined || !members) return false;
  const species = members[warning.slot]?.species;
  if (!species) return false;
  return namedSlugs.has(normalizeBoxSpecies(species));
}

/** Actionable insufficient_data body when a build turn never submitted a team. */
const TEAM_BUILD_INSUFFICIENT_MARKDOWN =
  "I gathered pieces for a team but ran out of room before I could submit a " +
  "complete six. Ask me again — naming Singles or Doubles, or any " +
  "must-includes — and I'll submit a full legal team immediately.";

// ---------------------------------------------------------------------------
// Provider-neutral tool definitions. `name` / `parameters` come straight from
// the tool layer (schemas.ts is the single source); built from the run's hook
// tool list (default: T1..T17) and never reordered between turns of a run
// (reordering would invalidate the prompt cache). Each provider adapter maps
// these to its own tool shape (Anthropic input_schema / OpenAI function).
// ---------------------------------------------------------------------------

function toProviderToolDefs(toolDefs: ToolDef[]): ProviderToolDef[] {
  return toolDefs.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

// ---------------------------------------------------------------------------
// Progress labels (integration.md § UI Consumer Contract — "stream tool-activity
// labels … so the UI shows motion").
// ---------------------------------------------------------------------------

const PROGRESS_LABELS: Record<string, string> = {
  resolve_entity: "🔍 Resolving name…",
  query_pokedex: "📊 Searching the Pokédex…",
  get_pokemon: "📇 Looking up Pokémon…",
  get_move: "⚔️ Looking up move…",
  get_ability: "✨ Looking up ability…",
  get_type_matchups: "🛡️ Checking type matchups…",
  get_evolution_chain: "🧬 Tracing evolution…",
  get_item: "🎒 Looking up item…",
  compute_stat: "🧮 Computing stat…",
  estimate_damage: "💥 Estimating damage…",
  submit_answer: "✍️ Composing the answer…",
  get_team: "📋 Reading your team…",
  save_team: "💾 Saving your team…",
  get_encounters: "🗺️ Checking where to find it…",
  get_usage_stats: "📈 Checking live usage…",
  list_teams: "📋 Finding your teams…",
  get_learnset: "📖 Checking the learnset…",
  submit_builder_answer: "✍️ Composing the answer…",
  run_sql: "🗄️ Querying the dex database…",
  search_wiki: "📖 Searching the wiki…",
};

/** The generic per-tool label, used as the fallback when args are unusable. */
function progressLabel(tool: string): string {
  return PROGRESS_LABELS[tool] ?? "⚙️ Working…";
}

/**
 * Title-cases a slug/name for display in a progress label, preserving internal
 * separators: `"will-o-wisp"` → `"Will-O-Wisp"`, `"iron hands"` → `"Iron Hands"`,
 * `"garchomp"` → `"Garchomp"`. Returns "" for non-strings/empties so callers can
 * fall back to the generic label. Only the first letter after a word boundary is
 * uppercased (existing casing is left intact), and the result is length-capped so
 * a pathological input can't bloat the label.
 */
export function titleizeSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().replace(/_/g, " ").slice(0, 48);
  if (!cleaned) return "";
  return cleaned.replace(/(^|[\s-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

const STAT_FILTER_LABELS: Record<string, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  special_attack: "Sp. Atk",
  special_defense: "Sp. Def",
  speed: "Speed",
  base_stat_total: "BST",
};

const STAT_OP_LABELS: Record<string, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  "==": "=",
};

/** Pulls the string members out of a value that may or may not be an array. */
function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Joins the present query_pokedex filters into a readable "Fire · Speed > 100 · learns Will-O-Wisp" clause. */
function describePokedexFilters(obj: Record<string, unknown>): string {
  const parts: string[] = [];

  const types = asStringList(obj.types).map(titleizeSlug).filter(Boolean);
  if (types.length) parts.push(types.join("/"));

  const abilities = asStringList(obj.abilities).map(titleizeSlug).filter(Boolean);
  if (abilities.length) parts.push(abilities.join(", "));

  const moves = asStringList(obj.moves).map(titleizeSlug).filter(Boolean);
  if (moves.length) parts.push(`learns ${moves.join(", ")}`);

  if (Array.isArray(obj.stat_filters)) {
    for (const f of obj.stat_filters) {
      if (!f || typeof f !== "object") continue;
      const sf = f as Record<string, unknown>;
      const stat = typeof sf.stat === "string" ? STAT_FILTER_LABELS[sf.stat] ?? sf.stat : null;
      const op = typeof sf.op === "string" ? STAT_OP_LABELS[sf.op] ?? sf.op : null;
      const val = typeof sf.value === "number" ? sf.value : null;
      if (stat && op && val !== null) parts.push(`${stat} ${op} ${val}`);
    }
  }

  return parts.join(" · ");
}

/**
 * Builds a human-readable, context-rich progress label for one tool call by
 * enriching the generic per-tool verb with the concrete subject from the model's
 * `input`. Input is model-supplied and untrusted, so every field read is guarded
 * and any missing/malformed field falls back to the generic `progressLabel`.
 */
export function describeToolCall(tool: string, input: unknown): string {
  const base = progressLabel(tool);
  const obj =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  switch (tool) {
    case "resolve_entity": {
      const q = typeof obj.query === "string" ? obj.query.trim() : "";
      return q ? `🔍 Resolving “${q.slice(0, 48)}”…` : base;
    }
    case "query_pokedex": {
      const filters = describePokedexFilters(obj);
      return filters ? `📊 Searching the Pokédex: ${filters}…` : base;
    }
    case "get_pokemon": {
      const name = titleizeSlug(obj.name);
      return name ? `📇 Looking up ${name}…` : base;
    }
    case "get_move": {
      const name = titleizeSlug(obj.name);
      return name ? `⚔️ Looking up the move ${name}…` : base;
    }
    case "get_ability": {
      const name = titleizeSlug(obj.name);
      return name ? `✨ Reading the ${name} ability…` : base;
    }
    case "get_type_matchups": {
      const types = asStringList(obj.types).map(titleizeSlug).filter(Boolean);
      return types.length ? `🛡️ Checking ${types.join("/")} matchups…` : base;
    }
    case "get_evolution_chain": {
      const name = titleizeSlug(obj.species);
      return name ? `🧬 Tracing ${name}’s evolution…` : base;
    }
    case "get_item": {
      const name = titleizeSlug(obj.name);
      return name ? `🎒 Looking up ${name}…` : base;
    }
    case "compute_stat": {
      const lvl = typeof obj.level === "number" ? obj.level : null;
      return lvl ? `🧮 Computing a stat at Lv ${lvl}…` : "🧮 Computing a stat…";
    }
    case "estimate_damage":
      return "💥 Running the damage calc…";
    case "get_encounters": {
      const name = titleizeSlug(obj.name);
      return name ? `🗺️ Checking where to find ${name}…` : base;
    }
    case "get_usage_stats": {
      const name = titleizeSlug(obj.name);
      const fmt =
        obj.format === "singles"
          ? "Singles"
          : obj.format === "doubles"
            ? "Doubles"
            : "";
      if (name && fmt) return `📈 Checking ${name}’s live ${fmt} usage…`;
      if (name) return `📈 Checking ${name}’s live usage…`;
      return base;
    }
    case "get_learnset": {
      const name = titleizeSlug(obj.name);
      return name ? `📖 Checking ${name}’s learnset…` : base;
    }
    case "run_sql": {
      const purpose =
        typeof obj.purpose === "string" ? obj.purpose.trim() : "";
      // Defensive scrub: if the model leaks internal names/SQL into `purpose`,
      // fall back to the generic label rather than surfacing them to the user.
      const leaks = /natdex_|meta_(usage|snapshot)|pmd_|\bsql\b|\bselect\b|\bjoin\b|_table\b/i;
      return purpose && !leaks.test(purpose)
        ? `🗄️ Querying the dex database — ${purpose.slice(0, 120)}…`
        : base;
    }
    case "search_wiki": {
      const query = typeof obj.query === "string" ? obj.query.trim() : "";
      return query
        ? `📖 Searching the wiki for "${query.slice(0, 60)}"…`
        : base;
    }
    case "submit_answer":
      return "✍️ Composing the answer…";
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Incremental answer_markdown extractor (token-by-token streaming)
// ---------------------------------------------------------------------------

/**
 * Pulls the growing, decoded value of the top-level `answer_markdown` string out
 * of the accumulating `partial_json` fragments of a streaming submit_answer tool
 * input. Only a `submit_answer` input has an `answer_markdown` field, so feeding
 * this just the submit_answer block's deltas is sufficient.
 *
 * `push(fragment)` returns ONLY the newly-decoded characters (or "") so the
 * caller can forward them as an `answer_delta`. Concatenating every return value
 * reproduces the decoded `answer_markdown` prefix seen so far — and, once the
 * value's closing quote arrives, equals the final `answer.answer_markdown`.
 *
 * SDK-version-independent: it consumes only raw JSON text and decodes JSON string
 * escapes itself (\n \t \r \b \f \/ \\ \" and \uXXXX incl. surrogate pairs),
 * never emitting a partial escape and never splitting an escaped surrogate pair
 * across two chunks. Keys may appear in any order; non-target values (objects,
 * arrays, strings, primitives) are fully skipped, so a `reasoning_markdown` value
 * that contains the literal substring `"answer_markdown"` cannot misfire.
 */
export class AnswerMarkdownExtractor {
  private state:
    | "before_object"
    | "at_root"
    | "key_string"
    | "after_key"
    | "before_value"
    | "target_value"
    | "skip_value"
    | "done" = "before_object";

  private keyBuf = "";
  private targetKey = false;

  // Shared JSON-string decode state (key_string + target_value).
  private escape = false;
  private uHex: string | null = null; // collecting \uXXXX digits when non-null
  private pendingHigh: number | null = null; // buffered escaped high surrogate

  // skip_value state.
  private skipDepth = 0;
  private skipInString = false;
  private skipEscape = false;
  private skipStarted = false;

  /** Feed one `partial_json` fragment; returns newly-decoded answer_markdown. */
  push(fragment: string): string {
    let out = "";
    for (let i = 0; i < fragment.length; i++) {
      if (this.state === "done") break;
      out += this.feed(fragment[i]!);
    }
    return out;
  }

  private resetStringState(): void {
    this.escape = false;
    this.uHex = null;
    this.pendingHigh = null;
  }

  private flushPendingHigh(): string {
    if (this.pendingHigh !== null) {
      const s = String.fromCharCode(this.pendingHigh);
      this.pendingHigh = null;
      return s;
    }
    return "";
  }

  private feed(ch: string): string {
    switch (this.state) {
      case "before_object":
        if (ch === "{") this.state = "at_root";
        return "";
      case "at_root":
        if (ch === '"') {
          this.keyBuf = "";
          this.resetStringState();
          this.state = "key_string";
        } else if (ch === "}") {
          this.state = "done";
        }
        return "";
      case "key_string": {
        const r = this.decodeStringChar(ch);
        if (r.closed) {
          this.targetKey = this.keyBuf === "answer_markdown";
          this.state = "after_key";
        } else {
          this.keyBuf += r.char;
        }
        return "";
      }
      case "after_key":
        if (ch === ":") this.state = "before_value";
        return "";
      case "before_value":
        if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") return "";
        if (this.targetKey && ch === '"') {
          this.resetStringState();
          this.state = "target_value";
          return "";
        }
        // Non-target key, or a target value that isn't a string — skip it whole.
        this.startSkip();
        return this.feedSkip(ch);
      case "target_value": {
        const r = this.decodeStringChar(ch);
        if (r.closed) {
          this.state = "done";
          return r.char;
        }
        return r.char;
      }
      case "skip_value":
        return this.feedSkip(ch);
      case "done":
        return "";
    }
  }

  /** Decode one char of a JSON string. `closed` marks the unescaped end quote. */
  private decodeStringChar(ch: string): { char: string; closed: boolean } {
    if (this.uHex !== null) {
      this.uHex += ch;
      if (this.uHex.length < 4) return { char: "", closed: false };
      const code = parseInt(this.uHex, 16);
      this.uHex = null;
      if (Number.isNaN(code)) return { char: "", closed: false };
      if (code >= 0xd800 && code <= 0xdbff) {
        const flushed = this.flushPendingHigh();
        this.pendingHigh = code;
        return { char: flushed, closed: false };
      }
      if (code >= 0xdc00 && code <= 0xdfff && this.pendingHigh !== null) {
        const s = String.fromCharCode(this.pendingHigh, code);
        this.pendingHigh = null;
        return { char: s, closed: false };
      }
      return {
        char: this.flushPendingHigh() + String.fromCharCode(code),
        closed: false,
      };
    }

    if (this.escape) {
      this.escape = false;
      const lead = this.flushPendingHigh();
      switch (ch) {
        case "n":
          return { char: lead + "\n", closed: false };
        case "t":
          return { char: lead + "\t", closed: false };
        case "r":
          return { char: lead + "\r", closed: false };
        case "b":
          return { char: lead + "\b", closed: false };
        case "f":
          return { char: lead + "\f", closed: false };
        case "/":
          return { char: lead + "/", closed: false };
        case "\\":
          return { char: lead + "\\", closed: false };
        case '"':
          return { char: lead + '"', closed: false };
        case "u":
          // A high surrogate buffered before this \u must wait for the result.
          if (lead) this.pendingHighReinstate(lead);
          this.uHex = "";
          return { char: "", closed: false };
        default:
          return { char: lead + ch, closed: false };
      }
    }

    if (ch === "\\") {
      this.escape = true;
      return { char: "", closed: false };
    }
    if (ch === '"') {
      return { char: this.flushPendingHigh(), closed: true };
    }
    return { char: this.flushPendingHigh() + ch, closed: false };
  }

  // The `\u` escape branch flushes pendingHigh into `lead`, but a high surrogate
  // immediately followed by `\u` is the start of a surrogate PAIR — re-buffer it
  // so the low surrogate can combine. (Only reachable for back-to-back \u.)
  private pendingHighReinstate(lead: string): void {
    if (lead.length === 1) this.pendingHigh = lead.charCodeAt(0);
  }

  private startSkip(): void {
    this.state = "skip_value";
    this.skipDepth = 0;
    this.skipInString = false;
    this.skipEscape = false;
    this.skipStarted = false;
  }

  private feedSkip(ch: string): string {
    if (this.skipInString) {
      if (this.skipEscape) {
        this.skipEscape = false;
      } else if (ch === "\\") {
        this.skipEscape = true;
      } else if (ch === '"') {
        this.skipInString = false;
        if (this.skipDepth === 0) this.state = "at_root";
      }
      return "";
    }

    if (!this.skipStarted) {
      if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") return "";
      this.skipStarted = true;
      if (ch === '"') {
        this.skipInString = true;
        return "";
      }
      if (ch === "{" || ch === "[") {
        this.skipDepth = 1;
        return "";
      }
      // Primitive (number / true / false / null) — fall through.
    }

    if (ch === '"') {
      this.skipInString = true;
      return "";
    }
    if (ch === "{" || ch === "[") {
      this.skipDepth++;
      return "";
    }
    if (ch === "}" || ch === "]") {
      if (this.skipDepth > 0) {
        this.skipDepth--;
        if (this.skipDepth === 0) this.state = "at_root";
        return "";
      }
      // A primitive ended on the parent's closing brace — re-dispatch it.
      this.state = "at_root";
      return this.feed(ch);
    }
    if (this.skipDepth === 0) {
      if (ch === ",") {
        this.state = "at_root";
        return this.feed(ch);
      }
      if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
        this.state = "at_root";
      }
      // else: still mid-primitive token (digits, letters) — keep consuming.
    }
    return "";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compact a Zod issue list into a single human/model-readable string. */
function formatZodIssues(error: import("zod").ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Build a schema-valid `insufficient_data` answer for the orchestration-level
 * fallbacks (loop-max, invalid-after-retries, no-submit). Never user-blaming;
 * states plainly that the turn couldn't be completed (integration.md). The
 * `mode` stamps the turn's scope onto `generation_basis` so a fallback in a gen
 * scope (or Champions) still reports the right basis tag, not a hardcoded gen-9.
 */
function synthesizeInsufficientData(reason: string, mode: AgentMode): OakAnswer {
  // The two timeout reasons are internal machine strings; surfacing them raw in a
  // player-visible uncertainty_flag would leak agent internals (anti-leak rule,
  // domain.ts). Special-case them with plain English in BOTH the answer text and
  // the flag, and keep the machine `reason` only in logs/trace (the caller passes
  // it to the trace separately; this synthesized answer never carries it).
  const isTimeout =
    reason === "turn_deadline_exceeded" || reason === "provider_call_timeout";
  const answer_markdown = isTimeout
    ? "This one took longer than I allow for a single question, so I stopped " +
      "early. Try narrowing it down or asking again."
    : "I wasn't able to put together a reliable answer for that this time. " +
      "Could you rephrase or narrow the question, and I'll try again?";
  const uncertainty_flags = isTimeout
    ? ["This answer was cut off because the question took too long to work through."]
    : [reason];
  return {
    status: "insufficient_data",
    answer_markdown,
    reasoning_markdown:
      "The agent could not complete this turn through its normal tool loop, " +
      "so it is reporting insufficient data rather than guessing.",
    citations: [],
    inferences: [],
    generation_basis: {
      generation: basisForFormat(formatForMode(mode)),
      fallback: false,
    },
    uncertainty_flags,
  };
}

/**
 * Last-resort recovery when the model keeps ending its turn with prose and never
 * calls submit_answer (nudge budget exhausted). Rather than discard the prose and
 * show the generic apology, wrap it in a schema-valid `answered` payload — flagged
 * so the trace records that it bypassed the structured tool path. No citations or
 * inferences are available (the model never supplied them). The `mode` stamps the
 * turn's scope onto `generation_basis` (the prose was produced under the tuned
 * per-scope system prompt, so its basis is that scope, not a hardcoded gen-9).
 */
function synthesizeFromProse(prose: string, mode: AgentMode): OakAnswer {
  return {
    status: "answered",
    answer_markdown: prose,
    reasoning_markdown:
      "The model produced this answer as plain text without calling " +
      "submit_answer, so it carries no structured citations or inferences.",
    citations: [],
    inferences: [],
    generation_basis: {
      generation: basisForFormat(formatForMode(mode)),
      fallback: false,
    },
    uncertainty_flags: ["recovered_prose_no_submit_answer"],
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
export interface TraceState {
  startedAt: number;
  /** The concrete API model id answering this turn (provider.apiModelId). */
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  toolTrace: ToolTraceEntry[];
}

/** Fold one turn's normalized usage into the running trace totals. */
function accumulateUsage(state: TraceState, usage: NormalizedUsage): void {
  state.inputTokens += usage.inputTokens;
  state.outputTokens += usage.outputTokens;
  state.thinkingTokens += usage.thinkingTokens;
  state.cachedTokens += usage.cachedTokens ?? 0;
}

/**
 * Assemble + emit the per-turn pino trace (integration.md § Observability
 * Hooks) and return the answer. `cache_hit` is recorded as `false` for every
 * entry: the read-through cache hit/miss lives inside the data layer and is not
 * observable from the runtime seam.
 */
function finalize(
  answer: OakAnswer,
  state: TraceState,
  ctx: AgentContext,
): OakAnswer {
  const trace: TurnTrace = {
    request_id: ctx.requestId,
    session_id: sessionIdOf(ctx),
    model: state.modelId,
    input_tokens: state.inputTokens,
    output_tokens: state.outputTokens,
    thinking_tokens: state.thinkingTokens,
    cached_input_tokens: state.cachedTokens,
    tool_trace: state.toolTrace,
    turn_latency_ms: Date.now() - state.startedAt,
    status: answer.status,
    citation_count: answer.citations.length,
  };
  logTurn(trace, ctx.logger);
  // Hand the assembled trace to the optional recording sink (admin-panel, AD-2).
  // Pure hand-off — never awaited, never inspected; absent in tests/eval.
  ctx.onTurnComplete?.(trace);
  return answer;
}

// ---------------------------------------------------------------------------
// Run hooks — the seam that makes the loop answer-contract-agnostic.
//
// The loop mechanics (transcript echo, streaming extraction, retry budgets,
// nudges, tracing) are generic; everything OakAnswer-specific — the tool list,
// the submit tool + schema, domain validation (team legality), enrichment, the
// synthesized fallbacks, and finalization — is injected via AnswerRunHooks.
// `runWithProvider` defaults to DEFAULT_OAK_HOOKS (the original behavior,
// byte-for-byte); an alternate agent (e.g. the team-builder assistant) supplies
// its own complete hooks object.
// ---------------------------------------------------------------------------

/**
 * Verdict on a schema-VALID answer from {@link AnswerRunHooks.validateAnswer}.
 *
 * `ok: false` feeds `feedback` back to the model as an error tool_result (the
 * loop counts the rejection and re-asks); `annotateBestEffort` is remembered
 * with the rejected answer so a later give-up can salvage it (applied after
 * enrichment). `ok: true` accepts; `annotate` is applied to the enriched answer
 * before finalization (e.g. stamping server-authoritative team warnings).
 */
export type AnswerVerdict<TAnswer> =
  | { ok: true; annotate?: (enriched: TAnswer) => void }
  | {
      ok: false;
      feedback: string;
      traceError: string;
      annotateBestEffort?: (enriched: TAnswer) => void;
    };

/** Everything answer-contract-specific about one tool-loop run. */
export interface AnswerRunHooks<TAnswer> {
  /** Tools advertised to the model (the submit tool must be among them). */
  tools: ToolDef[];
  /**
   * Dispatch for non-submit tool calls. MUST cover only the tools in `tools` —
   * a dispatch built over a wider set would execute hallucinated calls to
   * tools the model was never offered.
   */
  dispatch: ToolDispatch;
  /** Name of the terminal answer tool (e.g. "submit_answer"). */
  submitToolName: string;
  /** Zod schema the submit payload must satisfy. */
  answerSchema: ZodType<TAnswer>;
  /** Provider-tuned system prompt for this run (loop-invariant). */
  buildSystem: (
    providerKind: LLMProvider["kind"],
    ctx: AgentContext,
  ) => SystemSegment[];
  /**
   * Domain validation of a schema-valid answer. `rejectionsSoFar` counts this
   * run's prior `ok: false` verdicts. Oak rejects hard-illegal proposed_teams
   * up to {@link MAX_PROPOSED_TEAM_HARD_REJECTIONS}, then legalizes-and-accepts;
   * there is no accept-with-warnings path for hard violations.
   */
  validateAnswer: (
    answer: TAnswer,
    ctx: AgentContext,
    rejectionsSoFar: number,
  ) => Promise<AnswerVerdict<TAnswer>>;
  /** Post-accept enrichment (sprites/subjects). Omitted ⇒ identity. */
  enrich?: (
    answer: TAnswer,
    ctx: AgentContext,
    lookedUpProfiles: PokemonProfile[],
    queryPokedexCalls: { args: unknown; result: unknown }[],
  ) => Promise<TAnswer>;
  /**
   * Give-up salvage for a schema-valid answer that was only domain-rejected
   * (Oak: legalize proposed_team). Omitted ⇒ apply `annotateBestEffort` if set.
   */
  salvageAnswer?: (answer: TAnswer, ctx: AgentContext) => Promise<TAnswer>;
  /** Fallback answer when the turn can't complete (loop-max, invalid). */
  synthesizeInsufficient: (reason: string, ctx: AgentContext) => TAnswer;
  /** Wrap prose from a no-submit turn into a valid answer. */
  synthesizeFromProse: (prose: string, ctx: AgentContext) => TAnswer;
  /** Trace/log finalization. Omitted ⇒ answer returned unchanged. */
  finalizeAnswer?: (
    answer: TAnswer,
    state: TraceState,
    ctx: AgentContext,
  ) => TAnswer;
  /** Corrective user turn after a no-tool-call model turn. */
  emptyTurnNudge: string;
  /** One-shot wrap-up nudge near the iteration cap. */
  submitNudge: string;
}

/**
 * Stamp proposed-team warnings server-authoritatively (like saved_team):
 * overwrite anything the model emitted. Only present when there IS a proposal
 * with warnings; otherwise the key stays absent (clean proposal).
 */
function stampTeamWarnings(answer: OakAnswer, warnings: TeamWarning[]): void {
  if (answer.proposed_team && warnings.length > 0) {
    answer.proposed_team_warnings = warnings;
  } else {
    delete answer.proposed_team_warnings;
  }
}

/**
 * Legalize a built proposed_team in place (or drop it if unrepairable). Shared
 * by the hard-rejection budget path and end-of-budget salvage. Image-import
 * incomplete items are not force-filled — only hard violations + item_missing
 * on non-image turns are repaired.
 */
async function applyLegalizedTeam(
  answer: OakAnswer,
  ctx: AgentContext,
  keepSpecies?: string[],
): Promise<OakAnswer> {
  const pt = answer.proposed_team;
  if (!pt) return answer;

  const format = formatForMode(ctx.mode);
  const db = ctx.db as unknown as OakDb;
  const hasImages = (ctx.images?.length ?? 0) > 0;
  const keepSlugs = new Set(
    (keepSpecies ?? []).map(normalizeBoxSpecies).filter(Boolean),
  );
  const skippableNamed = (w: TeamWarning, members: { species: string | null }[]) =>
    BOX_SOFT_ON_NAMED.has(w.code) && isNamedMemberSlot(w, members, keepSlugs);

  const before = await validateTeamDetailed(pt.members, format, db);
  const hardBefore = before.warnings.filter(
    (w) => isHardViolation(w) || (w.code === "item_missing" && !hasImages),
  );
  if (hardBefore.length === 0) {
    stampTeamWarnings(answer, before.warnings);
    return answer;
  }

  const { members, repairs, remainingHard } = await legalizeTeam(
    pt.members,
    format,
    db,
    keepSpecies?.length ? { keepSpecies } : undefined,
  );
  // item_missing after legalize is still a failure for built teams.
  // Named-for-party species_illegal / learnset misses stay as warnings.
  const stillHard = remainingHard.filter((w) => {
    const hard =
      isHardViolation(w) || (w.code === "item_missing" && !hasImages);
    if (!hard) return false;
    if (keepSlugs.size > 0 && skippableNamed(w, members)) return false;
    return true;
  });

  if (stillHard.length > 0) {
    // Cannot ship a legal complete team — drop the proposal; keep prose.
    delete answer.proposed_team;
    delete answer.proposed_team_warnings;
    answer.uncertainty_flags = [
      ...(answer.uncertainty_flags ?? []),
      "team_could_not_be_legalized",
    ];
    const note =
      "I could not finish a fully legal team for this format after adjusting " +
      "the illegal slots — please ask me to rebuild around a different core.";
    if (!answer.answer_markdown.includes("could not finish a fully legal")) {
      answer.answer_markdown = `${answer.answer_markdown.trim()}\n\n${note}`;
    }
    return answer;
  }

  answer.proposed_team = { ...pt, members };
  const after = await validateTeamDetailed(members, format, db);
  stampTeamWarnings(
    answer,
    after.warnings.filter((w) => {
      if (keepSlugs.size > 0 && skippableNamed(w, members)) return true;
      return !isHardViolation(w) && w.code !== "item_missing";
    }),
  );
  const note = formatRepairsNote(repairs);
  if (note && repairs.length > 0) {
    answer.answer_markdown = `${answer.answer_markdown.trim()}\n\n${note}`;
  }
  // Drop the old "may be illegal" flag if present; team is legal now
  // unless we kept named species_illegal as a warning.
  if (answer.uncertainty_flags && keepSlugs.size === 0) {
    answer.uncertainty_flags = answer.uncertainty_flags.filter(
      (f) => f !== "team_may_have_illegal_slots",
    );
    if (answer.uncertainty_flags.length === 0) delete answer.uncertainty_flags;
  }
  return answer;
}

/**
 * The OakAnswer domain validation: roster-validate a proposed team against the
 * turn's ACTUAL format (server-controlled — never the model-emitted
 * proposed_team.format). HARD format-illegalities are rejected up to
 * {@link MAX_PROPOSED_TEAM_HARD_REJECTIONS} with embedded legal move/ability/item
 * lists; after that budget the team is legalized-and-accepted. On give-up,
 * {@link salvageOakAnswer} legalizes the last best-effort team. Image imports
 * still skip hard `item_missing` (obscured items). Soft EV/IV/`incomplete`
 * warnings never block.
 */
async function validateOakAnswer(
  answer: OakAnswer,
  ctx: AgentContext,
  rejectionsSoFar: number,
  box?: BoxBuildTurn,
): Promise<AnswerVerdict<OakAnswer>> {
  const pt = answer.proposed_team;
  const format = formatForMode(ctx.mode);
  const validation = pt
    ? await validateTeamDetailed(pt.members, format, ctx.db as unknown as OakDb)
    : {
        warnings: [] as TeamWarning[],
        legalMoves: new Map<string, string[]>(),
        legalAbilities: new Map<string, string[]>(),
        legalItems: [] as string[],
        requiredItems: new Map<string, string>(),
      };
  const teamWarnings = validation.warnings;
  const hasImages = (ctx.images?.length ?? 0) > 0;
  const namedSlugs = box ? boxNameSlugs(box) : null;
  const hardViolations = teamWarnings.filter((w) => {
    const hard =
      isHardViolation(w) || (w.code === "item_missing" && !hasImages);
    if (!hard) return false;
    if (
      namedSlugs &&
      BOX_SOFT_ON_NAMED.has(w.code) &&
      isNamedMemberSlot(w, pt?.members, namedSlugs)
    ) {
      return false;
    }
    return true;
  });
  if (hardViolations.length > 0) {
    // Budget spent → legalize and accept (never ship hard-illegal slots).
    if (rejectionsSoFar >= MAX_PROPOSED_TEAM_HARD_REJECTIONS) {
      const legalized = await applyLegalizedTeam(
        answer,
        ctx,
        box ? keepSpeciesFor(answer, box) : undefined,
      );
      return {
        ok: true,
        annotate: (enriched) => {
          // applyLegalizedTeam mutated `answer`; copy the repaired fields onto
          // the enriched copy (enrich runs on the pre-annotate payload).
          if (legalized.proposed_team) {
            enriched.proposed_team = legalized.proposed_team;
          } else {
            delete enriched.proposed_team;
          }
          if (legalized.proposed_team_warnings) {
            enriched.proposed_team_warnings = legalized.proposed_team_warnings;
          } else {
            delete enriched.proposed_team_warnings;
          }
          enriched.answer_markdown = legalized.answer_markdown;
          if (legalized.uncertainty_flags) {
            enriched.uncertainty_flags = legalized.uncertainty_flags;
          } else {
            delete enriched.uncertainty_flags;
          }
        },
      };
    }

    const issues = hardViolations.map((w) => w.message).join(" ");
    const speciesAt = (slot: number | undefined): string | null =>
      slot === undefined ? null : pt?.members[slot]?.species ?? null;

    const moveSpecies = new Set<string>();
    for (const w of hardViolations) {
      if (w.code !== "move_not_in_learnset") continue;
      const sp = speciesAt(w.slot);
      if (sp) moveSpecies.add(sp);
    }
    const legalMoveLines = [...moveSpecies].map((sp) => {
      const moves = validation.legalMoves.get(sp) ?? [];
      return `Legal moves for ${sp} in ${format}: ${moves.join(", ")}.`;
    });

    const abilitySpecies = new Set<string>();
    for (const w of hardViolations) {
      if (w.code !== "ability_not_for_species") continue;
      const sp = speciesAt(w.slot);
      if (sp) abilitySpecies.add(sp);
    }
    const legalAbilityLines = [...abilitySpecies].map((sp) => {
      const abilities = validation.legalAbilities.get(sp) ?? [];
      return `Legal abilities for ${sp}: ${abilities.join(", ")}.`;
    });

    // Legal held items for the format (admin Champions catalog included).
    const itemIssues = hardViolations.some(
      (w) => w.code === "item_illegal" || w.code === "item_missing",
    );
    const legalItemLines: string[] = [];
    if (itemIssues || hardViolations.some((w) => w.code === "duplicate_item")) {
      const items = validation.legalItems;
      if (items.length === 0) {
        legalItemLines.push(
          `No legal held-item list could be loaded for ${format}; call get_item / resolve_entity to verify each item.`,
        );
      } else if (items.length <= LEGAL_ITEMS_FEEDBACK_CAP) {
        legalItemLines.push(
          `Legal held items in ${format}: ${items.join(", ")}.`,
        );
      } else {
        legalItemLines.push(
          `Legal held items in ${format} (first ${LEGAL_ITEMS_FEEDBACK_CAP} of ${items.length}): ${items
            .slice(0, LEGAL_ITEMS_FEEDBACK_CAP)
            .join(", ")}. Verify any other candidate with get_item.`,
        );
      }
    }

    const feedback =
      `Your proposed_team is not legal for ${format} and ` +
      `was rejected: ${issues}` +
      [...legalMoveLines, ...legalAbilityLines, ...legalItemLines]
        .map((line) => ` ${line}`)
        .join("") +
      ` Rebuild a COMPLETE team: choose moves ONLY from the legal lists ` +
      `(or call get_learnset), held items ONLY from the legal item list above ` +
      `(or get_item), give every battle-ready member a held item, make sure no ` +
      `two members share a species or a held item — do NOT clear items to dodge ` +
      `checks — and call submit_answer again.`;
    return {
      ok: false,
      feedback,
      traceError: "proposed_team_illegal",
      // Fallback if salvageAnswer is absent: never leave an unstamped illegal card.
      annotateBestEffort: (enriched) => {
        stampTeamWarnings(enriched, teamWarnings);
        enriched.uncertainty_flags = [
          ...(enriched.uncertainty_flags ?? []),
          "team_may_have_illegal_slots",
        ];
      },
    };
  }
  return {
    ok: true,
    annotate: (enriched) => stampTeamWarnings(enriched, teamWarnings),
  };
}

/**
 * End-of-budget salvage: legalize a hard-illegal built proposed_team so the
 * user still gets a complete, Apply-ready card (with an honesty note about
 * what changed).
 */
async function salvageOakAnswer(
  answer: OakAnswer,
  ctx: AgentContext,
  box?: BoxBuildTurn,
): Promise<OakAnswer> {
  return applyLegalizedTeam(
    answer,
    ctx,
    box ? keepSpeciesFor(answer, box) : undefined,
  );
}

/** The original Oak agent behavior, expressed as hooks (the default run). */
const DEFAULT_OAK_HOOKS: AnswerRunHooks<OakAnswer> = {
  tools,
  dispatch,
  submitToolName: "submit_answer",
  answerSchema: oakAnswerSchema,
  buildSystem: (providerKind, ctx) =>
    buildSystemSegments({
      provider: providerKind,
      mode: ctx.mode,
      boundTeams: ctx.boundTeams,
    }),
  validateAnswer: validateOakAnswer,
  enrich: enrichAnswer,
  salvageAnswer: salvageOakAnswer,
  synthesizeInsufficient: (reason, ctx) =>
    synthesizeInsufficientData(reason, ctx.mode),
  synthesizeFromProse: (prose, ctx) => synthesizeFromProse(prose, ctx.mode),
  finalizeAnswer: finalize,
  emptyTurnNudge: EMPTY_TURN_NUDGE,
  submitNudge: SUBMIT_NUDGE,
};

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * Run the tool-loop against an explicit {@link LLMProvider}. The loop is fully
 * provider-NEUTRAL: it owns the opaque transcript, schema validation, the
 * re-emit budget, insufficient_data synthesis, the trace, and the
 * AnswerMarkdownExtractor; the provider owns only the transport (request shape,
 * normalized stream events, message shaping). Exposed for tests (a fake provider
 * / the OpenAI provider) and used by both entry points below.
 */
export async function runWithProvider<TAnswer = OakAnswer>(
  provider: LLMProvider,
  message: string,
  history: ChatMessage[],
  ctx: AgentContext,
  onProgress?: OnProgress,
  onAnswerStart?: OnAnswerStart,
  onAnswerDelta?: OnAnswerDelta,
  // The default hooks ARE the OakAnswer run; the cast only widens the default
  // to the generic parameter (callers overriding TAnswer must pass hooks).
  hooks: AnswerRunHooks<TAnswer> = DEFAULT_OAK_HOOKS as unknown as AnswerRunHooks<TAnswer>,
): Promise<TAnswer> {
  const state: TraceState = {
    startedAt: Date.now(),
    modelId: provider.apiModelId,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    toolTrace: [],
  };

  // The opaque, provider-owned transcript: prior in-session turns + the current
  // message (with any attached images, consume-on-turn from ctx.images). The loop
  // only ever PUSHES provider-produced values into it.
  const transcript = provider.createTranscript(history, message, ctx.images);

  // Server-controlled scope + provider together select the tuned system prompt
  // (loop-invariant). Built once per turn; the same byte-identical segments are
  // sent every iteration, preserving each provider's prompt cache.
  const systemSegments = hooks.buildSystem(provider.kind, ctx);

  // Provider-neutral tool defs for this run's tool list (loop-invariant).
  const providerToolDefs = toProviderToolDefs(hooks.tools);

  // Box-build wins over roster and full team-build (BOX-BR-1): cap 6, no
  // SQL/wiki dispatch, keep-named-species. Roster stays on the default cap.
  // Full team-build gets 28 + an earlier submit nudge. Non-box "build me a
  // rain team" still uses MAX_ITERATIONS_TEAM_BUILD (BOX-AD-7).
  const historyTexts = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const boxBuild = isBoxBuildMessage(message, historyTexts);
  const teamRoster = !boxBuild && isTeamRosterMessage(message);
  const teamBuild = !boxBuild && !teamRoster && isTeamBuildMessage(message);
  const boxTurn: BoxBuildTurn | undefined = boxBuild
    ? { message, historyTexts }
    : undefined;
  const maxIterations = boxBuild
    ? MAX_ITERATIONS_BOX_BUILD
    : teamBuild
      ? MAX_ITERATIONS_TEAM_BUILD
      : MAX_ITERATIONS;
  const submitNudgeRemaining = boxBuild
    ? SUBMIT_NUDGE_REMAINING_BOX_BUILD
    : teamBuild
      ? SUBMIT_NUDGE_REMAINING_TEAM_BUILD
      : SUBMIT_NUDGE_REMAINING;
  const submitNudgeText = boxBuild
    ? BOX_BUILD_SUBMIT_NUDGE
    : teamRoster
      ? ROSTER_SUBMIT_NUDGE
      : teamBuild
        ? BUILD_SUBMIT_NUDGE
        : hooks.submitNudge;

  const oakBoxValidate =
    boxTurn && hooks.validateAnswer === DEFAULT_OAK_HOOKS.validateAnswer;
  const runValidateAnswer: AnswerRunHooks<TAnswer>["validateAnswer"] =
    oakBoxValidate
      ? (answer, c, rejections) =>
          validateOakAnswer(
            answer as unknown as OakAnswer,
            c,
            rejections,
            boxTurn,
          ) as Promise<AnswerVerdict<TAnswer>>
      : hooks.validateAnswer;
  const runSalvageAnswer: AnswerRunHooks<TAnswer>["salvageAnswer"] =
    boxTurn && hooks.salvageAnswer === DEFAULT_OAK_HOOKS.salvageAnswer
      ? (answer, c) =>
          salvageOakAnswer(
            answer as unknown as OakAnswer,
            c,
            boxTurn,
          ) as Promise<TAnswer>
      : hooks.salvageAnswer;

  let submitRetries = 0;
  let emptyTurnNudges = 0;
  // Fire the late-iteration submit nudge at most once per turn.
  let submitNudged = false;
  // Domain-level answer rejection count (for Oak: hard-illegal proposed_team).
  // Separated from the schema-failure budget so an illegal team never burns
  // schema retries. Oak rejects up to MAX_PROPOSED_TEAM_HARD_REJECTIONS then
  // legalizes-and-accepts; give-up salvage covers timeouts / max-iter when a
  // best-effort submit exists.
  let answerRejections = 0;
  // Last schema-VALID submit rejected only by domain validation. On give-up
  // we legalize (Oak) or annotate it instead of a bare insufficient_data.
  let bestEffortAnswer: TAnswer | null = null;
  let bestEffortAnnotate: ((enriched: TAnswer) => void) | null = null;

  // get_pokemon profiles fetched this turn — used by answer enrichment to
  // synthesize subjects[] when the model omits it on a single-entity answer.
  const lookedUpProfiles: PokemonProfile[] = [];

  // query_pokedex {args,result} pairs from this turn — used by enrichment to
  // re-run a truncated query and backfill candidates.hidden_rows.
  const queryPokedexCalls: { args: unknown; result: unknown }[] = [];

  // Emit the "reasoning…" progress tick at most once per turn (UX for models like
  // Grok that stream a long reasoning phase before the answer arrives at once).
  let reasoningNudged = false;

  // Trace/log finalization via the hook (default: pino turn trace + the
  // onTurnComplete sink); omitted ⇒ the answer passes through unchanged.
  const doFinalize = (answer: TAnswer): TAnswer =>
    hooks.finalizeAnswer ? hooks.finalizeAnswer(answer, state, ctx) : answer;

  // Post-accept enrichment via the hook; omitted ⇒ identity.
  const doEnrich = async (answer: TAnswer): Promise<TAnswer> =>
    hooks.enrich
      ? hooks.enrich(answer, ctx, lookedUpProfiles, queryPokedexCalls)
      : answer;

  // Give-up recovery shared by all three fallthroughs. Prefer a best-effort
  // answer (only ever set from a schema-valid, domain-rejected submit) over a
  // discard; else recovered prose if we have any (empty-turn case), else the
  // generic insufficient_data apology (build-specific copy when applicable).
  // Oak's salvageAnswer legalizes the team.
  const finalizeBestEffortOrInsufficient = async (
    reason: string,
    prose?: string,
  ): Promise<TAnswer> => {
    if (bestEffortAnswer) {
      let enriched = await doEnrich(bestEffortAnswer);
      if (runSalvageAnswer) {
        enriched = await runSalvageAnswer(enriched, ctx);
      } else {
        bestEffortAnnotate?.(enriched);
      }
      return doFinalize(enriched);
    }
    const trimmed = prose?.trim() ?? "";
    if (trimmed.length > 0) {
      return doFinalize(hooks.synthesizeFromProse(trimmed, ctx));
    }
    const insufficient = hooks.synthesizeInsufficient(reason, ctx);
    // Build turns that never submitted a team: actionable body, same machine
    // uncertainty flag (UI still maps max_iterations_reached → "Couldn't complete").
    // Duck-type via unknown — TAnswer may be BuilderAnswer for alternate hooks.
    if (
      teamBuild &&
      reason !== "turn_deadline_exceeded" &&
      reason !== "provider_call_timeout" &&
      insufficient &&
      typeof insufficient === "object"
    ) {
      const maybe = insufficient as unknown as {
        status?: string;
        answer_markdown?: string;
      };
      if (maybe.status === "insufficient_data") {
        maybe.answer_markdown = TEAM_BUILD_INSUFFICIENT_MARKDOWN;
      }
    }
    return doFinalize(insufficient);
  };

  // The absolute wall-clock deadline for this whole turn (issue #6). Fixed at the
  // start; every iteration checks it and every provider call's timeout is clamped
  // to what's left of it.
  const deadlineAt = state.startedAt + turnDeadlineMs();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Bail if the client disconnected (user pressed Stop) during the prior tool
    // dispatch — covers the gap between the provider-level aborts. Thrown as an
    // AbortError so it propagates to the route like any transport fault (where it
    // is recognized via req.signal.aborted and not surfaced as an error event).
    if (ctx.signal?.aborted) {
      throw new DOMException("Aborted by client", "AbortError");
    }

    // Overall turn deadline (issue #6). Checked at the TOP of each iteration, so
    // it also catches a turn that blew its budget inside the PRIOR iteration's
    // tool dispatch — which is itself unbounded in v1 (accepted gap: a long local
    // Postgres query isn't interrupted mid-flight, but the deadline stops the loop
    // before any further model work). Surfaces as an honest in-domain OakAnswer,
    // never a transport error or `stopped`.
    if (Date.now() >= deadlineAt) {
      ctx.logger.warn(
        { event: "oak_turn_deadline_exceeded", deadline_ms: turnDeadlineMs() },
        "oak turn exceeded its wall-clock deadline; degrading to insufficient_data",
      );
      return finalizeBestEffortOrInsufficient("turn_deadline_exceeded");
    }

    // Bound this single provider call: the smaller of the per-call timeout and the
    // remaining turn budget (so the turn deadline always wins), floored at 1ms.
    // AbortSignal.timeout is the aborter; it is composed with ctx.signal (user
    // Stop) so BOTH can tear the stream down — the catch below disambiguates which.
    const timeoutSignal = AbortSignal.timeout(
      Math.max(1, Math.min(providerCallTimeoutMs(), deadlineAt - Date.now())),
    );
    const callSignal = ctx.signal
      ? AbortSignal.any([ctx.signal, timeoutSignal])
      : timeoutSignal;

    // Transport/API faults here propagate to the route (NOT caught). The composed
    // signal is forwarded so an in-flight stream is torn down on Stop OR timeout.
    const stream = provider.streamTurn({
      system: systemSegments,
      tools: providerToolDefs,
      transcript,
      signal: callSignal,
    });

    // Stream answer_markdown out of the submit_answer tool args as they arrive.
    // Keyed on the tool-call index so parallel tool calls stay isolated; a
    // re-emitted submit_answer (after a validation failure) starts a fresh call
    // → fresh onAnswerStart → the client resets its buffer.
    let submitIndex: number | null = null;
    let extractor: AnswerMarkdownExtractor | null = null;
    // Captured for the prose fallback if this turn ends with no tool call.
    let assistantText = "";
    // Consuming the stream (and draining it via stream.final()) is the one place a
    // provider call can hang. Wrap both and CLASSIFY BY SIGNAL STATE, not by error
    // class: SDKs surface aborts inconsistently (APIUserAbortError / DOMException /
    // TimeoutError). ctx.signal.aborted → user Stop, rethrow so run-turn maps it to
    // `stopped` (unchanged). Else timeoutSignal.aborted → our timeout, degrade to a
    // valid in-domain OakAnswer. Else a genuine transport fault → rethrow (→ error).
    let final: FinalTurn;
    try {
      for await (const event of stream) {
        if (event.type === "tool_call_start") {
          if (event.name === hooks.submitToolName) {
            submitIndex = event.index;
            extractor = new AnswerMarkdownExtractor();
            onAnswerStart?.();
          }
        } else if (
          event.type === "tool_call_args_delta" &&
          event.index === submitIndex &&
          extractor !== null
        ) {
          const chunk = extractor.push(event.argChunk);
          if (chunk) onAnswerDelta?.(chunk);
        } else if (
          event.type === "tool_call_stop" &&
          event.index === submitIndex
        ) {
          submitIndex = null;
          extractor = null;
        } else if (event.type === "text_delta") {
          assistantText += event.text;
        } else if (event.type === "thinking_delta" && !reasoningNudged) {
          // Surface a single "reasoning…" tick so a long pre-answer reasoning phase
          // (e.g. Grok at reasoning_effort:low) reads as progress, not a stall.
          reasoningNudged = true;
          onProgress?.({ tool: "reasoning", label: "🤔 Reasoning…" });
        }
      }

      // Drain the stream into a normalized final turn.
      final = await stream.final();
    } catch (err) {
      // User Stop wins: rethrow so run-turn maps it to `stopped` (the composed
      // signal must never swallow a Stop). Our per-call timeout: degrade to a
      // valid in-domain OakAnswer (best-effort salvage if we have one). Anything
      // else is a genuine transport fault — rethrow so it becomes an error event.
      if (ctx.signal?.aborted) throw err;
      if (timeoutSignal.aborted) {
        ctx.logger.warn(
          {
            event: "oak_provider_call_timeout",
            timeout_ms: providerCallTimeoutMs(),
          },
          "oak provider call timed out; degrading to insufficient_data",
        );
        return finalizeBestEffortOrInsufficient("provider_call_timeout");
      }
      throw err;
    }

    accumulateUsage(state, final.usage);

    // Echo the assistant content back opaquely (the provider preserves whatever
    // its API needs for multi-turn continuity: thinking + tool_use blocks for
    // Anthropic, the assistant message + tool_calls for OpenAI).
    transcript.push(final.assistantContentToEcho);

    const toolCalls = final.toolCalls;

    // Model ended its turn without calling any tool — it never submitted an
    // answer. Nudge it back to submit_answer (the assistant turn was already
    // echoed above, so appending a user message keeps the transcript valid).
    // Only after the nudge budget is spent do we give up: surface the prose the
    // model wrote if we have any, else the generic insufficient_data apology.
    if (toolCalls.length === 0) {
      if (emptyTurnNudges < MAX_EMPTY_TURN_NUDGES) {
        emptyTurnNudges += 1;
        transcript.push(provider.buildUserMessage(hooks.emptyTurnNudge));
        continue;
      }
      return finalizeBestEffortOrInsufficient(
        "model_ended_turn_without_submit_answer",
        assistantText,
      );
    }

    // One ToolResult per tool call. Built provider-neutral, then handed to the
    // provider to shape into the next transcript message(s) (Anthropic: one user
    // message of tool_result blocks; OpenAI: one {role:"tool"} message each).
    const toolResults: ToolResult[] = [];
    let validAnswer: TAnswer | null = null;
    let submitFailed = false;
    // Accept-verdict annotation for this iteration's valid answer, applied to
    // the enriched answer below (for Oak: stamping server-authoritative
    // proposed-team warnings — the model never authors these).
    let acceptAnnotate: ((enriched: TAnswer) => void) | null = null;

    for (const call of toolCalls) {
      onProgress?.({
        tool: call.name,
        label: describeToolCall(call.name, call.input),
      });

      if (call.name === hooks.submitToolName) {
        const started = Date.now();
        const parsed = hooks.answerSchema.safeParse(
          sanitizeCitationAnchors(call.input),
        );
        if (parsed.success) {
          // Domain-validate the schema-valid answer via the hook (for Oak:
          // roster legality of a proposed_team — see validateOakAnswer). The
          // hook owns its retry budget; the loop just counts rejections.
          const verdict = await runValidateAnswer(
            parsed.data,
            ctx,
            answerRejections,
          );
          if (!verdict.ok) {
            answerRejections += 1;
            // Remember this attempt (schema-valid) so a later give-up salvages
            // it instead of discarding the model's work. Keep the LAST attempt.
            bestEffortAnswer = parsed.data;
            bestEffortAnnotate = verdict.annotateBestEffort ?? null;
            state.toolTrace.push({
              tool: call.name,
              args: call.input,
              latency_ms: Date.now() - started,
              cache_hit: false,
              error: verdict.traceError,
            });
            toolResults.push({
              toolCallId: call.id,
              isError: true,
              content: verdict.feedback,
            });
            continue;
          }
          validAnswer = parsed.data;
          acceptAnnotate = verdict.annotate ?? null;
          state.toolTrace.push({
            tool: call.name,
            args: call.input,
            latency_ms: Date.now() - started,
            cache_hit: false,
            error: null,
          });
          toolResults.push({
            toolCallId: call.id,
            content: "Answer accepted.",
            isError: false,
          });
        } else {
          submitFailed = true;
          const detail = formatZodIssues(parsed.error);
          state.toolTrace.push({
            tool: call.name,
            args: call.input,
            latency_ms: Date.now() - started,
            cache_hit: false,
            error: detail,
          });
          toolResults.push({
            toolCallId: call.id,
            isError: true,
            content:
              `Your ${hooks.submitToolName} payload failed validation: ${detail}. ` +
              `Call ${hooks.submitToolName} again with a corrected payload that matches ` +
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
      if (boxBuild && BOX_FORBIDDEN_TOOLS.has(call.name)) {
        state.toolTrace.push({
          tool: call.name,
          args: call.input,
          latency_ms: Date.now() - started,
          cache_hit: false,
          error: "forbidden_on_box_build",
        });
        toolResults.push({
          toolCallId: call.id,
          content: JSON.stringify({ error: "forbidden_on_box_build" }),
          isError: true,
        });
        continue;
      }
      let result: unknown;
      let errorMessage: string | null = null;
      try {
        result = await hooks.dispatch(call.name, call.input, ctx);
        // Stash successful single-Pokémon profiles for subjects[] enrichment.
        if (
          call.name === "get_pokemon" &&
          result &&
          typeof result === "object" &&
          (result as { found?: unknown }).found === true
        ) {
          lookedUpProfiles.push(result as PokemonProfile);
        }
        // Stash query_pokedex {args,result} pairs for candidates.hidden_rows
        // enrichment (dispatch didn't throw ⇒ result is a documented shape).
        if (call.name === "query_pokedex") {
          queryPokedexCalls.push({ args: call.input, result });
        }
      } catch (caught) {
        errorMessage =
          caught instanceof Error ? caught.message : String(caught);
        result = { error: "tool_error", detail: errorMessage };
      }
      state.toolTrace.push({
        tool: call.name,
        args: call.input,
        latency_ms: Date.now() - started,
        cache_hit: false,
        error: errorMessage,
      });
      toolResults.push({
        toolCallId: call.id,
        content: JSON.stringify(result),
        isError: Boolean(errorMessage),
      });
    }

    // A valid answer terminates the turn immediately (no further API call, so
    // the unused tool_results are harmless). Enrich it first (for Oak: backfill
    // sprite_url/dex_number/types and derive subjects[] when absent, so sprites
    // are model-independent — enrichment never throws and never weakens the
    // answer), then apply the accept verdict's annotation (for Oak: stamp
    // proposed-team warnings server-authoritatively).
    if (validAnswer) {
      const enriched = await doEnrich(validAnswer);
      acceptAnnotate?.(enriched);
      return doFinalize(enriched);
    }

    // submit_answer was emitted but invalid: re-emit up to the budget, then
    // synthesize insufficient_data.
    if (submitFailed) {
      submitRetries += 1;
      if (submitRetries > MAX_SUBMIT_RETRIES) {
        return finalizeBestEffortOrInsufficient(
          "submit_answer_invalid_after_retries",
        );
      }
    }

    // Hand the tool results back (provider-shaped) and loop.
    for (const m of provider.buildToolResultMessages(toolResults)) {
      transcript.push(m);
    }

    // Submit nudge (once per turn): late-iteration OR soft time-budget. The
    // model is STILL gathering (reached here with tools, no valid submit).
    // Team-build uses BUILD_SUBMIT_NUDGE; roster uses ROSTER_SUBMIT_NUDGE.
    // Time path leaves ~timeNudgeRemainingMs() for one more provider call
    // before the hard turn deadline. One flag prevents double-nudge.
    const nearIterCap =
      iteration >= maxIterations - submitNudgeRemaining;
    const remainingMs = deadlineAt - Date.now();
    const nearTimeCap = remainingMs <= timeNudgeRemainingMs();
    if (!submitNudged && (nearIterCap || nearTimeCap)) {
      submitNudged = true;
      if (nearTimeCap && !nearIterCap) {
        ctx.logger.info(
          {
            event: "oak_time_budget_nudge",
            remaining_ms: remainingMs,
            deadline_ms: turnDeadlineMs(),
          },
          "oak soft time-budget nudge; asking model to submit now",
        );
      }
      transcript.push(provider.buildUserMessage(submitNudgeText));
    }
  }

  // Iteration cap reached without a valid submit_answer.
  return finalizeBestEffortOrInsufficient("max_iterations_reached");
}

/**
 * Run the tool-loop against a raw Anthropic client. Retained as the existing
 * test seam (recorded-transcript injection wraps a fake client in the Anthropic
 * provider); production goes through {@link runOak}.
 */
export async function runOakWith(
  client: AnthropicClientLike,
  message: string,
  history: ChatMessage[],
  ctx: AgentContext,
  onProgress?: OnProgress,
  onAnswerStart?: OnAnswerStart,
  onAnswerDelta?: OnAnswerDelta,
): Promise<OakAnswer> {
  const provider = new AnthropicProvider({}, client);
  return runWithProvider(
    provider,
    message,
    history,
    ctx,
    onProgress,
    onAnswerStart,
    onAnswerDelta,
  );
}

/**
 * The agent entry point. Selects the provider for `ctx.model` (default Grok),
 * runs the tool-loop, and returns a schema-valid OakAnswer. See the module
 * header for the full contract.
 */
export const runOak: RunOak = (
  message,
  history,
  ctx,
  onProgress,
  onAnswerStart,
  onAnswerDelta,
) =>
  runWithProvider(
    providerFor(ctx.model),
    message,
    history,
    ctx,
    onProgress,
    onAnswerStart,
    onAnswerDelta,
  );

export default runOak;
