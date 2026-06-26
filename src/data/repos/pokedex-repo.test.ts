/**
 * Unit tests for PokedexRepo (queryPokedex / getPokemon).
 *
 * Run against a REAL throwaway in-memory SQLite DB built from the committed
 * Drizzle migrations (design.md: "repos against a real fixture SQLite DB"), so
 * the dynamic filter/sort/threshold SQL, the Gen-9 learnset intersection, and
 * the row → tool-shape mappers are all exercised end-to-end. No mocks, no
 * on-disk index, no network.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/data/schema";
import { ingest_meta, learnset, pokemon } from "@/data/schema";
import type { PokebotDb } from "@/data/db";
import {
  getPokemon as getPokemonRaw,
  queryPokedex as queryPokedexRaw,
  type PokedexFilters,
} from "./pokedex-repo";

// All of these tests exercise the standard (Scarlet-Violet) scope. Bind that
// format here so the call sites stay focused on filters/slugs; the format
// threading itself is covered by the format-scoping checks below.
const SV = "scarlet-violet" as const;
const queryPokedex = (f: PokedexFilters, db: PokebotDb) =>
  queryPokedexRaw(f, SV, db);
const getPokemon = (slug: string, db: PokebotDb) => getPokemonRaw(slug, SV, db);

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "drizzle",
);

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

function makeDb(): PokebotDb {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

function insertMon(db: PokebotDb, mon: MonInput): void {
  const bst =
    mon.base_stat_total ??
    mon.stat_hp +
      mon.stat_attack +
      mon.stat_defense +
      mon.stat_special_attack +
      mon.stat_special_defense +
      mon.stat_speed;
  db.insert(pokemon)
    .values({
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
    })
    .run();
}

/** Seed a small, fully-controlled fixture index + an ingest_meta marker. */
function seed(db: PokebotDb): void {
  insertMon(db, {
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
  insertMon(db, {
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
  insertMon(db, {
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
  insertMon(db, {
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
  insertMon(db, {
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
  db.insert(learnset)
    .values(
      moves.map((x) => ({
        pokemon_id: x.p,
        move_slug: x.m,
        format: SV,
        method: "level-up",
      })),
    )
    .run();

  db.insert(ingest_meta)
    .values({
      format: SV,
      last_success_at: 0,
      pokemon_count: 5,
      learnset_count: moves.length,
      names_count: 0,
      schema_version: "2",
    })
    .run();
}

// ---------------------------------------------------------------------------

describe("queryPokedex — index availability", () => {
  it("returns index_unavailable when ingest_meta has no row", () => {
    const db = makeDb(); // migrated but empty (no ingest_meta marker)
    expect(queryPokedex({}, db)).toEqual({ error: "index_unavailable" });
  });
});

describe("queryPokedex — filters", () => {
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("types are ANDed: ['dragon'] matches both dragons", () => {
    const r = queryPokedex({ types: ["dragon"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(2);
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Dragapult",
      "Garchomp",
    ]);
  });

  it("types are ANDed: ['dragon','ground'] matches only Garchomp", () => {
    const r = queryPokedex({ types: ["dragon", "ground"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(1);
    expect(r.results[0].display_name).toBe("Garchomp");
  });

  it("abilities are ORed across slots (slot1 + hidden)", () => {
    const r = queryPokedex({ abilities: ["flash-fire", "gale-wings"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Ninetales", // flash-fire (slot1)
      "Talonflame", // gale-wings (hidden)
    ]);
  });

  it("stat_filters are ANDed (speed > 120) and sortable", () => {
    const r = queryPokedex(
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
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("sorts by speed desc (superlative 'fastest')", () => {
    const r = queryPokedex({ sortBy: "speed", order: "desc", limit: 1 }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results[0].display_name).toBe("Dragapult"); // 142
    expect(r.sort).toBe("speed desc");
  });

  it("reports total_count over the full match set and truncates the page", () => {
    const r = queryPokedex({ types: ["dragon"], limit: 1 }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(2);
    expect(r.results).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it("sort is null when no sort_by is given", () => {
    const r = queryPokedex({ types: ["fire"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.sort).toBeNull();
  });
});

describe("queryPokedex — multi-move Gen-9 intersection (BR-7)", () => {
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("returns only Pokémon that learn ALL listed moves", () => {
    const r = queryPokedex({ moveIds: ["earthquake", "dragon-claw"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.total_count).toBe(1);
    expect(r.results[0].display_name).toBe("Garchomp");
  });

  it("a single move matches every learner (Dragapult learns dragon-claw too)", () => {
    const r = queryPokedex({ moveIds: ["dragon-claw"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    expect(r.results.map((x) => x.display_name).sort()).toEqual([
      "Dragapult",
      "Garchomp",
    ]);
  });

  it("an empty intersection is total_count 0 (NOT an error)", () => {
    const r = queryPokedex({ moveIds: ["earthquake", "will-o-wisp"] }, db);
    expect(r).toEqual({
      total_count: 0,
      truncated: false,
      sort: null,
      results: [],
    });
  });

  it("intersects with other filters (dragon AND learns dragon-claw)", () => {
    const r = queryPokedex(
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
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("flags an unknown type", () => {
    expect(queryPokedex({ types: ["draagon"] }, db)).toEqual({
      unresolved: ["draagon"],
    });
  });

  it("flags an unknown ability", () => {
    expect(queryPokedex({ abilities: ["levitation"] }, db)).toEqual({
      unresolved: ["levitation"],
    });
  });

  it("flags an unknown move", () => {
    expect(queryPokedex({ moveIds: ["trik-room"] }, db)).toEqual({
      unresolved: ["trik-room"],
    });
  });

  it("collects multiple unresolved slugs in input order", () => {
    const r = queryPokedex(
      { types: ["draagon"], abilities: ["levitation"], moveIds: ["trik-room"] },
      db,
    );
    expect(r).toEqual({ unresolved: ["draagon", "levitation", "trik-room"] });
  });

  it("does not flag valid slugs", () => {
    const r = queryPokedex(
      { types: ["dragon"], abilities: ["sand-veil"], moveIds: ["earthquake"] },
      db,
    );
    expect("unresolved" in r).toBe(false);
  });
});

describe("queryPokedex — row shape (tools.md T2)", () => {
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("maps a row to the exact T2 shape (abilities omit absent slots)", () => {
    const r = queryPokedex({ types: ["dragon", "ground"] }, db);
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

  it("surfaces the Gen-9 fallback flags for a non-native form (BR-1)", () => {
    const r = queryPokedex({ types: ["fire", "dark"] }, db);
    if ("error" in r || "unresolved" in r) throw new Error("expected results");
    const row = r.results.find((x) => x.display_name === "Incineroar");
    expect(row?.is_gen9_native).toBe(false);
    expect(row?.source_generation).toBe("gen-7");
  });
});

// ---------------------------------------------------------------------------

describe("getPokemon — T3", () => {
  let db: PokebotDb;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("returns the full profile for an exact slug", () => {
    const r = getPokemon("garchomp", db);
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

  it("is case-insensitive on the name", () => {
    const r = getPokemon("  GARCHOMP ", db);
    expect(r.found).toBe(true);
  });

  it("returns found:false with substring suggestions on a near miss", () => {
    const r = getPokemon("garchom", db);
    expect(r.found).toBe(false);
    if (r.found) return;
    expect(r.suggestions).toContain("garchomp");
  });

  it("returns found:false with empty suggestions when nothing is close", () => {
    const r = getPokemon("zzzznope", db);
    expect(r).toEqual({ found: false, suggestions: [] });
  });
});

// ---------------------------------------------------------------------------

describe("format scoping (standard vs champions)", () => {
  /**
   * The same dex slug exists in both formats with different data; every read
   * must stay inside the requested format. We seed one row + meta per format and
   * confirm each format only ever sees its own row.
   */
  function seedBothFormats(db: PokebotDb): void {
    // A champions-only build of "garchomp" with a deliberately different type so
    // a leak across formats would be obvious.
    db.insert(pokemon)
      .values({
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
      })
      .run();
    db.insert(learnset)
      .values({
        pokemon_id: "garchomp",
        move_slug: "earthquake",
        format: "champions",
        method: "machine",
      })
      .run();
    db.insert(ingest_meta)
      .values({
        format: "champions",
        last_success_at: 0,
        pokemon_count: 1,
        learnset_count: 1,
        names_count: 0,
        schema_version: "2",
      })
      .run();
  }

  it("queryPokedex only returns rows for the requested format", () => {
    const db = makeDb();
    seed(db); // 5 scarlet-violet mons
    seedBothFormats(db); // + 1 champions garchomp

    const sv = queryPokedexRaw({}, "scarlet-violet", db);
    if ("error" in sv || "unresolved" in sv) throw new Error("expected results");
    expect(sv.total_count).toBe(5); // the champions garchomp is NOT counted

    const champ = queryPokedexRaw({}, "champions", db);
    if ("error" in champ || "unresolved" in champ)
      throw new Error("expected results");
    expect(champ.total_count).toBe(1);
    expect(champ.results[0].display_name).toBe("Garchomp");
  });

  it("getPokemon resolves the row for the requested format", () => {
    const db = makeDb();
    seed(db);
    seedBothFormats(db);

    // Standard garchomp has a slot1 ability of sand-veil; champions' is rough-skin.
    const sv = getPokemonRaw("garchomp", "scarlet-violet", db);
    expect(sv.found && sv.abilities.slot1).toBe("sand-veil");

    const champ = getPokemonRaw("garchomp", "champions", db);
    expect(champ.found && champ.abilities.slot1).toBe("rough-skin");
  });

  it("index_unavailable is per-format (champions meta missing ⇒ unavailable)", () => {
    const db = makeDb();
    seed(db); // seeds only the scarlet-violet ingest_meta row
    expect(queryPokedexRaw({}, "champions", db)).toEqual({
      error: "index_unavailable",
    });
  });
});
