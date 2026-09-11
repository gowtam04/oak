/**
 * src/lib/reference-pages-types.ts — CLIENT-SAFE view-model types shared by the
 * programmatic reference pages (/pokedex, /moves, /abilities, /items) and the
 * `components/reference/*` renderers.
 *
 * This module is PURE and platform-agnostic: it imports ONLY the pure `Format`
 * type from `@/data/formats` (no `@/data/db`, no repos, no `server-only`, no
 * React/Node). That is deliberate — the jsdom component tests and the repo files
 * both need these shapes, and neither may pull the DB singleton transitively. So
 * the shapes live HERE and the repos `import type { … }` from this file (a
 * type-only import of a pure module is safe in either direction), keeping exactly
 * one definition of each.
 *
 * The B2 detail/index view-models (profile blocks, matchup data, usage blocks,
 * index-page shapes) live BELOW the B1 shapes in this same file — they are just
 * as client-safe (the `components/reference/*` renderers import them under
 * jsdom), so keeping them here preserves the "one pure definition" rule. The
 * assembler in `src/data/reference-pages.ts` builds these; it never redefines a
 * shape that belongs here.
 */

import type { Format } from "@/data/formats";

/**
 * One row of the `/pokedex` index (and the batched source for any Pokémon list).
 * Mirrors the index columns the list view renders. `spriteUrl` is typed nullable
 * for the view-model (a page can fall back to a placeholder); the repo returns
 * the stored, non-null URL.
 */
export interface PokemonIndexRow {
  /** Canonical Pokémon slug, e.g. "tauros-paldea-aqua" (the detail-page param). */
  slug: string;
  /** Disambiguating human label, e.g. "Tauros (Paldean Aqua)". */
  displayName: string;
  /** National Pokédex number (index grouping + ordering). */
  dexNumber: number;
  /** One or two canonical type slugs. */
  types: string[];
  /** Precomputed sum of the six base stats. */
  baseStatTotal: number;
  /** Sprite image URL; null only in a degraded view-model. */
  spriteUrl: string | null;
  /** True if native to this format's game (false = earlier-gen fallback, BR-1). */
  isNative: boolean;
}

/**
 * A minimal (slug, display-name) pair — the shape of an enumeration row on an
 * index page and of a back-linked entity elsewhere. Used for the move/ability/
 * item name lists and the "requires this item" back-links.
 */
export interface NameRow {
  /** Canonical slug (the detail-page param). */
  slug: string;
  /** Human display name. */
  displayName: string;
}

/**
 * One entry in the "Pokémon that can learn this move" reverse roster on a
 * `/moves/[slug]` page. `method` is how the Pokémon learns the move
 * ("level-up" | "machine" | "tutor"), or null when ingest left it unset.
 */
export interface LearnerRow {
  /** Canonical Pokémon slug (links to its /pokedex page). */
  slug: string;
  /** Disambiguating human label. */
  displayName: string;
  /** Learn method, or null if unknown. */
  method: string | null;
}

/**
 * Which reference kinds carry a cross-format availability chip. Re-exported for
 * callers that enumerate the kinds; `Format` comes straight from the pure
 * formats module.
 */
export type ReferenceEntityKind = "pokemon" | "move" | "ability" | "item";

// ===========================================================================
// B2 — detail-page view-models (one per reference kind)
//
// Every field is a plain JSON-serializable value (string / number / boolean /
// array / nested object) so a page can pass the whole object straight into a
// Server Component and it survives serialization. `sourceFormat` records which
// of the six scopes the profile was resolved from (the fallback chain reads
// scarlet-violet first, then champions, then gen-8…gen-5); `availability` is
// every scope the entity exists in (the cross-scope chips). The two differ:
// e.g. a Mega resolves from a gen-8 fallback (`sourceFormat`) yet has
// availability `["gen-6", "gen-7", "gen-8"]`.
// ===========================================================================

/** The six base stats, keyed by the short labels the reference UI renders. */
export interface PokemonStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/**
 * A Pokémon's combined defensive matchups — mirrors the shape
 * `entity-profile.ts` produces (`TypeMatchupsDetail["defensive"]` with the quad
 * subsets filled). `quad_weak_to` ⊆ `weak_to` and `quad_resists` ⊆ `resists`;
 * all five arrays are always present (possibly empty).
 */
export interface DefensiveMatchups {
  weak_to: string[];
  resists: string[];
  immune_to: string[];
  quad_weak_to: string[];
  quad_resists: string[];
}

/** One ability on a Pokémon page: slug + name + effect prose + hidden flag. */
export interface AbilityEntry {
  slug: string;
  displayName: string;
  /** True for the hidden-ability slot; absent/false for slot1 & slot2. */
  isHidden?: boolean;
  /** One-line effect (empty string if the ability reference row was missing). */
  effectShort: string;
  /** Full effect prose, when the ability reference row carried it. */
  effectFull?: string;
}

/** One move inside a movepool group (learnset row) on a Pokémon page. */
export interface MovepoolMoveView {
  slug: string;
  displayName: string;
  /** Canonical type slug, when hydrated from the move reference. */
  type?: string;
  /** Base power; null for status moves, absent when not hydrated. */
  power?: number | null;
  /** "physical" | "special" | "status", when hydrated. */
  damageClass?: string | null;
}

/** A Pokémon's movepool grouped by learn method (Level-up / TM/HM / Tutor…). */
export interface MovepoolGroupView {
  /** Human method label ("Level-up", "TM/HM", "Tutor", "Other"). */
  method: string;
  moves: MovepoolMoveView[];
}

/**
 * One evolution edge. `trigger` is always present; the remaining condition
 * fields vary by trigger (item, min_level, time_of_day, …) and ride along as
 * extra keys, matching the passthrough `EvolutionChainDetail` shape.
 */
export interface EvolutionEdge {
  from: string;
  to: string;
  conditions: Array<{ trigger: string } & Record<string, unknown>>;
}

/** One usage line (a move / item / ability / teammate) with its share. */
export interface UsageStatEntry {
  name: string;
  /** Usage percentage (e.g. 42.1); null when the source omitted it. */
  pct: number | null;
}

/**
 * Best-effort live Champions usage for a Pokémon page. Present only when the
 * species is champions-available AND the community API answered in time; a
 * failure/timeout/miss yields `null` and the page renders without it.
 */
export interface UsageBlock {
  /** The API's form-specific saved name this snapshot is for. */
  savedName: string;
  /** Season label (e.g. "Season M-3" or "current"). */
  season: string;
  topMoves: UsageStatEntry[];
  topItems: UsageStatEntry[];
  topAbilities: UsageStatEntry[];
  topTeammates: UsageStatEntry[];
  /** Community-data attribution string (surfaced with the block). */
  attribution: string;
  /** The battle-data endpoint this came from (for a citation link). */
  sourceUrl: string;
}

/** Full view-model for a `/pokedex/[slug]` page. */
export interface PokemonPageData {
  slug: string;
  displayName: string;
  dexNumber: number;
  types: string[];
  stats: PokemonStats;
  baseStatTotal: number;
  abilities: AbilityEntry[];
  matchups: DefensiveMatchups;
  movepool: MovepoolGroupView[];
  /** Evolution edges when the species' chain was available; else omitted. */
  evolution?: EvolutionEdge[];
  /** All forms of this species (canonical slugs, dex-then-slug order). */
  forms: string[];
  /** Every scope this Pokémon exists in (cross-scope chips). */
  availability: Format[];
  /** Native to `sourceFormat`'s game (false = earlier-gen fallback data). */
  isNative: boolean;
  spriteUrl: string;
  artworkUrl: string;
  /** Which scope the profile was resolved from (fallback chain). */
  sourceFormat: Format;
  /** Best-effort Champions usage; null when unavailable. */
  usage: UsageBlock | null;
}

/** Full view-model for a `/moves/[slug]` page. */
export interface MovePageData {
  slug: string;
  displayName: string;
  type: string;
  /** "physical" | "special" | "status". */
  damageClass: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  target: string;
  effectShort: string;
  effectFull: string;
  /** Showdown move flags (bullet, pulse, sound, …); empty when unknown. */
  flags?: string[];
  /** The reverse roster — every Pokémon that can learn this move. */
  learners: LearnerRow[];
  /** Convenience count of `learners` (the spine's headline number). */
  learnerCount: number;
  availability: Format[];
  sourceFormat: Format;
}

/** Full view-model for an `/abilities/[slug]` page. */
export interface AbilityPageData {
  slug: string;
  displayName: string;
  effectShort: string;
  effectFull: string;
  /** Every Pokémon with this ability (in any slot). */
  learnedBy: NameRow[];
  availability: Format[];
  sourceFormat: Format;
}

/** One "held by wild" record on an item page. */
export interface HeldByWildRow {
  pokemon: string;
  rarityPercent: number;
}

/** Full view-model for an `/items/[slug]` page. */
export interface ItemPageData {
  slug: string;
  displayName: string;
  effectShort: string;
  effectFull: string;
  /** Wild holders (when the item reference carried them). */
  heldByWild: HeldByWildRow[];
  /** Forms that must hold this item (Mega stones → their Mega form). */
  requiredBy: NameRow[];
  availability: Format[];
  sourceFormat: Format;
}

// ===========================================================================
// B2 — index-page view-models (one per index route)
// ===========================================================================

/**
 * `/pokedex` index data. `rows` are the full scarlet-violet roster (dex order);
 * `extras` are entities that exist ONLY in other scopes (so they still get a
 * crawlable link), each tagged with the scope it was found in.
 */
export interface PokedexIndexData {
  rows: PokemonIndexRow[];
  extras: { slug: string; displayName: string; sourceFormat: Format }[];
}

/** One row of the `/moves` index table — name plus battle facts when known. */
export interface MoveIndexRow {
  slug: string;
  displayName: string;
  /** Canonical type slug, when the move had a cached summary. */
  type?: string;
  power?: number | null;
  damageClass?: string | null;
}

/** `/moves` index data (name list merged with the batched move summaries). */
export interface MovesIndexData {
  rows: MoveIndexRow[];
}

/** `/abilities` and `/items` index data — a flat, alphabetical name list. */
export interface NamesIndexData {
  rows: NameRow[];
}

export type { Format };
