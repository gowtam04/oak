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
 * Kept intentionally small. The B2 assembler unit (src/data/reference-pages.ts)
 * EXTENDS this module with the richer detail-page view-models (profile blocks,
 * matchup data, usage blocks); add those there, not here.
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

export type { Format };
