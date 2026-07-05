/**
 * Oracle tests for MetaRepo (`meta-repo.ts`) — the B-5 competitive-usage read
 * layer over `meta_snapshot`/`meta_usage`.
 *
 * Run against a REAL throwaway Postgres schema built from the committed
 * Drizzle migrations (Testcontainers), seeded via `seedMetaFixture`
 * (test/fixtures/meta-fixture.ts) — 3 months x ~6 gen9ou species with
 * hand-picked deltas (see that file's header for the exact numbers). No
 * mocks, no singleton — every function here takes an explicit db handle.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OakDb } from "@/data/db";
import {
  listMetaMonths,
  metaLeaderboard,
  metaSnapshot,
  metaSpeciesDetail,
  metaSpeciesTrend,
  speciesSpriteUrls,
  speciesWithDexPage,
} from "./meta-repo";

import { createPgSchema, type PgFixture } from "../../../test/support/pg";
import { seedMetaFixture } from "../../../test/fixtures/meta-fixture";

const GEN9OU = "gen9ou" as const;

describe("meta-repo (gen9ou fixture)", () => {
  let fix: PgFixture;
  let db: OakDb;

  beforeAll(async () => {
    fix = await createPgSchema({ seed: "tools" });
    db = fix.db;
    await seedMetaFixture(db);
  }, 60_000);

  afterAll(async () => {
    await fix?.cleanup();
  });

  describe("listMetaMonths", () => {
    it("returns synced months descending", async () => {
      expect(await listMetaMonths(db, GEN9OU)).toEqual([
        "2026-05",
        "2026-04",
        "2026-03",
      ]);
    });

    it("returns [] for an unsynced ladder id (defensive: same shape, no throw)", async () => {
      // "gen9ou" is the only real MetaFormat; this proves the WHERE clause
      // scopes strictly by meta_format rather than returning every month.
      expect(await listMetaMonths(db, "not-a-real-format" as never)).toEqual(
        [],
      );
    });
  });

  describe("metaSnapshot", () => {
    it("returns the snapshot row for a synced month", async () => {
      const snap = await metaSnapshot(db, GEN9OU, "2026-05");
      expect(snap).not.toBeNull();
      expect(snap!.smogon_format_id).toBe("gen9ou");
      expect(snap!.cutoff).toBe(1695);
      expect(snap!.species_count).toBe(5);
      expect(snap!.total_battles).toEqual(expect.any(Number));
      expect(snap!.source_url).toContain("2026-05");
    });

    it("returns null for an unsynced month", async () => {
      expect(await metaSnapshot(db, GEN9OU, "2026-01")).toBeNull();
    });
  });

  describe("metaLeaderboard", () => {
    it("orders by rank ascending for the latest month", async () => {
      const rows = await metaLeaderboard(db, GEN9OU, "2026-05");
      expect(rows.map((r) => r.species)).toEqual([
        "kingambit",
        "great-tusk",
        "gholdengo",
        "garchomp",
        "dragapult",
      ]);
      expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    });

    it("computes MoM delta from the immediately-previous synced month", async () => {
      const rows = await metaLeaderboard(db, GEN9OU, "2026-04");
      const kingambit = rows.find((r) => r.species === "kingambit")!;
      expect(kingambit.usage_pct).toBeCloseTo(44.2);
      expect(kingambit.prev_usage_pct).toBeCloseTo(45.0);

      const greatTusk = rows.find((r) => r.species === "great-tusk")!;
      expect(greatTusk.usage_pct).toBeCloseTo(25.0);
      expect(greatTusk.prev_usage_pct).toBeCloseTo(20.0);
    });

    it("a brand-new arrival has prev_usage_pct null (no prior-month row)", async () => {
      const rows = await metaLeaderboard(db, GEN9OU, "2026-05");
      const dragapult = rows.find((r) => r.species === "dragapult")!;
      expect(dragapult).toBeDefined();
      expect(dragapult.prev_usage_pct).toBeNull();
    });

    it("a species dropped from the current month simply isn't in its rows", async () => {
      const rows = await metaLeaderboard(db, GEN9OU, "2026-05");
      expect(rows.find((r) => r.species === "iron-valiant")).toBeUndefined();
      // But it IS present (with a null-free prev) in the month it dropped FROM.
      const aprilRows = await metaLeaderboard(db, GEN9OU, "2026-04");
      const ironValiant = aprilRows.find((r) => r.species === "iron-valiant")!;
      expect(ironValiant.prev_usage_pct).toBeCloseTo(15.0);
    });

    it("the earliest synced month has null prev_usage_pct for every row", async () => {
      const rows = await metaLeaderboard(db, GEN9OU, "2026-03");
      expect(rows.every((r) => r.prev_usage_pct === null)).toBe(true);
      expect(rows.length).toBe(5);
    });

    it("returns [] for an unsynced month", async () => {
      expect(await metaLeaderboard(db, GEN9OU, "2026-01")).toEqual([]);
    });
  });

  describe("metaSpeciesDetail", () => {
    it("returns the full row with JSON columns parsed into arrays", async () => {
      const detail = await metaSpeciesDetail(db, GEN9OU, "2026-05", "kingambit");
      expect(detail).not.toBeNull();
      expect(detail!.display_name).toBe("Kingambit");
      expect(detail!.rank).toBe(1);
      expect(detail!.usage_pct).toBeCloseTo(46.1);
      expect(Array.isArray(detail!.moves)).toBe(true);
      expect(detail!.moves[0]).toEqual({
        name: "Sucker Punch",
        slug: "sucker-punch",
        pct: 78.5,
      });
      expect(detail!.abilities[0]!.name).toBe("Supreme Overlord");
      expect(detail!.spreads[0]).toEqual({
        nature: "Adamant",
        evs: "0/252/4/0/0/252",
        pct: 40.0,
      });
      expect(detail!.counters[0]!.ko_or_switch_pct).toBe(68.0);
      expect(detail!.counters[0]!.n).toBe(1500);
    });

    it("returns null for an unknown species", async () => {
      expect(
        await metaSpeciesDetail(db, GEN9OU, "2026-05", "not-a-real-species"),
      ).toBeNull();
    });

    it("returns null for a species absent from that specific month (iron-valiant in 2026-05)", async () => {
      expect(
        await metaSpeciesDetail(db, GEN9OU, "2026-05", "iron-valiant"),
      ).toBeNull();
    });
  });

  describe("metaSpeciesTrend", () => {
    it("returns ascending-by-month points, most recent `limit` months", async () => {
      const trend = await metaSpeciesTrend(db, GEN9OU, "great-tusk");
      expect(trend.map((t) => t.month)).toEqual([
        "2026-03",
        "2026-04",
        "2026-05",
      ]);
      expect(trend.map((t) => t.rank)).toEqual([4, 3, 2]);
      expect(trend.map((t) => t.usage_pct)).toEqual([20.0, 25.0, 30.0]);
    });

    it("respects a smaller limit (most recent months only)", async () => {
      const trend = await metaSpeciesTrend(db, GEN9OU, "kingambit", 2);
      expect(trend.map((t) => t.month)).toEqual(["2026-04", "2026-05"]);
    });

    it("a species with a single month's row returns a one-point trend", async () => {
      const trend = await metaSpeciesTrend(db, GEN9OU, "dragapult");
      expect(trend).toEqual([{ month: "2026-05", usage_pct: 18.0, rank: 5 }]);
    });

    it("returns [] for a species that never appeared", async () => {
      expect(await metaSpeciesTrend(db, GEN9OU, "not-a-real-species")).toEqual(
        [],
      );
    });
  });

  describe("speciesWithDexPage", () => {
    it("resolves species present in scarlet-violet searchable_names (garchomp, from the tools fixture)", async () => {
      const found = await speciesWithDexPage(db, ["garchomp", "kingambit"]);
      expect(found.has("garchomp")).toBe(true);
      expect(found.has("kingambit")).toBe(false);
    });

    it("returns an empty set for []", async () => {
      expect(await speciesWithDexPage(db, [])).toEqual(new Set());
    });
  });

  describe("speciesSpriteUrls", () => {
    it("resolves a sprite for a species with a scarlet-violet pokemon row (garchomp, tools fixture)", async () => {
      const urls = await speciesSpriteUrls(db, ["garchomp", "kingambit"]);
      expect(urls.get("garchomp")).toBe("https://img.example/sprite/445.png");
      expect(urls.has("kingambit")).toBe(false);
    });

    it("returns an empty map for []", async () => {
      expect(await speciesSpriteUrls(db, [])).toEqual(new Map());
    });
  });
});
