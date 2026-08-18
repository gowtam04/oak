/**
 * Portable `diffPokemonProfiles` — client compare of two `/api/entity` reads
 * (ADR-11). No compare endpoint. Not a chat turn (CMP-BR-4).
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P5 TDD).
 *
 *   diffPokemonProfiles(left, right) → PokemonCompareDiff
 *
 * Each input is a portable profile: format tag + name + types + abilities +
 * base stats + movepool slugs + matchups. Optional `speed` override is the
 * originating set's computed speed (CMP-AC-3.2); otherwise the default
 * level/nature is stated on the result.
 *
 * Diff covers: stats, types, abilities, speed, movepool set-diff
 * (only-left / only-right / shared), matchup-diff. Cross-scope pairs keep
 * both format tags (CMP-BR-2).
 *
 * Requirement refs: CMP-US-2, CMP-US-3, CMP-AC-2.1–2.3, CMP-AC-3.1–3.4,
 * CMP-BR-1, CMP-BR-2. ADR-11.
 */

import { describe, expect, it } from "vitest";

import type { Format } from "@/data/formats";

import {
  diffPokemonProfiles,
  type PokemonCompareProfile,
} from "./pokemon-compare";

const SV = "scarlet-violet" as const satisfies Format;
const GEN4 = "gen-4" as const satisfies Format;
const CHAMPIONS = "champions" as const satisfies Format;

const GARCHOMP_SV: PokemonCompareProfile = {
  format: SV,
  name: "Garchomp",
  types: ["dragon", "ground"],
  abilities: { slot1: "sand-veil", hidden: "rough-skin" },
  stats: {
    hp: 108,
    attack: 130,
    defense: 95,
    special_attack: 80,
    special_defense: 85,
    speed: 102,
  },
  movepool: ["earthquake", "dragon-claw", "swords-dance", "stealth-rock"],
  matchups: {
    defensive: {
      weak_to: ["ice", "dragon", "fairy"],
      resists: ["rock", "fire", "poison"],
      immune_to: ["electric"],
    },
    offensive: {
      super_effective_against: ["fire", "electric", "poison", "rock", "steel"],
      not_very_effective_against: ["bug", "grass", "dragon"],
      no_effect_against: ["flying"],
    },
  },
};

const GARCHOMP_GEN4: PokemonCompareProfile = {
  format: GEN4,
  name: "Garchomp",
  types: ["dragon", "ground"],
  abilities: { slot1: "sand-veil" },
  stats: {
    hp: 108,
    attack: 130,
    defense: 95,
    special_attack: 80,
    special_defense: 85,
    speed: 102,
  },
  movepool: ["earthquake", "dragon-claw", "swords-dance", "outrage"],
  matchups: {
    defensive: {
      weak_to: ["ice", "dragon"],
      resists: ["rock", "fire", "poison"],
      immune_to: ["electric"],
    },
    offensive: {
      super_effective_against: ["fire", "electric", "poison", "rock", "steel"],
      not_very_effective_against: ["bug", "grass", "dragon"],
      no_effect_against: ["flying"],
    },
  },
};

const DRAGAPULT_CHAMPIONS: PokemonCompareProfile = {
  format: CHAMPIONS,
  name: "Dragapult",
  types: ["dragon", "ghost"],
  abilities: { slot1: "clear-body", slot2: "infiltrator", hidden: "cursed-body" },
  stats: {
    hp: 88,
    attack: 120,
    defense: 75,
    special_attack: 100,
    special_defense: 75,
    speed: 142,
  },
  movepool: ["dragon-darts", "shadow-ball", "u-turn", "thunderbolt"],
  matchups: {
    defensive: {
      weak_to: ["ice", "dragon", "fairy", "ghost", "dark"],
      resists: ["fire", "water", "grass", "electric", "poison", "bug"],
      immune_to: ["normal", "fighting"],
    },
    offensive: {
      super_effective_against: ["dragon", "ghost", "psychic"],
      not_very_effective_against: ["steel", "dark"],
      no_effect_against: ["normal"],
    },
  },
};

describe("diffPokemonProfiles — cross-scope tags (CMP-US-2, CMP-BR-2)", () => {
  it("tags each column with its own format — same species, two gens (CMP-AC-2.1)", () => {
    const diff = diffPokemonProfiles(GARCHOMP_GEN4, GARCHOMP_SV);
    expect(diff.left.format).toBe(GEN4);
    expect(diff.right.format).toBe(SV);
    expect(diff.left.name).toBe("Garchomp");
    expect(diff.right.name).toBe("Garchomp");
    expect(diff.left.format).not.toBe(diff.right.format);
  });

  it("tags each column when species and scopes both differ (CMP-AC-2.2)", () => {
    const diff = diffPokemonProfiles(GARCHOMP_SV, DRAGAPULT_CHAMPIONS);
    expect(diff.left.format).toBe(SV);
    expect(diff.right.format).toBe(CHAMPIONS);
    expect(diff.left.name).toBe("Garchomp");
    expect(diff.right.name).toBe("Dragapult");
  });
});

describe("diffPokemonProfiles — stats, types, abilities (CMP-AC-3.1)", () => {
  it("compares the six base stats with a signed delta (right − left)", () => {
    const diff = diffPokemonProfiles(GARCHOMP_SV, DRAGAPULT_CHAMPIONS);
    expect(diff.stats.hp).toEqual({ left: 108, right: 88, delta: -20 });
    expect(diff.stats.attack).toEqual({ left: 130, right: 120, delta: -10 });
    expect(diff.stats.defense).toEqual({ left: 95, right: 75, delta: -20 });
    expect(diff.stats.special_attack).toEqual({
      left: 80,
      right: 100,
      delta: 20,
    });
    expect(diff.stats.special_defense).toEqual({
      left: 85,
      right: 75,
      delta: -10,
    });
    expect(diff.stats.speed).toEqual({ left: 102, right: 142, delta: 40 });
  });

  it("exposes each column's typing (CMP-AC-3.1)", () => {
    const diff = diffPokemonProfiles(GARCHOMP_SV, DRAGAPULT_CHAMPIONS);
    expect(diff.types.left).toEqual(["dragon", "ground"]);
    expect(diff.types.right).toEqual(["dragon", "ghost"]);
  });

  it("set-diffs abilities across scopes (CMP-AC-3.1)", () => {
    const diff = diffPokemonProfiles(GARCHOMP_GEN4, GARCHOMP_SV);
    expect(diff.abilities.left).toEqual(
      expect.arrayContaining(["sand-veil"]),
    );
    expect(diff.abilities.right).toEqual(
      expect.arrayContaining(["sand-veil", "rough-skin"]),
    );
    expect(diff.abilities.onlyLeft).toEqual([]);
    expect(diff.abilities.onlyRight).toEqual(["rough-skin"]);
    expect(diff.abilities.shared).toEqual(["sand-veil"]);
  });
});

describe("diffPokemonProfiles — speed (CMP-AC-3.2)", () => {
  it("uses base speed and states the default level/nature when no set is given", () => {
    const diff = diffPokemonProfiles(GARCHOMP_SV, DRAGAPULT_CHAMPIONS);
    expect(diff.speed.left).toBe(102);
    expect(diff.speed.right).toBe(142);
    expect(diff.speed.delta).toBe(40);
    expect(typeof diff.speed.level).toBe("number");
    expect(diff.speed.level).toBeGreaterThan(0);
    expect(typeof diff.speed.nature).toBe("string");
    expect(diff.speed.nature.length).toBeGreaterThan(0);
    expect(diff.speed.source).toBe("default");
  });

  it("uses a named set's speed and labels it when the originating card had a set", () => {
    const withSet: PokemonCompareProfile = {
      ...GARCHOMP_SV,
      speed: { value: 200, level: 50, nature: "jolly" },
    };
    const diff = diffPokemonProfiles(withSet, DRAGAPULT_CHAMPIONS);
    expect(diff.speed.left).toBe(200);
    expect(diff.speed.level).toBe(50);
    expect(diff.speed.nature).toBe("jolly");
    expect(diff.speed.source).toBe("set");
  });
});

describe("diffPokemonProfiles — movepool set-diff (CMP-AC-3.3)", () => {
  it("returns only-left / only-right / shared — not two full dumps", () => {
    const diff = diffPokemonProfiles(GARCHOMP_GEN4, GARCHOMP_SV);
    expect(diff.movepool.onlyLeft.sort()).toEqual(["outrage"]);
    expect(diff.movepool.onlyRight.sort()).toEqual(["stealth-rock"]);
    expect(diff.movepool.shared.sort()).toEqual(
      ["dragon-claw", "earthquake", "swords-dance"].sort(),
    );
    const dumped =
      GARCHOMP_GEN4.movepool.length + GARCHOMP_SV.movepool.length;
    expect(
      diff.movepool.onlyLeft.length +
        diff.movepool.onlyRight.length +
        diff.movepool.shared.length,
    ).toBeLessThan(dumped);
  });
});

describe("diffPokemonProfiles — matchup-diff (CMP-AC-3.4)", () => {
  it("set-diffs defensive matchups so coverage holes are visible", () => {
    const diff = diffPokemonProfiles(GARCHOMP_GEN4, GARCHOMP_SV);
    expect(diff.matchups.defensive.weak_to.onlyRight).toEqual(["fairy"]);
    expect(diff.matchups.defensive.weak_to.shared.sort()).toEqual(
      ["dragon", "ice"].sort(),
    );
    expect(diff.matchups.defensive.immune_to.shared).toEqual(["electric"]);
  });

  it("set-diffs offensive matchups across two typings", () => {
    const diff = diffPokemonProfiles(GARCHOMP_SV, DRAGAPULT_CHAMPIONS);
    expect(diff.matchups.offensive.super_effective_against.onlyLeft).toEqual(
      expect.arrayContaining(["fire", "electric", "poison", "rock", "steel"]),
    );
    expect(diff.matchups.offensive.super_effective_against.onlyRight).toEqual(
      expect.arrayContaining(["ghost", "psychic"]),
    );
    expect(diff.matchups.offensive.no_effect_against.onlyLeft).toEqual([
      "flying",
    ]);
    expect(diff.matchups.offensive.no_effect_against.onlyRight).toEqual([
      "normal",
    ]);
  });
});
