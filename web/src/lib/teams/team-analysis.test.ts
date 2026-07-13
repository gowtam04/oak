/**
 * Schema round-trip tests for the team-analysis wire contract. Pins the request
 * shape and the `ok | unavailable` response union so the iOS/Android DTOs (which
 * build against this file) can't silently drift.
 */

import { describe, it, expect } from "vitest";

import {
  teamAnalysisRequestSchema,
  teamAnalysisResponseSchema,
  type TeamAnalysisOk,
} from "./team-analysis";

const OK: TeamAnalysisOk = {
  status: "ok",
  format: "scarlet-violet",
  members: [
    {
      slug: "garchomp",
      found: true,
      display_name: "Garchomp",
      types: ["dragon", "ground"],
      bst: 600,
      stats: { hp: 183, atk: 130, def: 115, spa: 80, spd: 105, spe: 122 },
      level: 50,
      nature: "jolly",
    },
    { slug: "", found: false },
  ],
  defense: [
    { type: "ice", weak: ["garchomp"], resists: [], immune: [] },
    { type: "electric", weak: [], resists: [], immune: ["garchomp"] },
  ],
  offense: {
    covered: [{ type: "fire", by: [{ member: "garchomp", move: "earthquake" }] }],
    uncovered: ["water", "grass"],
  },
  speed_tiers: [{ member: "garchomp", speed: 122 }],
  notes: [
    "Abilities/items outside the curated matchup table, weather, terrain, and dynamic effects are not fully modeled.",
  ],
  roles: [{ member: "garchomp", flags: ["stealth_rock"] }],
  roles_present: ["stealth_rock"],
  roles_missing: ["hazard_removal"],
  physical_special: {
    physical_moves: 1,
    special_moves: 0,
    status_moves: 0,
    attacker_bias: "physical",
  },
  defense_notes: ["Garchomp: levitate: immune to ground"],
  threats: [
    {
      species: "kingambit",
      display_name: "Kingambit",
      usage_pct: 40,
      rank: 1,
      status: "soft",
      reasons: ["1 member(s) weak to its STAB"],
    },
  ],
  meta_attribution: "Smogon gen9ou 2026-05",
};

describe("teamAnalysisResponseSchema", () => {
  it("round-trips a full ok envelope", () => {
    const parsed = teamAnalysisResponseSchema.parse(OK);
    expect(parsed).toEqual(OK);
  });

  it("accepts a null stat and a not-found member", () => {
    const withNull: TeamAnalysisOk = {
      ...OK,
      members: [
        {
          slug: "missingno",
          found: true,
          display_name: "MissingNo.",
          types: ["normal"],
          bst: 0,
          stats: { hp: null, atk: null, def: null, spa: null, spd: null, spe: null },
          level: 50,
          nature: null,
        },
      ],
    };
    expect(() => teamAnalysisResponseSchema.parse(withNull)).not.toThrow();
  });

  it("round-trips an unavailable envelope", () => {
    const env = { status: "unavailable" as const, format: "gen-1" as const };
    expect(teamAnalysisResponseSchema.parse(env)).toEqual(env);
  });

  it("rejects an unknown status", () => {
    expect(
      teamAnalysisResponseSchema.safeParse({ status: "boom", format: "gen-1" })
        .success,
    ).toBe(false);
  });
});

describe("teamAnalysisRequestSchema", () => {
  it("accepts a valid { format, members } body", () => {
    const body = {
      format: "champions",
      members: [
        {
          species: "garchomp",
          ability: "rough-skin",
          item: "leftovers",
          moves: ["earthquake"],
          nature: "jolly",
          evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
          ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
          tera_type: null,
          level: 50,
        },
      ],
    };
    expect(teamAnalysisRequestSchema.safeParse(body).success).toBe(true);
  });

  it("rejects an unknown format", () => {
    expect(
      teamAnalysisRequestSchema.safeParse({ format: "gen1", members: [] })
        .success,
    ).toBe(false);
  });

  it("rejects a non-array members field", () => {
    expect(
      teamAnalysisRequestSchema.safeParse({
        format: "scarlet-violet",
        members: "nope",
      }).success,
    ).toBe(false);
  });
});
