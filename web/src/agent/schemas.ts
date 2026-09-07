/**
 * Cross-phase contract surface — Zod schemas (single source of truth, A5).
 *
 * This module is the ONLY definition of:
 *  - the input/output shapes for all 11 tools (T1..T11, tools.md), and
 *  - the `OakAnswer` object emitted by `submit_answer` (T11 / output-formats.md).
 *
 * TS types are inferred from these schemas; the Anthropic SDK tool `input_schema`
 * values and the `submit_answer` JSON Schema are GENERATED from them via
 * zod-to-json-schema (zod@3 + zod-to-json-schema — the supported pairing).
 *
 * Tool names and output field names match tools.md / output-formats.md exactly —
 * the model depends on them; never rename.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Pure, client-safe module (no server-only / env / SDK) — safe to import from
// this shared schema surface. Single source of truth for the full `Format` set
// (all six scopes) so the team enums below stay in lockstep with the ingest.
import { FORMATS } from "@/data/formats";
// Pure, client-safe (no @pkmn/DB/server imports) — the competitive-ladder axis
// for T21 get_meta_usage's input enum (kept in lockstep with the meta warehouse).
import { META_FORMAT_IDS, DEFAULT_META_FORMAT } from "@/data/meta-formats";
import {
  teamMembersSchema,
  teamWarningSchema,
  type TeamWarning,
} from "@/data/teams/team-schema";
// Type-only — erased at compile, so this shared module never pulls the
// server-only active-team service (or its repos) into a client bundle.
import type { EnrichedActiveTeam } from "@/server/teams/active-team";

// ---------------------------------------------------------------------------
// Shared enums / leaf schemas
// ---------------------------------------------------------------------------

/** The 18 canonical type slugs (output-formats.md `definitions.typeName`). */
export const TYPE_NAMES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export const typeNameSchema = z.enum(TYPE_NAMES);

/**
 * Type display order used in-game by Pokémon Champions (NOT alphabetical and NOT
 * the `TYPE_NAMES` enum order). A permutation of TYPE_NAMES — same 18 members,
 * presentation order only. Pinned as a permutation by schemas.test.ts.
 */
export const TYPE_DISPLAY_ORDER = [
  "normal",
  "grass",
  "fire",
  "water",
  "electric",
  "bug",
  "flying",
  "rock",
  "poison",
  "ground",
  "ice",
  "fighting",
  "psychic",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

const TYPE_DISPLAY_RANK = new Map<string, number>(
  TYPE_DISPLAY_ORDER.map((t, i) => [t, i]),
);

/** Sort index for a type slug in Champions display order; unknown/"" sorts last. */
export function typeDisplayIndex(type: string): number {
  return TYPE_DISPLAY_RANK.get(type) ?? Number.MAX_SAFE_INTEGER;
}

/** Stat keys usable in query_pokedex filters/sort (tools.md T2). */
export const STAT_KEYS = [
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
  "base_stat_total",
] as const;

export const statKeySchema = z.enum(STAT_KEYS);

/** Entity kinds resolvable by T1 / present in searchable_names. */
export const ENTITY_KINDS = [
  "pokemon",
  "move",
  "ability",
  "type",
  "item",
] as const;

export const entityKindSchema = z.enum(ENTITY_KINDS);

/** Six-stat block shared by query_pokedex rows and get_pokemon. */
export const baseStatsSchema = z.object({
  hp: z.number().int(),
  attack: z.number().int(),
  defense: z.number().int(),
  special_attack: z.number().int(),
  special_defense: z.number().int(),
  speed: z.number().int(),
});

/**
 * Ability block. `slot1` is always present; `slot2`/`hidden` may be absent (a
 * Pokémon with no second/hidden ability) or omitted entirely (tools.md T2/T3).
 */
export const abilitiesSchema = z.object({
  slot1: z.string(),
  slot2: z.string().nullish(),
  hidden: z.string().nullish(),
});

/**
 * A JSON scalar value (string | number | boolean | null) — the value type for the
 * free-form maps inside `submit_answer` (candidate `key_stats`, `damage_calc`
 * assumptions/result). Closed on purpose: `z.record(z.unknown())` generates an
 * open `additionalProperties: {}` in the tool's JSON Schema, which xAI's
 * always-strict tool-argument validator can reject at stream-open (and the loop's
 * Zod re-emit budget does NOT cover a request-time schema rejection). These maps
 * only ever hold scalars, so a typed value schema keeps them permissive while
 * emitting a concrete `additionalProperties` xAI accepts.
 */
export const jsonScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

// ===========================================================================
// T1 — resolve_entity
// ===========================================================================

export const resolveEntityInputSchema = z.object({
  query: z.string(),
  kind: z
    .enum(["pokemon", "move", "ability", "type", "item", "any"])
    .default("any"),
  limit: z.number().int().min(1).max(10).default(5),
});

export const resolveEntityOutputSchema = z.object({
  matches: z.array(
    z.object({
      kind: entityKindSchema,
      slug: z.string(),
      display_name: z.string(),
      score: z.number(),
    }),
  ),
  /** Champions mode only: the entity missed here but exists in the mainline
   *  Gen 9 (scarlet-violet) index — surface the cross-scope hint. Additive. */
  exists_in_standard: z.boolean().optional(),
});

// ===========================================================================
// T2 — query_pokedex (the workhorse)
// ===========================================================================

export const statFilterSchema = z.object({
  stat: statKeySchema,
  op: z.enum([">", ">=", "<", "<=", "=="]),
  value: z.number().int(),
});

export const queryPokedexInputSchema = z.object({
  types: z.array(z.string()).optional(),
  abilities: z.array(z.string()).optional(),
  moves: z.array(z.string()).optional(),
  stat_filters: z.array(statFilterSchema).optional(),
  sort_by: statKeySchema.or(z.literal("national_dex_number")).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  // Default 50 (was 20): a 20-row default silently truncated common
  // intersection queries (e.g. 23 results → "20 of 23"). Max stays 100.
  limit: z.number().int().min(1).max(100).default(50),
});

/** One row in a query_pokedex result set. */
export const pokedexRowSchema = z.object({
  display_name: z.string(),
  national_dex_number: z.number().int(),
  types: z.array(z.string()),
  abilities: abilitiesSchema,
  base_stats: baseStatsSchema,
  base_stat_total: z.number().int(),
  sprite_url: z.string(),
  is_gen9_native: z.boolean(),
  source_generation: z.string().nullish(),
});

/** Successful query result. */
export const queryPokedexResultSchema = z.object({
  total_count: z.number().int(),
  truncated: z.boolean(),
  sort: z.string().nullable(),
  results: z.array(pokedexRowSchema),
});

/** Full output union: success | index unavailable | unresolved slugs. */
export const queryPokedexOutputSchema = z.union([
  queryPokedexResultSchema,
  z.object({ error: z.literal("index_unavailable") }),
  z.object({ unresolved: z.array(z.string()) }),
]);

// ===========================================================================
// T3 — get_pokemon
// ===========================================================================

export const getPokemonInputSchema = z.object({
  name: z.string(),
});

export const pokemonProfileSchema = z.object({
  found: z.literal(true),
  display_name: z.string(),
  national_dex_number: z.number().int(),
  types: z.array(z.string()),
  abilities: abilitiesSchema,
  base_stats: baseStatsSchema,
  base_stat_total: z.number().int(),
  sprite_url: z.string(),
  artwork_url: z.string(),
  forms: z.array(z.string()),
  is_gen9_native: z.boolean(),
  source_generation: z.string().nullish(),
  /**
   * Held item this form MUST carry (a Mega's stone slug, e.g. "swampertite");
   * null/absent for ordinary forms. Team builder locks it; validateTeam
   * rejects any other held item on this species.
   */
  required_item: z.string().nullable().optional(),
});

/** Generic "not found, here are close names" miss shape (BR-9). */
export const notFoundSchema = z.object({
  found: z.literal(false),
  suggestions: z.array(z.string()),
  /** Champions mode only: the entity missed here but exists in the mainline
   *  Gen 9 (scarlet-violet) index — surface the cross-scope hint. Additive. */
  exists_in_standard: z.boolean().optional(),
});

/** PokeAPI-down miss shape for read-through-cache tools. */
export const upstreamUnavailableSchema = z.object({
  error: z.literal("upstream_unavailable"),
});

export const getPokemonOutputSchema = z.union([
  pokemonProfileSchema,
  notFoundSchema,
]);

// ===========================================================================
// T4 — get_move
// ===========================================================================

export const getMoveInputSchema = z.object({
  name: z.string(),
  include_gen9_learner_count: z.boolean().default(false),
});

export const moveDetailSchema = z.object({
  found: z.literal(true),
  display_name: z.string(),
  type: z.string(),
  damage_class: z.enum(["physical", "special", "status"]),
  power: z.number().int().nullable(),
  accuracy: z.number().int().nullable(),
  pp: z.number().int().nullable(),
  priority: z.number().int(),
  target: z.string(),
  hits_allies: z.boolean().optional(),
  spread_modifier_doubles: z.number().nullable().optional(),
  effect_short: z.string(),
  effect_full: z.string(),
  gen9_learner_count: z.number().int().optional(),
});

export const getMoveOutputSchema = z.union([
  moveDetailSchema,
  notFoundSchema,
  upstreamUnavailableSchema,
]);

// ===========================================================================
// T5 — get_ability
// ===========================================================================

export const getAbilityInputSchema = z.object({
  name: z.string(),
});

export const abilityDetailSchema = z.object({
  found: z.literal(true),
  display_name: z.string(),
  effect_short: z.string(),
  effect_full: z.string(),
});

export const getAbilityOutputSchema = z.union([
  abilityDetailSchema,
  notFoundSchema,
  upstreamUnavailableSchema,
]);

// ===========================================================================
// T6 — get_type_matchups
// ===========================================================================

export const getTypeMatchupsInputSchema = z.object({
  types: z.array(z.string()).min(1).max(2),
});

export const typeMatchupsDetailSchema = z.object({
  found: z.literal(true),
  types: z.array(z.string()),
  // Offensive profile is present for a single type; omitted for a two-type
  // combined defensive request (tools.md T6).
  offensive: z
    .object({
      super_effective_against: z.array(z.string()),
      not_very_effective_against: z.array(z.string()),
      no_effect_against: z.array(z.string()),
    })
    .optional(),
  defensive: z.object({
    weak_to: z.array(z.string()),
    resists: z.array(z.string()),
    immune_to: z.array(z.string()),
    // Quad-multiplier subsets of weak_to/resists, surfaced for the artifact
    // viewer's matchup grid (x4 / x0.25). OPTIONAL (default []): omitted by every
    // existing producer/consumer (chat answer, get_type_matchups tool, ingest)
    // so they stay byte-for-byte compatible — only the artifact assembler fills
    // them. weak_to / resists / immune_to semantics are UNCHANGED (quad_* are
    // strict subsets). Kept `.optional()` rather than `.default([])` so the
    // INFERRED OUTPUT type leaves them absent for producers that don't supply
    // them (a forced default would require every type-chart producer to emit the
    // fields and break typecheck).
    quad_weak_to: z.array(z.string()).optional(),
    quad_resists: z.array(z.string()).optional(),
  }),
});

export const getTypeMatchupsOutputSchema = z.union([
  typeMatchupsDetailSchema,
  notFoundSchema,
  upstreamUnavailableSchema,
]);

// ===========================================================================
// T7 — get_evolution_chain
// ===========================================================================

export const getEvolutionChainInputSchema = z.object({
  species: z.string(),
});

/**
 * One evolution edge. `trigger` is always present; the remaining condition
 * fields vary by trigger (item, min_happiness, time_of_day, min_level, …), so
 * additional keys are allowed (tools.md T7 — "as provided by PokeAPI").
 */
export const evolutionConditionSchema = z
  .object({ trigger: z.string() })
  .passthrough();

export const evolutionChainDetailSchema = z.object({
  found: z.literal(true),
  chain: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      conditions: z.array(evolutionConditionSchema),
    }),
  ),
  /** Champions scope only: the species missed the Champions roster, so this is
   *  the mainline Gen 9 chain — additive, mirrors `exists_in_standard`. */
  source_format: z.literal("scarlet-violet").optional(),
});

export const getEvolutionChainOutputSchema = z.union([
  evolutionChainDetailSchema,
  notFoundSchema,
  upstreamUnavailableSchema,
]);

// ===========================================================================
// T8 — get_item
// ===========================================================================

export const getItemInputSchema = z.object({
  name: z.string(),
});

export const itemDetailSchema = z.object({
  found: z.literal(true),
  display_name: z.string(),
  effect_short: z.string(),
  effect_full: z.string(),
  held_by_wild: z
    .array(
      z.object({
        pokemon: z.string(),
        rarity_percent: z.number(),
      }),
    )
    .optional(),
});

export const getItemOutputSchema = z.union([
  itemDetailSchema,
  notFoundSchema,
  upstreamUnavailableSchema,
]);

// ===========================================================================
// T14 — get_encounters (PokeAPI catch-location / obtain-method data)
//
// STANDARD MODE ONLY. The data covers Gen 1 → Sword/Shield + Let's Go (PokeAPI
// has no encounter records for Scarlet/Violet, Legends: Arceus, or BDSP). Built
// offline from a committed snapshot (src/ingest/build-encounters.ts) and stored
// in reference_cache under resource_kind "encounters". See get-encounters.ts.
// ===========================================================================

export const getEncountersInputSchema = z.object({
  name: z.string(),
});

/** One place a species can be obtained within a version-group. */
export const encounterLocationSchema = z.object({
  location_display: z.string(),
  region: z.string().nullable(),
  /** "walk" | "surf" | "old-rod" | "gift" | "gift-egg" | "npc-trade" | … */
  method: z.string(),
  min_level: z.number().int().nullable(),
  max_level: z.number().int().nullable(),
  /** Best (max) encounter rate % across the aggregated slots; null if unknown. */
  chance: z.number().nullable(),
  /** Meaningful conditions (swarm/season/radar/story); time-of-day is stripped. */
  conditions: z.array(z.string()),
});

/** Encounters for one version-group (e.g. Gold/Silver), with its game versions. */
export const encounterGroupSchema = z.object({
  version_group: z.string(),
  generation: z.number().int(),
  versions: z.array(z.string()),
  locations: z.array(encounterLocationSchema),
  // Present ONLY on a gen-scoped turn (mode "gen-5".."gen-8"): true when this
  // group's generation matches the active scope (B-12 annotate+foreground).
  // Absent on standard/champions turns — byte-identical to pre-B-12 output.
  in_active_scope: z.boolean().optional(),
});

export const encounterDetailSchema = z.object({
  found: z.literal(true),
  name: z.string(),
  encounters: z.array(encounterGroupSchema),
  // Non-null ONLY when `encounters` is empty: explains that PokeAPI records no
  // catch data for this species (obtain via evolution/breeding/trade/event, or it
  // exists only in a PokeAPI-uncovered game — Gen 9 / Legends: Arceus / BDSP).
  coverage_note: z.string().nullish(),
  // Set ONLY on a gen-scoped turn (mode "gen-5".."gen-8") when NO encounter
  // group matches the active generation — every group is still returned, just
  // none flagged in_active_scope (B-12). Null/absent on standard/champions
  // turns and whenever at least one group matches.
  scope_note: z.string().nullish(),
});

export const getEncountersOutputSchema = z.union([
  encounterDetailSchema,
  notFoundSchema,
  z.object({ error: z.literal("index_unavailable") }),
  z.object({ error: z.literal("not_available_in_champions") }),
]);

// ===========================================================================
// T15 — get_usage_stats (championsbattledata.com live competitive usage)
//
// CHAMPIONS MODE ONLY (the mirror of get_encounters' standard-only gate). Fetches
// live usage — most-used moves/items/abilities/natures/stat-spreads/teammates,
// each with a usage % — from championsbattledata.com AT REQUEST TIME (the only
// network-at-request-time tool; everything else reads the offline @pkmn index).
// The data is community-maintained, time-varying, and fan-sourced, so answers
// MUST cite the source + season + `fetched_at` and flag uncertainty. A standard-
// mode turn short-circuits to `not_available_in_standard`. See
// get-usage-stats.tool.ts + src/server/champions-usage/usage-client.ts.
// ===========================================================================

/** Battle format the usage ladder is keyed by (the API uses "Doubles"/"Singles"). */
export const usageFormatSchema = z.enum(["singles", "doubles"]);

export const getUsageStatsInputSchema = z.object({
  name: z.string(),
  format: usageFormatSchema.default("doubles"),
});

/** One ranked usage row within a category (e.g. a move used 90.3% of the time). */
export const usageEntrySchema = z.object({
  name: z.string(),
  /** Usage percentage as a number, e.g. 90.3 (parsed from the API's "90.3%"). */
  pct: z.number().nullable(),
  rank: z.number().int(),
});

export const usageStatsDetailSchema = z.object({
  found: z.literal(true),
  name: z.string(),
  /** The championsbattledata `saved_name` actually queried (form-specific). */
  saved_name: z.string(),
  format: usageFormatSchema,
  /** The API season label this snapshot is from, e.g. "Season M-3". */
  season: z.string(),
  /** Epoch-ms when Oak fetched this snapshot (the API carries no timestamp). */
  fetched_at: z.number().int(),
  moves: z.array(usageEntrySchema),
  items: z.array(usageEntrySchema),
  abilities: z.array(usageEntrySchema),
  natures: z.array(usageEntrySchema),
  spreads: z.array(usageEntrySchema),
  teammates: z.array(usageEntrySchema),
  source_url: z.string(),
  attribution: z.string(),
});

export const getUsageStatsOutputSchema = z.union([
  usageStatsDetailSchema,
  notFoundSchema,
  upstreamUnavailableSchema,
  z.object({ error: z.literal("not_available_in_standard") }),
]);

// ===========================================================================
// T9 — compute_stat
// ===========================================================================

export const computeStatInputSchema = z.object({
  base_stat: z.number().int(),
  is_hp: z.boolean().default(false),
  iv: z.number().int().min(0).max(31).default(31),
  ev: z.number().int().min(0).max(252).default(0),
  level: z.number().int().min(1).max(100).default(50),
  nature_effect: z.enum(["boosted", "neutral", "hindered"]).default("neutral"),
});

export const invalidInputSchema = z.object({
  error: z.literal("invalid_input"),
  detail: z.string(),
});

export const computeStatResultSchema = z.object({
  value: z.number().int(),
  breakdown: z.string(),
  inputs_echo: z.record(z.unknown()),
});

export const computeStatOutputSchema = z.union([
  computeStatResultSchema,
  invalidInputSchema,
]);

// ===========================================================================
// T10 — estimate_damage
// ===========================================================================

export const estimateDamageInputSchema = z.object({
  level: z.number().int().default(50),
  power: z.number().int(),
  attack_stat: z.number().int(),
  defense_stat: z.number().int(),
  stab: z.boolean().default(false),
  type_effectiveness: z.number().default(1),
  other_modifier: z.number().default(1),
});

export const estimateDamageResultSchema = z.object({
  min_damage: z.number().int(),
  max_damage: z.number().int(),
  is_estimate: z.literal(true),
  breakdown: z.string(),
  inputs_echo: z.record(z.unknown()),
});

export const estimateDamageOutputSchema = z.union([
  estimateDamageResultSchema,
  invalidInputSchema,
]);

// ===========================================================================
// T11 — submit_answer / OakAnswer (output-formats.md)
// ===========================================================================

// OakAnswer sub-objects are `.strict()` so runtime validation rejects
// unknown keys — mirroring `additionalProperties: false` in the generated JSON
// Schema (output-formats.md). Free-form objects (assumptions/result/key_stats)
// stay open via z.record.
export const citationSchema = z
  .object({
    source: z.string(),
    detail: z
      .string()
      .describe(
        "User-visible, plain player language describing the fact relied on. No internal tool, table, or column names and no SQL — say where it came from in plain English (e.g. 'Oak's complete Pokédex records').",
      ),
    endpoint_url: z.string().optional(),
    // Optional highlight target. Invalid / extra-keyed anchors are stripped by
    // sanitizeCitationAnchors before parse (CIT-BR-3) — they must never fail
    // submit_answer. Absent → no highlight (CIT-AC-1.2).
    anchor: z
      .object({
        target: z.enum(["answer_span", "fact_row"]),
        id: z.string(),
      })
      .optional(),
  })
  .strict();

export const inferenceSchema = z
  .object({
    claim: z
      .string()
      .describe(
        "User-visible, plain player language stating the deduction. No internal tool, table, or column names.",
      ),
    confidence: z.enum(["high", "medium", "low"]),
    note: z
      .string()
      .optional()
      .describe(
        "User-visible, plain player language explaining the deduction. No internal tool, table, or column names.",
      ),
  })
  .strict();

export const generationBasisSchema = z
  .object({
    generation: z.string(),
    fallback: z.boolean(),
    note: z
      .string()
      .optional()
      .describe(
        "User-visible, plain player language on what the answer is based on. No internal tool, table, or column names — describe provenance in plain English (e.g. 'stored monthly Smogon usage statistics').",
      ),
  })
  .strict();

export const subjectSchema = z
  .object({
    name: z.string(),
    dex_number: z.number().int().optional(),
    sprite_url: z.string(),
    types: z.array(typeNameSchema),
    is_fallback: z.boolean(),
    source_generation: z.string().optional(),
  })
  .strict();

export const candidateRowSchema = z
  .object({
    name: z.string(),
    dex_number: z.number().int().optional(),
    sprite_url: z.string().optional(),
    types: z.array(typeNameSchema),
    // The full six-stat block, copied verbatim from the query_pokedex result.
    // Rendered in fixed order (HP, Attack, Defense, SpA, SpD, Speed). Optional +
    // strict keeps older `key_stats`-only payloads valid (CandidateTable falls
    // back to key_stats when base_stats is absent).
    base_stats: baseStatsSchema.optional(),
    key_stats: z.record(jsonScalarSchema).optional(),
    ability: z.string().optional(),
  })
  .strict();

export const candidatesSchema = z
  .object({
    total_count: z.number().int(),
    truncated: z.boolean(),
    sort: z.string().nullable().optional(),
    shown: z.array(candidateRowSchema),
    // SERVER-POPULATED (enrichment) — the rows beyond `shown`, so clients can
    // expand a truncated list locally instead of firing a follow-up chat turn.
    // Declared because candidatesSchema is `.strict()`; NEVER model-authored —
    // enrichment strips any model-emitted value and sets it server-side only.
    hidden_rows: z.array(candidateRowSchema).optional(),
  })
  .strict();

export const damageCalcSchema = z
  .object({
    assumptions: z.record(jsonScalarSchema),
    result: z.record(jsonScalarSchema),
    is_estimate: z.literal(true),
    breakdown: z.string().optional(),
  })
  .strict();

// A single selectable option in a `question` (the "ask the user" affordance).
// `label` is sent verbatim as the next user message when the option is clicked,
// so it must read as the user's reply (e.g. "Singles", "Doubles"). `description`
// is optional helper text shown under the label.
export const questionOptionSchema = z
  .object({
    label: z.string(),
    description: z.string().optional(),
  })
  .strict();

// Present on a `clarification_needed` answer when the agent stops to ask a
// focused question. The UI renders `options` as clickable buttons; the
// always-present composer covers the free-text path. 2-4 mutually-exclusive
// choices keep the affordance meaningful (a wider/narrower set is a prompt bug).
export const questionSchema = z
  .object({
    options: z.array(questionOptionSchema).min(2).max(4),
  })
  .strict();

// The agent's proposed team (TEAM-AD-6) — a buildable team the user can Apply.
// Extracted as a named schema so the `proposed_team` answer field, the
// `save_team` tool input, and `ctx.proposedTeam` all share one definition.
export const proposedTeamSchema = z
  .object({
    name: z.string(),
    format: z.enum(FORMATS),
    members: teamMembersSchema,
  })
  .strict();

// A reference to a team the agent SAVED this turn via `save_team` (T13). The
// route stamps this onto the answer authoritatively (server-owned id), so the
// UI can render a persistent "Saved ✓ — open in viewer" card and the model
// never has to copy a UUID.
export const savedTeamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    format: z.enum(FORMATS),
  })
  .strict();

export const oakAnswerSchema = z
  .object({
    status: z.enum([
      "answered",
      "clarification_needed",
      "resolution_failed",
      "insufficient_data",
    ]),
    answer_markdown: z.string(),
    reasoning_markdown: z
      .string()
      .describe(
        "User-visible, plain player language explaining how you reached the answer. No internal tool, table, or column names, no SQL — describe where facts came from in plain English.",
      ),
    citations: z.array(citationSchema),
    inferences: z.array(inferenceSchema),
    generation_basis: generationBasisSchema,
    subjects: z.array(subjectSchema).optional(),
    candidates: candidatesSchema.optional(),
    damage_calc: damageCalcSchema.optional(),
    suggestions: z.array(z.string()).optional(),
    question: questionSchema.optional(),
    uncertainty_flags: z
      .array(z.string())
      .optional()
      .describe(
        "User-visible, plain player language caveats. No internal tool, table, or column names — describe any source or limitation in plain English (e.g. 'from the community Pokémon wiki, not authoritative game data').",
      ),
    // The agent's proposed team (TEAM-AD-6). ADDITIVE optional field: previously
    // stored answer_json (no `proposed_team` key) stays valid under `.strict()`,
    // and a new answer carries a buildable team the user can Apply (save-new /
    // apply-existing via the Teams API) OR approve in chat (the agent then calls
    // `save_team`, T13, to persist it — TEAM-AD-7).
    proposed_team: proposedTeamSchema.optional(),
    // The team the agent SAVED this turn (T13). ADDITIVE optional field, stamped
    // by the route from `ctx.savedTeam` after a successful `save_team` call —
    // never emitted by the model. Drives the persistent "Saved ✓" card.
    saved_team: savedTeamSchema.optional(),
    // Roster/legality warnings for `proposed_team` (BR-T5). ADDITIVE optional
    // field, SERVER-STAMPED by the runtime after it runs validateTeam against the
    // turn's format — never emitted by the model (kept off `proposed_team` so the
    // tool input schema stays clean), exactly like `saved_team`. Empty/absent ⇒
    // the proposal is clean. Drives the "illegal in this format" badges in the
    // proposed-team card + viewer. Previously stored answers (no key) stay valid.
    proposed_team_warnings: z.array(teamWarningSchema).optional(),
    // SERVER-OWNED (VOICE-AC-1.2). Stamped on voice cards; the model must not
    // emit it — sanitizeCitationAnchors strips a model-authored value.
    origin: z.literal("voice").optional(),
  })
  .strict();

// ===========================================================================
// T12 — get_team (load ONE saved team by id; the model picks the id from a
// prior list_teams call). Replaces the former server-bound get_active_team.
// ===========================================================================

// The model supplies a `team_id` it obtained from `list_teams` — it cannot
// invent one, and an unknown / not-owned / wrong-format id yields
// `{ found: false }`. `.strict()` rejects any stray key the model might invent.
export const getTeamInputSchema = z
  .object({ team_id: z.string().min(1) })
  .strict();

/**
 * Output of `get_team`: `{ found: false }` when the id is unknown, not the
 * user's, or not in the turn's format; else the enriched team view (display
 * names + computed warnings). Hand-authored as a discriminated union — the
 * enriched shape is owned by the active-team service, not re-derived here.
 */
export type GetTeamInput = z.infer<typeof getTeamInputSchema>;
export type GetTeamOutput =
  | { found: false }
  | { found: true; team: EnrichedActiveTeam };

// ===========================================================================
// T16 — list_teams (the user's saved teams for the turn's format; the model
// matches the user's words against name + species, then calls get_team).
// ===========================================================================

// Takes NO arguments: scope is the turn's format (server-controlled like
// `mode`), so the model has no parameter to widen it. `.strict()` rejects strays.
export const listTeamsInputSchema = z.object({}).strict();

/** One saved team in the `list_teams` result — a cheap pick-list row (no full members). */
export interface TeamListEntry {
  team_id: string;
  name: string;
  member_count: number;
  /** `< 6` members, or any member missing a species / its 4th move. */
  incomplete: boolean;
  /** Display names of the team's Pokémon — lets the model match "the one with Garchomp". */
  species: string[];
}

/**
 * Output of `list_teams`: `{ signed_in: false }` for a guest (no saved teams to
 * read), else the account's teams for the turn's format (possibly an empty array).
 */
export type ListTeamsInput = z.infer<typeof listTeamsInputSchema>;
export type ListTeamsOutput =
  | { signed_in: false }
  | { signed_in: true; teams: TeamListEntry[] };

// ===========================================================================
// T13 — save_team (conversational save; TEAM-AD-7)
// ===========================================================================

// Persists a team to the user's saved Teams on explicit user approval. Prefers
// the server-bound proposed team for the turn (`ctx.proposedTeam`, the exact set
// the user saw) so EVs/IVs/moves are never re-typed by the model; `team` is the
// fallback for a build-AND-save in one message (no prior proposal in context).
// `name` optionally overrides the saved team's name. `.strict()` rejects strays.
export const saveTeamInputSchema = z
  .object({
    name: z.string().optional(),
    team: proposedTeamSchema.optional(),
  })
  .strict();

export type SaveTeamInput = z.infer<typeof saveTeamInputSchema>;
/**
 * Output of `save_team`: the saved team's id + name + format on success, else a
 * structured miss (`not_signed_in` — guest; `no_team` — nothing to save;
 * `index_unavailable` — write fault). Never throws in-domain (tool contract).
 */
export type SaveTeamOutput =
  | { saved: true; team_id: string; name: string; format: string }
  | {
      saved: false;
      reason:
        | "not_signed_in"
        | "no_team"
        | "index_unavailable"
        // A HARD format-illegality (see HARD_VIOLATION_CODES) — an out-of-format
        // species, an illegal move/ability/item, or the species/item clauses —
        // refused rather than persisting an illegal team (mirrors the runtime
        // proposal gate).
        | "illegal_team";
      /** Present for `illegal_team`: the hard-illegality warnings that blocked it. */
      warnings?: TeamWarning[];
    };

// ===========================================================================
// T17 — get_learnset (every move a form can legally learn in the active scope)
// ===========================================================================

// Single required `name` — the Pokémon form slug/name (same convention as
// get_pokemon). Scope is the turn's format (server-controlled like `mode`), so
// the model has no parameter to widen it.
export const getLearnsetInputSchema = z.object({
  name: z.string(),
});

export type GetLearnsetInput = z.infer<typeof getLearnsetInputSchema>;

/** One learnable move in the `get_learnset` result: its slug and learn method. */
export interface LearnsetEntry {
  slug: string;
  /** "level-up" | "machine" | "tutor"; null when ingest left it unset. */
  method: string | null;
}

/**
 * Output of `get_learnset`: on a hit, the canonical species slug, active format,
 * move count and every legal move (slug + method, slug-sorted); else the generic
 * not-found miss shape (BR-9). Never throws in-domain (tool contract).
 */
export type GetLearnsetOutput =
  | {
      found: true;
      pokemon: string;
      format: string;
      count: number;
      moves: LearnsetEntry[];
    }
  | { found: false; suggestions: string[] };

// ===========================================================================
// T18 — run_sql (guarded read-only SQL over Oak's offline warehouse; Oak v2 §5).
// The model writes its own SQL for aggregations/set-operations the typed tools
// can't express (natdex==BST, catch-rate vs pre-evo, unique type combos, dual→
// mono evolutions). Safety is enforced at the DB layer (READ ONLY txn, single
// statement, statement_timeout, oak_readonly role / deny-list, 200-row cap) —
// see src/data/sql-sandbox.ts. On any failure the tool returns a structured
// miss shape carrying the raw Postgres message as a `hint` (the loop's ≤10
// iterations are the retry mechanism); it never throws in-domain.
// ===========================================================================

export const runSqlInputSchema = z.object({
  /** A single read-only SELECT/CTE query against the warehouse. */
  query: z.string().min(1).max(5000),
  /** A short natural-language note on what the query is for (audit/log only). */
  purpose: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "User-visible: a short, plain-English reason for the search, written for a non-technical player (it can appear as a progress label). NO table or column names, NO SQL, NO tool names — e.g. 'species whose Dex number equals their base-stat total', not a query description.",
    ),
});

/** One returned cell — always coerced to a JSON primitive by the executor. */
export const runSqlCellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const runSqlRowsSchema = z.object({
  /** Column names, in select order. */
  columns: z.array(z.string()),
  /** Result rows (≤200), each a cell array aligned to `columns`. */
  rows: z.array(z.array(runSqlCellSchema)),
  /** Number of rows returned (= rows.length; ≤200). */
  row_count: z.number().int(),
  /** True when the 200-row cap clipped the result. */
  truncated: z.boolean(),
});

export const runSqlErrorSchema = z.object({
  /** "query_failed" (bad SQL / permission) | "query_timeout" (>3s). */
  error: z.enum(["query_failed", "query_timeout"]),
  /** Raw Postgres message (or timeout note) — the model uses it to fix the SQL. */
  hint: z.string().optional(),
});

export const runSqlOutputSchema = z.union([
  runSqlRowsSchema,
  runSqlErrorSchema,
]);

// ===========================================================================
// T19 — search_wiki (hybrid-lexical retrieval over the Fandom prose corpus;
// Oak v2 §4.2/§5). Answers anime/movie/character/PMD/lore/glitch/trivia
// questions Oak's structured @pkmn + natdex data can't. Backed by wiki-repo.ts
// (the sole reader of wiki_page/wiki_chunk), Postgres built-in full-text search
// (websearch_to_tsquery + ts_rank_cd, ts_headline snippets). NEVER an error:
// an empty corpus OR no match both return `{ results: [] }` — this tool has no
// upstream to fail. Results are community-sourced (CC BY-SA) prose excerpts, so
// the model MUST cite them by URL and treat them as non-authoritative.
// ===========================================================================

export const searchWikiInputSchema = z.object({
  /** Natural-language search query (1–300 chars). */
  query: z.string().min(1).max(300),
  /** Max results to return (1–8, default 5). */
  limit: z.number().int().min(1).max(8).optional(),
});

export const wikiResultSchema = z.object({
  /** Page title, e.g. "Ash Ketchum". */
  title: z.string(),
  /** Section heading the snippet came from. */
  section: z.string(),
  /** Highlighted prose excerpt (ts_headline), best-matching fragments. */
  snippet: z.string(),
  /** Canonical page URL — cite this. */
  url: z.string(),
  /** Epoch ms of the page's last wiki revision; null if unknown. */
  revised_at: z.number().nullable(),
});

export const searchWikiOutputSchema = z.object({
  results: z.array(wikiResultSchema),
});

// ===========================================================================
// T21 — get_meta_usage (stored monthly Smogon ladder usage; backlog B-5).
// A DB read over the offline meta_snapshot/meta_usage warehouse (synced from
// Smogon's monthly chaos stats via sync:meta) — what a Pokémon runs on a
// competitive ladder (moves/items/abilities/spreads/teammates/checks), with its
// usage %, rank, and a short usage/rank trend. v1 covers ONE ladder,
// "gen9ou" (Smogon OU Gen 9 singles); Pokémon Champions is deliberately NOT a
// meta_format (its current usage is served live by T15 get_usage_stats). The
// data is MONTHLY, not live, so answers must cite the ladder + month and flag
// staleness. Available in ALL scopes — the ladder is an explicit input, so the
// server-controlled data scope stays uninvolved. See get-meta-usage.tool.ts +
// src/data/repos/meta-repo.ts + src/data/meta-formats.ts.
// ===========================================================================

export const getMetaUsageInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("A Pokémon name or slug, e.g. 'Kingambit' or 'great-tusk'."),
  meta_format: z
    .enum(META_FORMAT_IDS)
    .default(DEFAULT_META_FORMAT)
    .describe(
      "The competitive ladder to read usage for. Currently only \"gen9ou\" " +
        "(Smogon OU, Gen 9 singles) is available.",
    ),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe(
      "The stats month as \"YYYY-MM\". Omit for the latest synced month.",
    ),
});

/** One move/item/ability/teammate usage line — `{name, slug, pct}`. */
export const metaUsageEntrySchema = z.object({
  name: z.string(),
  slug: z.string(),
  pct: z.number(),
});

/** One EV-spread usage line (`evs` is "HP/Atk/Def/SpA/SpD/Spe"). */
export const metaSpreadEntrySchema = z.object({
  nature: z.string(),
  evs: z.string(),
  pct: z.number(),
});

/** One checks-and-counters entry (score + combined KO-or-switch %, sample n). */
export const metaCounterEntrySchema = z.object({
  name: z.string(),
  slug: z.string(),
  score: z.number(),
  ko_or_switch_pct: z.number(),
  n: z.number(),
});

/** One point of a species' usage/rank trend across synced months. */
export const metaTrendPointSchema = z.object({
  month: z.string(),
  usage_pct: z.number(),
  rank: z.number().int(),
});

export const metaUsageDetailSchema = z.object({
  found: z.literal(true),
  /** The name/slug the caller asked for (echoed). */
  name: z.string(),
  /** The canonical species slug the usage row is keyed by, e.g. "great-tusk". */
  species: z.string(),
  /** The display name, e.g. "Great Tusk". */
  display_name: z.string(),
  /** The ladder id this usage is from, e.g. "gen9ou". */
  meta_format: z.enum(META_FORMAT_IDS),
  /** Full ladder label, e.g. "Smogon OU (Gen 9 singles)". */
  meta_format_label: z.string(),
  /** Exact Smogon format id behind the stats URL, e.g. "gen9ou". */
  smogon_format_id: z.string(),
  /** The stats month this row covers ("YYYY-MM"). */
  month: z.string(),
  /** The usage cutoff (minimum battles a player needed to count). */
  cutoff: z.number().int(),
  /** The species' usage rank on the ladder that month (1 = most used). */
  rank: z.number().int(),
  /** The species' usage percentage that month, e.g. 46.1. */
  usage_pct: z.number(),
  moves: z.array(metaUsageEntrySchema),
  items: z.array(metaUsageEntrySchema),
  abilities: z.array(metaUsageEntrySchema),
  spreads: z.array(metaSpreadEntrySchema),
  teammates: z.array(metaUsageEntrySchema),
  counters: z.array(metaCounterEntrySchema),
  /** Usage/rank trend, ascending by month (oldest first), most-recent ≤6 months. */
  trend: z.array(metaTrendPointSchema),
  /** Total battles behind the snapshot; null when the source omitted it. */
  total_battles: z.number().nullable(),
  /** The Smogon chaos-stats URL this snapshot was synced from. */
  source_url: z.string(),
  /** Static attribution string — always cite Smogon. */
  attribution: z.string(),
});

/** No usage data for the requested (or any) month on this ladder. */
export const metaNoDataSchema = z.object({
  error: z.literal("no_data"),
  /** Every synced month for this ladder, most recent first (may be empty). */
  months_available: z.array(z.string()),
});

export const getMetaUsageOutputSchema = z.union([
  metaUsageDetailSchema,
  notFoundSchema,
  metaNoDataSchema,
]);

// ===========================================================================
// T22 — lookup_box (bulk species + compact learnset; team-from-box Phase 1)
//
// One call looks up up to 40 names: get_pokemon profile + ≤16 compact legal
// moves, or a miss with suggestions. Advertised Zod max is 40 (model JSON
// Schema); the tool run() slices extras and sets truncated_input. An empty
// learnset is a hit with available:false — not a miss (BOX-AC-3.2/3.4).
// get_learnset stays the full-movepool API (BOX-BR-7 / BOX-AD-1).
// ===========================================================================

export const lookupBoxInputSchema = z
  .object({
    names: z.array(z.string().min(1)).min(1).max(40),
  })
  .strict();

export const compactMoveSchema = z.object({
  slug: z.string(),
  method: z.string().nullable(),
  type: z.string().nullable(),
  category: z.enum(["physical", "special", "status"]).nullable(),
  power: z.number().nullable(),
});

export const lookupBoxLearnsetSchema = z.object({
  available: z.boolean(),
  count: z.number().int(),
  truncated: z.boolean(),
  compact_moves: z.array(compactMoveSchema).max(16),
});

export const lookupBoxHitSchema = z.object({
  query: z.string(),
  found: z.literal(true),
  pokemon: pokemonProfileSchema,
  learnset: lookupBoxLearnsetSchema,
});

export const lookupBoxMissSchema = z.object({
  query: z.string(),
  found: z.literal(false),
  suggestions: z.array(z.string()),
  /** Champions mode only: the species missed here but exists in mainline Gen 9. */
  exists_in_standard: z.boolean().optional(),
});

export const lookupBoxOutputSchema = z.object({
  format: z.string(),
  truncated_input: z.boolean(),
  results: z.array(z.union([lookupBoxHitSchema, lookupBoxMissSchema])),
});

// ===========================================================================
// Inferred TypeScript types
// ===========================================================================

export type ResolveEntityInput = z.infer<typeof resolveEntityInputSchema>;
export type ResolveEntityOutput = z.infer<typeof resolveEntityOutputSchema>;
export type QueryPokedexInput = z.infer<typeof queryPokedexInputSchema>;
export type QueryPokedexResult = z.infer<typeof queryPokedexResultSchema>;
export type QueryPokedexOutput = z.infer<typeof queryPokedexOutputSchema>;
export type PokedexRow = z.infer<typeof pokedexRowSchema>;
export type GetPokemonInput = z.infer<typeof getPokemonInputSchema>;
export type PokemonProfile = z.infer<typeof pokemonProfileSchema>;
export type GetPokemonOutput = z.infer<typeof getPokemonOutputSchema>;
export type GetMoveInput = z.infer<typeof getMoveInputSchema>;
export type MoveDetail = z.infer<typeof moveDetailSchema>;
export type GetMoveOutput = z.infer<typeof getMoveOutputSchema>;
export type GetAbilityInput = z.infer<typeof getAbilityInputSchema>;
export type AbilityDetail = z.infer<typeof abilityDetailSchema>;
export type GetAbilityOutput = z.infer<typeof getAbilityOutputSchema>;
export type GetTypeMatchupsInput = z.infer<typeof getTypeMatchupsInputSchema>;
export type TypeMatchupsDetail = z.infer<typeof typeMatchupsDetailSchema>;
export type GetTypeMatchupsOutput = z.infer<typeof getTypeMatchupsOutputSchema>;
export type GetEvolutionChainInput = z.infer<
  typeof getEvolutionChainInputSchema
>;
export type EvolutionChainDetail = z.infer<typeof evolutionChainDetailSchema>;
export type GetEvolutionChainOutput = z.infer<
  typeof getEvolutionChainOutputSchema
>;
export type GetItemInput = z.infer<typeof getItemInputSchema>;
export type ItemDetail = z.infer<typeof itemDetailSchema>;
export type GetItemOutput = z.infer<typeof getItemOutputSchema>;
export type GetEncountersInput = z.infer<typeof getEncountersInputSchema>;
export type EncounterLocation = z.infer<typeof encounterLocationSchema>;
export type EncounterGroup = z.infer<typeof encounterGroupSchema>;
export type EncounterDetail = z.infer<typeof encounterDetailSchema>;
export type GetEncountersOutput = z.infer<typeof getEncountersOutputSchema>;
export type UsageFormat = z.infer<typeof usageFormatSchema>;
export type GetUsageStatsInput = z.infer<typeof getUsageStatsInputSchema>;
export type UsageEntry = z.infer<typeof usageEntrySchema>;
export type UsageStatsDetail = z.infer<typeof usageStatsDetailSchema>;
export type GetUsageStatsOutput = z.infer<typeof getUsageStatsOutputSchema>;
export type ComputeStatInput = z.infer<typeof computeStatInputSchema>;
export type ComputeStatOutput = z.infer<typeof computeStatOutputSchema>;
export type EstimateDamageInput = z.infer<typeof estimateDamageInputSchema>;
export type EstimateDamageOutput = z.infer<typeof estimateDamageOutputSchema>;
export type NotFound = z.infer<typeof notFoundSchema>;
export type UpstreamUnavailable = z.infer<typeof upstreamUnavailableSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Inference = z.infer<typeof inferenceSchema>;
export type GenerationBasis = z.infer<typeof generationBasisSchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type Candidates = z.infer<typeof candidatesSchema>;
export type DamageCalc = z.infer<typeof damageCalcSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ProposedTeam = z.infer<typeof proposedTeamSchema>;
export type SavedTeam = z.infer<typeof savedTeamSchema>;
export type TypeName = z.infer<typeof typeNameSchema>;
export type StatKey = z.infer<typeof statKeySchema>;
export type EntityKind = z.infer<typeof entityKindSchema>;
export type RunSqlInput = z.infer<typeof runSqlInputSchema>;
export type RunSqlCell = z.infer<typeof runSqlCellSchema>;
export type RunSqlRows = z.infer<typeof runSqlRowsSchema>;
export type RunSqlError = z.infer<typeof runSqlErrorSchema>;
export type RunSqlOutput = z.infer<typeof runSqlOutputSchema>;

export type SearchWikiInput = z.infer<typeof searchWikiInputSchema>;
export type WikiResult = z.infer<typeof wikiResultSchema>;
export type SearchWikiOutput = z.infer<typeof searchWikiOutputSchema>;

export type GetMetaUsageInput = z.infer<typeof getMetaUsageInputSchema>;
export type MetaUsageEntry = z.infer<typeof metaUsageEntrySchema>;
export type MetaSpreadEntry = z.infer<typeof metaSpreadEntrySchema>;
export type MetaCounterEntry = z.infer<typeof metaCounterEntrySchema>;
export type MetaTrendPoint = z.infer<typeof metaTrendPointSchema>;
export type MetaUsageDetail = z.infer<typeof metaUsageDetailSchema>;
export type MetaNoData = z.infer<typeof metaNoDataSchema>;
export type GetMetaUsageOutput = z.infer<typeof getMetaUsageOutputSchema>;

export type LookupBoxInput = z.infer<typeof lookupBoxInputSchema>;
export type CompactMove = z.infer<typeof compactMoveSchema>;
export type LookupBoxLearnset = z.infer<typeof lookupBoxLearnsetSchema>;
export type LookupBoxHit = z.infer<typeof lookupBoxHitSchema>;
export type LookupBoxMiss = z.infer<typeof lookupBoxMissSchema>;
export type LookupBoxOutput = z.infer<typeof lookupBoxOutputSchema>;

/** The single structured output the agent emits per turn (T11). */
export type OakAnswer = z.infer<typeof oakAnswerSchema>;

// ===========================================================================
// JSON-Schema generation for the Anthropic SDK
// ===========================================================================

/** A generated JSON Schema object (always `{ type: "object", ... }`). */
export type JsonSchema = Record<string, unknown>;

/**
 * Convert a Zod schema to a JSON Schema suitable for an Anthropic tool
 * `input_schema` / the `submit_answer` schema.
 *
 * Follows the project Zod->JSON-Schema directive:
 *  - `$refStrategy: "none"` so the result is fully inlined (no `$ref`/`$defs`),
 *  - `additionalProperties: false` is preserved (zod-to-json-schema default),
 *  - the `$schema` key is stripped,
 *  - the root is guaranteed to be `{ type: "object", ... }`.
 */
export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const generated = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as Record<string, unknown>;

  delete generated.$schema;

  if (generated.type !== "object") {
    throw new Error(
      `toJsonSchema expected an object root, got: ${String(generated.type)}`,
    );
  }

  return generated;
}

/** Tool name -> input JSON Schema, in the T1..T11 order of tools.md. */
export const toolInputJsonSchemas: Record<string, JsonSchema> = {
  resolve_entity: toJsonSchema(resolveEntityInputSchema),
  query_pokedex: toJsonSchema(queryPokedexInputSchema),
  get_pokemon: toJsonSchema(getPokemonInputSchema),
  get_move: toJsonSchema(getMoveInputSchema),
  get_ability: toJsonSchema(getAbilityInputSchema),
  get_type_matchups: toJsonSchema(getTypeMatchupsInputSchema),
  get_evolution_chain: toJsonSchema(getEvolutionChainInputSchema),
  get_item: toJsonSchema(getItemInputSchema),
  compute_stat: toJsonSchema(computeStatInputSchema),
  estimate_damage: toJsonSchema(estimateDamageInputSchema),
  // submit_answer's input IS the OakAnswer object.
  submit_answer: toJsonSchema(oakAnswerSchema),
  // T12 — load one of the user's saved teams by id (from list_teams).
  get_team: toJsonSchema(getTeamInputSchema),
  // T13 — save a proposed team to the user's Teams on approval.
  save_team: toJsonSchema(saveTeamInputSchema),
  // T14 — catch-location / obtain-method data (standard mode only).
  get_encounters: toJsonSchema(getEncountersInputSchema),
  // T15 — live Champions competitive usage (championsbattledata.com; champions mode only).
  get_usage_stats: toJsonSchema(getUsageStatsInputSchema),
  // T16 — the user's saved teams for the turn's format (the by-name pick-list).
  list_teams: toJsonSchema(listTeamsInputSchema),
  // T17 — every legal move a form can learn in the turn's format (team legality).
  get_learnset: toJsonSchema(getLearnsetInputSchema),
  // T18 — guarded read-only SQL over Oak's offline warehouse (aggregations).
  run_sql: toJsonSchema(runSqlInputSchema),
  // T19 — full-text retrieval over the self-built Fandom prose corpus (lore/anime).
  search_wiki: toJsonSchema(searchWikiInputSchema),
  // T21 — stored monthly Smogon ladder usage (all scopes; ladder is explicit input).
  get_meta_usage: toJsonSchema(getMetaUsageInputSchema),
  // T22 — bulk species + compact learnset for box-build (appended after T21).
  lookup_box: toJsonSchema(lookupBoxInputSchema),
};

/** The generated `submit_answer` (OakAnswer) JSON Schema. */
export const oakAnswerJsonSchema: JsonSchema =
  toolInputJsonSchemas.submit_answer;

/** Canonical tool name list (T1..T22), in order. T1–T21 order is unchanged. */
export const TOOL_NAMES = [
  "resolve_entity",
  "query_pokedex",
  "get_pokemon",
  "get_move",
  "get_ability",
  "get_type_matchups",
  "get_evolution_chain",
  "get_item",
  "compute_stat",
  "estimate_damage",
  "submit_answer",
  "get_team",
  "save_team",
  "get_encounters",
  "get_usage_stats",
  "list_teams",
  "get_learnset",
  "run_sql",
  "search_wiki",
  "get_meta_usage",
  "lookup_box",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
