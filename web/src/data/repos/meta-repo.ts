/**
 * MetaRepo — typed, read-only Postgres access over `meta_snapshot`/`meta_usage`
 * (backlog B-5, Phase 2 — see `src/data/schema.ts`'s meta block +
 * `src/data/meta-formats.ts` for the ladder axis).
 *
 * These are thin, close-to-the-column reads (mirrors `getPokemon`'s style in
 * `pokedex-repo.ts`, not the further-reshaped `LearnerRow`/`LearnedMove`
 * page-view-model helpers in `learnset-repo.ts`): field names match the DB
 * columns verbatim (`display_name`, `usage_pct`, …), including the JSON-text
 * columns parsed into their typed array shapes. The polished camelCase
 * view-models the pages/components actually render (`MetaLeaderboardRow`,
 * `MetaSpeciesView`, …) are assembled ONE layer up, in `src/data/meta-pages.ts`
 * — this repo does no camelCasing or Showdown-export assembly itself.
 *
 * node-postgres is asynchronous — every read here is `async` and awaits its
 * Drizzle query. The Drizzle handle is supplied by the caller (mirrors every
 * other repo's convention), so this module has no eager DB-connection side
 * effect and is exercised against a fixture DB with no singleton involved.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { OakDb } from "@/data/db";
import { STANDARD_FORMAT } from "@/data/formats";
import type { MetaFormat } from "@/data/meta-formats";
import { meta_snapshot, meta_usage, pokemon, searchable_names } from "@/data/schema";
import type {
  MetaCounterUsage,
  MetaMoveUsage,
  MetaSpreadUsage,
  MetaTeammateUsage,
} from "@/lib/meta-pages-types";

/** One `meta_snapshot` row, column names verbatim. */
export interface MetaSnapshotRecord {
  meta_format: string;
  month: string;
  smogon_format_id: string;
  cutoff: number;
  total_battles: number | null;
  species_count: number;
  fetched_at: number;
  source_url: string;
}

/** One leaderboard entry — `meta_usage` columns plus the derived MoM `prev_usage_pct`. */
export interface MetaLeaderboardEntry {
  rank: number;
  species: string;
  display_name: string;
  usage_pct: number;
  /** The immediately-previous SYNCED month's usage_pct for this species, or null. */
  prev_usage_pct: number | null;
}

/** A full `meta_usage` row with its six JSON-text columns parsed into typed arrays. */
export interface MetaSpeciesDetailRecord {
  meta_format: string;
  month: string;
  species: string;
  display_name: string;
  rank: number;
  usage_pct: number;
  raw_count: number | null;
  moves: MetaMoveUsage[];
  items: MetaMoveUsage[];
  abilities: MetaMoveUsage[];
  spreads: MetaSpreadUsage[];
  teammates: MetaTeammateUsage[];
  counters: MetaCounterUsage[];
}

/** One point of a species' usage/rank trend across synced months. */
export interface MetaTrendRecord {
  month: string;
  usage_pct: number;
  rank: number;
}

/**
 * Every synced month for `metaFormat`, most recent first. Empty array when the
 * ladder has never been synced (the pre-sync "expected empty" state — see
 * `src/data/meta-pages.ts`'s `available: false` contract).
 */
export async function listMetaMonths(
  db: OakDb,
  metaFormat: MetaFormat,
): Promise<string[]> {
  const rows = await db
    .select({ month: meta_snapshot.month })
    .from(meta_snapshot)
    .where(eq(meta_snapshot.meta_format, metaFormat))
    .orderBy(desc(meta_snapshot.month));
  return rows.map((r) => r.month);
}

/** One `meta_snapshot` row for `(metaFormat, month)`, or null when unsynced. */
export async function metaSnapshot(
  db: OakDb,
  metaFormat: MetaFormat,
  month: string,
): Promise<MetaSnapshotRecord | null> {
  const rows = await db
    .select()
    .from(meta_snapshot)
    .where(
      and(
        eq(meta_snapshot.meta_format, metaFormat),
        eq(meta_snapshot.month, month),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The `(metaFormat, month)` leaderboard, ordered by rank ascending, each row
 * carrying `prev_usage_pct` from the immediately-previous SYNCED month (derived
 * from {@link listMetaMonths}, NOT month arithmetic — months can have holes, and
 * a species absent from that prior month yields `prev_usage_pct: null`, the
 * LEFT-JOIN semantics the plan calls for). When `month` is the earliest synced
 * month (or isn't a synced month at all), every row's `prev_usage_pct` is null.
 */
export async function metaLeaderboard(
  db: OakDb,
  metaFormat: MetaFormat,
  month: string,
): Promise<MetaLeaderboardEntry[]> {
  const rows = await db
    .select({
      species: meta_usage.species,
      display_name: meta_usage.display_name,
      rank: meta_usage.rank,
      usage_pct: meta_usage.usage_pct,
    })
    .from(meta_usage)
    .where(
      and(eq(meta_usage.meta_format, metaFormat), eq(meta_usage.month, month)),
    )
    .orderBy(asc(meta_usage.rank));

  if (rows.length === 0) return [];

  // Months are returned most-recent-first; the immediately-previous synced
  // month is the NEXT entry after `month`'s position (a hole simply advances
  // this by more than one calendar month, which is fine — we never do date math).
  const months = await listMetaMonths(db, metaFormat);
  const idx = months.indexOf(month);
  const prevMonth = idx >= 0 ? months[idx + 1] : undefined;

  if (!prevMonth) {
    return rows.map((r) => ({ ...r, prev_usage_pct: null }));
  }

  const prevRows = await db
    .select({ species: meta_usage.species, usage_pct: meta_usage.usage_pct })
    .from(meta_usage)
    .where(
      and(
        eq(meta_usage.meta_format, metaFormat),
        eq(meta_usage.month, prevMonth),
      ),
    );
  const prevBySpecies = new Map(prevRows.map((r) => [r.species, r.usage_pct]));

  return rows.map((r) => ({
    ...r,
    prev_usage_pct: prevBySpecies.get(r.species) ?? null,
  }));
}

/** Full `(metaFormat, month, species)` detail row, JSON columns parsed, or null. */
export async function metaSpeciesDetail(
  db: OakDb,
  metaFormat: MetaFormat,
  month: string,
  species: string,
): Promise<MetaSpeciesDetailRecord | null> {
  const rows = await db
    .select()
    .from(meta_usage)
    .where(
      and(
        eq(meta_usage.meta_format, metaFormat),
        eq(meta_usage.month, month),
        eq(meta_usage.species, species),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  return {
    meta_format: row.meta_format,
    month: row.month,
    species: row.species,
    display_name: row.display_name,
    rank: row.rank,
    usage_pct: row.usage_pct,
    raw_count: row.raw_count,
    moves: JSON.parse(row.moves) as MetaMoveUsage[],
    items: JSON.parse(row.items) as MetaMoveUsage[],
    abilities: JSON.parse(row.abilities) as MetaMoveUsage[],
    spreads: JSON.parse(row.spreads) as MetaSpreadUsage[],
    teammates: JSON.parse(row.teammates) as MetaTeammateUsage[],
    counters: JSON.parse(row.counters) as MetaCounterUsage[],
  };
}

/**
 * A species' usage/rank trend across up to `limit` most-recent synced months,
 * ascending by month (oldest first — the order a sparkline/chart wants).
 */
export async function metaSpeciesTrend(
  db: OakDb,
  metaFormat: MetaFormat,
  species: string,
  limit = 12,
): Promise<MetaTrendRecord[]> {
  const rows = await db
    .select({
      month: meta_usage.month,
      usage_pct: meta_usage.usage_pct,
      rank: meta_usage.rank,
    })
    .from(meta_usage)
    .where(
      and(eq(meta_usage.meta_format, metaFormat), eq(meta_usage.species, species)),
    )
    .orderBy(desc(meta_usage.month))
    .limit(limit);

  return rows.reverse();
}

/**
 * Which of `species` slugs resolve a `scarlet-violet` `/pokedex/<slug>` page —
 * a cheap indexed `searchable_names` lookup (PK `(format, kind, slug)`), the
 * same table `resolve-index.ts` reads, but queried directly here rather than
 * through that module's in-memory fuzzy-index singleton (this is an exact
 * membership check, not a fuzzy resolve).
 */
export async function speciesWithDexPage(
  db: OakDb,
  species: string[],
): Promise<Set<string>> {
  if (species.length === 0) return new Set();
  const rows = await db
    .select({ slug: searchable_names.slug })
    .from(searchable_names)
    .where(
      and(
        eq(searchable_names.format, STANDARD_FORMAT),
        eq(searchable_names.kind, "pokemon"),
        inArray(searchable_names.slug, species),
      ),
    );
  return new Set(rows.map((r) => r.slug));
}

/**
 * Sprite URLs for `species` slugs, read off the `scarlet-violet` `pokemon`
 * table (same format {@link speciesWithDexPage} checks) — a sibling lookup,
 * not a join with that function, since a leaderboard species can have art
 * (`pokemon` row) without a resolvable dex PAGE (`searchable_names` row) or
 * vice versa. Absent species are simply omitted from the returned Map, not
 * mapped to `null` — callers do the `?? null` at the call site.
 */
export async function speciesSpriteUrls(
  db: OakDb,
  species: string[],
): Promise<Map<string, string>> {
  if (species.length === 0) return new Map();
  const rows = await db
    .select({ id: pokemon.id, sprite_url: pokemon.sprite_url })
    .from(pokemon)
    .where(
      and(eq(pokemon.format, STANDARD_FORMAT), inArray(pokemon.id, species)),
    );
  return new Map(rows.map((r) => [r.id, r.sprite_url]));
}
