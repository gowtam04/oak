/**
 * Pure unit tests for the team-analysis core (`analyzeTeam`). No DB — the type
 * chart + resolved members are constructed inline, so these pin the type math:
 * the defensive matrix (weak/resist/immune classification, incl. 4× and
 * immunities), offensive coverage (super-effective union, uncovered), speed-tier
 * ordering, and the format-awareness that gives gen-1 its 15-type chart.
 */

import { describe, it, expect } from "vitest";

import type { StatSpread } from "@/data/teams/team-schema";
import type { SpriteRef } from "@/data/repos/pokedex-repo";
import {
  analyzeTeam,
  type AnalysisMemberSource,
  type TypeProfileLite,
} from "./analyze-core";

const ZERO_EVS: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** Minimal single-type defensive profiles for the types these tests touch. */
const DEF: Record<string, TypeProfileLite["defensive"]> = {
  dragon: {
    weak_to: ["ice", "dragon", "fairy"],
    resists: ["fire", "water", "grass", "electric"],
    immune_to: [],
  },
  ground: {
    weak_to: ["water", "grass", "ice"],
    resists: ["poison", "rock"],
    immune_to: ["electric"],
  },
  fire: {
    weak_to: ["water", "ground", "rock"],
    resists: ["fire", "grass", "ice", "bug", "steel", "fairy"],
    immune_to: [],
  },
  water: {
    weak_to: ["electric", "grass"],
    resists: ["fire", "water", "ice", "steel"],
    immune_to: [],
  },
  normal: { weak_to: ["fighting"], resists: [], immune_to: ["ghost"] },
};

/** Offensive super-effective lists (only what these tests assert on). */
const OFF: Record<string, string[]> = {
  ground: ["fire", "electric", "poison", "rock", "steel"],
  dragon: ["dragon"],
  fire: ["grass", "ice", "bug", "steel"],
  water: ["fire", "ground", "rock"],
  normal: [],
};

/** Build a type-chart map from a list of type slugs (its keys = battle types). */
function chart(types: string[]): Map<string, TypeProfileLite> {
  const map = new Map<string, TypeProfileLite>();
  for (const t of types) {
    map.set(t, {
      defensive: DEF[t] ?? { weak_to: [], resists: [], immune_to: [] },
      offensive: {
        super_effective_against: OFF[t] ?? [],
        not_very_effective_against: [],
        no_effect_against: [],
      },
    });
  }
  return map;
}

/** The full 18-type set (modern chart). */
const ALL_18 = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

/** The gen-1 chart: 18 minus dark/steel/fairy = 15 types. */
const GEN1_15 = ALL_18.filter(
  (t) => t !== "dark" && t !== "steel" && t !== "fairy",
);

function baseStats(spe: number): SpriteRef["base_stats"] {
  return {
    hp: 100,
    attack: 100,
    defense: 100,
    special_attack: 100,
    special_defense: 100,
    speed: spe,
  };
}

function member(
  slug: string,
  types: string[],
  spe: number,
  moves: AnalysisMemberSource["moves"] = [],
): AnalysisMemberSource {
  return {
    input: { evs: ZERO_EVS, nature: null, level: 50 },
    slug,
    ref: {
      display_name: slug,
      sprite_url: "",
      dex_number: 1,
      types,
      base_stats: baseStats(spe),
    },
    moves,
  };
}

describe("analyzeTeam — defensive matrix", () => {
  it("classifies Garchomp (dragon/ground) as 4× weak to ice and immune to electric", () => {
    const team = [member("garchomp", ["dragon", "ground"], 102)];
    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");

    const ice = result.defense.find((r) => r.type === "ice")!;
    expect(ice.weak).toContain("garchomp"); // dragon 2× × ground 2× = 4×

    const electric = result.defense.find((r) => r.type === "electric")!;
    expect(electric.immune).toContain("garchomp"); // ground immunity dominates
    expect(electric.weak).not.toContain("garchomp");
  });

  it("emits one defense row per battle type of the format's chart", () => {
    const team = [member("garchomp", ["dragon", "ground"], 102)];
    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");
    expect(result.defense).toHaveLength(18);
  });
});

describe("analyzeTeam — offensive coverage", () => {
  it("Earthquake (ground) covers fire/electric/rock/steel; uncovered excludes them", () => {
    const team = [
      member("garchomp", ["dragon", "ground"], 102, [
        { slug: "earthquake", type: "ground", damageClass: "physical" },
      ]),
    ];
    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");

    const coveredTypes = result.offense.covered.map((c) => c.type);
    expect(coveredTypes).toEqual(
      expect.arrayContaining(["fire", "electric", "rock", "steel", "poison"]),
    );
    for (const t of ["fire", "electric", "rock", "steel"]) {
      expect(result.offense.uncovered).not.toContain(t);
    }
    // The move + member are attributed on the covered row.
    const fire = result.offense.covered.find((c) => c.type === "fire")!;
    expect(fire.by).toContainEqual({ member: "garchomp", move: "earthquake" });
  });

  it("reports uncovered types no damaging move hits, and skips status moves", () => {
    const team = [
      member("garchomp", ["dragon", "ground"], 102, [
        { slug: "earthquake", type: "ground", damageClass: "physical" },
        { slug: "swords-dance", type: "normal", damageClass: "status" },
      ]),
    ];
    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");
    // Ground alone hits fire/electric/poison/rock/steel — everything else is
    // uncovered (grass, ice, water, …). The status move contributes nothing.
    expect(result.offense.uncovered).toContain("grass");
    expect(result.offense.uncovered).toContain("water");
    const coveredTypes = result.offense.covered.map((c) => c.type);
    expect(coveredTypes).not.toContain("water");
  });
});

describe("analyzeTeam — speed tiers", () => {
  it("orders members by computed Speed, fastest first", () => {
    const team = [
      member("slowbro", ["water"], 30),
      member("garchomp", ["dragon", "ground"], 102),
      member("ninetales", ["fire"], 100),
    ];
    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");
    const order = result.speed_tiers.map((t) => t.member);
    expect(order).toEqual(["garchomp", "ninetales", "slowbro"]);
    // Descending speeds.
    const speeds = result.speed_tiers.map((t) => t.speed);
    expect([...speeds].sort((a, b) => b - a)).toEqual(speeds);
  });
});

describe("analyzeTeam — per-member readout + degradation", () => {
  it("degrades an unresolved member to { found: false } without failing the call", () => {
    const team: AnalysisMemberSource[] = [
      member("garchomp", ["dragon", "ground"], 102),
      { input: { evs: ZERO_EVS, nature: null, level: 50 }, slug: "", ref: null, moves: [] },
    ];
    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");
    expect(result.members).toHaveLength(2);
    expect(result.members[1]).toEqual({ slug: "", found: false });
    const chomp = result.members[0];
    if (!chomp.found) throw new Error("expected found member");
    expect(chomp.bst).toBe(602); // 100×5 + 102 speed
    expect(chomp.types).toEqual(["dragon", "ground"]);
    expect(chomp.stats.spe).toBeGreaterThan(0);
  });
});

describe("analyzeTeam — Champions format", () => {
  it("computes stats via the Champions Stat-Point path and still orders speed", () => {
    const team = [
      member("dragapult", ["dragon"], 142),
      member("garchomp", ["dragon", "ground"], 102),
    ];
    const result = analyzeTeam(team, chart(ALL_18), "champions");
    // Champions bakes Lv50/IV31; higher base Speed still sorts first.
    expect(result.speed_tiers[0]!.member).toBe("dragapult");
    const first = result.members[0];
    if (!first.found) throw new Error("expected found");
    expect(first.stats.spe).not.toBeNull();
  });
});

describe("analyzeTeam — gen-1 15-type chart", () => {
  it("never surfaces dark/steel/fairy (absent from the gen-1 chart)", () => {
    const team = [
      member("charizard", ["fire"], 100, [
        { slug: "flamethrower", type: "fire", damageClass: "special" },
      ]),
    ];
    const result = analyzeTeam(team, chart(GEN1_15), "gen-1");

    // 15 defensive rows; none of the three modern types.
    expect(result.defense).toHaveLength(15);
    const defTypes = result.defense.map((r) => r.type);
    for (const t of ["dark", "steel", "fairy"]) {
      expect(defTypes).not.toContain(t);
    }
    // Fire's SE-vs-steel is dropped because steel isn't a gen-1 battle type.
    const coveredTypes = result.offense.covered.map((c) => c.type);
    expect(coveredTypes).not.toContain("steel");
    expect(coveredTypes).toContain("grass");
    // Uncovered is drawn only from the 15-type chart.
    for (const t of ["dark", "steel", "fairy"]) {
      expect(result.offense.uncovered).not.toContain(t);
    }
  });
});

describe("analyzeTeam — ability-aware defense + roles", () => {
  it("Levitate removes Ground from the weak list", () => {
    // Fire is weak to Ground in this fixture chart; Levitate should flip it.
    const team: AnalysisMemberSource[] = [
      {
        ...member("rotom", ["fire"], 86),
        ability: "levitate",
        moves: [{ slug: "overheat", type: "fire", damageClass: "special" }],
      },
    ];
    const without = analyzeTeam(
      [{ ...member("rotom", ["fire"], 86), ability: null, moves: [] }],
      chart(ALL_18),
      "scarlet-violet",
    );
    expect(without.defense.find((r) => r.type === "ground")!.weak).toContain(
      "rotom",
    );

    const result = analyzeTeam(team, chart(ALL_18), "scarlet-violet");
    const ground = result.defense.find((r) => r.type === "ground")!;
    expect(ground.weak).not.toContain("rotom");
    expect(ground.immune).toContain("rotom");
    expect(result.defense_notes.some((n) => n.includes("levitate"))).toBe(true);
  });

  it("detects Tailwind as speed control on Champions", () => {
    const team: AnalysisMemberSource[] = [
      {
        ...member("whimsicott", ["grass", "fairy"], 116, [
          { slug: "tailwind", type: "flying", damageClass: "status" },
          { slug: "moonblast", type: "fairy", damageClass: "special" },
        ]),
        ability: "prankster",
      },
    ];
    const result = analyzeTeam(team, chart(ALL_18), "champions");
    expect(result.roles_present).toContain("speed_control");
    expect(result.roles_missing).not.toContain("speed_control");
    expect(result.physical_special.special_moves).toBe(1);
  });
});

