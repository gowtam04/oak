/**
 * Unit tests for the B2 reference-page view-model assembler.
 *
 * Exercises the UNCACHED inner loaders (`*Uncached(db)`) directly against a
 * fresh, migrated Postgres schema (Testcontainers) seeded with the shared
 * "tools" fixture — no @/data/db singleton, no Next cache. The Champions usage
 * client is vi.mock'd so no network is touched and failure paths are forced.
 *
 * Fixture facts relied on (see test/fixtures/tools-fixture.ts):
 *   - garchomp exists in scarlet-violet, champions, AND gen-7.
 *   - incineroar / decidueye / hidden-power are gen-7 ONLY (fallback probes).
 *   - scarlet-violet holds 8 pokemon, 6 move names, 5 abilities, 2 items.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// reference-pages.ts (and its repo deps) statically `import "server-only"`,
// which throws under the node test env. Neutralize it; we inject fixture DB
// handles into the uncached loaders and never resolve the @/data/db singleton.
vi.mock("server-only", () => ({}));

// The Champions usage client is dynamically imported by the assembler; mock the
// module so no live network is hit and we can force success / failure per test.
const getUsageMock = vi.fn();
vi.mock("@/server/champions-usage/usage-client", () => ({
  getUsage: (...args: unknown[]) => getUsageMock(...args),
  USAGE_ATTRIBUTION: "ATTR",
}));

import type { OakDb } from "@/data/db";
import {
  loadAbilitiesIndexUncached,
  loadAbilityPageUncached,
  loadItemsIndexUncached,
  loadMovePageUncached,
  loadMovesIndexUncached,
  loadPokedexIndexUncached,
  loadPokemonPageUncached,
  referenceLastModifiedUncached,
} from "@/data/reference-pages";
import {
  buildAbilityTitle,
  buildItemTitle,
  buildMoveDescription,
  buildMoveTitle,
  buildPokemonDescription,
  buildPokemonTitle,
  clampDescription,
} from "@/data/reference-metadata";
import type {
  MovePageData,
  PokemonPageData,
} from "@/lib/reference-pages-types";

import { createPgSchema, type PgFixture } from "../../test/support/pg";

/** A minimal UsageData-shaped success payload for the usage-client mock. */
function fakeUsage() {
  return {
    found: true as const,
    data: {
      saved_name: "Garchomp",
      format: "doubles" as const,
      season: "current",
      fetched_at: 0,
      moves: [{ name: "earthquake", pct: 90, rank: 1 }],
      items: [{ name: "life-orb", pct: 30, rank: 1 }],
      abilities: [{ name: "rough-skin", pct: 60, rank: 1 }],
      natures: [],
      spreads: [],
      teammates: [{ name: "incineroar", pct: 40, rank: 1 }],
      source_url: "https://example/api/battle/Doubles/Garchomp",
    },
  };
}

// ---------------------------------------------------------------------------
// DB-backed loaders (shared read-only "tools" fixture)
// ---------------------------------------------------------------------------

describe("reference-pages loaders (tools fixture)", () => {
  let fix: PgFixture;
  let db: OakDb;

  beforeAll(async () => {
    fix = await createPgSchema({ seed: "tools" });
    db = fix.db;
  }, 60_000);

  afterAll(async () => {
    await fix?.cleanup();
  });

  beforeEach(() => {
    getUsageMock.mockReset();
  });

  describe("loadPokemonPageUncached", () => {
    it("assembles garchomp: blocks present, three-scope availability, SV source, usage", async () => {
      getUsageMock.mockResolvedValue(fakeUsage());

      const page = await loadPokemonPageUncached("garchomp", db);
      expect(page).not.toBeNull();
      const p = page!;

      expect(p.slug).toBe("garchomp");
      expect(p.displayName).toBe("Garchomp");
      expect(p.dexNumber).toBe(445);
      expect(p.types).toEqual(["dragon", "ground"]);
      expect(p.sourceFormat).toBe("scarlet-violet");
      expect(p.availability).toEqual([
        "scarlet-violet",
        "champions",
        "gen-7",
      ]);
      expect(p.isNative).toBe(true);

      // stats mapped to short keys.
      expect(p.stats).toEqual({
        hp: 108,
        atk: 130,
        def: 95,
        spa: 80,
        spd: 85,
        spe: 102,
      });
      expect(p.baseStatTotal).toBe(600);

      // abilities: slot1 sand-veil + hidden rough-skin (no slot2).
      expect(p.abilities.map((a) => a.slug)).toEqual([
        "sand-veil",
        "rough-skin",
      ]);
      expect(p.abilities.find((a) => a.slug === "rough-skin")?.isHidden).toBe(
        true,
      );
      expect(p.abilities.find((a) => a.slug === "sand-veil")?.isHidden).toBe(
        undefined,
      );

      // matchups present (arrays).
      expect(Array.isArray(p.matchups.weak_to)).toBe(true);
      expect(Array.isArray(p.matchups.quad_weak_to)).toBe(true);

      // movepool carries garchomp's SV learnset moves.
      const moveSlugs = p.movepool.flatMap((g) => g.moves.map((m) => m.slug));
      expect(moveSlugs).toEqual(
        expect.arrayContaining(["earthquake", "dragon-claw", "fire-fang"]),
      );

      // champions-available → usage was fetched and mapped.
      expect(getUsageMock).toHaveBeenCalledWith(
        "Garchomp",
        "doubles",
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect(p.usage).not.toBeNull();
      expect(p.usage!.attribution).toBe("ATTR");
      expect(p.usage!.topMoves[0]).toEqual({ name: "earthquake", pct: 90 });
    });

    it("resolves a gen-7-only species via the fallback chain (sourceFormat gen-7)", async () => {
      const page = await loadPokemonPageUncached("incineroar", db);
      expect(page).not.toBeNull();
      expect(page!.sourceFormat).toBe("gen-7");
      expect(page!.availability).toEqual(["gen-7"]);
      // not champions-available → usage never fetched.
      expect(page!.usage).toBeNull();
      expect(getUsageMock).not.toHaveBeenCalled();
    });

    it("returns null for an unknown slug (resolves in no scope)", async () => {
      expect(await loadPokemonPageUncached("mystery-mon", db)).toBeNull();
    });

    it("survives a usage-client failure — usage null, page still loads", async () => {
      getUsageMock.mockRejectedValue(new Error("upstream down"));

      const page = await loadPokemonPageUncached("garchomp", db);
      expect(page).not.toBeNull();
      expect(page!.displayName).toBe("Garchomp");
      expect(page!.usage).toBeNull();
    });

    it("preferredFormat gen-7 loads that scope's profile and learnset", async () => {
      const page = await loadPokemonPageUncached("garchomp", db, "gen-7");
      expect(page).not.toBeNull();
      expect(page!.sourceFormat).toBe("gen-7");
      expect(page!.displayName).toBe("Garchomp");
      // Gen-7 fixture learnset is a subset (no fire-fang).
      const moveSlugs = page!.movepool.flatMap((g) =>
        g.moves.map((m) => m.slug),
      );
      expect(moveSlugs).toEqual(
        expect.arrayContaining(["earthquake", "dragon-claw"]),
      );
      expect(moveSlugs).not.toContain("fire-fang");
      // Explicit non-champions scope → no Champions usage fetch.
      expect(getUsageMock).not.toHaveBeenCalled();
      expect(page!.usage).toBeNull();
    });

    it("preferredFormat champions loads Champions profile and fetches usage", async () => {
      getUsageMock.mockResolvedValue(fakeUsage());

      const page = await loadPokemonPageUncached("garchomp", db, "champions");
      expect(page).not.toBeNull();
      expect(page!.sourceFormat).toBe("champions");
      expect(getUsageMock).toHaveBeenCalled();
      expect(page!.usage).not.toBeNull();
    });

    it("unavailable preferredFormat soft-falls back to the default chain", async () => {
      getUsageMock.mockResolvedValue(fakeUsage());

      // gen-1 is not seeded for garchomp in the tools fixture.
      const page = await loadPokemonPageUncached("garchomp", db, "gen-1");
      expect(page).not.toBeNull();
      expect(page!.sourceFormat).toBe("scarlet-violet");
      // preferred was gen-1 (not champions) → usage gated off even on SV fallback.
      expect(getUsageMock).not.toHaveBeenCalled();
      expect(page!.usage).toBeNull();
    });
  });

  describe("loadMovePageUncached", () => {
    it("resolves a gen-7-only move (hidden-power) with its reverse roster", async () => {
      const page = await loadMovePageUncached("hidden-power", db);
      expect(page).not.toBeNull();
      const m = page!;
      expect(m.sourceFormat).toBe("gen-7");
      expect(m.availability).toEqual(["gen-7"]);
      expect(m.type).toBe("normal");
      expect(m.damageClass).toBe("special");
      expect(m.learners.map((l) => l.slug)).toContain("incineroar");
      expect(m.learnerCount).toBe(m.learners.length);
    });

    it("returns null for an unknown move", async () => {
      expect(await loadMovePageUncached("no-such-move", db)).toBeNull();
    });
  });

  describe("loadAbilityPageUncached", () => {
    it("returns null for an ability with no reference row (rough-skin unseeded)", async () => {
      // The tools fixture has no ability reference_cache rows, so the ability
      // detail can't be assembled in any scope → null.
      expect(await loadAbilityPageUncached("rough-skin", db)).toBeNull();
    });
  });

  describe("index loaders", () => {
    it("loadPokedexIndex: 8 SV rows + 2 cross-scope extras (incineroar, decidueye)", async () => {
      const index = await loadPokedexIndexUncached(db);
      expect(index.rows).toHaveLength(8);
      expect(index.extras.map((e) => e.slug).sort()).toEqual([
        "decidueye",
        "incineroar",
      ]);
      expect(index.extras.every((e) => e.sourceFormat === "gen-7")).toBe(true);
    });

    it("loadMovesIndex: 6 SV move names, flamethrower hydrated from its summary", async () => {
      const index = await loadMovesIndexUncached(db);
      expect(index.rows).toHaveLength(6);
      const flamethrower = index.rows.find((r) => r.slug === "flamethrower");
      expect(flamethrower?.type).toBe("fire");
      expect(flamethrower?.power).toBe(90);
    });

    it("loadAbilitiesIndex: 5 SV abilities", async () => {
      const index = await loadAbilitiesIndexUncached(db);
      expect(index.rows).toHaveLength(5);
    });

    it("loadItemsIndex: 2 SV items", async () => {
      const index = await loadItemsIndexUncached(db);
      expect(index.rows.map((r) => r.slug)).toEqual(["leftovers", "life-orb"]);
    });
  });

  describe("referenceLastModifiedUncached", () => {
    it("returns the scarlet-violet ingest timestamp as a Date", async () => {
      const at = await referenceLastModifiedUncached(db);
      expect(at).toBeInstanceOf(Date);
      expect(at!.getTime()).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// index_unavailable — an unbuilt index THROWS (page 500s, crawler retries)
// ---------------------------------------------------------------------------

describe("reference-pages loaders — index unavailable", () => {
  let none: PgFixture;

  beforeAll(async () => {
    none = await createPgSchema({ seed: "none" });
  }, 60_000);

  afterAll(async () => {
    await none?.cleanup();
  });

  it("detail loader throws index_unavailable when the primary index is unbuilt", async () => {
    await expect(
      loadPokemonPageUncached("garchomp", none.db),
    ).rejects.toThrow(/index_unavailable/);
  });

  it("index loader throws index_unavailable when the primary index is unbuilt", async () => {
    await expect(loadPokedexIndexUncached(none.db)).rejects.toThrow(
      /index_unavailable/,
    );
  });

  it("referenceLastModified returns null (does NOT throw) on an unbuilt index", async () => {
    expect(await referenceLastModifiedUncached(none.db)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pure title/description builders (no DB)
// ---------------------------------------------------------------------------

describe("reference-metadata builders", () => {
  const basePokemon: PokemonPageData = {
    slug: "garchomp",
    displayName: "Garchomp",
    dexNumber: 445,
    types: ["dragon", "ground"],
    stats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    baseStatTotal: 600,
    abilities: [],
    matchups: {
      weak_to: [],
      resists: [],
      immune_to: [],
      quad_weak_to: [],
      quad_resists: [],
    },
    movepool: [],
    forms: [],
    availability: ["scarlet-violet", "champions"],
    isNative: true,
    spriteUrl: "s",
    artworkUrl: "a",
    sourceFormat: "scarlet-violet",
    usage: null,
  };

  it("buildPokemonTitle: Champions-available species gets the usage segment", () => {
    expect(buildPokemonTitle(basePokemon)).toBe(
      "Garchomp — Stats, Moveset & Champions Usage",
    );
  });

  it("buildPokemonTitle: non-Champions species omits the usage segment", () => {
    expect(
      buildPokemonTitle({ ...basePokemon, availability: ["scarlet-violet"] }),
    ).toBe("Garchomp — Stats, Abilities & Movepool");
  });

  it("buildPokemonDescription: names types + BST and stays within the cap", () => {
    const d = buildPokemonDescription(basePokemon);
    expect(d).toContain("Garchomp");
    expect(d).toContain("Dragon/Ground");
    expect(d).toContain("600 BST");
    expect(d.length).toBeLessThanOrEqual(158);
  });

  const move: MovePageData = {
    slug: "earthquake",
    displayName: "Earthquake",
    type: "ground",
    damageClass: "physical",
    power: 100,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "all-other-pokemon",
    effectShort: "Hits every other Pokémon.",
    effectFull: "Inflicts regular damage.",
    learners: [],
    learnerCount: 3,
    availability: ["scarlet-violet"],
    sourceFormat: "scarlet-violet",
  };

  it("buildMoveTitle: type + class", () => {
    expect(buildMoveTitle(move)).toBe(
      "Earthquake — Ground-type physical Move",
    );
  });

  it("buildMoveDescription: power/accuracy + learner count", () => {
    const d = buildMoveDescription(move);
    expect(d).toContain("Ground-type physical move");
    expect(d).toContain("100 power");
    expect(d).toContain("3 Pokémon");
  });

  it("buildAbilityTitle / buildItemTitle", () => {
    expect(
      buildAbilityTitle({
        slug: "rough-skin",
        displayName: "Rough Skin",
        effectShort: "x",
        effectFull: "x",
        learnedBy: [],
        availability: [],
        sourceFormat: "scarlet-violet",
      }),
    ).toBe("Rough Skin — Ability Effect & Pokémon");
    expect(
      buildItemTitle({
        slug: "leftovers",
        displayName: "Leftovers",
        effectShort: "x",
        effectFull: "x",
        heldByWild: [],
        requiredBy: [],
        availability: [],
        sourceFormat: "scarlet-violet",
      }),
    ).toBe("Leftovers — Held Item Effect");
  });

  it("clampDescription truncates long text on a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim();
    const clamped = clampDescription(long);
    expect(clamped.length).toBeLessThanOrEqual(158);
    expect(clamped.endsWith("…")).toBe(true);
  });
});
