/**
 * Data-scope formats — the discriminator stored on index rows, teams, and
 * conversations.
 *
 * Champions-first (ADR-3 / ADR-4): ingest and runtime are Champions-only
 * (`DEFAULT_FORMATS` is `["champions"]`). The historical {@link FORMATS} union
 * remains so archived teams and old conversations still decode
 * (`isFormat("gen-7")` etc.). Repos filter by the active format, which is
 * derived from the turn's {@link AgentMode} (server-controlled — see
 * `@/agent/types`). This module holds ONLY pure constants/mappings (no @pkmn or
 * DB imports) so it is safe to import from repos, tools, ingest, and tests.
 */

import type { AgentMode } from "@/agent/types";

/**
 * Mainline generation scopes beyond Gen 9 (GS-D1), widened by the National Dex
 * scope feature to include Gens 1–4 (GS-D1 originally excluded them for their
 * pre-nature/EV stat systems; Gen 1–2 now has a dedicated stat formula — see
 * `computeStatGen12` in `@/agent/formulas/compute-stat` — and Gens 3–4 share the
 * modern formula). Gen 9 keeps its existing `"scarlet-violet"` format name
 * (stored conversations/teams/ingest_meta already reference it). This is the
 * single source of truth for the gen-scope literal set — `AgentMode` in
 * `@/agent/types` derives its gen members from this type.
 */
export type GenFormat = "gen-5" | "gen-6" | "gen-7" | "gen-8" | "gen-4" | "gen-3" | "gen-2" | "gen-1";

/**
 * A data scope stored in the index.
 *   "scarlet-violet" — Gen 9 / Scarlet-Violet (standard mode; today's behavior).
 *   "champions"      — Pokémon Champions (current regulation), from the @pkmn
 *                      `champions` mod.
 *   "national-dex"   — the whole-Pokédex, form-aware reference scope (all
 *                      battle-relevant forms across every generation); rides
 *                      the Gen 9 dex like `scarlet-violet` (near-duplicate
 *                      data today, kept as its own format for clean semantics
 *                      and in case Scarlet/Violet ever gains a legality gate).
 *   "gen-5"…"gen-8"  — mainline generations 5–8 (generation-scope feature),
 *                      built from `Dex.forGen(n)`.
 *   "gen-1"…"gen-4"  — mainline generations 1–4, built from `Dex.forGen(n)`.
 */
export type Format = "scarlet-violet" | "champions" | "national-dex" | GenFormat;

/**
 * Historical stored-row union (archived teams, old conversations, turn_record).
 * Append-only. Not the ingest/runtime set — see {@link DEFAULT_FORMATS}.
 */
export const FORMATS = [
  "scarlet-violet",
  "champions",
  "gen-5",
  "gen-6",
  "gen-7",
  "gen-8",
  "national-dex",
  "gen-4",
  "gen-3",
  "gen-2",
  "gen-1",
] as const;

/**
 * Formats `runIngest` builds when none are specified. Champions-first (ADR-4):
 * ingest and runtime are Champions-only — not the full {@link FORMATS} tuple.
 */
export const DEFAULT_FORMATS = ["champions"] as const satisfies readonly Format[];

/**
 * Display order for remaining product pickers. Champions-first (ADR-3):
 * Champions is the only live format — National Dex is not the default.
 * {@link FORMATS} is unchanged so archived stored rows still decode.
 */
export const SCOPE_PICKER_ORDER: readonly Format[] = ["champions"];

/** The standard (non-Champions) format — today's Gen 9 scope. */
export const STANDARD_FORMAT: Format = "scarlet-violet";

/** The Champions format. */
export const CHAMPIONS_FORMAT: Format = "champions";

/** The National Dex format — the whole-Pokédex, form-aware reference scope. */
export const NATDEX_FORMAT: Format = "national-dex";

/**
 * The regulation the base `champions` @pkmn mod currently tracks (it always
 * tracks the LATEST regulation; bumping `@pkmn/mods` + re-ingesting advances it).
 * Surfaced to users via `generation_basis.note` in Champions answers. Update
 * this one line when the regulation rotates.
 */
export const CHAMPIONS_REGULATION = "Regulation M-B";

/**
 * Map the turn's agent mode to the data format the repos should query.
 *   "champions" → champions; "standard" → scarlet-violet (Gen 9); "national-dex"
 *   maps 1:1; a gen scope ("gen-1"…"gen-8") maps 1:1 to the same-named format.
 */
export function formatForMode(mode: AgentMode): Format {
  if (mode === "champions") return CHAMPIONS_FORMAT;
  if (mode === "standard") return STANDARD_FORMAT;
  return mode; // national-dex + gen scopes map 1:1 (GenFormat ⊂ Format)
}

/**
 * Inverse of {@link formatForMode}: map a stored conversation `format` back to
 * the agent mode. Used when resuming a saved conversation, whose mode is derived
 * from its stored format — never from the request body (BR-H6).
 *   champions → "champions"; scarlet-violet → "standard"; national-dex/gen-N →
 *   itself.
 */
export function modeForFormat(format: Format): AgentMode {
  // Literal comparisons (not the Format-typed constants) so TS narrows `format`
  // to "national-dex" | GenFormat by the final return.
  if (format === "champions") return "champions";
  if (format === "scarlet-violet") return "standard";
  return format; // national-dex + gen scopes map 1:1 (⊂ AgentMode)
}

/**
 * The Dex generation number backing a format. Champions and National Dex both
 * ride the Gen 9 dex, so both resolve to 9 alongside `scarlet-violet`; gen
 * scopes read their trailing digit ("gen-7" → 7, "gen-2" → 2). The
 * national-dex check must come BEFORE the trailing-digit slice — "national-dex"
 * has no numeric suffix and would otherwise resolve to `NaN`. Used by the
 * gen-provider (`Dex.forGen`), the pokedex builder's learnset source filter,
 * and prompt fallbacks.
 */
export function genNumberForFormat(format: Format): number {
  if (format === STANDARD_FORMAT || format === CHAMPIONS_FORMAT) return 9;
  if (format === NATDEX_FORMAT) return 9;
  return Number(format.slice("gen-".length));
}

/**
 * The `generation_basis.generation` tag for answers in this format. Champions →
 * "champions"; scarlet-violet → "gen-9"; national-dex intentionally falls
 * through to its own format name ("national-dex") — it is not tied to a single
 * generation's basis; a gen scope is its own tag ("gen-1"…"gen-8"). Distinct
 * from {@link Format} because the standard format's storage name
 * ("scarlet-violet") differs from its answer basis tag ("gen-9").
 */
export function basisForFormat(format: Format): string {
  if (format === CHAMPIONS_FORMAT) return "champions";
  if (format === STANDARD_FORMAT) return "gen-9";
  return format; // "national-dex" (falls through intentionally) or "gen-1"…"gen-8"
}

/**
 * Type guard for a known stored-row format string (archived teams, old
 * conversations). Accepts the full historical {@link FORMATS} union (ADR-3).
 * Ingest/runtime do not use this to accept other games — those are Champions-only.
 */
export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}
