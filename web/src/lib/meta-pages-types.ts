/**
 * src/lib/meta-pages-types.ts — CLIENT-SAFE view-model types for the public
 * `/meta` competitive-usage reference pages (backlog B-5, Phase 2).
 *
 * Mirrors `@/lib/reference-pages-types`'s role for `/pokedex`/`/moves`/etc:
 * this module is PURE and platform-agnostic (no `@/data/db`, no repos, no
 * `server-only`, no React/Node), importing only the pure `MetaFormat` type
 * from `@/data/meta-formats`. That keeps it safe for BOTH the jsdom
 * `components/meta/*` renderers and the `meta-repo`/`meta-pages` server
 * modules to import — exactly one definition of each shape.
 *
 * The six JSON-text columns on `meta_usage` (moves/items/abilities/spreads/
 * teammates/counters) are parsed into the typed arrays below by
 * `src/data/meta-pages.ts`; nothing here ever touches the raw JSON strings.
 */

import type { MetaFormat } from "@/data/meta-formats";

/** One move/item/ability/teammate usage line: `{name, slug, pct}`. */
export interface MetaMoveUsage {
  name: string;
  slug: string;
  pct: number;
}

/** One EV-spread usage line. `evs` is "HP/Atk/Def/SpA/SpD/Spe", e.g. "252/0/0/252/4/0". */
export interface MetaSpreadUsage {
  nature: string;
  evs: string;
  pct: number;
}

/** Teammates share the plain `{name, slug, pct}` usage shape. */
export type MetaTeammateUsage = MetaMoveUsage;

/**
 * One checks-and-counters entry. The Smogon chaos source only publishes
 * `{n, p, d}` per counter (n = sample count, p = KO-or-switch proportion,
 * d = std deviation); `score` and `ko_or_switch_pct` below are DERIVED at
 * ingest time from those, not stored verbatim:
 *   - `score` = (p - 4d) x 100 — Smogon's standard checks-and-counters
 *     ranking score, 0-100 (a conservative lower-bound estimate of p).
 *   - `ko_or_switch_pct` = p x 100 — how often this counter KOs or forces a
 *     switch out of the species, 0-100.
 * There is no separate KO-vs-switch split in the source data (unlike the plan's
 * original `koed_pct`/`switched_pct` guess), so both are collapsed into this
 * one combined percentage.
 */
export interface MetaCounterUsage {
  name: string;
  slug: string;
  score: number;
  ko_or_switch_pct: number;
  n: number;
}

/** Snapshot bookkeeping shared by both view-models below (from `meta_snapshot`). */
export interface MetaSnapshotInfo {
  smogonFormatId: string;
  cutoff: number;
  totalBattles: number | null;
  fetchedAt: number;
  sourceUrl: string;
}

/** One row of the `/meta/[format]` leaderboard table. */
export interface MetaLeaderboardRow {
  rank: number;
  species: string;
  displayName: string;
  usagePct: number;
  /** usagePct - prev month's usagePct; null when no prior synced month or species was absent then. */
  deltaPct: number | null;
  /** True when this species resolves a `/pokedex/<slug>` page (scarlet-violet). */
  hasDexPage: boolean;
}

/**
 * `/meta/[format]` view-model. `available: false` is the EXPECTED, honest
 * pre-sync state (no `meta_snapshot` row exists yet for this ladder) — see
 * `src/data/meta-pages.ts` for why this deliberately does NOT throw
 * reference-pages' `index_unavailable`.
 */
export type MetaLeaderboardView =
  | { available: false; metaFormat: MetaFormat; label: string }
  | {
      available: true;
      metaFormat: MetaFormat;
      label: string;
      shortLabel: string;
      /** The month this leaderboard covers ("YYYY-MM"). */
      month: string;
      /** Every synced month for this ladder, most recent first. */
      months: string[];
      snapshot: MetaSnapshotInfo;
      rows: MetaLeaderboardRow[];
    };

/** One point on a species' usage/rank trend line. */
export interface MetaTrendPoint {
  month: string;
  usagePct: number;
  rank: number;
}

/** The single "most representative" set assembled from a species' top usage stats. */
export interface MetaRepresentativeSet {
  ability: string | null;
  item: string | null;
  nature: string | null;
  /** Raw "HP/Atk/Def/SpA/SpD/Spe" string of the top spread; null when no spread data. */
  evs: string | null;
  /** Top 4 move names by usage. */
  moves: string[];
}

/** Full view-model for a `/meta/[format]/[slug]` drill-in page. */
export interface MetaSpeciesView {
  metaFormat: MetaFormat;
  label: string;
  shortLabel: string;
  /** The month this detail covers ("YYYY-MM"). */
  month: string;
  /** Every synced month for this ladder, most recent first. */
  months: string[];
  species: string;
  displayName: string;
  rank: number;
  usagePct: number;
  rawCount: number | null;
  moves: MetaMoveUsage[];
  items: MetaMoveUsage[];
  abilities: MetaMoveUsage[];
  spreads: MetaSpreadUsage[];
  teammates: MetaTeammateUsage[];
  counters: MetaCounterUsage[];
  /** Ascending by month, most recent `limit` months (see `metaSpeciesTrend`). */
  trend: MetaTrendPoint[];
  representativeSet: MetaRepresentativeSet;
  /** Plain-text Showdown import/export format, assembled from `representativeSet`. */
  showdownExport: string;
  snapshot: MetaSnapshotInfo;
  hasDexPage: boolean;
}

export type { MetaFormat };
