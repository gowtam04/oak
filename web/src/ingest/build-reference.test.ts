/**
 * Unit tests for src/ingest/build-reference.ts — normalizeMove spread fields.
 *
 * normalizeMove is a pure function over a minimal @pkmn move shape, so we hand
 * build inputs and assert the derived `hits_allies` / `spread_modifier_doubles`
 * fields in isolation — no @pkmn, no Postgres, no network.
 *
 * Derivation under test:
 *   hits_allies            = (target === "allAdjacent")
 *   spread_modifier_doubles = damaging move with a spread target
 *                              ? (spreadModifier ?? 0.75)
 *                              : null
 */

import { describe, expect, it } from "vitest";

import { assertEffectText, moveFlagNames, normalizeMove } from "./build-reference";

type MoveInput = Parameters<typeof normalizeMove>[0];

/** Minimal damaging-move source; override per case. */
function move(over: Partial<MoveInput>): MoveInput {
  return {
    name: "Test Move",
    type: "Ground",
    category: "Physical",
    basePower: 100,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "normal",
    ...over,
  };
}

describe("normalizeMove — spread fields", () => {
  it("allAdjacent + physical → 0.75, hits_allies true", () => {
    const m = normalizeMove(move({ target: "allAdjacent", category: "Physical" }));
    expect(m.spread_modifier_doubles).toBe(0.75);
    expect(m.hits_allies).toBe(true);
  });

  it("allAdjacentFoes + physical → 0.75, hits_allies false", () => {
    const m = normalizeMove(move({ target: "allAdjacentFoes", category: "Physical" }));
    expect(m.spread_modifier_doubles).toBe(0.75);
    expect(m.hits_allies).toBe(false);
  });

  it("normal single-target + physical → no spread reduction, hits_allies false", () => {
    const m = normalizeMove(move({ target: "normal", category: "Physical" }));
    expect(m.spread_modifier_doubles).toBeNull();
    expect(m.hits_allies).toBe(false);
  });

  it("allAdjacent + status → no spread reduction, but hits_allies true", () => {
    const m = normalizeMove(
      move({ target: "allAdjacent", category: "Status", basePower: 0 }),
    );
    expect(m.spread_modifier_doubles).toBeNull();
    expect(m.hits_allies).toBe(true);
  });

  it("explicit spreadModifier on an allAdjacent damaging move is honored (0.5, not 0.75)", () => {
    const m = normalizeMove(
      move({ target: "allAdjacent", category: "Physical", spreadModifier: 0.5 }),
    );
    expect(m.spread_modifier_doubles).toBe(0.5);
    expect(m.hits_allies).toBe(true);
  });
});

describe("normalizeMove — flags", () => {
  it("emits sorted truthy Showdown flag names (Aura Sphere)", () => {
    const m = normalizeMove(
      move({
        name: "Aura Sphere",
        type: "Fighting",
        category: "Special",
        basePower: 80,
        accuracy: true,
        flags: {
          protect: 1,
          mirror: 1,
          distance: 1,
          metronome: 1,
          bullet: 1,
          pulse: 1,
        },
      }),
    );
    expect(m.flags).toEqual([
      "bullet",
      "distance",
      "metronome",
      "mirror",
      "protect",
      "pulse",
    ]);
  });

  it("drops falsy flag values and returns [] when flags are missing", () => {
    expect(moveFlagNames({ contact: 1, punch: 0, sound: undefined })).toEqual([
      "contact",
    ]);
    expect(moveFlagNames(undefined)).toEqual([]);
    expect(moveFlagNames(null)).toEqual([]);
    expect(normalizeMove(move({})).flags).toEqual([]);
  });
});

describe("assertEffectText", () => {
  it("throws on empty effect fields and passes when either is set", () => {
    expect(() =>
      assertEffectText("ability", "bulletproof", {
        effect_short: "",
        effect_full: "",
      }),
    ).toThrow(/ability\/bulletproof/);
    expect(() =>
      assertEffectText("move", "aura-sphere", {
        effect_short: "This move does not check accuracy.",
        effect_full: "",
      }),
    ).not.toThrow();
  });
});
