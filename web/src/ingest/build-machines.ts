/**
 * build-machines.ts — build the global `natdex_machines` rows (TM/HM/TR per
 * version group) from the committed snapshot (src/ingest/data/machines.json).
 *
 * OFFLINE half of the machines feature; the crawl lives in
 * scripts/fetch-pokeapi-natdex.ts. GLOBAL table — no `format` column. Imported
 * ONLY by src/ingest/run.ts.
 */

import type { natdex_machines } from "@/data/schema";

import { readSnapshot } from "./read-snapshot";

export type NatdexMachineRow = typeof natdex_machines.$inferInsert;

interface MachineSnapshotRow {
  version_group: string;
  machine: string;
  move_slug: string;
  item_slug: string;
}
interface MachineSnapshot {
  machines: MachineSnapshotRow[];
}

/** Map machines.json → `natdex_machines` insert rows. */
export function buildMachineRows(): NatdexMachineRow[] {
  const snap = readSnapshot<MachineSnapshot>("machines.json");
  const machines = snap?.machines ?? [];
  return machines.map((m) => ({
    version_group: m.version_group,
    machine: m.machine,
    move_slug: m.move_slug,
    item_slug: m.item_slug,
  }));
}
