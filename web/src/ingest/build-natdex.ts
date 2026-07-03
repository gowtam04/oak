/**
 * build-natdex.ts — build the global `natdex_species` and `natdex_moves` rows
 * from the committed PokeAPI snapshots (src/ingest/data/natdex.json +
 * natdex-moves.json).
 *
 * These are the OFFLINE halves; the network crawl lives in
 * scripts/fetch-pokeapi-natdex.ts (run manually). GLOBAL tables — no `format`
 * column — so the builders take no FormatSource: they just map the snapshot
 * rows into the table's insert shape. Imported ONLY by src/ingest/run.ts.
 */

import type { natdex_species, natdex_moves } from "@/data/schema";

import { readSnapshot } from "./read-snapshot";

export type NatdexSpeciesRow = typeof natdex_species.$inferInsert;
export type NatdexMoveRow = typeof natdex_moves.$inferInsert;

/** Citation source label for natdex rows. */
export const NATDEX_SOURCE_URL = "https://pokeapi.co";

interface SpeciesSnapshotRow {
  slug: string;
  natdex: number;
  gen: number;
  color: string | null;
  shape: string | null;
  capture_rate: number | null;
  bst: number;
  evolves_from: string | null;
  type1: string;
  type2: string | null;
}

interface MoveSnapshotRow {
  slug: string;
  gen: number;
  type: string | null;
  damage_class: string | null;
}

interface SpeciesSnapshot {
  species: SpeciesSnapshotRow[];
}
interface MoveSnapshot {
  moves: MoveSnapshotRow[];
}

/** Map natdex.json → `natdex_species` insert rows. */
export function buildNatdexSpeciesRows(): NatdexSpeciesRow[] {
  const snap = readSnapshot<SpeciesSnapshot>("natdex.json");
  const species = snap?.species ?? [];
  return species.map((s) => ({
    species: s.slug,
    national_dex_number: s.natdex,
    generation: s.gen,
    color: s.color,
    shape: s.shape,
    capture_rate: s.capture_rate,
    base_stat_total: s.bst,
    evolves_from: s.evolves_from,
    type1: s.type1,
    type2: s.type2,
  }));
}

/** Map natdex-moves.json → `natdex_moves` insert rows. */
export function buildNatdexMoveRows(): NatdexMoveRow[] {
  const snap = readSnapshot<MoveSnapshot>("natdex-moves.json");
  const moves = snap?.moves ?? [];
  return moves.map((m) => ({
    move_slug: m.slug,
    generation: m.gen,
    type: m.type,
    damage_class: m.damage_class,
  }));
}
