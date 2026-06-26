/**
 * build-names.ts — DS-2 + PokeAPI name lists → searchable_names rows.
 *
 * Builds every row for the `searchable_names` table that backs `resolve_entity`
 * (tool T1, BR-9). Five entity kinds are indexed:
 *
 *   pokemon  — derived from already-built PokemonRows (DS-2); uses their rich
 *              display_names (e.g. "Tauros (Paldean Aqua)") without extra fetches.
 *   move     — fetched from PokeAPI /move?limit=100000
 *   ability  — fetched from PokeAPI /ability?limit=100000
 *   type     — fetched from PokeAPI /type?limit=100000; "unknown" and "shadow"
 *              pseudo-types are excluded (not real battle types).
 *   item     — fetched from PokeAPI /item?limit=100000
 *
 * Design notes:
 *   - Uses `limit=100000` so PokeAPI returns the full corpus in one request; the
 *     API clips the response to the actual count — the large limit is harmless.
 *   - Throws on any PokeAPI failure so the ingest orchestrator (run.ts) can catch
 *     the error and implement the reuse-last-good strategy.
 *   - No dependency on server-only / better-sqlite3 — safe to import in the ingest
 *     CLI (tsx) without Next.js server context.
 */

import type { PokeApiClient } from "@/data/pokeapi-client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Entity kinds that the searchable_names table indexes (T1, BR-9). */
export type NameKind = "pokemon" | "move" | "ability" | "type" | "item";

/** One row of the searchable_names table (kind, slug, display_name). */
export interface NameRow {
  kind: NameKind;
  /** Canonical PokeAPI slug, e.g. "will-o-wisp", "tauros-paldea-aqua". */
  slug: string;
  /** Human-readable label, e.g. "Will-O-Wisp", "Tauros (Paldean Aqua)". */
  display_name: string;
}

/**
 * Minimal shape consumed from a Pokémon row.
 * Structurally compatible with `PokemonRow` exported by `build-pokedex.ts`;
 * only the fields relevant to name-indexing are declared here to avoid a hard
 * compile-time dependency on a sibling ingest module that may not exist yet.
 */
export interface PokemonNameSource {
  /** PokeAPI pokemon slug, e.g. "tauros-paldea-aqua". */
  id: string;
  /** Disambiguating human label, e.g. "Tauros (Paldean Aqua)". */
  display_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a PokeAPI slug to a human-readable display name by capitalizing each
 * hyphen-separated word and preserving the hyphens:
 *   "will-o-wisp"    → "Will-O-Wisp"
 *   "fake-out"       → "Fake-Out"
 *   "armor-tail"     → "Armor-Tail"
 *   "fire"           → "Fire"
 *   ""               → ""  (passthrough)
 */
export function slugToDisplayName(slug: string): string {
  if (!slug) return slug;
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

/** Non-battle pseudo-types PokeAPI includes that must not appear in the index. */
const EXCLUDED_TYPES = new Set<string>(["unknown", "shadow"]);

// Raw shape of a PokeAPI list-endpoint response (shared across all list endpoints).
interface PokeApiListResponse {
  count: number;
  results: Array<{ name: string; url: string }>;
}

/**
 * Fetch all slugs for a PokeAPI list endpoint (e.g. "move", "ability").
 *
 * Uses `limit=100000` so the full corpus comes back in a single page.
 * Throws on any fetch failure (PokeApiError), bubbling to the caller for
 * reuse-last-good handling in the ingest orchestrator.
 */
async function fetchNameList(
  client: PokeApiClient,
  endpoint: string,
): Promise<string[]> {
  const result = await client.get(`${endpoint}?limit=100000&offset=0`);
  if (!result.ok) {
    throw new Error(
      `build-names: failed to fetch PokeAPI /${endpoint} list: ` +
        JSON.stringify(result.error),
    );
  }
  const data = result.value as unknown as PokeApiListResponse;
  return data.results.map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build all `searchable_names` rows from DS-2 Pokémon rows + PokeAPI name lists.
 *
 * @param pokemonRows - Already-built DS-2 rows from `build-pokedex.ts`.
 *                      Provides pokemon slugs and their rich display_names —
 *                      no additional PokeAPI fetches are needed for this kind.
 * @param client      - The app's PokeApiClient, used to fetch move / ability /
 *                      type / item name lists. Must be the injected singleton
 *                      (not constructed here — module-boundary rule, design.md).
 * @returns           - All NameRow objects to be inserted into searchable_names,
 *                      one per (kind, slug) pair.
 * @throws            - Re-throws any PokeApiClient error (structured
 *                      PokeApiError as JSON-serialised message) so the ingest
 *                      orchestrator can abort and keep the prior DB intact.
 */
export async function buildNames(
  pokemonRows: PokemonNameSource[],
  client: PokeApiClient,
): Promise<NameRow[]> {
  const rows: NameRow[] = [];

  // --- Pokémon (from DS-2 — no extra fetch) --------------------------------
  // Use the display_name already computed by build-pokedex (it handles forms,
  // e.g. "Tauros (Paldean Aqua)") rather than re-deriving from the slug.
  for (const p of pokemonRows) {
    rows.push({ kind: "pokemon", slug: p.id, display_name: p.display_name });
  }

  // --- Moves ---------------------------------------------------------------
  const moveSlugs = await fetchNameList(client, "move");
  for (const slug of moveSlugs) {
    rows.push({ kind: "move", slug, display_name: slugToDisplayName(slug) });
  }

  // --- Abilities -----------------------------------------------------------
  const abilitySlugs = await fetchNameList(client, "ability");
  for (const slug of abilitySlugs) {
    rows.push({ kind: "ability", slug, display_name: slugToDisplayName(slug) });
  }

  // --- Types (exclude non-battle pseudo-types) -----------------------------
  const typeSlugs = await fetchNameList(client, "type");
  for (const slug of typeSlugs) {
    if (!EXCLUDED_TYPES.has(slug)) {
      rows.push({ kind: "type", slug, display_name: slugToDisplayName(slug) });
    }
  }

  // --- Items ---------------------------------------------------------------
  const itemSlugs = await fetchNameList(client, "item");
  for (const slug of itemSlugs) {
    rows.push({ kind: "item", slug, display_name: slugToDisplayName(slug) });
  }

  return rows;
}
