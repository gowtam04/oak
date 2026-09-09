/**
 * Portable `explainCalcPrompt(scenario, result)` — the deterministic chat
 * message for "Explain this calc" (`api-design.md`).
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P2 TDD).
 *
 * Requirement refs: CALC-US-8 (message body only). CALC-AC-8.3 is later UI
 * (turn / overlay); this file only locks the portable string.
 *
 * Template (api-design.md):
 *
 *   Explain this damage estimate (do not re-roll unless needed).
 *   Format: {format}
 *   Attacker: {species} @ {item} / {ability} / {nature} / {evs} / L{level} / Tera {tera}
 *   Defender: …
 *   Move: {move}
 *   Field: {weather}, screens {…}
 *   Estimate: {min}–{max} ({pmin}–{pmax}%); {hits}HKO
 *   Unsupported: {list}
 */

import { describe, expect, it } from "vitest";

import { explainCalcPrompt } from "./explain-prompt";

const SCENARIO = {
  format: "scarlet-violet" as const,
  attacker: {
    species: "garchomp",
    item: "life-orb",
    ability: "rough-skin",
    nature: "jolly",
    evs: { atk: 252, spe: 252, hp: 4 },
    level: 100,
    tera: "ground",
  },
  defender: {
    species: "farigiraf",
    item: "leftovers",
    ability: "armor-tail",
    nature: "modest",
    evs: { hp: 252, spd: 252 },
    level: 100,
    tera: "fairy",
  },
  move: { slug: "earthquake", name: "Earthquake" },
  field: {
    weather: "sun" as const,
    reflect: true,
    light_screen: false,
  },
};

const RESULT = {
  ok: true as const,
  format: "scarlet-violet" as const,
  estimate: {
    min_damage: 100,
    max_damage: 120,
    percent_min: 30,
    percent_max: 36,
    ko: { hits: 3 },
    is_estimate: true as const,
  },
  breakdown: "estimate",
  applied: {
    stab: true,
    type_effectiveness: 1,
    other_modifier: 1.3,
    weather: "sun",
    screens: ["Reflect"],
    item: "life-orb",
    unsupported: ["leftovers"],
  },
};

describe("explainCalcPrompt", () => {
  it("returns the deterministic Explain message with format, sides, move, field, estimate range, and unsupported list", () => {
    const prompt = explainCalcPrompt(SCENARIO, RESULT);

    expect(typeof prompt).toBe("string");
    expect(prompt.startsWith("Explain this damage estimate (do not re-roll unless needed).")).toBe(
      true,
    );

    expect(prompt).toMatch(/Format:\s*scarlet-violet/);

    expect(prompt).toMatch(/Attacker:/);
    expect(prompt).toMatch(/garchomp/i);
    expect(prompt).toMatch(/life-orb/i);
    expect(prompt).toMatch(/rough-skin/i);
    expect(prompt).toMatch(/jolly/i);
    expect(prompt).toMatch(/L100/);
    expect(prompt).toMatch(/Tera\s+ground/i);

    expect(prompt).toMatch(/Defender:/);
    expect(prompt).toMatch(/farigiraf/i);
    expect(prompt).toMatch(/leftovers/i);
    expect(prompt).toMatch(/armor-tail/i);
    expect(prompt).toMatch(/modest/i);
    expect(prompt).toMatch(/Tera\s+fairy/i);

    expect(prompt).toMatch(/Move:\s*(earthquake|Earthquake)/);
    expect(prompt).toMatch(/Field:/);
    expect(prompt).toMatch(/sun/i);
    expect(prompt).toMatch(/screens/i);
    expect(prompt).toMatch(/Reflect/i);

    expect(prompt).toMatch(
      /Estimate:\s*100\s*[–-]\s*120\s*\(\s*30\s*[–-]\s*36\s*%\s*\)\s*;\s*3\s*HKO/i,
    );

    expect(prompt).toMatch(/Unsupported:/);
    expect(prompt).toMatch(/leftovers/i);
  });

  it("is a normal chat-message string (not JSON / not an OakAnswer)", () => {
    const prompt = explainCalcPrompt(SCENARIO, RESULT);
    expect(prompt.includes("\n")).toBe(true);
    expect(() => JSON.parse(prompt)).toThrow();
  });
});
