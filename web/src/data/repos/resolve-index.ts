/**
 * ResolveIndex — the in-memory fuzzy matcher backing `resolve_entity` (T1, BR-9).
 *
 * Design (design.md § Data Model `searchable_names`, § Interface Definitions
 * `resolve-index.ts`; tools.md T1):
 *
 *   function resolveEntity(query, kind, limit): { matches: [...] }
 *
 * The `searchable_names` rows (one per Pokémon / move / ability / type / item)
 * are loaded ONCE into an in-memory fuse.js index — "loaded into an in-memory
 * fuzzy index at startup" — and ranked per query. Resolution is name->slug over
 * a known finite set, so a fuzzy string matcher (no vector store, A9) is the
 * right tool.
 *
 * Contract specifics:
 *   - Output is `{ matches: [{ kind, slug, display_name, score }] }`, ranked
 *     best-first, where `score` is in [0, 1] with HIGHER = better (the inverse
 *     of fuse.js's 0=perfect distance), matching the tools.md T1 sample.
 *   - `kind` restricts the search to one entity kind, or "any" for all.
 *   - Returns `{ matches: [] }` when nothing is close — never throws, no
 *     "fatal" failure mode (tools.md T1). T1 has no `index_unavailable` path;
 *     an empty names table simply yields no matches.
 *
 * Module boundary (design.md Code Conventions): repos are the sole SQLite
 * readers. This file reads `searchable_names` via the memoized Drizzle handle.
 */

import "server-only";

import { eq } from "drizzle-orm";
import Fuse from "fuse.js";

import { db } from "@/data/db";
import { type Format, CHAMPIONS_FORMAT } from "@/data/formats";
import { searchable_names } from "@/data/schema";
import { loadChampionsItemExclusions } from "@/data/repos/champions-items-repo";
import { type EntityKind, type ResolveEntityOutput } from "@/agent/schemas";

/** One searchable name row (the in-memory record fuse.js indexes). */
export type SearchableName = {
  kind: EntityKind;
  slug: string;
  display_name: string;
};

/** The `kind` argument accepted by `resolveEntity` (T1 input). */
export type ResolveKind = EntityKind | "any";

// ---------------------------------------------------------------------------
// fuse.js configuration
// ---------------------------------------------------------------------------
//
// - Search across both `display_name` (human label, spaces + caps) and `slug`
//   (canonical, hyphenated) so "Will-o-Whisp", "will o wisp", and "will-o-wisp"
//   all resolve to `will-o-wisp`.
// - `threshold` bounds how far a fuzzy match may stray; anything beyond it is
//   dropped, which is what produces an empty result for an unrelated query.
// - `ignoreLocation` so a match anywhere in the string counts (names are short;
//   we don't want to penalise position).
// - `minMatchCharLength` of 2 avoids a single stray character matching half the
//   index.
const FUSE_OPTIONS: import("fuse.js").IFuseOptions<SearchableName> = {
  keys: ["display_name", "slug"],
  includeScore: true,
  threshold: 0.45,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

/** Convert a fuse.js distance (0=perfect, 1=worst) to a [0,1] HIGHER=better score. */
function toScore(fuseScore: number | undefined): number {
  const distance = fuseScore ?? 1;
  const score = 1 - distance;
  // Two decimals, clamped to [0, 1].
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/**
 * An immutable fuzzy index over a fixed set of `searchable_names` rows. Built
 * once and queried many times. Construct via `createResolveIndex(rows)`.
 */
export class ResolveIndex {
  private readonly fuse: Fuse<SearchableName>;
  private readonly rows: SearchableName[];

  constructor(rows: SearchableName[]) {
    this.fuse = new Fuse(rows, FUSE_OPTIONS);
    this.rows = rows;
  }

  /**
   * List the entities of one `kind` (alphabetical by display name), capped at
   * `limit`. Backs the picker's "show options on focus" with no query — there is
   * nothing to rank, so order is just the friendly name. `score` is a constant 1.
   */
  list(kind: ResolveKind = "any", limit = 50): ResolveEntityOutput {
    const matches = this.rows
      .filter((r) => kind === "any" || r.kind === kind)
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .slice(0, Math.max(0, limit))
      .map((r) => ({
        kind: r.kind,
        slug: r.slug,
        display_name: r.display_name,
        score: 1,
      }));
    return { matches };
  }

  /**
   * Rank candidate matches for `query`, optionally restricted to one `kind`,
   * returning at most `limit` results best-first. Empty `matches` when the
   * query is blank or nothing is close.
   */
  resolve(
    query: string,
    kind: ResolveKind = "any",
    limit = 5,
  ): ResolveEntityOutput {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { matches: [] };
    }

    // Search the whole index, then narrow by kind (so a kind filter never
    // truncates better cross-kind matches out of fuse's internal limit) and
    // finally take the top `limit`. fuse returns results already sorted
    // best-first (lowest distance), which is also highest score-first.
    const results = this.fuse.search(trimmed);

    const matches = results
      .filter((r) => kind === "any" || r.item.kind === kind)
      .slice(0, Math.max(0, limit))
      .map((r) => ({
        kind: r.item.kind,
        slug: r.item.slug,
        display_name: r.item.display_name,
        score: toScore(r.score),
      }));

    return { matches };
  }
}

/** Build a fresh in-memory resolve index over the given rows (pure; no I/O). */
export function createResolveIndex(rows: SearchableName[]): ResolveIndex {
  return new ResolveIndex(rows);
}

// ---------------------------------------------------------------------------
// Process-wide singleton (lazy "startup" load from the SQLite names table)
// ---------------------------------------------------------------------------

/** One lazily-built fuzzy index per format (searchable_names is format-scoped). */
const byFormat = new Map<Format, ResolveIndex>();

/**
 * Read the `searchable_names` rows for one format. For Champions, item rows the
 * operator has marked unavailable (`champions_item_exclusion`) are dropped, so
 * an excluded item cannot resolve — steering both the team-builder picker and
 * the agent's `resolve_entity` away from items that aren't in the game yet. The
 * built index is cached per format and rebuilt via `resetResolveIndex`
 * (`setChampionsItemAvailability` resets Champions on every toggle).
 */
async function loadRows(format: Format): Promise<SearchableName[]> {
  const rows = (await db
    .select({
      kind: searchable_names.kind,
      slug: searchable_names.slug,
      display_name: searchable_names.display_name,
    })
    .from(searchable_names)
    .where(eq(searchable_names.format, format))) as SearchableName[];

  if (format !== CHAMPIONS_FORMAT) return rows;

  const excluded = await loadChampionsItemExclusions({ db });
  if (excluded.size === 0) return rows;
  return rows.filter((r) => r.kind !== "item" || !excluded.has(r.slug));
}

/** Get (building lazily on first use) the resolve index for `format`. */
async function getIndex(format: Format): Promise<ResolveIndex> {
  let index = byFormat.get(format);
  if (!index) {
    index = createResolveIndex(await loadRows(format));
    byFormat.set(format, index);
  }
  return index;
}

/**
 * Resolve a possibly-misspelled / ambiguous name to canonical entities (T1),
 * scoped to `format`.
 *
 * The in-memory index is built from `searchable_names` on first call and cached
 * for the process lifetime. Returns ranked matches (best-first) or
 * `{ matches: [] }` when nothing is close — never throws.
 */
export async function resolveEntity(
  query: string,
  kind: ResolveKind = "any",
  limit = 5,
  format: Format = "scarlet-violet",
): Promise<ResolveEntityOutput> {
  return (await getIndex(format)).resolve(query, kind, limit);
}

/**
 * List entities of one `kind` for `format`, alphabetical, capped at `limit` —
 * backs the picker's "show options on focus" (empty query). Never throws.
 */
export async function listEntities(
  kind: ResolveKind = "any",
  limit = 50,
  format: Format = "scarlet-violet",
): Promise<ResolveEntityOutput> {
  return (await getIndex(format)).list(kind, limit);
}

/**
 * Drop the cached index(es) so the next `resolveEntity` rebuilds from the
 * current `searchable_names` table (e.g. after an ingest rebuild, or in tests).
 * Pass a format to reset just that one; omit to reset all.
 */
export function resetResolveIndex(format?: Format): void {
  if (format) byFormat.delete(format);
  else byFormat.clear();
}
