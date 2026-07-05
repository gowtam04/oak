/**
 * src/data/meta-pages.ts — view-model assembler for the public `/meta`
 * competitive-usage reference pages (backlog B-5, Phase 2).
 *
 * Sits on top of `src/data/repos/meta-repo.ts` exactly the way
 * `reference-pages.ts` sits on top of `entity-profile.ts`/the B1 repos:
 * loaders resolve close-to-column repo rows and reshape them into the
 * page-and-component-friendly view-models in `@/lib/meta-pages-types`.
 *
 * NOT the reference-pages `index_unavailable` CONTRACT. `reference-pages.ts`
 * THROWS when its primary index isn't built, because a crawler must never see
 * a soft-200 empty page for a permanently-missing dataset. The meta ladder is
 * different: `meta_snapshot`/`meta_usage` are populated by a SEPARATE,
 * deliberately-manual `sync:meta` step (never by the always-run `ingest`
 * pipeline) — a pre-sync DB is an EXPECTED, temporary state, not a broken
 * index. So `loadMetaLeaderboard` returns an honest `{available:false}`
 * instead of throwing; the page renders a "not synced yet" empty state rather
 * than 500ing for a crawler to retry forever.
 *
 * CACHING. Mirrors reference-pages.ts: each loader has an UNCACHED inner
 * `*Uncached(metaFormat, ..., db)` variant (tests call these directly with an
 * injected fixture handle) wrapped first in `unstable_cache` (revalidate 3600s
 * — the ladder refreshes at most monthly, so an hour of staleness is cheap)
 * and then in React `cache()` so a page and its `generateMetadata` share one
 * query per request.
 *
 * `server-only`: reads the repo/DB layer, must never reach a client bundle.
 * Only ever dynamically imported by the /meta reference pages.
 */

import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { OakDb } from "@/data/db";
import { DEFAULT_META_FORMAT, metaFormatConfig, type MetaFormat } from "@/data/meta-formats";
import {
  listMetaMonths,
  metaLeaderboard,
  metaSnapshot,
  metaSpeciesDetail,
  metaSpeciesTrend,
  speciesWithDexPage,
  type MetaSnapshotRecord,
  type MetaSpeciesDetailRecord,
} from "@/data/repos/meta-repo";
import type {
  MetaLeaderboardRow,
  MetaLeaderboardView,
  MetaRepresentativeSet,
  MetaSnapshotInfo,
  MetaSpeciesView,
} from "@/lib/meta-pages-types";

/** How many of the top synced months a species drill-in page's trend covers. */
const TREND_MONTHS = 12;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Resolve the `@/data/db` singleton for the cached wrappers (pages only). */
async function singletonDb(): Promise<OakDb> {
  const mod = await import("@/data/db");
  return mod.db;
}

/** `meta_snapshot` record -> the client-safe `MetaSnapshotInfo` view-model. */
function toSnapshotInfo(row: MetaSnapshotRecord): MetaSnapshotInfo {
  return {
    smogonFormatId: row.smogon_format_id,
    cutoff: row.cutoff,
    totalBattles: row.total_battles,
    fetchedAt: row.fetched_at,
    sourceUrl: row.source_url,
  };
}

/**
 * Resolve the effective month for a page: the caller's explicit `month` wins
 * ONLY when it's actually a synced month; otherwise (omitted, or naming a
 * month that was never synced) falls back to the latest synced month.
 * `months` must be non-empty (callers check `available`/return null first).
 */
function resolveMonth(months: string[], month: string | undefined): string {
  if (month && months.includes(month)) return month;
  return months[0]!;
}

/** Round to 2 decimals — guards MoM delta math against float noise (e.g. 46.1-44.2). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const EV_LABELS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const;

/** "0/252/4/0/0/252" -> "252 Atk / 4 Def / 252 Spe" (named nonzero stats only). */
function formatEvSpread(evs: string): string {
  const values = evs.split("/").map((v) => Number.parseInt(v, 10) || 0);
  return EV_LABELS.map((label, i) => ({ label, value: values[i] ?? 0 }))
    .filter((e) => e.value > 0)
    .map((e) => `${e.value} ${e.label}`)
    .join(" / ");
}

/** The top ability/item/spread/4-moves, read straight off a detail record's arrays. */
function buildRepresentativeSet(
  detail: MetaSpeciesDetailRecord,
): MetaRepresentativeSet {
  const topSpread = detail.spreads[0] ?? null;
  return {
    ability: detail.abilities[0]?.name ?? null,
    item: detail.items[0]?.name ?? null,
    nature: topSpread?.nature ?? null,
    evs: topSpread?.evs ?? null,
    moves: detail.moves.slice(0, 4).map((m) => m.name),
  };
}

/**
 * Plain-text Showdown import/export format assembled from a representative
 * set: the canonical Showdown paste header is ONE line, `<name> @ <item>`
 * (what @pkmn/sets and Showdown's importer expect) — just `<name>` when there's
 * no item, never a dangling "@". Then `Ability:`, `EVs:` (only the named
 * nonzero stats, omitted if no spread data), `<Nature> Nature`, then up to 4
 * `- <move>` lines. Skips each line gracefully when its category is empty.
 */
function buildShowdownExport(
  displayName: string,
  rep: MetaRepresentativeSet,
): string {
  const lines: string[] = [rep.item ? `${displayName} @ ${rep.item}` : displayName];
  if (rep.ability) lines.push(`Ability: ${rep.ability}`);
  if (rep.evs) {
    const formatted = formatEvSpread(rep.evs);
    if (formatted) lines.push(`EVs: ${formatted}`);
  }
  if (rep.nature) lines.push(`${rep.nature} Nature`);
  for (const move of rep.moves) lines.push(`- ${move}`);
  return lines.join("\n");
}

// ===========================================================================
// Loaders (uncached inner fns take an injected db; cached wrappers below)
// ===========================================================================

/**
 * `/meta/[format]` leaderboard view-model. `available: false` when the ladder
 * has NEVER been synced (see the module doc's index-unavailable contrast) —
 * this is the expected pre-`sync:meta` state, not an error. `month` omitted
 * (or naming a month that was never synced) resolves to the latest synced
 * month.
 */
export async function loadMetaLeaderboardUncached(
  metaFormat: MetaFormat,
  month: string | undefined,
  db: OakDb,
): Promise<MetaLeaderboardView> {
  const config = metaFormatConfig(metaFormat);
  const months = await listMetaMonths(db, metaFormat);
  if (months.length === 0) {
    return { available: false, metaFormat, label: config.label };
  }

  const resolvedMonth = resolveMonth(months, month);
  const [snapshotRow, entries] = await Promise.all([
    metaSnapshot(db, metaFormat, resolvedMonth),
    metaLeaderboard(db, metaFormat, resolvedMonth),
  ]);
  // months.includes(resolvedMonth) by construction of resolveMonth, so a
  // snapshot row must exist; the `!` reflects that invariant.
  const snapshot = toSnapshotInfo(snapshotRow!);

  const dexPages = await speciesWithDexPage(
    db,
    entries.map((e) => e.species),
  );

  const rows: MetaLeaderboardRow[] = entries.map((e) => ({
    rank: e.rank,
    species: e.species,
    displayName: e.display_name,
    usagePct: e.usage_pct,
    deltaPct:
      e.prev_usage_pct == null ? null : round2(e.usage_pct - e.prev_usage_pct),
    hasDexPage: dexPages.has(e.species),
  }));

  return {
    available: true,
    metaFormat,
    label: config.label,
    shortLabel: config.shortLabel,
    month: resolvedMonth,
    months,
    snapshot,
    rows,
  };
}

/**
 * `/meta/[format]/[slug]` drill-in view-model. Null when the species has no
 * row in the resolved month (the caller 404s) — including when the ladder has
 * never been synced at all.
 */
export async function loadMetaSpeciesUncached(
  metaFormat: MetaFormat,
  species: string,
  month: string | undefined,
  db: OakDb,
): Promise<MetaSpeciesView | null> {
  const config = metaFormatConfig(metaFormat);
  const months = await listMetaMonths(db, metaFormat);
  if (months.length === 0) return null;

  const resolvedMonth = resolveMonth(months, month);
  const detail = await metaSpeciesDetail(db, metaFormat, resolvedMonth, species);
  if (!detail) return null;

  const [snapshotRow, trendRows, dexPages] = await Promise.all([
    metaSnapshot(db, metaFormat, resolvedMonth),
    metaSpeciesTrend(db, metaFormat, species, TREND_MONTHS),
    speciesWithDexPage(db, [species]),
  ]);

  const representativeSet = buildRepresentativeSet(detail);

  return {
    metaFormat,
    label: config.label,
    shortLabel: config.shortLabel,
    month: resolvedMonth,
    months,
    species: detail.species,
    displayName: detail.display_name,
    rank: detail.rank,
    usagePct: detail.usage_pct,
    rawCount: detail.raw_count,
    moves: detail.moves,
    items: detail.items,
    abilities: detail.abilities,
    spreads: detail.spreads,
    teammates: detail.teammates,
    counters: detail.counters,
    trend: trendRows.map((r) => ({
      month: r.month,
      usagePct: r.usage_pct,
      rank: r.rank,
    })),
    representativeSet,
    showdownExport: buildShowdownExport(detail.display_name, representativeSet),
    snapshot: toSnapshotInfo(snapshotRow!),
    hasDexPage: dexPages.has(species),
  };
}

// ===========================================================================
// Cached wrappers (used by pages; resolve the @/data/db singleton)
// ===========================================================================

const cachedMetaLeaderboard = unstable_cache(
  async (
    metaFormat: MetaFormat,
    month?: string,
  ): Promise<MetaLeaderboardView> =>
    loadMetaLeaderboardUncached(metaFormat, month, await singletonDb()),
  ["meta-leaderboard"],
  { revalidate: 3600 },
);

const cachedMetaSpecies = unstable_cache(
  async (
    metaFormat: MetaFormat,
    species: string,
    month?: string,
  ): Promise<MetaSpeciesView | null> =>
    loadMetaSpeciesUncached(metaFormat, species, month, await singletonDb()),
  ["meta-species"],
  { revalidate: 3600 },
);

/** `/meta/[format]` — React `cache()` dedupes page + generateMetadata per request. */
export const loadMetaLeaderboard = cache(
  async (
    metaFormat: MetaFormat = DEFAULT_META_FORMAT,
    month?: string,
  ): Promise<MetaLeaderboardView> => cachedMetaLeaderboard(metaFormat, month),
);

/** `/meta/[format]/[slug]` — React `cache()` dedupes page + generateMetadata per request. */
export const loadMetaSpecies = cache(
  async (
    metaFormat: MetaFormat,
    species: string,
    month?: string,
  ): Promise<MetaSpeciesView | null> =>
    cachedMetaSpecies(metaFormat, species, month),
);
