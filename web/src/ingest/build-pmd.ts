/**
 * build-pmd.ts — build the global `pmd_recruits` rows (Pokémon Mystery Dungeon
 * recruit locations + rates) from the committed snapshot (src/ingest/data/pmd.json).
 *
 * OFFLINE half; the crawl lives in scripts/fetch-pokeapi-natdex.ts. Source data
 * is the pa5sarinho/pmd_dataset CSV (scraped from Bulbapedia), covering Red/Blue
 * Rescue Team and Explorers of Sky. GLOBAL table — no `format` column. Imported
 * ONLY by src/ingest/run.ts.
 */

import type { pmd_recruits } from "@/data/schema";

import { readSnapshot } from "./read-snapshot";

export type PmdRecruitRow = typeof pmd_recruits.$inferInsert;

/** Citation source label for PMD rows. */
export const PMD_SOURCE_URL = "https://github.com/pa5sarinho/pmd_dataset";

interface PmdSnapshotRow {
  game: string;
  species: string;
  location: string;
  recruit_rate: string | null;
  friend_area: string | null;
}
interface PmdSnapshot {
  recruits: PmdSnapshotRow[];
}

/** Map pmd.json → `pmd_recruits` insert rows. */
export function buildPmdRows(): PmdRecruitRow[] {
  const snap = readSnapshot<PmdSnapshot>("pmd.json");
  const recruits = snap?.recruits ?? [];
  return recruits.map((r) => ({
    game: r.game,
    species: r.species,
    location: r.location,
    recruit_rate: r.recruit_rate,
    friend_area: r.friend_area,
  }));
}
