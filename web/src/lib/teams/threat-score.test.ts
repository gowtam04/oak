import { describe, it, expect } from "vitest";

import { scoreThreats } from "./threat-score";
import type { TypeProfileLite } from "./analyze-core";

const DEF: Record<string, TypeProfileLite["defensive"]> = {
  water: {
    weak_to: ["electric", "grass"],
    resists: ["fire", "water", "ice", "steel"],
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
  electric: {
    weak_to: ["ground"],
    resists: ["electric", "flying", "steel"],
    immune_to: [],
  },
  grass: {
    weak_to: ["fire", "ice", "poison", "flying", "bug"],
    resists: ["water", "electric", "grass", "ground"],
    immune_to: [],
  },
  dragon: {
    weak_to: ["ice", "dragon", "fairy"],
    resists: ["fire", "water", "grass", "electric"],
    immune_to: [],
  },
};

function chart(types: string[]): Map<string, TypeProfileLite> {
  const map = new Map<string, TypeProfileLite>();
  for (const t of types) {
    map.set(t, {
      defensive: DEF[t] ?? { weak_to: [], resists: [], immune_to: [] },
      offensive: {
        super_effective_against: [],
        not_very_effective_against: [],
        no_effect_against: [],
      },
    });
  }
  return map;
}

const TYPES = ["water", "ground", "fire", "electric", "grass", "dragon"];

describe("scoreThreats", () => {
  it("marks a threat unanswered when many members are weak to its STAB", () => {
    const rows = scoreThreats({
      format: "scarlet-violet",
      typeProfiles: chart(TYPES),
      members: [
        { slug: "garchomp", types: ["dragon", "ground"] },
        { slug: "dragonite", types: ["dragon"] },
        { slug: "salamence", types: ["dragon"] },
      ],
      candidates: [
        {
          species: "kyurem",
          display_name: "Kyurem",
          types: ["dragon"], // ice would be better but dragon is in chart
          rank: 1,
          usage_pct: 20,
        },
      ],
    });
    // Dragon STAB: all three are weak or neutral to dragon — garchomp/dragonite weak.
    expect(rows[0]!.status).toMatch(/unanswered|soft/);
    expect(rows[0]!.species).toBe("kyurem");
  });

  it("marks answered when multiple members resist the threat STAB", () => {
    const rows = scoreThreats({
      format: "scarlet-violet",
      typeProfiles: chart(TYPES),
      members: [
        { slug: "gastrodon", types: ["water", "ground"] },
        { slug: "swampert", types: ["water", "ground"] },
        { slug: "hippowdon", types: ["ground"] },
      ],
      candidates: [
        {
          species: "zapdos",
          display_name: "Zapdos",
          types: ["electric"],
          rank: 5,
        },
      ],
    });
    // Ground immunity to Electric on all three.
    expect(rows[0]!.status).toBe("answered");
  });

  it("returns empty for empty inputs", () => {
    expect(
      scoreThreats({
        format: "scarlet-violet",
        typeProfiles: chart(TYPES),
        members: [],
        candidates: [{ species: "x", display_name: "X", types: ["fire"] }],
      }),
    ).toEqual([]);
  });
});
