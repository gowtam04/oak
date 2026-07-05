/**
 * Drift guard for WAREHOUSE_DDL — the CREATE TABLE reference handed to run_sql
 * MUST stay in lock-step with the live Drizzle schema. This test parses every
 * table/column name out of the DDL string and cross-checks it against
 * `getTableColumns(...)` for the real schema objects, both directions:
 *   - every table named in the DDL is a real, allowlisted warehouse table,
 *   - every column named under it exists on the live table (no phantom columns),
 *   - every live column is documented in the DDL (no silently-added columns).
 * A schema change to any exposed table fails the build until the DDL is updated.
 */

import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";

import { WAREHOUSE_DDL, WAREHOUSE_ALLOWLIST } from "./warehouse-ddl";
import * as schema from "@/data/schema";

/** Parse `CREATE TABLE <name> ( <col> <type>, ... );` blocks from the DDL. */
function parseDdl(ddl: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const re = /CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ddl)) !== null) {
    const [, name, body] = m;
    const cols: string[] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith("--")) continue;
      const col = /^(\w+)\s/.exec(line);
      if (col) cols.push(col[1]);
    }
    tables.set(name, cols);
  }
  return tables;
}

const parsed = parseDdl(WAREHOUSE_DDL);

/** Live column names for a schema table object, by name. */
const liveColumns: Record<string, string[]> = {
  pokemon: Object.keys(getTableColumns(schema.pokemon)),
  learnset: Object.keys(getTableColumns(schema.learnset)),
  reference_cache: Object.keys(getTableColumns(schema.reference_cache)),
  searchable_names: Object.keys(getTableColumns(schema.searchable_names)),
  ingest_meta: Object.keys(getTableColumns(schema.ingest_meta)),
  champions_item_exclusion: Object.keys(
    getTableColumns(schema.champions_item_exclusion),
  ),
  natdex_species: Object.keys(getTableColumns(schema.natdex_species)),
  natdex_machines: Object.keys(getTableColumns(schema.natdex_machines)),
  natdex_moves: Object.keys(getTableColumns(schema.natdex_moves)),
  classic_encounters: Object.keys(getTableColumns(schema.classic_encounters)),
  pmd_recruits: Object.keys(getTableColumns(schema.pmd_recruits)),
  meta_snapshot: Object.keys(getTableColumns(schema.meta_snapshot)),
  meta_usage: Object.keys(getTableColumns(schema.meta_usage)),
};

describe("WAREHOUSE_DDL drift guard", () => {
  it("documents exactly the allowlisted tables", () => {
    expect([...parsed.keys()].sort()).toEqual([...WAREHOUSE_ALLOWLIST].sort());
  });

  it("the allowlist matches the sandbox's exposed set (13 tables)", () => {
    expect(WAREHOUSE_ALLOWLIST).toHaveLength(13);
  });

  for (const table of WAREHOUSE_ALLOWLIST) {
    it(`${table}: DDL columns match the live Drizzle schema exactly`, () => {
      const ddlCols = parsed.get(table);
      expect(ddlCols, `${table} present in DDL`).toBeDefined();
      expect([...(ddlCols ?? [])].sort()).toEqual(
        [...liveColumns[table]].sort(),
      );
    });
  }
});
