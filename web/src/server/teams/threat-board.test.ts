/**
 * Unit tests for attachThreatBoard — live Champions Doubles ladder
 * (CF-TEAM-US-4, CF-TEAM-AC-4.1–4.2, CF-INT-BR-4–7, ADR-5).
 *
 * The community client is mocked (no network). Smogon meta_repo must never
 * be consulted — if the mock is invoked the test fails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listLeaderboard = vi.hoisted(() => vi.fn());
const getUsage = vi.hoisted(() => vi.fn());
vi.mock("@/server/champions-usage/usage-client", () => ({
  listLeaderboard: (...args: unknown[]) => listLeaderboard(...args),
  getUsage: (...args: unknown[]) => getUsage(...args),
  USAGE_ATTRIBUTION: "ATTR",
}));

const spriteRefsByNames = vi.hoisted(() => vi.fn());
vi.mock("@/data/repos/pokedex-repo", () => ({
  spriteRefsByNames: (...args: unknown[]) => spriteRefsByNames(...args),
}));

const moveSummaries = vi.hoisted(() => vi.fn());
vi.mock("@/data/repos/reference-cache", () => ({
  moveSummaries: (...args: unknown[]) => moveSummaries(...args),
}));

const metaRepo = vi.hoisted(() => ({
  listMetaMonths: vi.fn(async () => {
    throw new Error("Smogon meta_repo must not be used (CF-INT-BR-7)");
  }),
  metaLeaderboard: vi.fn(async () => {
    throw new Error("Smogon meta_repo must not be used (CF-INT-BR-7)");
  }),
  metaSpeciesDetail: vi.fn(async () => {
    throw new Error("Smogon meta_repo must not be used (CF-INT-BR-7)");
  }),
}));
vi.mock("@/data/repos/meta-repo", () => metaRepo);

import type { OakDb } from "@/data/db";
import type { TeamMember } from "@/data/teams/team-schema";
import type { TypeProfileLite } from "@/lib/teams/analyze-core";
import type { TeamAnalysisOk } from "@/lib/teams/team-analysis";
import { attachThreatBoard } from "./threat-board";

const db = {} as OakDb;

const emptyDef = {
  weak_to: [] as string[],
  resists: [] as string[],
  immune_to: [] as string[],
};

function profile(over: Partial<TypeProfileLite["defensive"]> = {}): TypeProfileLite {
  return {
    defensive: { ...emptyDef, ...over },
    offensive: {
      super_effective_against: [],
      not_very_effective_against: [],
      no_effect_against: [],
    },
  };
}

const typeProfiles = new Map<string, TypeProfileLite>([
  ["dragon", profile({ weak_to: ["ice", "fairy", "dragon"] })],
  ["ground", profile({ weak_to: ["water", "ice", "grass"], immune_to: ["electric"] })],
  ["steel", profile({ resists: ["dragon", "fairy", "ice"] })],
  ["dark", profile({ weak_to: ["fighting", "fairy"] })],
  ["normal", profile()],
  ["psychic", profile({ weak_to: ["dark", "bug", "ghost"] })],
]);

function analysisOk(over: Partial<TeamAnalysisOk> = {}): TeamAnalysisOk {
  return {
    status: "ok",
    format: "champions",
    members: [
      {
        slug: "garchomp",
        found: true,
        display_name: "Garchomp",
        types: ["dragon", "ground"],
        bst: 600,
        stats: { hp: 183, atk: 150, def: 115, spa: 100, spd: 105, spe: 169 },
        level: 50,
        nature: "jolly",
      },
    ],
    defense: [],
    offense: { covered: [], uncovered: [] },
    speed_tiers: [],
    notes: [],
    roles: [],
    roles_present: [],
    roles_missing: [],
    physical_special: {
      physical_moves: 0,
      special_moves: 0,
      status_moves: 0,
      attacker_bias: "none",
    },
    defense_notes: [],
    threats: [],
    meta_attribution: null,
    ...over,
  };
}

const garchompMember: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: null,
  moves: ["earthquake"],
  nature: "jolly",
  evs: { hp: 0, atk: 32, def: 0, spa: 0, spd: 2, spe: 32 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: null,
  level: 50,
};

function spriteRef(over: Record<string, unknown> = {}) {
  return {
    display_name: "Farigiraf",
    sprite_url: "https://img.example/sprite/981.png",
    dex_number: 981,
    types: ["normal", "psychic"],
    base_stats: {
      hp: 120,
      attack: 90,
      defense: 70,
      special_attack: 110,
      special_defense: 70,
      speed: 60,
    },
    ...over,
  };
}

beforeEach(() => {
  listLeaderboard.mockReset();
  getUsage.mockReset();
  spriteRefsByNames.mockReset();
  moveSummaries.mockReset();
  moveSummaries.mockResolvedValue(new Map());
  spriteRefsByNames.mockImplementation(async (names: string[]) => {
    const out = new Map();
    for (const n of names) {
      const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (slug === "farigiraf") {
        out.set(
          n,
          spriteRef({ display_name: "Farigiraf", types: ["normal", "psychic"] }),
        );
      }
      if (slug === "garchomp") {
        out.set(
          n,
          spriteRef({
            display_name: "Garchomp",
            types: ["dragon", "ground"],
            dex_number: 445,
          }),
        );
      }
    }
    return out;
  });
});

describe("attachThreatBoard — live Doubles (CF-TEAM-AC-4.1–4.2, CF-INT-BR-4–7)", () => {
  it("builds threats from the live Doubles leaderboard, never Smogon OU (CF-TEAM-AC-4.1)", async () => {
    listLeaderboard.mockResolvedValue({
      available: true,
      season: "Current",
      fetched_at: 1_000,
      rows: [
        { rank: 1, name: "Farigiraf", usage_pct: 12.5 },
        { rank: 2, name: "Garchomp", usage_pct: 18.4 },
      ],
    });

    const out = await attachThreatBoard(
      analysisOk(),
      [garchompMember],
      "champions",
      db,
      typeProfiles,
    );

    expect(listLeaderboard).toHaveBeenCalled();
    expect(listLeaderboard.mock.calls[0][0]).toBe("doubles");
    expect(metaRepo.listMetaMonths).not.toHaveBeenCalled();
    expect(metaRepo.metaLeaderboard).not.toHaveBeenCalled();
    expect(out.threats.length).toBeGreaterThan(0);
    const species = out.threats.map((t) => t.species.toLowerCase());
    expect(species).toContain("farigiraf");
    expect(JSON.stringify(out).toLowerCase()).not.toMatch(/smogon|gen9ou/);
    expect(out.meta_attribution ?? "").not.toMatch(/smogon/i);
    expect(out.meta_attribution ?? "ATTR").toEqual(expect.any(String));
  });

  it("fail-softs to empty threats + a usage-unavailable note when the ladder is down (CF-TEAM-AC-4.2, CF-INT-BR-6)", async () => {
    listLeaderboard.mockResolvedValue({ available: false });

    const out = await attachThreatBoard(
      analysisOk({ notes: ["coverage ok"] }),
      [garchompMember],
      "champions",
      db,
      typeProfiles,
    );

    expect(out.threats).toEqual([]);
    expect(out.notes.join(" ").toLowerCase()).toMatch(/unavailable/);
    expect(out.notes.join(" ")).toContain("coverage ok");
    expect(JSON.stringify(out).toLowerCase()).not.toMatch(/smogon|gen9ou/);
    expect(out.meta_attribution == null || out.meta_attribution === "").toBe(
      true,
    );
  });

  it("fail-softs when listLeaderboard throws — still no Smogon fallback", async () => {
    listLeaderboard.mockRejectedValue(new Error("network down"));

    const out = await attachThreatBoard(
      analysisOk(),
      [garchompMember],
      "champions",
      db,
      typeProfiles,
    );

    expect(out.threats).toEqual([]);
    expect(out.notes.join(" ").toLowerCase()).toMatch(/unavailable/);
    expect(metaRepo.metaLeaderboard).not.toHaveBeenCalled();
  });
});
