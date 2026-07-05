/**
 * Unit tests for the B-5 `/meta` page view-model assembler (`meta-pages.ts`).
 *
 * Exercises the UNCACHED inner loaders (`*Uncached(..., db)`) directly against
 * a fresh, migrated Postgres schema (Testcontainers) seeded with
 * `seedMetaFixture` — no @/data/db singleton, no Next cache. See
 * test/fixtures/meta-fixture.ts's header for the exact seeded deltas.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// meta-pages.ts `import "server-only"`, which throws under the node test env.
// We inject fixture DB handles into the uncached loaders and never resolve the
// @/data/db singleton, so neutralizing this is safe (mirrors reference-pages.test.ts).
vi.mock("server-only", () => ({}));

import type { OakDb } from "@/data/db";
import {
  loadMetaLeaderboardUncached,
  loadMetaSpeciesUncached,
} from "@/data/meta-pages";

import { createPgSchema, type PgFixture } from "../../test/support/pg";
import { seedMetaFixture } from "../../test/fixtures/meta-fixture";

const GEN9OU = "gen9ou" as const;

describe("meta-pages loaders (gen9ou fixture)", () => {
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

  describe("loadMetaLeaderboardUncached", () => {
    it("defaults to the latest synced month when month is omitted", async () => {
      const view = await loadMetaLeaderboardUncached(GEN9OU, undefined, db);
      expect(view.available).toBe(true);
      if (!view.available) throw new Error("unreachable");
      expect(view.month).toBe("2026-05");
      expect(view.months).toEqual(["2026-05", "2026-04", "2026-03"]);
      expect(view.label).toBe("Smogon OU (Gen 9 singles)");
      expect(view.shortLabel).toBe("OU");
      expect(view.snapshot.smogonFormatId).toBe("gen9ou");
      expect(view.snapshot.cutoff).toBe(1695);
    });

    it("orders rows by rank and computes delta / hasDexPage per row", async () => {
      const view = await loadMetaLeaderboardUncached(GEN9OU, "2026-05", db);
      if (!view.available) throw new Error("unreachable");

      expect(view.rows.map((r) => r.species)).toEqual([
        "kingambit",
        "great-tusk",
        "gholdengo",
        "garchomp",
        "dragapult",
      ]);

      const kingambit = view.rows.find((r) => r.species === "kingambit")!;
      expect(kingambit.usagePct).toBeCloseTo(46.1);
      expect(kingambit.deltaPct).toBeCloseTo(46.1 - 44.2);

      // New arrival: no prior month row -> null delta, never 0.
      const dragapult = view.rows.find((r) => r.species === "dragapult")!;
      expect(dragapult.deltaPct).toBeNull();

      // hasDexPage: garchomp resolves (tools fixture); kingambit doesn't.
      expect(kingambit.hasDexPage).toBe(false);
      const garchomp = view.rows.find((r) => r.species === "garchomp")!;
      expect(garchomp.hasDexPage).toBe(true);
    });

    it("an explicit synced month is honored verbatim", async () => {
      const view = await loadMetaLeaderboardUncached(GEN9OU, "2026-03", db);
      if (!view.available) throw new Error("unreachable");
      expect(view.month).toBe("2026-03");
      // Earliest month: every row's delta is null (no prior synced month).
      expect(view.rows.every((r) => r.deltaPct === null)).toBe(true);
    });

    it("a dropped-out species is absent from a later month's rows", async () => {
      const view = await loadMetaLeaderboardUncached(GEN9OU, "2026-05", db);
      if (!view.available) throw new Error("unreachable");
      expect(view.rows.find((r) => r.species === "iron-valiant")).toBeUndefined();
    });

    it("an unknown month falls back to the latest synced month", async () => {
      const view = await loadMetaLeaderboardUncached(GEN9OU, "2099-01", db);
      if (!view.available) throw new Error("unreachable");
      expect(view.month).toBe("2026-05");
    });

    it("returns available:false when the ladder has never been synced (empty schema)", async () => {
      const empty = await createPgSchema({ seed: "none" });
      try {
        const view = await loadMetaLeaderboardUncached(
          GEN9OU,
          undefined,
          empty.db,
        );
        expect(view).toEqual({
          available: false,
          metaFormat: GEN9OU,
          label: "Smogon OU (Gen 9 singles)",
        });
      } finally {
        await empty.cleanup();
      }
    });
  });

  describe("loadMetaSpeciesUncached", () => {
    it("assembles kingambit's full detail: trend ascending, representative set, snapshot", async () => {
      const view = await loadMetaSpeciesUncached(
        GEN9OU,
        "kingambit",
        "2026-05",
        db,
      );
      expect(view).not.toBeNull();
      const v = view!;

      expect(v.displayName).toBe("Kingambit");
      expect(v.rank).toBe(1);
      expect(v.usagePct).toBeCloseTo(46.1);
      expect(v.month).toBe("2026-05");
      expect(v.months).toEqual(["2026-05", "2026-04", "2026-03"]);
      expect(v.hasDexPage).toBe(false);

      // Trend ascending by month across all three synced months.
      expect(v.trend).toEqual([
        { month: "2026-03", usagePct: 45.0, rank: 1 },
        { month: "2026-04", usagePct: 44.2, rank: 1 },
        { month: "2026-05", usagePct: 46.1, rank: 1 },
      ]);

      expect(v.representativeSet).toEqual({
        ability: "Supreme Overlord",
        item: "Leftovers",
        nature: "Adamant",
        evs: "0/252/4/0/0/252",
        moves: ["Sucker Punch", "Iron Head", "Swords Dance", "Kowtow Cleave"],
      });

      expect(v.snapshot.cutoff).toBe(1695);
      expect(v.snapshot.smogonFormatId).toBe("gen9ou");
    });

    it("pins the exact Showdown export string", async () => {
      const view = await loadMetaSpeciesUncached(
        GEN9OU,
        "kingambit",
        "2026-05",
        db,
      );
      expect(view!.showdownExport).toBe(
        [
          "Kingambit @ Leftovers",
          "Ability: Supreme Overlord",
          "EVs: 252 Atk / 4 Def / 252 Spe",
          "Adamant Nature",
          "- Sucker Punch",
          "- Iron Head",
          "- Swords Dance",
          "- Kowtow Cleave",
        ].join("\n"),
      );
    });

    it("hasDexPage true for garchomp (resolves in scarlet-violet searchable_names)", async () => {
      const view = await loadMetaSpeciesUncached(
        GEN9OU,
        "garchomp",
        "2026-05",
        db,
      );
      expect(view!.hasDexPage).toBe(true);
    });

    it("returns null for an unknown species", async () => {
      expect(
        await loadMetaSpeciesUncached(GEN9OU, "not-a-real-species", undefined, db),
      ).toBeNull();
    });

    it("returns null for a species absent from the (defaulted) latest month", async () => {
      // iron-valiant dropped out after 2026-04; the default month is 2026-05.
      expect(
        await loadMetaSpeciesUncached(GEN9OU, "iron-valiant", undefined, db),
      ).toBeNull();
    });

    it("returns null when the ladder has never been synced", async () => {
      const empty = await createPgSchema({ seed: "none" });
      try {
        expect(
          await loadMetaSpeciesUncached(GEN9OU, "kingambit", undefined, empty.db),
        ).toBeNull();
      } finally {
        await empty.cleanup();
      }
    });
  });
});
