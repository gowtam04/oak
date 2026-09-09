/**
 * Zod contracts for `CalcScenario` / `CalcResult` (`calc-schema.ts`).
 *
 * Production module is not required to exist yet — a failed resolve is the
 * intended red (P2 TDD).
 *
 * Requirement refs: CALC-US-4, CALC-US-5, CALC-AC-4.1, CALC-AC-4.4,
 * CALC-AC-5.1, CALC-AC-5.4, CALC-BR-2, CALC-BR-8.
 *
 * Architecture (`api-design.md` `POST /api/calc` request / success / 200-error
 * shapes): format is required and must pass `isFormat()`; a complete scenario
 * has attacker.species + defender.species + move.slug; a success result is
 * `{ ok: true }` with `estimate.is_estimate === true` and
 * `applied.unsupported: string[]`; missing species/move identity is an
 * in-domain 200 `{ ok: false, error: "incomplete" }` (not a schema 400).
 */

import { describe, expect, it } from "vitest";

import { calcResultSchema, calcScenarioSchema } from "./calc-schema";

const VALID_SCENARIO = {
  format: "scarlet-violet",
  attacker: { species: "garchomp" },
  defender: { species: "farigiraf" },
  move: { slug: "earthquake" },
};

const VALID_SUCCESS = {
  ok: true,
  format: "scarlet-violet",
  estimate: {
    min_damage: 100,
    max_damage: 120,
    percent_min: 30,
    percent_max: 36,
    ko: { hits: 3 },
    is_estimate: true,
  },
  breakdown: "floor(base × roll × STAB × type × other)",
  applied: {
    stab: true,
    type_effectiveness: 1,
    other_modifier: 1,
    unsupported: [] as string[],
  },
};

describe("calcScenarioSchema", () => {
  it("parses a valid scenario with format + attacker.species + defender.species + move.slug (CALC-US-4, CALC-AC-4.1)", () => {
    const parsed = calcScenarioSchema.safeParse(VALID_SCENARIO);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.format).toBe("scarlet-violet");
    expect(parsed.data.attacker.species).toBe("garchomp");
    expect(parsed.data.defender.species).toBe("farigiraf");
    expect(parsed.data.move.slug).toBe("earthquake");
  });

  it("accepts the documented optional set / field knobs (CALC-AC-4.1)", () => {
    const parsed = calcScenarioSchema.safeParse({
      format: "champions",
      attacker: {
        species: "garchomp",
        ability: "rough-skin",
        item: "life-orb",
        nature: "jolly",
        evs: { hp: 4 },
        ivs: { hp: 31 },
        tera: "ground",
        level: 50,
      },
      defender: {
        species: "garchomp",
        ability: null,
        item: null,
        nature: null,
        tera: null,
      },
      move: {
        slug: "earthquake",
        name: "Earthquake",
        power: 100,
        type: "ground",
        category: "physical",
      },
      field: {
        weather: "sand",
        reflect: false,
        light_screen: true,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("fails when format is missing (api-design: format required)", () => {
    const { format: _format, ...rest } = VALID_SCENARIO;
    void _format;
    expect(calcScenarioSchema.safeParse(rest).success).toBe(false);
  });

  it("fails when format is not an Oak Format (api-design: isFormat())", () => {
    expect(
      calcScenarioSchema.safeParse({ ...VALID_SCENARIO, format: "x" }).success,
    ).toBe(false);
    expect(
      calcScenarioSchema.safeParse({ ...VALID_SCENARIO, format: "gen9ou" })
        .success,
    ).toBe(false);
    expect(
      calcScenarioSchema.safeParse({ ...VALID_SCENARIO, format: "standard" })
        .success,
    ).toBe(false);
  });

  it("accepts every member of FORMATS as format", async () => {
    const { FORMATS } = await import("@/data/formats");
    for (const format of FORMATS) {
      const parsed = calcScenarioSchema.safeParse({
        ...VALID_SCENARIO,
        format,
      });
      expect(parsed.success, format).toBe(true);
    }
  });

  it("still parses when a side species or move identity is omitted so the engine can return 200 incomplete (CALC-BR-8, CALC-AC-5.4)", () => {
    expect(
      calcScenarioSchema.safeParse({
        format: "scarlet-violet",
        attacker: {},
        defender: { species: "farigiraf" },
        move: { slug: "earthquake" },
      }).success,
    ).toBe(true);
    expect(
      calcScenarioSchema.safeParse({
        format: "scarlet-violet",
        attacker: { species: "garchomp" },
        defender: {},
        move: { slug: "earthquake" },
      }).success,
    ).toBe(true);
    expect(
      calcScenarioSchema.safeParse({
        format: "scarlet-violet",
        attacker: { species: "garchomp" },
        defender: { species: "farigiraf" },
        move: {},
      }).success,
    ).toBe(true);
  });

  it("rejects an undocumented field.weather value", () => {
    expect(
      calcScenarioSchema.safeParse({
        ...VALID_SCENARIO,
        field: { weather: "hail" },
      }).success,
    ).toBe(false);
  });
});

describe("calcResultSchema", () => {
  it("parses a success result with ok: true, is_estimate: true, and applied.unsupported[] (CALC-AC-4.4, CALC-AC-5.1, CALC-BR-2)", () => {
    const parsed = calcResultSchema.safeParse(VALID_SUCCESS);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      ok: true,
      estimate: { is_estimate: true },
      applied: { unsupported: [] },
    });
  });

  it("rejects a success-shaped payload when is_estimate is not the literal true (CALC-BR-2)", () => {
    expect(
      calcResultSchema.safeParse({
        ...VALID_SUCCESS,
        estimate: { ...VALID_SUCCESS.estimate, is_estimate: false },
      }).success,
    ).toBe(false);
    expect(
      calcResultSchema.safeParse({
        ...VALID_SUCCESS,
        estimate: { ...VALID_SUCCESS.estimate, is_estimate: undefined },
      }).success,
    ).toBe(false);
  });

  it("rejects a success-shaped payload when applied.unsupported is missing (CALC-BR-3)", () => {
    const { unsupported: _u, ...applied } = VALID_SUCCESS.applied;
    void _u;
    expect(
      calcResultSchema.safeParse({ ...VALID_SUCCESS, applied }).success,
    ).toBe(false);
  });

  it("parses the incomplete error shape (CALC-BR-8, CALC-AC-5.4)", () => {
    const parsed = calcResultSchema.safeParse({
      ok: false,
      error: "incomplete",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({ ok: false, error: "incomplete" });
  });

  it("parses the other documented 200-error shapes (api-design)", () => {
    for (const error of ["unresolved", "index_unavailable", "status_move"] as const) {
      const parsed = calcResultSchema.safeParse({ ok: false, error });
      expect(parsed.success, error).toBe(true);
    }
  });

  it("accepts optional common_spreads + caveat on success (CALC-AC-5.2, CALC-BR-6)", () => {
    const parsed = calcResultSchema.safeParse({
      ...VALID_SUCCESS,
      caveat: "modern_estimate",
      common_spreads: [
        {
          label: "min",
          estimate: {
            min_damage: 80,
            max_damage: 96,
            percent_min: 40,
            percent_max: 48,
            ko: { hits: 3 },
          },
        },
        {
          label: "bulky",
          estimate: {
            min_damage: 60,
            max_damage: 72,
            percent_min: 25,
            percent_max: 30,
            ko: { hits: 4 },
          },
        },
        {
          label: "max",
          estimate: {
            min_damage: 50,
            max_damage: 60,
            percent_min: 20,
            percent_max: 24,
            ko: { hits: 5 },
          },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
