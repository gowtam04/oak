/**
 * Reference-page loaders — Champions roster only (P6c).
 *
 * Index/detail loaders read the Champions partition. Other-game rows that we
 * inject (Incineroar gen-7, Eternatus National Dex) must not appear, and an
 * unknown slug is null (→ page 404) rather than a natdex/SV fallback.
 * Usage is the live Champions client, not Smogon.
 *
 * Requirement refs: CF-DEX-US-1, CF-DEX-AC-1.1–1.6.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUsageMock = vi.fn();
vi.mock("@/server/champions-usage/usage-client", () => ({
  getUsage: (...args: unknown[]) => getUsageMock(...args),
  USAGE_ATTRIBUTION: "ATTR",
}));

import type { OakDb } from "@/data/db";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import {
  loadAbilitiesIndexUncached,
  loadAbilityPageUncached,
  loadItemPageUncached,
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
import type { MovePageData, PokemonPageData } from "@/lib/reference-pages-types";
import {
  champions_item_exclusion,
  ingest_meta,
  pokemon,
  reference_cache,
  searchable_names,
} from "@/data/schema";
import { SEARCHABLE_NAMES_SEED } from "../../test/fixtures/tools-fixture";
import { createPgSchema, type PgDb, type PgFixture } from "../../test/support/pg";

const SRC = readFileSync(
  fileURLToPath(new URL("./reference-pages.ts", import.meta.url)),
  "utf8",
);

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

async function seedOtherGameOnly(db: PgDb): Promise<void> {
  const now = Date.now();
  await db.insert(pokemon).values({
    id: "incineroar",
    format: "gen-7",
    species_name: "incineroar",
    form_name: null,
    display_name: "Incineroar",
    national_dex_number: 727,
    type1: "fire",
    type2: "dark",
    ability_slot1: "blaze",
    ability_slot2: null,
    ability_hidden: "intimidate",
    stat_hp: 95,
    stat_attack: 115,
    stat_defense: 90,
    stat_special_attack: 80,
    stat_special_defense: 90,
    stat_speed: 60,
    base_stat_total: 530,
    sprite_url: "https://img.example/sprite/727.png",
    artwork_url: "https://img.example/art/727.png",
    generation: "gen-7",
    is_gen9_native: 0,
    source_generation: "gen-7",
  });
  await db.insert(searchable_names).values([
    {
      format: "gen-7",
      kind: "pokemon",
      slug: "incineroar",
      display_name: "Incineroar",
    },
    {
      format: "gen-7",
      kind: "move",
      slug: "hidden-power",
      display_name: "Hidden Power",
    },
    {
      format: "national-dex",
      kind: "pokemon",
      slug: "eternatus",
      display_name: "Eternatus",
    },
  ]);
  await db.insert(reference_cache).values({
    format: "gen-7",
    resource_key: "move/hidden-power",
    resource_kind: "move",
    payload: JSON.stringify({
      found: true,
      display_name: "Hidden Power",
      type: "normal",
      damage_class: "special",
      power: 60,
      accuracy: 100,
      pp: 15,
      priority: 0,
      target: "selected-pokemon",
      effect_short: "Varies with the user's IVs.",
      effect_full: "Type and power depend on IVs.",
    }),
    endpoint_url: "https://pokeapi.co/api/v2/move/hidden-power",
    fetched_at: now,
  });
  await db.insert(ingest_meta).values([
    {
      format: "gen-7",
      last_success_at: now,
      pokemon_count: 1,
      learnset_count: 0,
      names_count: 2,
      schema_version: "2",
    },
    {
      format: "national-dex",
      last_success_at: now,
      pokemon_count: 0,
      learnset_count: 0,
      names_count: 1,
      schema_version: "2",
    },
  ]);
}

describe("reference-pages module — Champions only (CF-DEX-AC-1.1, CF-DEX-AC-1.6)", () => {
  it("does not walk other-format extras, DETAIL_FALLBACK gens, or Smogon", () => {
    expect(SRC).not.toMatch(/DETAIL_FALLBACK/);
    expect(SRC).not.toMatch(/pokemonExtras/);
    expect(SRC).not.toMatch(/Other formats/);
    expect(SRC).not.toMatch(/meta-pages/);
    expect(SRC).not.toMatch(/smogon/i);
    expect(SRC).not.toMatch(/STANDARD_FORMAT/);
    expect(SRC).toMatch(/champions-usage\/usage-client/);
    expect(SRC).toMatch(/CHAMPIONS_FORMAT|"champions"/);
    expect(SRC).toMatch(/loadChampionsItemExclusions/);
    expect(SRC).not.toMatch(/cachedItemsIndex/);
  });
});

describe("reference-pages loaders (tools fixture + other-game decoys)", () => {
  let fix: PgFixture;
  let db: OakDb;

  beforeAll(async () => {
    fix = await createPgSchema({
      seed: "tools",
      after: seedOtherGameOnly,
    });
    db = fix.db;
  }, 60_000);

  afterAll(async () => {
    await fix?.cleanup();
  });

  beforeEach(() => {
    getUsageMock.mockReset();
  });

  describe("loadPokemonPageUncached", () => {
    it("assembles garchomp from Champions data and fetches live usage (CF-DEX-AC-1.5, CF-DEX-AC-1.6)", async () => {
      getUsageMock.mockResolvedValue(fakeUsage());

      const page = await loadPokemonPageUncached("garchomp", db);
      expect(page).not.toBeNull();
      const p = page!;

      expect(p.slug).toBe("garchomp");
      expect(p.displayName).toBe("Garchomp");
      expect(p.dexNumber).toBe(445);
      expect(p.types).toEqual(["dragon", "ground"]);
      expect(p.sourceFormat).toBe(CHAMPIONS_FORMAT);
      expect(p.availability).toEqual([CHAMPIONS_FORMAT]);
      expect(p.availability).not.toContain("scarlet-violet");
      expect(p.availability).not.toContain("gen-7");
      expect(p.availability).not.toContain("national-dex");

      expect(p.stats).toEqual({
        hp: 108,
        atk: 130,
        def: 95,
        spa: 80,
        spd: 85,
        spe: 102,
      });
      expect(p.baseStatTotal).toBe(600);

      expect(p.abilities.map((a) => a.slug)).toEqual([
        "sand-veil",
        "rough-skin",
      ]);
      expect(p.abilities.find((a) => a.slug === "rough-skin")?.isHidden).toBe(
        true,
      );

      expect(Array.isArray(p.matchups.weak_to)).toBe(true);

      const moveSlugs = p.movepool.flatMap((g) => g.moves.map((m) => m.slug));
      expect(moveSlugs).toEqual(
        expect.arrayContaining(["earthquake", "dragon-claw", "fire-fang"]),
      );

      expect(getUsageMock).toHaveBeenCalledWith(
        "Garchomp",
        "doubles",
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect(p.usage).not.toBeNull();
      expect(p.usage!.attribution).toBe("ATTR");
      expect(p.usage!.topMoves[0]).toEqual({ name: "earthquake", pct: 90 });
    });

    it("returns null for a gen-7-only species (no fallback) (CF-DEX-AC-1.4)", async () => {
      expect(await loadPokemonPageUncached("incineroar", db)).toBeNull();
      expect(getUsageMock).not.toHaveBeenCalled();
    });

    it("returns null for a National Dex-only name", async () => {
      expect(await loadPokemonPageUncached("eternatus", db)).toBeNull();
    });

    it("returns null for an unknown slug", async () => {
      expect(await loadPokemonPageUncached("mystery-mon", db)).toBeNull();
    });

    it("survives a usage-client failure — usage null, page still loads (CF-DEX-AC-1.6)", async () => {
      getUsageMock.mockRejectedValue(new Error("upstream down"));

      const page = await loadPokemonPageUncached("garchomp", db);
      expect(page).not.toBeNull();
      expect(page!.displayName).toBe("Garchomp");
      expect(page!.sourceFormat).toBe(CHAMPIONS_FORMAT);
      expect(page!.usage).toBeNull();
    });

    it("ignores preferredFormat gen-7 and still loads Champions (CF-DEX-AC-1.5)", async () => {
      getUsageMock.mockResolvedValue(fakeUsage());

      const page = await loadPokemonPageUncached("garchomp", db, "gen-7");
      expect(page).not.toBeNull();
      expect(page!.sourceFormat).toBe(CHAMPIONS_FORMAT);
      expect(page!.sourceFormat).not.toBe("gen-7");
      expect(getUsageMock).toHaveBeenCalled();
      expect(page!.usage).not.toBeNull();
    });

    it("does not resurrect Incineroar via preferredFormat gen-7", async () => {
      expect(
        await loadPokemonPageUncached("incineroar", db, "gen-7"),
      ).toBeNull();
    });
  });

  describe("loadMovePageUncached", () => {
    it("loads a Champions move", async () => {
      const page = await loadMovePageUncached("earthquake", db);
      expect(page).not.toBeNull();
      expect(page!.sourceFormat).toBe(CHAMPIONS_FORMAT);
      expect(page!.type).toBe("ground");
      expect(page!.availability).toEqual([CHAMPIONS_FORMAT]);
    });

    it("returns null for a gen-7-only move (hidden-power) (CF-DEX-AC-1.4)", async () => {
      expect(await loadMovePageUncached("hidden-power", db)).toBeNull();
      expect(
        await loadMovePageUncached("hidden-power", db, "gen-7"),
      ).toBeNull();
    });

    it("returns null for an unknown move", async () => {
      expect(await loadMovePageUncached("no-such-move", db)).toBeNull();
    });
  });

  describe("loadAbilityPageUncached / loadItemPageUncached", () => {
    it("returns null for an ability with no Champions reference row", async () => {
      expect(await loadAbilityPageUncached("rough-skin", db)).toBeNull();
      expect(
        await loadAbilityPageUncached("rough-skin", db, "gen-5"),
      ).toBeNull();
    });

    it("returns null for an item with no Champions reference row", async () => {
      expect(await loadItemPageUncached("leftovers", db)).toBeNull();
      expect(
        await loadItemPageUncached("leftovers", db, "gen-5"),
      ).toBeNull();
    });
  });

  describe("index loaders", () => {
    it("loadPokedexIndex: Champions roster only, including Mega, no extras (CF-DEX-AC-1.1)", async () => {
      const index = await loadPokedexIndexUncached(db);
      const expected = SEARCHABLE_NAMES_SEED.filter((n) => n.kind === "pokemon");
      expect(index.rows).toHaveLength(expected.length);
      const extras =
        "extras" in index
          ? (index as { extras: unknown }).extras
          : [];
      expect(extras).toEqual([]);
      const slugs = new Set(index.rows.map((r) => r.slug));
      for (const p of expected) {
        expect(slugs.has(p.slug)).toBe(true);
      }
      expect(slugs.has("swampert-mega")).toBe(true);
      expect(slugs.has("incineroar")).toBe(false);
      expect(slugs.has("eternatus")).toBe(false);
    });

    it("loadMovesIndex: Champions moves only (CF-DEX-AC-1.2)", async () => {
      const index = await loadMovesIndexUncached(db);
      const expected = SEARCHABLE_NAMES_SEED.filter((n) => n.kind === "move");
      expect(index.rows).toHaveLength(expected.length);
      expect(index.rows.some((r) => r.slug === "hidden-power")).toBe(false);
      expect(index.rows.some((r) => r.slug === "flamethrower")).toBe(true);
      const earthquake = index.rows.find((r) => r.slug === "earthquake");
      expect(earthquake?.type).toBe("ground");
      expect(earthquake?.power).toBe(100);
    });

    it("loadAbilitiesIndex: Champions abilities only", async () => {
      const index = await loadAbilitiesIndexUncached(db);
      const expected = SEARCHABLE_NAMES_SEED.filter((n) => n.kind === "ability");
      expect(index.rows).toHaveLength(expected.length);
    });

    it("loadItemsIndex: Champions items only", async () => {
      const index = await loadItemsIndexUncached(db);
      expect(index.rows.map((r) => r.slug).sort()).toEqual([
        "leftovers",
        "life-orb",
        "swampertite",
      ]);
    });
  });

  describe("champions_item_exclusion (CF-DEX-AC-1.2)", () => {
    it("drops an excluded slug from the index and 404s its detail", async () => {
      const now = Date.now();
      await db.insert(reference_cache).values({
        format: CHAMPIONS_FORMAT,
        resource_key: "item/leftovers",
        resource_kind: "item",
        payload: JSON.stringify({
          found: true,
          display_name: "Leftovers",
          effect_short: "Restores HP each turn.",
          effect_full: "The holder restores 1/16 max HP at the end of each turn.",
        }),
        endpoint_url: "https://pokeapi.co/api/v2/item/leftovers",
        fetched_at: now,
      });
      expect(await loadItemPageUncached("leftovers", db)).not.toBeNull();

      await db.insert(champions_item_exclusion).values({
        slug: "leftovers",
        excluded_at: now,
        excluded_by: "test",
      });

      const index = await loadItemsIndexUncached(db);
      expect(index.rows.map((r) => r.slug).sort()).toEqual([
        "life-orb",
        "swampertite",
      ]);
      expect(index.rows.some((r) => r.slug === "leftovers")).toBe(false);
      expect(await loadItemPageUncached("leftovers", db)).toBeNull();
    });
  });

  describe("referenceLastModifiedUncached", () => {
    it("returns the Champions ingest timestamp as a Date", async () => {
      const at = await referenceLastModifiedUncached(db);
      expect(at).toBeInstanceOf(Date);
      expect(at!.getTime()).toBeGreaterThan(0);
    });
  });
});

describe("reference-pages loaders — index unavailable", () => {
  let none: PgFixture;

  beforeAll(async () => {
    none = await createPgSchema({ seed: "none" });
  }, 60_000);

  afterAll(async () => {
    await none?.cleanup();
  });

  it("detail loader throws index_unavailable when the Champions index is unbuilt", async () => {
    await expect(
      loadPokemonPageUncached("garchomp", none.db),
    ).rejects.toThrow(/index_unavailable/);
  });

  it("index loader throws index_unavailable when the Champions index is unbuilt", async () => {
    await expect(loadPokedexIndexUncached(none.db)).rejects.toThrow(
      /index_unavailable/,
    );
  });

  it("referenceLastModified returns null (does NOT throw) on an unbuilt index", async () => {
    expect(await referenceLastModifiedUncached(none.db)).toBeNull();
  });
});

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
    availability: ["champions"],
    isNative: true,
    spriteUrl: "s",
    artworkUrl: "a",
    sourceFormat: "champions",
    usage: null,
  };

  it("buildPokemonTitle: Champions species gets the usage segment", () => {
    expect(buildPokemonTitle(basePokemon)).toBe(
      "Garchomp — Stats, Moveset & Champions Usage",
    );
  });

  it("buildPokemonTitle: non-Champions availability omits the usage segment", () => {
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
    availability: ["champions"],
    sourceFormat: "champions",
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
        sourceFormat: "champions",
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
        sourceFormat: "champions",
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
