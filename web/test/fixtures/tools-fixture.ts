/**
 * Deterministic fixture DB seed for the INDEPENDENT ORACLE TESTS of the Tool
 * layer (Phase 4: src/agent/tools/**, src/agent/formulas/**, src/data/repos/**).
 *
 * This file is NOT a test itself (it has no `.test.ts` suffix, so vitest does
 * not collect it). It is the shared seed + context helper consumed by the
 * `*.oracle.test.ts` files in this folder.
 *
 * Design intent (derived from the docs, NOT from the implementation):
 *   - Curated species mandated by design.md § Testing Strategy / the task:
 *       Garchomp, Farigiraf, a Fire/Flash-Fire mon (Ninetales), a non-Gen-9
 *       fallback species (Dracovish), and the Tauros forms (D8).
 *   - Stats/types/abilities are the real PokeAPI values (cross-checked against
 *     src/ingest/__fixtures__/*.json) so the oracle's expected numbers come from
 *     ground truth, not from whatever the impl happens to produce.
 *   - Learnsets are a SMALL CONTROLLED set chosen so the multi-move intersection
 *     (BR-7) and the combined type+ability+move filter (G5) have a single,
 *     unambiguous expected answer.
 *   - One reference_cache row per type chart entry needed for get_type_matchups
 *     so that tool resolves from the cache (a HIT) and never reaches PokeAPI in
 *     a test (the read-through cache contract, tools.md T6 / BR-8).
 *   - ingest_meta is populated so the index reads as "available" (NOT
 *     index_unavailable) for the seeded-DB oracle.
 *
 * The seeder writes via Drizzle inserts over the node-postgres handle, so it
 * depends only on the committed schema (src/data/schema.ts) and not on any
 * Phase-4 code.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/data/schema";
import {
  ingest_meta,
  learnset,
  pokemon,
  reference_cache,
  searchable_names,
} from "@/data/schema";
import type { AgentContext } from "@/agent/types";

/** A Drizzle handle typed over the full Oak schema (node-postgres). */
export type ToolsFixtureDb = NodePgDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

export type PokemonSeed = {
  id: string;
  species_name: string;
  form_name: string | null;
  display_name: string;
  national_dex_number: number;
  type1: string;
  type2: string | null;
  ability_slot1: string;
  ability_slot2: string | null;
  ability_hidden: string | null;
  stat_hp: number;
  stat_attack: number;
  stat_defense: number;
  stat_special_attack: number;
  stat_special_defense: number;
  stat_speed: number;
  base_stat_total: number;
  sprite_url: string;
  artwork_url: string;
  generation: string;
  is_gen9_native: number; // 0 | 1
  source_generation: string | null;
};

function bst(s: {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}): number {
  return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}

/** Curated Pokédex rows (real PokeAPI stats/types/abilities). */
export const POKEMON_SEED: PokemonSeed[] = [
  {
    id: "garchomp",
    species_name: "garchomp",
    form_name: null,
    display_name: "Garchomp",
    national_dex_number: 445,
    type1: "dragon",
    type2: "ground",
    ability_slot1: "sand-veil",
    ability_slot2: null,
    ability_hidden: "rough-skin",
    stat_hp: 108,
    stat_attack: 130,
    stat_defense: 95,
    stat_special_attack: 80,
    stat_special_defense: 85,
    stat_speed: 102,
    base_stat_total: bst({
      hp: 108,
      atk: 130,
      def: 95,
      spa: 80,
      spd: 85,
      spe: 102,
    }),
    sprite_url: "https://img.example/sprite/445.png",
    artwork_url: "https://img.example/art/445.png",
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  },
  {
    id: "farigiraf",
    species_name: "farigiraf",
    form_name: null,
    display_name: "Farigiraf",
    national_dex_number: 981,
    type1: "normal",
    type2: "psychic",
    ability_slot1: "cud-chew",
    ability_slot2: "armor-tail",
    ability_hidden: "sap-sipper",
    stat_hp: 120,
    stat_attack: 90,
    stat_defense: 70,
    stat_special_attack: 110,
    stat_special_defense: 70,
    stat_speed: 60,
    base_stat_total: bst({
      hp: 120,
      atk: 90,
      def: 70,
      spa: 110,
      spd: 70,
      spe: 60,
    }),
    sprite_url: "https://img.example/sprite/981.png",
    artwork_url: "https://img.example/art/981.png",
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  },
  {
    // Fire / Flash-Fire mon (G5).
    id: "ninetales",
    species_name: "ninetales",
    form_name: null,
    display_name: "Ninetales",
    national_dex_number: 38,
    type1: "fire",
    type2: null,
    ability_slot1: "flash-fire",
    ability_slot2: null,
    ability_hidden: "drought",
    stat_hp: 73,
    stat_attack: 76,
    stat_defense: 75,
    stat_special_attack: 81,
    stat_special_defense: 100,
    stat_speed: 100,
    base_stat_total: bst({
      hp: 73,
      atk: 76,
      def: 75,
      spa: 81,
      spd: 100,
      spe: 100,
    }),
    sprite_url: "https://img.example/sprite/38.png",
    artwork_url: "https://img.example/art/38.png",
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  },
  {
    // Non-Gen-9 fallback species (G17 / BR-1) — cut from Scarlet/Violet.
    id: "dracovish",
    species_name: "dracovish",
    form_name: null,
    display_name: "Dracovish",
    national_dex_number: 882,
    type1: "water",
    type2: "dragon",
    ability_slot1: "water-absorb",
    ability_slot2: "strong-jaw",
    ability_hidden: "sand-rush",
    stat_hp: 90,
    stat_attack: 90,
    stat_defense: 100,
    stat_special_attack: 70,
    stat_special_defense: 80,
    stat_speed: 75,
    base_stat_total: bst({
      hp: 90,
      atk: 90,
      def: 100,
      spa: 70,
      spd: 80,
      spe: 75,
    }),
    sprite_url: "https://img.example/sprite/882.png",
    artwork_url: "https://img.example/art/882.png",
    generation: "gen-8",
    is_gen9_native: 0,
    source_generation: "gen-8",
  },
  // --- Tauros forms (D8: one indexed row per battle-relevant form) ---------
  {
    id: "tauros",
    species_name: "tauros",
    form_name: null,
    display_name: "Tauros",
    national_dex_number: 128,
    type1: "normal",
    type2: null,
    ability_slot1: "intimidate",
    ability_slot2: "anger-point",
    ability_hidden: "sheer-force",
    stat_hp: 75,
    stat_attack: 100,
    stat_defense: 95,
    stat_special_attack: 40,
    stat_special_defense: 70,
    stat_speed: 110,
    base_stat_total: bst({
      hp: 75,
      atk: 100,
      def: 95,
      spa: 40,
      spd: 70,
      spe: 110,
    }),
    sprite_url: "https://img.example/sprite/128.png",
    artwork_url: "https://img.example/art/128.png",
    generation: "gen-1",
    is_gen9_native: 0,
    source_generation: "gen-1",
  },
  {
    id: "tauros-paldea-combat",
    species_name: "tauros",
    form_name: "paldea-combat",
    display_name: "Tauros (Paldean Combat)",
    national_dex_number: 128,
    type1: "fighting",
    type2: null,
    ability_slot1: "intimidate",
    ability_slot2: "anger-point",
    ability_hidden: "cud-chew",
    stat_hp: 75,
    stat_attack: 110,
    stat_defense: 105,
    stat_special_attack: 30,
    stat_special_defense: 70,
    stat_speed: 100,
    base_stat_total: bst({
      hp: 75,
      atk: 110,
      def: 105,
      spa: 30,
      spd: 70,
      spe: 100,
    }),
    sprite_url: "https://img.example/sprite/128-combat.png",
    artwork_url: "https://img.example/art/128-combat.png",
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  },
  {
    id: "tauros-paldea-blaze",
    species_name: "tauros",
    form_name: "paldea-blaze",
    display_name: "Tauros (Paldean Blaze)",
    national_dex_number: 128,
    type1: "fighting",
    type2: "fire",
    ability_slot1: "intimidate",
    ability_slot2: "anger-point",
    ability_hidden: "cud-chew",
    stat_hp: 75,
    stat_attack: 110,
    stat_defense: 105,
    stat_special_attack: 30,
    stat_special_defense: 70,
    stat_speed: 100,
    base_stat_total: bst({
      hp: 75,
      atk: 110,
      def: 105,
      spa: 30,
      spd: 70,
      spe: 100,
    }),
    sprite_url: "https://img.example/sprite/128-blaze.png",
    artwork_url: "https://img.example/art/128-blaze.png",
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  },
  {
    id: "tauros-paldea-aqua",
    species_name: "tauros",
    form_name: "paldea-aqua",
    display_name: "Tauros (Paldean Aqua)",
    national_dex_number: 128,
    type1: "fighting",
    type2: "water",
    ability_slot1: "intimidate",
    ability_slot2: "anger-point",
    ability_hidden: "cud-chew",
    stat_hp: 75,
    stat_attack: 110,
    stat_defense: 105,
    stat_special_attack: 30,
    stat_special_defense: 70,
    stat_speed: 100,
    base_stat_total: bst({
      hp: 75,
      atk: 110,
      def: 105,
      spa: 30,
      spd: 70,
      spe: 100,
    }),
    sprite_url: "https://img.example/sprite/128-aqua.png",
    artwork_url: "https://img.example/art/128-aqua.png",
    generation: "gen-9",
    is_gen9_native: 1,
    source_generation: null,
  },
];

export type LearnsetSeed = {
  pokemon_id: string;
  move_slug: string;
  format: string;
  method: string | null;
};

const SV = "scarlet-violet";

/**
 * Controlled Gen-9 learnsets. Chosen so:
 *   - ONLY Ninetales learns BOTH will-o-wisp AND trick-room  (intersection, G1)
 *   - will-o-wisp learners = { ninetales, tauros-paldea-blaze }
 *   - the fire + flash-fire + will-o-wisp intersection (G5) = { ninetales }
 */
export const LEARNSET_SEED: LearnsetSeed[] = [
  {
    pokemon_id: "garchomp",
    move_slug: "earthquake",
    format: SV,
    method: "machine",
  },
  {
    pokemon_id: "garchomp",
    move_slug: "dragon-claw",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "garchomp",
    move_slug: "fire-fang",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "ninetales",
    move_slug: "will-o-wisp",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "ninetales",
    move_slug: "trick-room",
    format: SV,
    method: "machine",
  },
  {
    pokemon_id: "ninetales",
    move_slug: "flamethrower",
    format: SV,
    method: "machine",
  },
  {
    pokemon_id: "farigiraf",
    move_slug: "trick-room",
    format: SV,
    method: "machine",
  },
  {
    pokemon_id: "farigiraf",
    move_slug: "psychic",
    format: SV,
    method: "machine",
  },
  {
    pokemon_id: "tauros-paldea-blaze",
    move_slug: "will-o-wisp",
    format: SV,
    method: "machine",
  },
  {
    pokemon_id: "tauros-paldea-blaze",
    move_slug: "flame-charge",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "tauros-paldea-combat",
    move_slug: "close-combat",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "tauros-paldea-aqua",
    move_slug: "aqua-jet",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "tauros",
    move_slug: "body-slam",
    format: SV,
    method: "level-up",
  },
  {
    pokemon_id: "dracovish",
    move_slug: "fishious-rend",
    format: SV,
    method: "level-up",
  },
];

export type SearchableNameSeed = {
  kind: string;
  slug: string;
  display_name: string;
};

/** Names index backing resolve_entity (T1). */
export const SEARCHABLE_NAMES_SEED: SearchableNameSeed[] = [
  { kind: "pokemon", slug: "garchomp", display_name: "Garchomp" },
  { kind: "pokemon", slug: "farigiraf", display_name: "Farigiraf" },
  { kind: "pokemon", slug: "ninetales", display_name: "Ninetales" },
  { kind: "pokemon", slug: "dracovish", display_name: "Dracovish" },
  { kind: "pokemon", slug: "tauros", display_name: "Tauros" },
  {
    kind: "pokemon",
    slug: "tauros-paldea-combat",
    display_name: "Tauros (Paldean Combat)",
  },
  {
    kind: "pokemon",
    slug: "tauros-paldea-blaze",
    display_name: "Tauros (Paldean Blaze)",
  },
  {
    kind: "pokemon",
    slug: "tauros-paldea-aqua",
    display_name: "Tauros (Paldean Aqua)",
  },
  { kind: "move", slug: "will-o-wisp", display_name: "Will-O-Wisp" },
  { kind: "move", slug: "trick-room", display_name: "Trick Room" },
  { kind: "move", slug: "fake-out", display_name: "Fake Out" },
  { kind: "move", slug: "flamethrower", display_name: "Flamethrower" },
  { kind: "move", slug: "earthquake", display_name: "Earthquake" },
  { kind: "move", slug: "wish", display_name: "Wish" },
  { kind: "ability", slug: "flash-fire", display_name: "Flash Fire" },
  { kind: "ability", slug: "armor-tail", display_name: "Armor Tail" },
  { kind: "ability", slug: "sand-veil", display_name: "Sand Veil" },
  { kind: "ability", slug: "rough-skin", display_name: "Rough Skin" },
  { kind: "ability", slug: "intimidate", display_name: "Intimidate" },
  { kind: "type", slug: "fire", display_name: "Fire" },
  { kind: "type", slug: "ground", display_name: "Ground" },
  { kind: "type", slug: "flying", display_name: "Flying" },
  { kind: "type", slug: "water", display_name: "Water" },
  { kind: "type", slug: "dragon", display_name: "Dragon" },
  { kind: "item", slug: "leftovers", display_name: "Leftovers" },
  { kind: "item", slug: "life-orb", display_name: "Life Orb" },
];

export type ReferenceCacheSeed = {
  resource_key: string;
  resource_kind: string;
  payload: unknown;
  endpoint_url: string;
};

/**
 * Pre-seeded normalized type-chart payloads so get_type_matchups resolves from
 * the cache (a HIT) and never touches PokeAPI in a test. The `ground` payload is
 * verbatim from tools.md T6 — Flying is `no_effect_against` (immune 0x), the
 * G11 oracle.
 */
export const REFERENCE_CACHE_SEED: ReferenceCacheSeed[] = [
  {
    resource_key: "type/ground",
    resource_kind: "type",
    endpoint_url: "https://pokeapi.co/api/v2/type/ground",
    payload: {
      found: true,
      types: ["ground"],
      offensive: {
        super_effective_against: [
          "fire",
          "electric",
          "poison",
          "rock",
          "steel",
        ],
        not_very_effective_against: ["bug", "grass"],
        no_effect_against: ["flying"],
      },
      defensive: {
        weak_to: ["water", "grass", "ice"],
        resists: ["poison", "rock"],
        immune_to: ["electric"],
      },
    },
  },
  {
    resource_key: "type/flying",
    resource_kind: "type",
    endpoint_url: "https://pokeapi.co/api/v2/type/flying",
    payload: {
      found: true,
      types: ["flying"],
      offensive: {
        super_effective_against: ["grass", "fighting", "bug"],
        not_very_effective_against: ["electric", "rock", "steel"],
        no_effect_against: [],
      },
      defensive: {
        weak_to: ["electric", "ice", "rock"],
        resists: ["grass", "fighting", "bug"],
        immune_to: ["ground"],
      },
    },
  },
  // --- T14 get_encounters: a grouped HIT + an explicit known-but-empty -------
  {
    // Forward hit: Garchomp has grouped, multi-game-shaped encounter data.
    resource_key: "encounters/garchomp",
    resource_kind: "encounters",
    endpoint_url: "https://pokeapi.co",
    payload: {
      found: true,
      name: "Garchomp",
      encounters: [
        {
          version_group: "sword-shield",
          generation: 8,
          versions: ["shield", "sword"],
          locations: [
            {
              location_display: "Lake of Outrage",
              region: "Galar",
              method: "walk",
              min_level: 55,
              max_level: 60,
              chance: 5,
              conditions: [],
            },
          ],
        },
      ],
      coverage_note: null,
    },
  },
  {
    // Known-but-empty (builder-style): species covered, but no recorded catch
    // data — found:true, empty list, coverage_note set.
    resource_key: "encounters/dracovish",
    resource_kind: "encounters",
    endpoint_url: "https://pokeapi.co",
    payload: {
      found: true,
      name: "Dracovish",
      encounters: [],
      coverage_note:
        "PokeAPI records no catch/encounter data for this Pokémon. Obtain it " +
        "by evolution, breeding, in-game trade, or events.",
    },
  },
  // --- T7 get_evolution_chain: an evolution HIT under scarlet-violet only ------
  // Eevee is NOT seeded under the champions format, so a champions-mode
  // get_evolution_chain misses the roster and falls back to THIS row — the
  // source_format-flagged mainline chain (GS evolution fallback).
  {
    resource_key: "evolution-chain/eevee",
    resource_kind: "evolution",
    endpoint_url: "https://pokeapi.co/api/v2/evolution-chain/67",
    payload: {
      found: true,
      chain: [
        {
          from: "eevee",
          to: "vaporeon",
          conditions: [{ trigger: "use-item", item: "water-stone" }],
        },
        {
          from: "eevee",
          to: "sylveon",
          conditions: [
            { trigger: "level-up", known_move_type: "fairy", min_affection: 2 },
          ],
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Gen-7 slice (generation-scope feature) — a SMALL second row-set under the
// "gen-7" format, alongside the scarlet-violet rows above, so the oracle can
// prove that a `ctx.mode = "gen-7"` turn reads the gen-7 index (not gen-9).
//
// The DIVERGENCE from gen 9 is deliberate and single-pointed: Incineroar learns
// `hidden-power` here, a move legal in Gen 7 but removed from Gen 8+ — so it is
// present in NO scarlet-violet learnset above. A moves-filter query therefore
// resolves Incineroar under gen-7 but reports `unresolved` under standard/SV,
// pinning the format cut. Real @pkmn stats/types/abilities (ground truth).
// ---------------------------------------------------------------------------

const GEN7 = "gen-7";

/** Curated gen-7 Pokédex rows (real @pkmn/dex values). */
export const POKEMON_SEED_GEN7: PokemonSeed[] = [
  {
    // Gen-7 starter flagship; carries the divergence move.
    id: "incineroar",
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
    base_stat_total: bst({
      hp: 95,
      atk: 115,
      def: 90,
      spa: 80,
      spd: 90,
      spe: 60,
    }),
    sprite_url: "https://img.example/sprite/727.png",
    artwork_url: "https://img.example/art/727.png",
    generation: "gen-7",
    is_gen9_native: 1, // native to gen 7 (field name is historical)
    source_generation: null,
  },
  {
    id: "decidueye",
    species_name: "decidueye",
    form_name: null,
    display_name: "Decidueye",
    national_dex_number: 724,
    type1: "grass",
    type2: "ghost",
    ability_slot1: "overgrow",
    ability_slot2: null,
    ability_hidden: "long-reach",
    stat_hp: 78,
    stat_attack: 107,
    stat_defense: 75,
    stat_special_attack: 100,
    stat_special_defense: 100,
    stat_speed: 70,
    base_stat_total: bst({
      hp: 78,
      atk: 107,
      def: 75,
      spa: 100,
      spd: 100,
      spe: 70,
    }),
    sprite_url: "https://img.example/sprite/724.png",
    artwork_url: "https://img.example/art/724.png",
    generation: "gen-7",
    is_gen9_native: 1,
    source_generation: null,
  },
  {
    // A gen-4 species that is ALSO a real, current mon in USUM (not a "Past"
    // fallback) — its stats are unchanged across gens, so it doubles as a cross-
    // format control (the same slug exists under scarlet-violet above).
    id: "garchomp",
    species_name: "garchomp",
    form_name: null,
    display_name: "Garchomp",
    national_dex_number: 445,
    type1: "dragon",
    type2: "ground",
    ability_slot1: "sand-veil",
    ability_slot2: null,
    ability_hidden: "rough-skin",
    stat_hp: 108,
    stat_attack: 130,
    stat_defense: 95,
    stat_special_attack: 80,
    stat_special_defense: 85,
    stat_speed: 102,
    base_stat_total: bst({
      hp: 108,
      atk: 130,
      def: 95,
      spa: 80,
      spd: 85,
      spe: 102,
    }),
    sprite_url: "https://img.example/sprite/445.png",
    artwork_url: "https://img.example/art/445.png",
    generation: "gen-7",
    is_gen9_native: 1,
    source_generation: null,
  },
];

/**
 * Controlled gen-7 learnsets. `hidden-power` on Incineroar is the divergence:
 * gen-7-legal, absent from every scarlet-violet learnset above (Gen 8+ dropped
 * it), so it resolves only under the gen-7 format.
 */
export const LEARNSET_SEED_GEN7: LearnsetSeed[] = [
  {
    pokemon_id: "incineroar",
    move_slug: "hidden-power",
    format: GEN7,
    method: "machine",
  },
  {
    pokemon_id: "incineroar",
    move_slug: "fake-out",
    format: GEN7,
    method: "level-up",
  },
  {
    pokemon_id: "incineroar",
    move_slug: "flare-blitz",
    format: GEN7,
    method: "level-up",
  },
  {
    pokemon_id: "decidueye",
    move_slug: "spirit-shackle",
    format: GEN7,
    method: "level-up",
  },
  {
    pokemon_id: "garchomp",
    move_slug: "earthquake",
    format: GEN7,
    method: "machine",
  },
  {
    pokemon_id: "garchomp",
    move_slug: "dragon-claw",
    format: GEN7,
    method: "level-up",
  },
];

/** Names index backing resolve_entity for the gen-7 format. */
export const SEARCHABLE_NAMES_SEED_GEN7: SearchableNameSeed[] = [
  { kind: "pokemon", slug: "incineroar", display_name: "Incineroar" },
  { kind: "pokemon", slug: "decidueye", display_name: "Decidueye" },
  { kind: "pokemon", slug: "garchomp", display_name: "Garchomp" },
  { kind: "move", slug: "hidden-power", display_name: "Hidden Power" },
  { kind: "move", slug: "flare-blitz", display_name: "Flare Blitz" },
  { kind: "move", slug: "spirit-shackle", display_name: "Spirit Shackle" },
  { kind: "ability", slug: "intimidate", display_name: "Intimidate" },
];

/** One reference_cache row so the gen-7 format carries reference detail too. */
export const REFERENCE_CACHE_SEED_GEN7: ReferenceCacheSeed[] = [
  {
    resource_key: "move/hidden-power",
    resource_kind: "move",
    endpoint_url: "https://data.pkmn.cc/gen7",
    payload: {
      found: true,
      display_name: "Hidden Power",
      type: "normal",
      damage_class: "special",
      power: 60,
      accuracy: 100,
      pp: 15,
      priority: 0,
      target: "selected-pokemon",
      effect_short: "Type and power depend on the user's IVs (Gen 7 only).",
      effect_full:
        "A Normal-type attack whose actual type is determined by the user's " +
        "individual values. Removed from Generation 8 onward.",
    },
  },
];

// ---------------------------------------------------------------------------
// Champions slice (Champions-default cross-scope hint, B-13/exists_in_standard)
// — a SMALL second row-set under the "champions" format, alongside the
// scarlet-violet rows above, so the oracle can prove that a champions-mode
// tool MISS is additionally flagged `exists_in_standard` when the entity is
// real in the mainline Gen 9 (scarlet-violet) index.
//
// Deliberately minimal and single-pointed:
//   - Garchomp is seeded under BOTH formats (the "shared species" probe).
//   - Every other scarlet-violet species above (Farigiraf, Ninetales,
//     Dracovish, the Tauros forms) stays champions-ABSENT — the "SV-only"
//     miss probe for get_pokemon / resolve_entity.
//   - `move/dragon-claw` is seeded ONLY under scarlet-violet — the
//     champions-absent reference-cache probe for get_move.
//   - `move/earthquake` is seeded under "champions" — a champions-present
//     reference row, so the format carries reference detail too (parallel to
//     the gen-7 slice's `move/hidden-power`).
// ---------------------------------------------------------------------------

const CHAMPIONS = "champions";

/** Garchomp, shared verbatim into the champions format (same real stats). */
export const POKEMON_SEED_CHAMPIONS: PokemonSeed[] = POKEMON_SEED.filter(
  (p) => p.id === "garchomp",
);

/** Names index backing resolve_entity for the champions format. */
export const SEARCHABLE_NAMES_SEED_CHAMPIONS: SearchableNameSeed[] = [
  { kind: "pokemon", slug: "garchomp", display_name: "Garchomp" },
  { kind: "move", slug: "earthquake", display_name: "Earthquake" },
];

/**
 * `flamethrower` is real move data seeded ONLY under scarlet-violet (the
 * champions-absent probe); `earthquake` is seeded under champions (present).
 * (Deliberately NOT `dragon-claw`/`earthquake`-under-SV — those resource_keys
 * are already claimed by test/fixtures/entity-refs.ts's `after` hook, which
 * layers onto this same "tools" seed in other suites; reusing them would
 * collide on the reference_cache PK.)
 */
export const REFERENCE_CACHE_SEED_SV_EXTRA: ReferenceCacheSeed[] = [
  {
    resource_key: "move/flamethrower",
    resource_kind: "move",
    endpoint_url: "@pkmn/dex (Pokémon Showdown)",
    payload: {
      found: true,
      display_name: "Flamethrower",
      type: "fire",
      damage_class: "special",
      power: 90,
      accuracy: 100,
      pp: 15,
      priority: 0,
      target: "selected-pokemon",
      effect_short: "May burn the target.",
      effect_full: "Inflicts regular damage. Has a 10% chance to burn the target.",
    },
  },
];

export const REFERENCE_CACHE_SEED_CHAMPIONS: ReferenceCacheSeed[] = [
  {
    resource_key: "move/earthquake",
    resource_kind: "move",
    endpoint_url: "@pkmn/dex (Pokémon Showdown)",
    payload: {
      found: true,
      display_name: "Earthquake",
      type: "ground",
      damage_class: "physical",
      power: 100,
      accuracy: 100,
      pp: 10,
      priority: 0,
      target: "all-other-pokemon",
      effect_short: "Hits every other Pokémon on the field.",
      effect_full:
        "Inflicts regular damage. Hits every Pokémon on the field other than the user.",
    },
  },
];

// ---------------------------------------------------------------------------
// Seeder
// ---------------------------------------------------------------------------

/**
 * Insert the full fixture into a freshly-migrated Postgres schema via Drizzle.
 * Idempotent on a fresh schema; the caller must supply an empty, migrated handle
 * (typically `createPgSchema({ seed: "tools" })` does this).
 */
export async function seedToolsFixture(db: ToolsFixtureDb): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx
      .insert(pokemon)
      .values(POKEMON_SEED.map((p) => ({ ...p, format: SV })));
    await tx.insert(learnset).values(LEARNSET_SEED);
    await tx
      .insert(searchable_names)
      .values(SEARCHABLE_NAMES_SEED.map((n) => ({ ...n, format: SV })));
    await tx.insert(reference_cache).values(
      REFERENCE_CACHE_SEED.map((r) => ({
        format: SV,
        resource_key: r.resource_key,
        resource_kind: r.resource_kind,
        payload: JSON.stringify(r.payload),
        endpoint_url: r.endpoint_url,
        fetched_at: now,
      })),
    );
    await tx.insert(ingest_meta).values({
      format: SV,
      last_success_at: now,
      pokemon_count: POKEMON_SEED.length,
      learnset_count: LEARNSET_SEED.length,
      names_count: SEARCHABLE_NAMES_SEED.length,
      schema_version: "2",
    });

    // --- Gen-7 slice (generation-scope) — a second row-set under "gen-7" -----
    // Additive: leaves the scarlet-violet rows above untouched. The gen-7
    // ingest_meta row is what makes the index read as "available" for the format.
    await tx
      .insert(pokemon)
      .values(POKEMON_SEED_GEN7.map((p) => ({ ...p, format: GEN7 })));
    await tx.insert(learnset).values(LEARNSET_SEED_GEN7);
    await tx
      .insert(searchable_names)
      .values(SEARCHABLE_NAMES_SEED_GEN7.map((n) => ({ ...n, format: GEN7 })));
    await tx.insert(reference_cache).values(
      REFERENCE_CACHE_SEED_GEN7.map((r) => ({
        format: GEN7,
        resource_key: r.resource_key,
        resource_kind: r.resource_kind,
        payload: JSON.stringify(r.payload),
        endpoint_url: r.endpoint_url,
        fetched_at: now,
      })),
    );
    await tx.insert(ingest_meta).values({
      format: GEN7,
      last_success_at: now,
      pokemon_count: POKEMON_SEED_GEN7.length,
      learnset_count: LEARNSET_SEED_GEN7.length,
      names_count: SEARCHABLE_NAMES_SEED_GEN7.length,
      schema_version: "2",
    });

    // --- Champions slice (exists_in_standard) — a second row-set under -------
    // "champions", additive: leaves the scarlet-violet rows above untouched
    // (the extra SV reference row is inserted separately, into the SV format).
    await tx.insert(reference_cache).values(
      REFERENCE_CACHE_SEED_SV_EXTRA.map((r) => ({
        format: SV,
        resource_key: r.resource_key,
        resource_kind: r.resource_kind,
        payload: JSON.stringify(r.payload),
        endpoint_url: r.endpoint_url,
        fetched_at: now,
      })),
    );
    await tx
      .insert(pokemon)
      .values(POKEMON_SEED_CHAMPIONS.map((p) => ({ ...p, format: CHAMPIONS })));
    await tx
      .insert(searchable_names)
      .values(
        SEARCHABLE_NAMES_SEED_CHAMPIONS.map((n) => ({ ...n, format: CHAMPIONS })),
      );
    await tx.insert(reference_cache).values(
      REFERENCE_CACHE_SEED_CHAMPIONS.map((r) => ({
        format: CHAMPIONS,
        resource_key: r.resource_key,
        resource_kind: r.resource_kind,
        payload: JSON.stringify(r.payload),
        endpoint_url: r.endpoint_url,
        fetched_at: now,
      })),
    );
    await tx.insert(ingest_meta).values({
      format: CHAMPIONS,
      last_success_at: now,
      pokemon_count: POKEMON_SEED_CHAMPIONS.length,
      learnset_count: 0,
      names_count: SEARCHABLE_NAMES_SEED_CHAMPIONS.length,
      schema_version: "2",
    });
  });
}

// ---------------------------------------------------------------------------
// Context helper
// ---------------------------------------------------------------------------

type LoadedTools = {
  dispatch: (
    name: string,
    args: unknown,
    ctx: AgentContext,
  ) => Promise<unknown>;
  ctx: AgentContext;
};

/**
 * Build the public tool surface against the (already-seeded) singleton DB.
 *
 * `dispatch` comes from the Phase-4 barrel src/agent/tools/index.ts (its public
 * contract). The AgentContext is built via the real factory in
 * src/agent/context.ts when present; if that module/export is not available yet,
 * a minimal ctx (singleton db handle + silent logger) is used so the DB-backed
 * tools that read the shared connection still run.
 *
 * NOTE for the Phase-4 / assembly author: this helper probes a few likely
 * factory names (createAgentContext / buildAgentContext / makeAgentContext /
 * createContext / default). If your factory is named differently, add it to the
 * list — the oracle does not otherwise depend on the factory's internals.
 */
export async function loadToolSurface(): Promise<LoadedTools> {
  const toolsMod = (await import("@/agent/tools")) as {
    dispatch: LoadedTools["dispatch"];
  };

  const ctx = await buildOracleContext();
  return { dispatch: toolsMod.dispatch, ctx };
}

async function buildOracleContext(): Promise<AgentContext> {
  const factoryNames = [
    "createAgentContext",
    "buildAgentContext",
    "makeAgentContext",
    "createContext",
    "default",
  ];

  try {
    const mod = (await import("@/agent/context")) as Record<string, unknown>;
    const factory = factoryNames
      .map((n) => mod[n])
      .find((f): f is (...a: unknown[]) => unknown => typeof f === "function");

    if (factory) {
      for (const args of [[{ requestId: "oracle" }], ["oracle"], []]) {
        try {
          const candidate = await Promise.resolve(
            factory(...(args as unknown[])),
          );
          if (
            candidate &&
            typeof candidate === "object" &&
            "db" in (candidate as Record<string, unknown>)
          ) {
            return candidate as AgentContext;
          }
        } catch {
          // try the next call signature
        }
      }
    }
  } catch {
    // context.ts not present yet — fall through to the minimal ctx
  }

  return buildMinimalContext();
}

async function buildMinimalContext(): Promise<AgentContext> {
  const dbMod = (await import("@/data/db")) as { db: unknown };
  const { default: pino } = await import("pino");
  const logger = pino({ level: "silent" });
  return {
    db: { db: dbMod.db },
    logger,
    requestId: "oracle",
    mode: "standard",
  } as unknown as AgentContext;
}
