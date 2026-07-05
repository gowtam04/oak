/**
 * INDEPENDENT ORACLE — get_meta_usage (T21, backlog B-5). Proves the tool reads
 * stored monthly Smogon ladder usage from `meta_snapshot`/`meta_usage` through a
 * real migrated Postgres schema (Testcontainers), seeded via `seedMetaFixture`
 * (gen9ou × 2026-03/04/05 × ~6 species — see that fixture's header):
 *
 *   - the found path is field-complete (species/display_name/meta_format label,
 *     month/cutoff/rank/usage_pct, the six usage arrays with their element keys,
 *     an ascending ≤6-month trend, snapshot bookkeeping, attribution),
 *   - `month` omitted resolves to the latest synced month (2026-05); an explicit
 *     synced month is honored; an unsynced month → `{ error:"no_data",
 *     months_available }`,
 *   - name resolution matches the species slug AND the display name, case- and
 *     format-insensitively ("Kingambit" / "kingambit" / "great tusk"),
 *   - a near-miss name returns ranked suggestions including the intended species,
 *   - an unsynced ladder (empty schema) → `{ error:"no_data",
 *     months_available:[] }`,
 *   - the tool is MODE-INDEPENDENT: "standard" and "champions" produce identical
 *     output (the ladder is explicit input; the data scope is uninvolved),
 *   - malformed input degrades to the file's miss convention (found:false, []).
 *
 * The tool reads `ctx.db`, which we bind to the fixture handle via
 * createAgentContext — no @/data/db singleton is involved. `server-only` is
 * neutralized for vitest node.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GetMetaUsageOutput } from "@/agent/schemas";
import type { AgentContext, AgentMode } from "@/agent/types";
import type { OakDb } from "@/data/db";
import { getMetaUsageTool } from "@/agent/tools/get-meta-usage.tool";
import { createAgentContext } from "@/agent/context";

import { createPgSchema, type PgFixture } from "../../../test/support/pg";
import { seedMetaFixture } from "../../../test/fixtures/meta-fixture";

let fix: PgFixture;
let emptyFix: PgFixture;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  emptyFix = await createPgSchema({ seed: "none" });
  await seedMetaFixture(fix.db);
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
  await emptyFix?.cleanup();
});

function ctxFor(db: OakDb, mode: AgentMode = "standard"): Promise<AgentContext> {
  return createAgentContext({ db, requestId: "oracle", mode });
}

async function getMeta(
  db: OakDb,
  args: unknown,
  mode: AgentMode = "standard",
): Promise<GetMetaUsageOutput> {
  const ctx = await ctxFor(db, mode);
  return getMetaUsageTool.run(args, ctx) as Promise<GetMetaUsageOutput>;
}

describe("get_meta_usage — found path (latest synced month)", () => {
  it("returns a field-complete Kingambit detail with no month (defaults to 2026-05)", async () => {
    const out = await getMeta(fix.db, { name: "kingambit" });
    if (!("found" in out) || !out.found) {
      throw new Error(`expected a hit, got ${JSON.stringify(out)}`);
    }
    expect(out.name).toBe("kingambit");
    expect(out.species).toBe("kingambit");
    expect(out.display_name).toBe("Kingambit");
    expect(out.meta_format).toBe("gen9ou");
    expect(out.meta_format_label).toBe("Smogon OU (Gen 9 singles)");
    expect(out.smogon_format_id).toBe("gen9ou");
    expect(out.month).toBe("2026-05"); // latest synced month
    expect(out.cutoff).toBe(1695);
    expect(out.rank).toBe(1);
    expect(out.usage_pct).toBe(46.1);
    expect(out.total_battles).toEqual(expect.any(Number));
    expect(out.source_url).toContain("2026-05");
    expect(out.attribution).toBe("Smogon usage statistics (smogon.com/stats)");

    // Element-key shapes of the six usage arrays.
    expect(out.moves[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        slug: expect.any(String),
        pct: expect.any(Number),
      }),
    );
    expect(out.spreads[0]).toEqual(
      expect.objectContaining({
        nature: expect.any(String),
        evs: expect.any(String),
        pct: expect.any(Number),
      }),
    );
    expect(out.counters[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        slug: expect.any(String),
        score: expect.any(Number),
        ko_or_switch_pct: expect.any(Number),
        n: expect.any(Number),
      }),
    );
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.abilities.length).toBeGreaterThan(0);
    expect(out.teammates.length).toBeGreaterThan(0);
  });

  it("returns a trend that is ascending by month and ≤6 points", async () => {
    const out = await getMeta(fix.db, { name: "Kingambit" });
    if (!("found" in out) || !out.found) throw new Error("expected a hit");
    // Kingambit is present in all three seeded months.
    expect(out.trend.map((t) => t.month)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(out.trend.length).toBeLessThanOrEqual(6);
    expect(out.trend[0]).toEqual(
      expect.objectContaining({
        month: expect.any(String),
        usage_pct: expect.any(Number),
        rank: expect.any(Number),
      }),
    );
  });
});

describe("get_meta_usage — month resolution", () => {
  it("honors an explicit synced month", async () => {
    const out = await getMeta(fix.db, { name: "kingambit", month: "2026-04" });
    if (!("found" in out) || !out.found) throw new Error("expected a hit");
    expect(out.month).toBe("2026-04");
    expect(out.usage_pct).toBe(44.2);
    expect(out.rank).toBe(1);
  });

  it("returns no_data with months_available for an unsynced month", async () => {
    const out = await getMeta(fix.db, { name: "kingambit", month: "2025-01" });
    expect(out).toEqual({
      error: "no_data",
      months_available: ["2026-05", "2026-04", "2026-03"],
    });
  });
});

describe("get_meta_usage — name resolution (slug + display name)", () => {
  it("resolves the exact species slug", async () => {
    const out = await getMeta(fix.db, { name: "great-tusk" });
    if (!("found" in out) || !out.found) throw new Error("expected a hit");
    expect(out.species).toBe("great-tusk");
    expect(out.display_name).toBe("Great Tusk");
  });

  it("resolves a spaced display name case/format-insensitively", async () => {
    const out = await getMeta(fix.db, { name: "great tusk" });
    if (!("found" in out) || !out.found) throw new Error("expected a hit");
    expect(out.species).toBe("great-tusk");
  });

  it("resolves the display name in any case", async () => {
    const out = await getMeta(fix.db, { name: "KINGAMBIT" });
    if (!("found" in out) || !out.found) throw new Error("expected a hit");
    expect(out.species).toBe("kingambit");
  });

  it("returns ranked suggestions (incl. the intended species) on a near-miss", async () => {
    const out = await getMeta(fix.db, { name: "Kingambi" });
    if (!("found" in out) || out.found) throw new Error("expected a miss");
    expect(out.suggestions).toContain("Kingambit");
    expect(out.suggestions.length).toBeLessThanOrEqual(5);
  });
});

describe("get_meta_usage — no synced data (empty ladder)", () => {
  it("returns no_data with an empty months_available", async () => {
    const out = await getMeta(emptyFix.db, { name: "kingambit" });
    expect(out).toEqual({ error: "no_data", months_available: [] });
  });
});

describe("get_meta_usage — mode independence (ladder is explicit input)", () => {
  it("produces identical output in standard and champions scope", async () => {
    const asStandard = await getMeta(fix.db, { name: "kingambit" }, "standard");
    const asChampions = await getMeta(
      fix.db,
      { name: "kingambit" },
      "champions",
    );
    if (!("found" in asStandard) || !asStandard.found) {
      throw new Error("expected a hit in standard");
    }
    expect(asChampions).toEqual(asStandard);
  });
});

describe("get_meta_usage — invalid input", () => {
  it("degrades to the miss convention (found:false, empty suggestions)", async () => {
    const out = await getMeta(fix.db, { name: "" });
    expect(out).toEqual({ found: false, suggestions: [] });
  });
});
