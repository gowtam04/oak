/**
 * Documented modifier catalog (`modifiers.ts`) — ADR-3 / CALC-BR-3.
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P2 TDD).
 *
 * Supported knobs (CALC-BR-3):
 *   - Weather: sun, rain, sand, snow (and off)
 *   - Screens: Reflect, Light Screen (and off)
 *   - Items: Life Orb, Choice Band, Choice Specs, Expert Belt
 *
 * Each listed item / weather / screen must contribute a real multiplier — not
 * `1.0` pretending it applied. Named leftovers (ability / item / knob) go in
 * `unsupported[]` and must NOT be folded into `other_modifier` as
 * 1.0-pretending-it-applied.
 *
 * Export under test: `resolveModifiers` (architecture file `modifiers.ts`;
 * exact name was unspecified — this is the name the engine will call).
 *
 * Do not require Smogon-calc parity; only that catalog knobs change the
 * multiplier and unsupported names stay honest.
 *
 * Requirement refs: CALC-US-4, CALC-AC-4.2, CALC-AC-4.3, CALC-BR-3.
 */

import { describe, expect, it } from "vitest";

import { resolveModifiers } from "./modifiers";

function namesOf(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

describe("resolveModifiers — documented catalog (CALC-BR-3)", () => {
  it("returns other_modifier + applied + unsupported[]", () => {
    const result = resolveModifiers({});
    expect(typeof result.other_modifier).toBe("number");
    expect(result.applied).toBeDefined();
    expect(Array.isArray(result.unsupported)).toBe(true);
    expect(result.other_modifier).toBe(1);
    expect(result.unsupported).toEqual([]);
  });

  it("applies Life Orb as a real offensive multiplier (not 1.0 pretending)", () => {
    for (const item of ["Life Orb", "life-orb"]) {
      const result = resolveModifiers({ item });
      expect(result.other_modifier, item).not.toBe(1);
      expect(result.other_modifier, item).toBeGreaterThan(1);
      expect(namesOf(result.applied)).toMatch(/life[\s-]?orb/);
      expect(result.unsupported.map((s) => s.toLowerCase())).not.toContain(
        item.toLowerCase(),
      );
    }
  });

  it("applies Choice Band as a real offensive multiplier (physical)", () => {
    for (const item of ["Choice Band", "choice-band"]) {
      const result = resolveModifiers({ item, category: "physical" });
      expect(result.other_modifier, item).not.toBe(1);
      expect(result.other_modifier, item).toBeGreaterThan(1);
      expect(namesOf(result.applied)).toMatch(/choice[\s-]?band/);
    }
  });

  it("applies Choice Specs as a real offensive multiplier (special)", () => {
    for (const item of ["Choice Specs", "choice-specs"]) {
      const result = resolveModifiers({ item, category: "special" });
      expect(result.other_modifier, item).not.toBe(1);
      expect(result.other_modifier, item).toBeGreaterThan(1);
      expect(namesOf(result.applied)).toMatch(/choice[\s-]?specs/);
    }
  });

  it("applies Expert Belt as a real offensive multiplier when the hit is super-effective", () => {
    for (const item of ["Expert Belt", "expert-belt"]) {
      const result = resolveModifiers({ item, typeEffectiveness: 2 });
      expect(result.other_modifier, item).not.toBe(1);
      expect(result.other_modifier, item).toBeGreaterThan(1);
      expect(namesOf(result.applied)).toMatch(/expert[\s-]?belt/);
    }
  });

  it("applies sun as a real weather multiplier for a Fire move", () => {
    const result = resolveModifiers({ weather: "sun", moveType: "fire" });
    expect(result.other_modifier).not.toBe(1);
    expect(namesOf({ applied: result.applied, weather: "sun" })).toMatch(/sun/);
    expect(result.unsupported.map((s) => s.toLowerCase())).not.toContain("sun");
  });

  it("applies rain as a real weather multiplier for a Water move", () => {
    const result = resolveModifiers({ weather: "rain", moveType: "water" });
    expect(result.other_modifier).not.toBe(1);
    expect(result.unsupported.map((s) => s.toLowerCase())).not.toContain(
      "rain",
    );
  });

  it("applies sand as a real weather multiplier (catalog knob, not 1.0 pretending)", () => {
    const result = resolveModifiers({ weather: "sand", moveType: "rock" });
    expect(result.other_modifier).not.toBe(1);
    expect(result.unsupported.map((s) => s.toLowerCase())).not.toContain(
      "sand",
    );
  });

  it("applies snow as a real weather multiplier (catalog knob, not 1.0 pretending)", () => {
    const result = resolveModifiers({ weather: "snow", moveType: "ice" });
    expect(result.other_modifier).not.toBe(1);
    expect(result.unsupported.map((s) => s.toLowerCase())).not.toContain(
      "snow",
    );
  });

  it("applies Reflect as a real screen multiplier on a physical hit", () => {
    const result = resolveModifiers({ reflect: true, category: "physical" });
    expect(result.other_modifier).not.toBe(1);
    expect(result.other_modifier).toBeLessThan(1);
    expect(namesOf(result.applied)).toMatch(/reflect/);
  });

  it("applies Light Screen as a real screen multiplier on a special hit", () => {
    const result = resolveModifiers({
      lightScreen: true,
      category: "special",
    });
    expect(result.other_modifier).not.toBe(1);
    expect(result.other_modifier).toBeLessThan(1);
    expect(namesOf(result.applied)).toMatch(/light[\s-]?screen/);
  });
});

describe("resolveModifiers — unsupported leftovers (CALC-BR-3, CALC-AC-4.3)", () => {
  it.each([
    { item: "leftovers" },
    { item: "Leftovers" },
    { item: "choice scarf" },
    { item: "choice-scarf" },
    { ability: "multiscale" },
    { ability: "Multiscale" },
  ])(
    "lists leftover knob %o in unsupported[] and does not change other_modifier vs baseline",
    (input) => {
      const baseline = resolveModifiers({});
      const result = resolveModifiers(input);
      expect(result.other_modifier).toBe(baseline.other_modifier);
      expect(result.other_modifier).toBe(1);
      const blob = result.unsupported.join(" ").toLowerCase();
      const needle =
        "item" in input
          ? String(input.item).toLowerCase()
          : String(input.ability).toLowerCase();
      // slug or display — "choice-scarf" / "choice scarf" / leftovers / multiscale
      expect(blob.replace(/-/g, " ")).toContain(needle.replace(/-/g, " "));
    },
  );

  it("keeps a catalog item applied while still listing leftovers as unsupported", () => {
    const result = resolveModifiers({
      item: "life-orb",
      ability: "multiscale",
    });
    expect(result.other_modifier).not.toBe(1);
    expect(result.other_modifier).toBeGreaterThan(1);
    const unsupported = result.unsupported.map((s) =>
      s.toLowerCase().replace(/-/g, " "),
    );
    expect(unsupported.some((s) => s.includes("multiscale"))).toBe(true);
    expect(unsupported.some((s) => s.includes("life orb"))).toBe(false);
  });
});
