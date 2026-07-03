/**
 * build-classic-encounters.ts — build the global `classic_encounters` rows
 * (wild encounters, Gens 1–7 ONLY) from the committed gzipped snapshot
 * (src/ingest/data/classic-encounters.json.gz).
 *
 * OFFLINE half; the crawl lives in scripts/fetch-pokeapi-natdex.ts. The snapshot
 * is gzipped (~59k deduped rows) and read via zlib in read-snapshot.ts. GLOBAL
 * table — no `format` column. Coverage is best-effort: PokeAPI has no Gen 8–9
 * encounter data and known Gen 1–7 holes, so any answer sourced from this table
 * must be flaggable as partial. `id` is assigned sequentially here (there is no
 * natural PK after deduping). Imported ONLY by src/ingest/run.ts.
 */

import type { classic_encounters } from "@/data/schema";

import { readSnapshot } from "./read-snapshot";

export type ClassicEncounterRow = typeof classic_encounters.$inferInsert;

/** Citation source label for classic-encounter rows. */
export const CLASSIC_ENCOUNTER_SOURCE_URL = "https://pokeapi.co";

interface EncounterSnapshotRow {
  version: string;
  location: string;
  area: string | null;
  method: string;
  species: string;
  rarity: number | null;
  min_level: number | null;
  max_level: number | null;
}
interface EncounterSnapshot {
  encounters: EncounterSnapshotRow[];
}

/** Map classic-encounters.json.gz → `classic_encounters` insert rows. */
export function buildClassicEncounterRows(): ClassicEncounterRow[] {
  const snap = readSnapshot<EncounterSnapshot>("classic-encounters.json.gz");
  const encounters = snap?.encounters ?? [];
  return encounters.map((e, i) => ({
    id: i,
    version: e.version,
    location: e.location,
    area: e.area,
    method: e.method,
    species: e.species,
    rarity: e.rarity,
    min_level: e.min_level,
    max_level: e.max_level,
  }));
}
