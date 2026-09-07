/**
 * Unit tests for PokedexRepo (queryPokedex / getPokemon).
 *
 * Run against a REAL throwaway Postgres schema built from the committed Drizzle
 * migrations (Testcontainers), so the dynamic filter/sort/threshold SQL, the
 * Gen-9 learnset intersection, and the row → tool-shape mappers are all
 * exercised end-to-end. No mocks, no live PokeAPI, no network.
 *
 * The read-only filter/sort/shape describes share ONE seeded schema; the tests
 * that need a different DB shape (empty index, both formats) provision their own
 * isolated schema so the per-format ingest_meta expectations don't collide.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingest_meta, learnset, pokemon } from "@/data/schema";
import type { OakDb } from "@/data/db";
import {
  getPokemon as getPokemonRaw,
  listAllPokemon,
  pokemonFormats,
  pokemonRequiringItem,
  queryPokedex as queryPokedexRaw,
  spriteUrlsByIds,
  type PokedexFilters,
} from "./pokedex-repo";

import { createPgSchema, type PgFixture } from "../../../test/support/pg";

// All of these tests exercise the standard (Scarlet-Violet) scope. Bind that
// format here so the call sites stay focused on filters/slugs; the format
// threading itself is covered by the format-scoping checks below.
const SV = "scarlet-violet" as const;
const queryPokedex = (
  f: PokedexFilters,
  db: OakDb,
  opts?: { maxLimit?: number },
) => queryPokedexRaw(f, SV, db, opts);
const getPokemon = (slug: string, db: OakDb) => getPokemonRaw(slug, SV, db);

type MonInput = Partial<typeof pokemon.$inferSelect> &
  Pick<
    typeof pokemon.$inferSelect,
    | "id"
    | "species_name"
    | "display_name"
    | "national_dex_number"
    | "type1"
    | "ability_slot1"
    | "stat_hp"
    | "stat_attack"
    | "stat_defense"
    | "stat_special_attack"
    | "stat_special_defense"
    | "stat_speed"
  >;

async function insertMon(db: OakDb, mon: MonInput): Promise<void> {
  const bst =
    mon.base_stat_total ??
    mon.stat_hp +
      mon.stat_attack +
      mon.stat_defense +
      mon.stat_special_attack +
      mon.stat_special_defense +
      mon.stat_speed;
  await db.insert(pokemon).values({
    format: SV,
    form_name: null,
    type2: null,
    ability_slot2: null,
    ability_hidden: null,
    sprite_url: `https://img/${mon.id}.png`,
    artwork_url: `https://img/${mon.id}_official.png`,
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
    base_stat_total: bst,
    ...mon,
  });
}

/** Seed a small, fully-controlled fixture index + an ingest_meta marker. */
async function seed(db: OakDb): Promise<void> {
  await insertMon(db, {
    id: "garchomp",
    species_name: "garchomp",
    display_name: "Garchomp",
    national_dex_number: 445,
    type1: "dragon",
    type2: "ground",
    ability_slot1: "sand-veil",
    ability_hidden: "rough-skin",
    stat_hp: 108,
    stat_attack: 130,
    stat_defense: 95,
    stat_special_attack: 80,
    stat_special_defense: 85,
    stat_speed: 102,
  });
  await insertMon(db, {
    id: "dragapult",
    species_name: "dragapult",
    display_name: "Dragapult",
    national_dex_number: 887,
    type1: "dragon",
    type2: "ghost",
    ability_slot1: "clear-body",
    ability_slot2: "infiltrator",
    ability_hidden: "cursed-body",
    stat_hp: 88,
    stat_attack: 120,
    stat_defense: 75,
    stat_special_attack: 100,
    stat_special_defense: 75,
    stat_speed: 142,
  });
  await insertMon(db, {
    id: "talonflame",
    species_name: "talonflame",
    display_name: "Talonflame",
    national_dex_number: 663,
    type1: "fire",
    type2: "flying",
    ability_slot1: "flame-body",
    ability_hidden: "gale-wings",
    stat_hp: 78,
    stat_attack: 81,
    stat_defense: 71,
    stat_special_attack: 74,
    stat_special_defense: 69,
    stat_speed: 126,
  });
  await insertMon(db, {
    id: "ninetales",
    species_name: "ninetales",
    display_name: "Ninetales",
    national_dex_number: 38,
    type1: "fire",
    ability_slot1: "flash-fire",
    ability_hidden: "drought",
    stat_hp: 73,
    stat_attack: 76,
    stat_defense: 75,
    stat_special_attack: 81,
    stat_special_defense: 100,
    stat_speed: 100,
  });
  // A non-native fallback form (BR-1) to verify the flags pass through.
  await insertMon(db, {
    id: "incineroar",
    species_name: "incineroar",
    display_name: "Incineroar",
    national_dex_number: 727,
    type1: "fire",
    type2: "dark",
    ability_slot1: "blaze",
    ability_hidden: "intimidate",
    stat_hp: 95,
    stat_attack: 115,
    stat_defense: 90,
    stat_special_attack: 80,
    stat_special_defense: 90,
    stat_speed: 60,
    is_gen9_native: 0,
    generation: "gen-7",
    source_generation: "gen-7",
  });

  // Learnsets (scarlet-violet version group).
  const moves: { p: string; m: string }[] = [
    { p: "garchomp", m: "earthquake" },
    { p: "garchomp", m: "dragon-claw" },
    { p: "garchomp", m: "fire-fang" },
    { p: "dragapult", m: "dragon-claw" },
    { p: "dragapult", m: "phantom-force" },
    { p: "talonflame", m: "brave-bird" },
    { p: "talonflame", m: "will-o-wisp" },
  ];
  await db.insert(learnset).values(
    moves.map((x) => ({
      pokemon_id: x.p,
      move_slug: x.m,
      format: SV,
      method: "level-up",
    })),
  );

  await db.insert(ingest_meta).values({
    format: SV,
    last_success_at: 0,
    pokemon_count: 5,
    learnset_count: moves.length,
    names_count: 0,
    schema_version: "2",
  });
}

// ---------------------------------------------------------------------------
// Shared, seeded, read-only fixture for the filter/sort/shape describes.
// ---------------------------------------------------------------------------

let sharedFix: PgFixture;
let db: OakDb;

beforeAll(async () => {
  sharedFix = await createPgSchema({ seed: "none" });
  db = sharedFix.db;
  await seed(db);
}, 60_000);

afterAll(async () => {
  await sharedFix?.cleanup();
});

describe("queryPokedex — index availability", () => {
  it("returns index_unavailable when ingest_meta has no row", async () => {
    const fix = await createPgSchema({ seed: "none" }); // migrated but empty
    try {
      expect(await queryPokedex({}, fix.db)).toEqual({
        error: "index_unavailable",
      });
    } finally {
      await fix.cleanup();
    }
  }, 60_000);
});

describe("queryPokedex — filters", () => {
  it("types are ANDed: ['dragon'] matches both dragons", async () => {
    const r = await queryPokedex({ types: ["dragon"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(2);
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Dragapult",
      "Garchomp",
    ]);
  });

  it("types are ANDed: ['dragon','ground'] matches only Garchomp", async () => {
    const r = await queryPokedex({ types: ["dragon", "ground"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(1);
    expect(r.results[0].display_name).toBe("Garchomp");
  });

  it("abilities are ORed across slots (slot1 + hidden)", async () => {
    const r = await queryPokedex({ abilities: ["flash-fire", "gale-wings"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Ninetales", // flash-fire (slot1)
      "Talonflame", // gale-wings (hidden)
    ]);
  });

  it("stat_filters are ANDed (speed > 120) and sortable", async () => {
    const r = await queryPokedex(
      { statFilters: [{ stat: "speed", op: ">", value: 120 }] },
      db,
    );
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Dragapult",
      "Talonflame",
    ]);
  });
});

describe("queryPokedex — sort / limit / truncation", () => {
  it("sorts by speed desc (superlative 'fastest')", async () => {
    const r = await queryPokedex({ sortBy: "speed", order: "desc", limit: 1 }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results[0].display_name).toBe("Dragapult"); // 142
    expect(r.sort).toBe("speed desc");
  });

  it("reports total_count over the full match set and truncates the page", async () => {
    const r = await queryPokedex({ types: ["dragon"], limit: 1 }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(2);
    expect(r.results).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it("defaults to base_stat_total desc when no sort_by is given (always ranked + labeled)", async () => {
    const r = await queryPokedex({ types: ["fire"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.sort).toBe("base_stat_total desc");
  });

  it("opts.maxLimit lifts the hardcoded 100-row clamp (enrichment hidden_rows path)", async () => {
    // The default clamp is 100; answer enrichment re-runs a truncated query with
    // maxLimit:200 to materialize the hidden rows. Seed 105 rows so the default
    // clamp truncates but the raised ceiling returns the full set.
    const fix = await createPgSchema({ seed: "none" });
    try {
      const database = fix.db;
      for (let n = 0; n < 105; n++) {
        await insertMon(database, {
          id: `bulk-${n}`,
          species_name: `bulk-${n}`,
          display_name: `Bulk ${n}`,
          national_dex_number: 5000 + n,
          type1: "normal",
          ability_slot1: "run-away",
          stat_hp: 50,
          stat_attack: 50,
          stat_defense: 50,
          stat_special_attack: 50,
          stat_special_defense: 50,
          stat_speed: 50,
        });
      }
      await database.insert(ingest_meta).values({
        format: SV,
        last_success_at: 0,
        pokemon_count: 105,
        learnset_count: 0,
        names_count: 0,
        schema_version: "2",
      });

      // Default ceiling: min(200, 100) = 100 rows, truncated.
      const capped = await queryPokedex(
        { types: ["normal"], limit: 200 },
        database,
      );
      if ("error" in capped || "unresolved" in capped) {
        throw new Error("expected results");
      }
      expect(capped.total_count).toBe(105);
      expect(capped.results).toHaveLength(100);
      expect(capped.truncated).toBe(true);

      // Raised ceiling: min(200, 200) = 200 → all 105 rows, no truncation.
      const lifted = await queryPokedex(
        { types: ["normal"], limit: 200 },
        database,
        { maxLimit: 200 },
      );
      if ("error" in lifted || "unresolved" in lifted) {
        throw new Error("expected results");
      }
      expect(lifted.results).toHaveLength(105);
      expect(lifted.truncated).toBe(false);
    } finally {
      await fix.cleanup();
    }
  });
});

describe("queryPokedex — multi-move Gen-9 intersection (BR-7)", () => {
  it("returns only Pokémon that learn ALL listed moves", async () => {
    const r = await queryPokedex({ moveIds: ["earthquake", "dragon-claw"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(1);
    expect(r.results[0].display_name).toBe("Garchomp");
  });

  it("a single move matches every learner (Dragapult learns dragon-claw too)", async () => {
    const r = await queryPokedex({ moveIds: ["dragon-claw"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Dragapult",
      "Garchomp",
    ]);
  });

  it("an empty intersection is total_count 0 (NOT an error)", async () => {
    const r = await queryPokedex({ moveIds: ["earthquake", "will-o-wisp"] }, db);
    expect(r).toEqual({
      total_count: 0,
      truncated: false,
      sort: "base_stat_total desc",
      results: [],
    });
  });

  it("intersects with other filters (dragon AND learns dragon-claw)", async () => {
    const r = await queryPokedex(
      { types: ["dragon"], moveIds: ["dragon-claw"] },
      db,
    );
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Dragapult",
      "Garchomp",
    ]);
  });
});

describe("queryPokedex — unresolved slugs", () => {
  it("flags an unknown type", async () => {
    expect(await queryPokedex({ types: ["draagon"] }, db)).toEqual({
      unresolved: ["draagon"],
    });
  });

  it("flags an unknown ability", async () => {
    expect(await queryPokedex({ abilities: ["levitation"] }, db)).toEqual({
      unresolved: ["levitation"],
    });
  });

  it("flags an unknown move", async () => {
    expect(await queryPokedex({ moveIds: ["trik-room"] }, db)).toEqual({
      unresolved: ["trik-room"],
    });
  });

  it("collects multiple unresolved slugs in input order", async () => {
    const r = await queryPokedex(
      { types: ["draagon"], abilities: ["levitation"], moveIds: ["trik-room"] },
      db,
    );
    expect(r).toEqual({ unresolved: ["draagon", "levitation", "trik-room"] });
  });

  it("does not flag valid slugs", async () => {
    const r = await queryPokedex(
      { types: ["dragon"], abilities: ["sand-veil"], moveIds: ["earthquake"] },
      db,
    );
    expect("unresolved" in r).toBe(false);
  });
});

describe("queryPokedex — row shape (tools.md T2)", () => {
  it("maps a row to the exact T2 shape (abilities omit absent slots)", async () => {
    const r = await queryPokedex({ types: ["dragon", "ground"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results[0]).toEqual({
      display_name: "Garchomp",
      national_dex_number: 445,
      types: ["dragon", "ground"],
      abilities: { slot1: "sand-veil", hidden: "rough-skin" },
      base_stats: {
        hp: 108,
        attack: 130,
        defense: 95,
        special_attack: 80,
        special_defense: 85,
        speed: 102,
      },
      base_stat_total: 600,
      sprite_url: "https://img/garchomp.png",
      is_gen9_native: true,
      source_generation: null,
    });
  });

  it("surfaces the Gen-9 fallback flags for a non-native form (BR-1)", async () => {
    const r = await queryPokedex({ types: ["fire", "dark"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    const row = r.results.find((x) => x.display_name === "Incineroar");
    expect(row?.is_gen9_native).toBe(false);
    expect(row?.source_generation).toBe("gen-7");
  });
});

// ---------------------------------------------------------------------------

describe("getPokemon — T3", () => {
  it("returns the full profile for an exact slug", async () => {
    const r = await getPokemon("garchomp", db);
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.display_name).toBe("Garchomp");
    expect(r.national_dex_number).toBe(445);
    expect(r.types).toEqual(["dragon", "ground"]);
    expect(r.abilities).toEqual({ slot1: "sand-veil", hidden: "rough-skin" });
    expect(r.base_stat_total).toBe(600);
    expect(r.artwork_url).toBe("https://img/garchomp_official.png");
    expect(r.forms).toEqual(["garchomp"]);
    expect(r.is_gen9_native).toBe(true);
  });

  it("is case-insensitive on the name", async () => {
    const r = await getPokemon("  GARCHOMP ", db);
    expect(r.found).toBe(true);
  });

  it("returns found:false with substring suggestions on a near miss", async () => {
    const r = await getPokemon("garchom", db);
    expect(r.found).toBe(false);
    if (r.found) return;
    expect(r.suggestions).toContain("garchomp");
  });

  it("returns found:false with empty suggestions when nothing is close", async () => {
    const r = await getPokemon("zzzznope", db);
    expect(r).toEqual({ found: false, suggestions: [] });
  });
});

// ---------------------------------------------------------------------------

describe("spriteUrlsByIds", () => {
  it("returns urls keyed by id", async () => {
    const map = await spriteUrlsByIds(["garchomp", "dragapult"], SV, db);
    expect(map.get("garchomp")).toBe("https://img/garchomp.png");
    expect(map.get("dragapult")).toBe("https://img/dragapult.png");
    expect(map.size).toBe(2);
  });

  it("omits unknown ids", async () => {
    const map = await spriteUrlsByIds(["garchomp", "missingno"], SV, db);
    expect(map.get("garchomp")).toBe("https://img/garchomp.png");
    expect(map.has("missingno")).toBe(false);
  });

  it("returns an empty map for empty ids without throwing", async () => {
    await expect(spriteUrlsByIds([], SV, db)).resolves.toEqual(new Map());
    await expect(spriteUrlsByIds(["", "  "], SV, db)).resolves.toEqual(
      new Map(),
    );
  });

  it("is format-scoped: a row in another format does not leak", async () => {
    const fix = await createPgSchema({ seed: "none" });
    try {
      await insertMon(fix.db, {
        id: "garchomp",
        species_name: "garchomp",
        display_name: "Garchomp",
        national_dex_number: 445,
        type1: "dragon",
        type2: "ground",
        ability_slot1: "sand-veil",
        stat_hp: 108,
        stat_attack: 130,
        stat_defense: 95,
        stat_special_attack: 80,
        stat_special_defense: 85,
        stat_speed: 102,
        sprite_url: "https://img/sv-garchomp.png",
      });
      await insertMon(fix.db, {
        format: "champions",
        id: "garchomp",
        species_name: "garchomp",
        display_name: "Garchomp",
        national_dex_number: 445,
        type1: "dragon",
        type2: "ground",
        ability_slot1: "sand-veil",
        stat_hp: 108,
        stat_attack: 130,
        stat_defense: 95,
        stat_special_attack: 80,
        stat_special_defense: 85,
        stat_speed: 102,
        sprite_url: "https://img/champions-garchomp.png",
      });

      const sv = await spriteUrlsByIds(["garchomp"], SV, fix.db);
      expect(sv.get("garchomp")).toBe("https://img/sv-garchomp.png");
      expect(sv.size).toBe(1);

      const champ = await spriteUrlsByIds(["garchomp"], "champions", fix.db);
      expect(champ.get("garchomp")).toBe("https://img/champions-garchomp.png");
      expect(champ.size).toBe(1);
    } finally {
      await fix.cleanup();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------

describe("format scoping (standard vs champions)", () => {
  /**
   * The same dex slug exists in both formats with different data; every read
   * must stay inside the requested format. We seed one row + meta per format and
   * confirm each format only ever sees its own row. Each test provisions its own
   * isolated schema because the per-format ingest_meta expectations differ.
   */
  async function seedBothFormats(database: OakDb): Promise<void> {
    // A champions-only build of "garchomp" with a deliberately different type so
    // a leak across formats would be obvious.
    await database.insert(pokemon).values({
      format: "champions",
      id: "garchomp",
      species_name: "garchomp",
      form_name: null,
      display_name: "Garchomp",
      national_dex_number: 445,
      type1: "dragon",
      type2: "ground",
      ability_slot1: "rough-skin",
      ability_slot2: null,
      ability_hidden: null,
      stat_hp: 108,
      stat_attack: 130,
      stat_defense: 95,
      stat_special_attack: 80,
      stat_special_defense: 85,
      stat_speed: 102,
      base_stat_total: 600,
      sprite_url: "https://img/garchomp.png",
      artwork_url: "https://img/garchomp_official.png",
      generation: "champions",
      is_gen9_native: 1,
      source_generation: null,
    });
    await database.insert(learnset).values({
      pokemon_id: "garchomp",
      move_slug: "earthquake",
      format: "champions",
      method: "machine",
    });
    await database.insert(ingest_meta).values({
      format: "champions",
      last_success_at: 0,
      pokemon_count: 1,
      learnset_count: 1,
      names_count: 0,
      schema_version: "2",
    });
  }

  it("queryPokedex only returns rows for the requested format", async () => {
    const fix = await createPgSchema({ seed: "none" });
    try {
      await seed(fix.db); // 5 scarlet-violet mons
      await seedBothFormats(fix.db); // + 1 champions garchomp

      const sv = await queryPokedexRaw({}, "scarlet-violet", fix.db);
      if ("error" in sv || "unresolved" in sv)
        throw new Error("expected results");
      expect(sv.total_count).toBe(5); // the champions garchomp is NOT counted

      const champ = await queryPokedexRaw({}, "champions", fix.db);
      if ("error" in champ || "unresolved" in champ)
        throw new Error("expected results");
      expect(champ.total_count).toBe(1);
      expect(champ.results[0].display_name).toBe("Garchomp");
    } finally {
      await fix.cleanup();
    }
  }, 60_000);

  it("getPokemon resolves the row for the requested format", async () => {
    const fix = await createPgSchema({ seed: "none" });
    try {
      await seed(fix.db);
      await seedBothFormats(fix.db);

      // Standard garchomp has a slot1 ability of sand-veil; champions' is rough-skin.
      const sv = await getPokemonRaw("garchomp", "scarlet-violet", fix.db);
      expect(sv.found && sv.abilities.slot1).toBe("sand-veil");

      const champ = await getPokemonRaw("garchomp", "champions", fix.db);
      expect(champ.found && champ.abilities.slot1).toBe("rough-skin");
    } finally {
      await fix.cleanup();
    }
  }, 60_000);

  it("index_unavailable is per-format (champions meta missing ⇒ unavailable)", async () => {
    const fix = await createPgSchema({ seed: "none" });
    try {
      await seed(fix.db); // seeds only the scarlet-violet ingest_meta row
      expect(await queryPokedexRaw({}, "champions", fix.db)).toEqual({
        error: "index_unavailable",
      });
    } finally {
      await fix.cleanup();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Reference-page reads — driven off the shared "tools" fixture, whose contents
// are asserted directly (POKEMON_SEED etc. in test/fixtures/tools-fixture.ts).
// ---------------------------------------------------------------------------

describe("reference-page reads (tools fixture)", () => {
  let toolsFix: PgFixture;
  let tdb: OakDb;

  beforeAll(async () => {
    toolsFix = await createPgSchema({ seed: "tools" });
    tdb = toolsFix.db;
  }, 60_000);

  afterAll(async () => {
    await toolsFix?.cleanup();
  });

  describe("listAllPokemon", () => {
    it("returns every scarlet-violet row, dex-then-slug ordered", async () => {
      const rows = await listAllPokemon(SV, tdb);
      // POKEMON_SEED has 9 scarlet-violet rows.
      expect(rows).toHaveLength(9);
      expect(rows.map((r) => r.slug)).toEqual([
        "ninetales", // 38
        "tauros", // 128 (slug order among dex 128)
        "tauros-paldea-aqua",
        "tauros-paldea-blaze",
        "tauros-paldea-combat",
        "swampert-mega", // 260
        "garchomp", // 445
        "dracovish", // 882
        "farigiraf", // 981
      ]);
    });

    it("maps the index-row shape (Garchomp)", async () => {
      const rows = await listAllPokemon(SV, tdb);
      const garchomp = rows.find((r) => r.slug === "garchomp");
      expect(garchomp).toEqual({
        slug: "garchomp",
        displayName: "Garchomp",
        dexNumber: 445,
        types: ["dragon", "ground"],
        baseStatTotal: 600,
        spriteUrl: "https://img.example/sprite/445.png",
        isNative: true,
      });
    });

    it("surfaces isNative=false for a non-native fallback (Dracovish)", async () => {
      const rows = await listAllPokemon(SV, tdb);
      const dracovish = rows.find((r) => r.slug === "dracovish");
      expect(dracovish?.isNative).toBe(false);
    });

    it("is format-scoped: champions holds only Garchomp", async () => {
      const rows = await listAllPokemon("champions", tdb);
      expect(rows.map((r) => r.slug)).toEqual(["garchomp"]);
    });

    it("returns [] when the pokemon table is missing", async () => {
      const empty = await createPgSchema({ seed: "none" });
      try {
        await empty.db.execute(sql`DROP TABLE pokemon`);
        expect(await listAllPokemon(SV, empty.db)).toEqual([]);
      } finally {
        await empty.cleanup();
      }
    }, 60_000);
  });

  describe("pokemonFormats", () => {
    it("lists the formats a slug appears in, in SCOPE_PICKER_ORDER", async () => {
      // Garchomp is seeded under scarlet-violet, champions AND gen-7.
      expect(await pokemonFormats("garchomp", tdb)).toEqual([
        "champions",
        "scarlet-violet",
        "gen-7",
      ]);
    });

    it("returns a single format for a scarlet-violet-only species", async () => {
      expect(await pokemonFormats("farigiraf", tdb)).toEqual(["scarlet-violet"]);
    });

    it("returns [] for an unknown slug", async () => {
      expect(await pokemonFormats("missingno", tdb)).toEqual([]);
    });
  });

  describe("pokemonRequiringItem", () => {
    it("returns [] when no form requires the item (ordinary held item)", async () => {
      expect(await pokemonRequiringItem("leftovers", SV, tdb)).toEqual([]);
    });

    it("back-links the forms whose required_item matches", async () => {
      // The tools fixture seeds Mega Swampert with required_item swampertite.
      expect(await pokemonRequiringItem("swampertite", SV, tdb)).toEqual([
        { slug: "swampert-mega", displayName: "Swampert (Mega)" },
      ]);
    }, 60_000);
  });
});
