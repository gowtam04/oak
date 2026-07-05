/**
 * INDEPENDENT ORACLE — run_sql (T18). Proves the guarded SQL sandbox against a
 * real migrated Postgres schema (Testcontainers, seed "tools" + inserted natdex
 * rows):
 *
 *   AGGREGATIONS (the reason the tool exists):
 *     - natdex number == base-stat total finds the seeded match,
 *     - catch-rate-higher-than-pre-evolution join works,
 *     - a GROUP BY aggregation works.
 *
 *   SECURITY (asserted under BOTH pool configurations — the oak_readonly role
 *   present, and the deny-list fallback with the role forced off):
 *     - INSERT/UPDATE/DELETE/DROP/TRUNCATE each rejected (READ ONLY txn),
 *     - `SELECT 1; DROP TABLE …` rejected (single-statement / subquery wrap),
 *       and the table is still intact afterwards,
 *     - `SELECT * FROM account` rejected (deny-list / role grant),
 *     - `SELECT pg_sleep(10)` → query_timeout (statement_timeout),
 *     - a 250-row result is capped to 200 rows with truncated=true.
 *
 * Every failure returns a structured `{ error, hint }` — never a throw.
 *
 * Wiring: migrate an isolated schema (migration 0009 creates the cluster-global
 * oak_readonly role + grants), insert fixture rows through the fixture pool
 * (superuser — NOT the sandbox), then install that pool as the sandbox singleton
 * and dispatch through the public tool layer.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";
import type { RunSqlOutput, RunSqlRows } from "@/agent/schemas";

import { createPgSchema, type PgFixture } from "../../../test/support/pg";

let fix: PgFixture;
let loadError: unknown = null;

let dispatch: (
  name: string,
  args: unknown,
  ctx: AgentContext,
) => Promise<unknown>;
let installSandboxPool: typeof import("@/data/sql-sandbox").installSandboxPool;
let resetSandboxPool: typeof import("@/data/sql-sandbox").resetSandboxPool;

const NATDEX_INSERT = `
INSERT INTO natdex_species
  (species, national_dex_number, generation, color, shape, capture_rate, base_stat_total, evolves_from, type1, type2)
VALUES
  ('bulbasaur',1,1,'green','quadruped',45,318,NULL,'grass','poison'),
  ('ivysaur',2,1,'green','quadruped',45,405,'bulbasaur','grass','poison'),
  ('venusaur',3,1,'green','quadruped',45,525,'ivysaur','grass','poison'),
  ('charmander',4,1,'red','upright',45,309,NULL,'fire',NULL),
  ('pichu',172,2,'yellow','quadruped',190,205,NULL,'electric',NULL),
  ('pikachu',25,1,'yellow','quadruped',190,320,'pichu','electric',NULL),
  ('matchmon',500,8,'blue','upright',3,500,NULL,'dragon',NULL),
  ('lowcatch',900,9,'gray','upright',30,400,NULL,'rock',NULL),
  ('highcatch',901,9,'gray','upright',60,500,'lowcatch','rock',NULL)
`;

const BULK_INSERT = `
INSERT INTO natdex_species
  (species, national_dex_number, generation, capture_rate, base_stat_total, type1)
SELECT 'bulk-' || g, 2000 + g, 1, 100, 300, 'normal'
FROM generate_series(1, 250) g
`;

const META_USAGE_INSERT = `
INSERT INTO meta_usage
  (meta_format, month, species, display_name, rank, usage_pct, raw_count, moves, items, abilities, spreads, teammates, counters)
VALUES
  ('gen9ou','2026-05','great-tusk','Great Tusk',1,58.7,1437000,'[]','[]','[]','[]','[]','[]'),
  ('gen9ou','2026-05','kingambit','Kingambit',3,42.1,1030500,'[]','[]','[]','[]','[]','[]'),
  ('gen9ou','2026-04','great-tusk','Great Tusk',1,55.2,1390000,'[]','[]','[]','[]','[]','[]')
`;

const ctx = {
  logger: console,
  requestId: "test",
  mode: "champions",
} as unknown as AgentContext;

function isRows(out: RunSqlOutput): out is RunSqlRows {
  return "rows" in out;
}

async function runSql(query: string): Promise<RunSqlOutput> {
  return (await dispatch(
    "run_sql",
    { query, purpose: "oracle test" },
    ctx,
  )) as RunSqlOutput;
}

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
    await fix.bundle.pool.query(NATDEX_INSERT);
    await fix.bundle.pool.query(BULK_INSERT);
    await fix.bundle.pool.query(META_USAGE_INSERT);

    ({ dispatch } = await import("@/agent/tools"));
    ({ installSandboxPool, resetSandboxPool } = await import(
      "@/data/sql-sandbox"
    ));
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  resetSandboxPool?.();
  await fix?.cleanup();
});

function ensureLoaded(): void {
  if (loadError) throw new Error(`Setup failed: ${String(loadError)}`);
}

// ---------------------------------------------------------------------------
// Aggregations — run under the default (role-probed) configuration.
// ---------------------------------------------------------------------------
describe("run_sql (T18) — aggregations, oak_readonly role configuration", () => {
  beforeAll(() => {
    ensureLoaded();
    installSandboxPool(fix.bundle.pool);
  });

  it("resolves the oak_readonly role path (migration 0009 created it)", async () => {
    // Force the async capability probe to complete by running any query.
    await runSql("SELECT 1 AS one");
    const bundle = (
      globalThis as { __oakSqlSandbox?: { useRole: boolean } }
    ).__oakSqlSandbox;
    expect(bundle?.useRole).toBe(true);
  });

  it("finds the species whose national-dex number equals its base-stat total", async () => {
    const out = await runSql(
      "SELECT species FROM natdex_species WHERE national_dex_number = base_stat_total ORDER BY species",
    );
    expect(isRows(out)).toBe(true);
    if (!isRows(out)) return;
    expect(out.columns).toEqual(["species"]);
    expect(out.rows).toEqual([["matchmon"]]);
    expect(out.row_count).toBe(1);
    expect(out.truncated).toBe(false);
  });

  it("finds species with a higher catch rate than their pre-evolution (self-join)", async () => {
    const out = await runSql(
      `SELECT s.species
       FROM natdex_species s
       JOIN natdex_species p ON s.evolves_from = p.species
       WHERE s.capture_rate > p.capture_rate
       ORDER BY s.species`,
    );
    expect(isRows(out)).toBe(true);
    if (!isRows(out)) return;
    expect(out.rows).toEqual([["highcatch"]]);
  });

  it("supports GROUP BY aggregation", async () => {
    const out = await runSql(
      "SELECT generation, count(*)::int AS n FROM natdex_species GROUP BY generation ORDER BY generation",
    );
    expect(isRows(out)).toBe(true);
    if (!isRows(out)) return;
    expect(out.columns).toEqual(["generation", "n"]);
    // gen 2 has exactly one species (pichu).
    const gen2 = out.rows.find((r) => r[0] === 2);
    expect(gen2?.[1]).toBe(1);
  });

  it("caps a large result at 200 rows and flags truncated", async () => {
    const out = await runSql("SELECT species FROM natdex_species");
    expect(isRows(out)).toBe(true);
    if (!isRows(out)) return;
    expect(out.rows).toHaveLength(200);
    expect(out.row_count).toBe(200);
    expect(out.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// meta_usage — the Smogon monthly ladder-usage warehouse tables (B-5).
// ---------------------------------------------------------------------------
describe("run_sql (T18) — meta_usage (Smogon ladder-usage warehouse tables)", () => {
  beforeAll(() => {
    ensureLoaded();
    installSandboxPool(fix.bundle.pool);
  });

  it("reads seeded meta_usage rows filtered by meta_format and month", async () => {
    const out = await runSql(
      `SELECT species, usage_pct FROM meta_usage
       WHERE meta_format = 'gen9ou' AND month = '2026-05'
       ORDER BY rank`,
    );
    expect(isRows(out)).toBe(true);
    if (!isRows(out)) return;
    expect(out.columns).toEqual(["species", "usage_pct"]);
    expect(out.rows).toEqual([
      ["great-tusk", 58.7],
      ["kingambit", 42.1],
    ]);
    expect(out.row_count).toBe(2);
    expect(out.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Security — asserted under BOTH configurations.
// ---------------------------------------------------------------------------
const CONFIGS: Array<{ label: string; forceNoRole: boolean }> = [
  { label: "oak_readonly role", forceNoRole: false },
  { label: "deny-list fallback (role forced off)", forceNoRole: true },
];

for (const cfg of CONFIGS) {
  describe(`run_sql (T18) — security under ${cfg.label}`, () => {
    beforeAll(() => {
      ensureLoaded();
      installSandboxPool(fix.bundle.pool, { forceNoRole: cfg.forceNoRole });
    });

    const writes = [
      ["INSERT", "INSERT INTO natdex_species (species, national_dex_number, generation, base_stat_total, type1) VALUES ('evil', 9999, 1, 1, 'normal')"],
      ["UPDATE", "UPDATE natdex_species SET generation = 9"],
      ["DELETE", "DELETE FROM natdex_species"],
      ["DROP", "DROP TABLE natdex_species"],
      ["TRUNCATE", "TRUNCATE natdex_species"],
    ] as const;

    for (const [name, sql] of writes) {
      it(`rejects ${name} (never throws)`, async () => {
        const out = await runSql(sql);
        expect(isRows(out)).toBe(false);
        if (isRows(out)) return;
        expect(out.error).toBe("query_failed");
      });
    }

    it("rejects a multi-command string and leaves the table intact", async () => {
      const out = await runSql("SELECT 1; DROP TABLE natdex_species");
      expect(isRows(out)).toBe(false);
      if (isRows(out)) return;
      expect(out.error).toBe("query_failed");

      // The table (and its rows) must still be there.
      const check = await runSql("SELECT count(*)::int AS n FROM natdex_species");
      expect(isRows(check)).toBe(true);
      if (!isRows(check)) return;
      expect(check.rows[0][0]).toBeGreaterThan(0);
    });

    it("rejects a paren-escape that breaks out of the subquery wrap (RESET ROLE injection)", async () => {
      // The `$1` bind forces the extended protocol, so this multi-statement
      // escape — which would otherwise close the wrap, RESET ROLE (dropping the
      // oak_readonly restriction), then run more commands — is rejected outright
      // by Postgres. It must NOT return rows under EITHER configuration.
      const out = await runSql("1) oak_sub LIMIT 1; RESET ROLE; SELECT 1 --");
      expect(isRows(out)).toBe(false);
      if (isRows(out)) return;
      expect(out.error).toBe("query_failed");
      expect(out.hint ?? "").toMatch(/multiple commands|syntax/i);
    });

    it("rejects reading a restricted user table (account)", async () => {
      const out = await runSql("SELECT * FROM account");
      expect(isRows(out)).toBe(false);
      if (isRows(out)) return;
      expect(out.error).toBe("query_failed");
    });
  });
}

// ---------------------------------------------------------------------------
// Timeout — one config is enough (each pg_sleep waits out the 3s cap).
// ---------------------------------------------------------------------------
describe("run_sql (T18) — statement timeout", () => {
  beforeAll(() => {
    ensureLoaded();
    installSandboxPool(fix.bundle.pool);
  });

  it("maps a >3s query to query_timeout", async () => {
    const out = await runSql("SELECT pg_sleep(10)");
    expect(isRows(out)).toBe(false);
    if (isRows(out)) return;
    expect(out.error).toBe("query_timeout");
    expect(out.hint).toBe("exceeded 3s");
  }, 15_000);
});
