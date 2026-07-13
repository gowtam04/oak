import { describe, it, expect } from "vitest";

import { applyDefensiveModifiers } from "./ability-matchups";
import { defMultiplier } from "@/agent/formulas/type-chart";

const GARCHOMP_LIKE = {
  weak_to: ["ice", "dragon", "fairy"],
  resists: ["fire", "poison", "rock"],
  immune_to: ["electric"],
};

describe("applyDefensiveModifiers", () => {
  it("Levitate grants Ground immunity", () => {
    const base = {
      weak_to: ["water", "grass", "ice"],
      resists: [],
      immune_to: [],
    };
    const { profile, notes } = applyDefensiveModifiers(base, {
      ability: "levitate",
    });
    expect(defMultiplier(profile, "ground")).toBe(0);
    expect(profile.immune_to).toContain("ground");
    expect(notes.some((n) => n.includes("levitate"))).toBe(true);
  });

  it("Flash Fire grants Fire immunity even if type-weak", () => {
    const base = {
      weak_to: ["fire", "flying", "rock"],
      resists: ["grass"],
      immune_to: [],
    };
    const { profile } = applyDefensiveModifiers(base, {
      ability: "flash-fire",
    });
    expect(defMultiplier(profile, "fire")).toBe(0);
    expect(profile.weak_to).not.toContain("fire");
  });

  it("Water Absorb / Volt Absorb immunities", () => {
    const base = {
      weak_to: ["electric", "grass"],
      resists: [],
      immune_to: [],
    };
    expect(
      defMultiplier(
        applyDefensiveModifiers(base, { ability: "water-absorb" }).profile,
        "water",
      ),
    ).toBe(0);
    expect(
      defMultiplier(
        applyDefensiveModifiers(base, { ability: "volt-absorb" }).profile,
        "electric",
      ),
    ).toBe(0);
  });

  it("Thick Fat halves Fire and Ice", () => {
    const base = {
      weak_to: ["fire", "ice"],
      resists: [],
      immune_to: [],
    };
    const { profile } = applyDefensiveModifiers(base, {
      ability: "thick-fat",
    });
    // Was 2× → 1× (neutral — omitted from weak/resists)
    expect(defMultiplier(profile, "fire")).toBe(1);
    expect(defMultiplier(profile, "ice")).toBe(1);
  });

  it("Air Balloon grants Ground immunity with a static-analysis note", () => {
    const { profile, notes } = applyDefensiveModifiers(GARCHOMP_LIKE, {
      item: "air-balloon",
    });
    expect(defMultiplier(profile, "ground")).toBe(0);
    expect(notes.some((n) => n.includes("air-balloon"))).toBe(true);
  });

  it("no ability/item leaves profile classification intact", () => {
    const { profile, notes } = applyDefensiveModifiers(GARCHOMP_LIKE, {});
    expect(profile.immune_to).toContain("electric");
    expect(profile.weak_to).toContain("ice");
    expect(notes).toHaveLength(0);
  });
});
