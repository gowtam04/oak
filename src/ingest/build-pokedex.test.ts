/**
 * INDEPENDENT ORACLE TESTS — DS-2 Pokédex-row transform (Phase 3, build-pokedex).
 *
 * These are contract tests authored from the docs BEFORE judging the
 * implementation. Expected values are derived from PokeAPI ground truth +
 * design.md / data-sources.md (BR-1, D8), NOT from the impl code. They run
 * fully offline against the recorded fixtures in ./__fixtures__ — no live crawl.
 *
 * ── CONTRACT under test (src/ingest/build-pokedex.ts) ──────────────────────
 *   export interface PokemonRow { …exactly the `pokemon` table columns
 *     from src/data/schema.ts (id, species_name, form_name, display_name,
 *     national_dex_number, type1, type2, ability_slot1/slot2/hidden,
 *     stat_hp…stat_speed, base_stat_total, sprite_url, artwork_url,
 *     generation, is_gen9_native (0|1), source_generation) }
 *
 *   export function buildPokemonRow(
 *     pokemon: Json,   // a /pokemon/{id} resource
 *     species: Json,   // its /pokemon-species/{id} resource
 *     opts: { gen9VersionGroups: string[] },
 *   ): PokemonRow;
 *
 * Rules the transform must satisfy (derived from docs):
 *   - base_stat_total = sum of the six base stats (precomputed; design.md L90).
 *   - abilities ordered by PokeAPI slot → slot1 / slot2 (non-hidden) and the
 *     is_hidden ability → ability_hidden; absent slots → null.
 *   - types ordered by slot → type1 (req.) / type2 (null for mono-type).
 *   - is_gen9_native = 1 when the form is present in a Gen-9 version group
 *     (any moves[].version_group_details[].version_group ∈ gen9VersionGroups),
 *     else 0; source_generation is null when native and the fallback origin
 *     gen-slug (e.g. "gen-8") when NOT native (BR-1).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Json } from "@/data/pokeapi-client";
import { buildPokemonRow } from "./build-pokedex";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
);
function load(name: string): Json {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Json;
}

const GEN9 = { gen9VersionGroups: ["scarlet-violet"] };

describe("buildPokemonRow — Garchomp (stats + types + BST)", () => {
  const row = buildPokemonRow(
    load("garchomp-pokemon.json"),
    load("garchomp-species.json"),
    GEN9,
  );

  it("carries the canonical id, species and national dex number", () => {
    expect(row.id).toBe("garchomp");
    expect(row.species_name).toBe("garchomp");
    expect(row.form_name).toBeNull();
    expect(row.national_dex_number).toBe(445);
    expect(row.display_name.toLowerCase()).toContain("garchomp");
  });

  it("maps the six base stats in canonical order [108,130,95,80,85,102]", () => {
    expect([
      row.stat_hp,
      row.stat_attack,
      row.stat_defense,
      row.stat_special_attack,
      row.stat_special_defense,
      row.stat_speed,
    ]).toEqual([108, 130, 95, 80, 85, 102]);
  });

  it("precomputes BST = 600 (sum of the six stats)", () => {
    expect(row.base_stat_total).toBe(600);
    expect(row.base_stat_total).toBe(
      row.stat_hp +
        row.stat_attack +
        row.stat_defense +
        row.stat_special_attack +
        row.stat_special_defense +
        row.stat_speed,
    );
  });

  it("orders types by slot (Dragon/Ground)", () => {
    expect(row.type1).toBe("dragon");
    expect(row.type2).toBe("ground");
  });

  it("maps abilities by slot, hidden into ability_hidden, absent slot → null", () => {
    expect(row.ability_slot1).toBe("sand-veil");
    expect(row.ability_slot2).toBeNull();
    expect(row.ability_hidden).toBe("rough-skin");
  });

  it("carries the front sprite and official-artwork URLs", () => {
    expect(row.sprite_url).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/445.png",
    );
    expect(row.artwork_url).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png",
    );
  });

  it("is Gen-9 native (present in scarlet-violet), no fallback flag", () => {
    expect(row.is_gen9_native).toBe(1);
    expect(row.generation).toBe("gen-9");
    expect(row.source_generation).toBeNull();
  });
});

describe("buildPokemonRow — Farigiraf (3 abilities incl. armor-tail)", () => {
  const row = buildPokemonRow(
    load("farigiraf-pokemon.json"),
    load("farigiraf-species.json"),
    GEN9,
  );

  it("has exactly three abilities including armor-tail", () => {
    const abilities = [
      row.ability_slot1,
      row.ability_slot2,
      row.ability_hidden,
    ].filter((a): a is string => a !== null);
    expect(abilities).toHaveLength(3);
    expect(abilities).toContain("armor-tail");
  });

  it("places the abilities in the correct slots", () => {
    // PokeAPI slot order: cud-chew (1), armor-tail (2), sap-sipper (hidden, 3)
    expect(row.ability_slot1).toBe("cud-chew");
    expect(row.ability_slot2).toBe("armor-tail");
    expect(row.ability_hidden).toBe("sap-sipper");
  });

  it("is a Normal/Psychic Gen-9 native with national dex 981, BST 520", () => {
    expect(row.type1).toBe("normal");
    expect(row.type2).toBe("psychic");
    expect(row.national_dex_number).toBe(981);
    expect(row.base_stat_total).toBe(520);
    expect(row.is_gen9_native).toBe(1);
    expect(row.source_generation).toBeNull();
  });
});

describe("buildPokemonRow — Dracovish (non-Gen-9 fallback, BR-1)", () => {
  const row = buildPokemonRow(
    load("dracovish-pokemon.json"),
    load("dracovish-species.json"),
    GEN9,
  );

  it("is flagged is_gen9_native=0 with a source_generation", () => {
    expect(row.is_gen9_native).toBe(0);
    expect(row.source_generation).toBe("gen-8");
    expect(typeof row.source_generation).toBe("string");
  });

  it("still builds a complete, valid row (Water/Dragon, BST 505)", () => {
    expect(row.id).toBe("dracovish");
    expect(row.national_dex_number).toBe(882);
    expect(row.type1).toBe("water");
    expect(row.type2).toBe("dragon");
    expect(row.base_stat_total).toBe(505);
  });
});
