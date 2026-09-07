/**
 * Unit tests for resolveSetTemplate — Champions live usage → TeamMember
 * (CF-TEAM-US-6, CF-TEAM-AC-6.5–6.6, ADR-5, ADR-7).
 *
 * `getUsage` / roster / learnset are mocked (no network, no Postgres).
 * Mapping rules:
 *   - member.evs = Stat Points from the usage spread
 *   - tera_type: null, level: 50
 *   - missing item / fewer than four moves stay empty with a note
 *   - do not invent moves from another game's learnset
 *   - found: false if usage is down or no set is listed
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUsage = vi.hoisted(() => vi.fn());
vi.mock("@/server/champions-usage/usage-client", () => ({
  getUsage: (...args: unknown[]) => getUsage(...args),
  listLeaderboard: vi.fn(),
  USAGE_ATTRIBUTION: "ATTR",
}));

const getPokemon = vi.hoisted(() => vi.fn());
vi.mock("@/data/repos/pokedex-repo", () => ({
  getPokemon: (...args: unknown[]) => getPokemon(...args),
}));

const movesForPokemon = vi.hoisted(() => vi.fn());
vi.mock("@/data/repos/learnset-repo", () => ({
  movesForPokemon: (...args: unknown[]) => movesForPokemon(...args),
}));

const metaRepo = vi.hoisted(() => ({
  listMetaMonths: vi.fn(async () => {
    throw new Error("Smogon meta_repo must not be used (CF-INT-BR-7)");
  }),
  metaSpeciesDetail: vi.fn(async () => {
    throw new Error("Smogon meta_repo must not be used (CF-INT-BR-7)");
  }),
  metaLeaderboard: vi.fn(async () => {
    throw new Error("Smogon meta_repo must not be used (CF-INT-BR-7)");
  }),
}));
vi.mock("@/data/repos/meta-repo", () => metaRepo);

import type { OakDb } from "@/data/db";
import type { SetTemplateResult } from "./set-template";
import { resolveSetTemplate } from "./set-template";

const db = {} as OakDb;

type ResolveChampions = (
  species: string,
  db: OakDb,
) => Promise<SetTemplateResult>;

/** P5 signature is (species, db) — format is not a picker (api-design.md). */
function resolveChampions(
  species: string,
): Promise<SetTemplateResult> {
  return (resolveSetTemplate as unknown as ResolveChampions)(species, db);
}

function usageData(over: Record<string, unknown> = {}) {
  return {
    saved_name: "Garchomp",
    format: "doubles",
    season: "Current",
    fetched_at: 1_000,
    moves: [
      { name: "Earthquake", pct: 90.3, rank: 1 },
      { name: "Protect", pct: 84.1, rank: 2 },
      { name: "Dragon Claw", pct: 60, rank: 3 },
      { name: "Stomping Tantrum", pct: 40, rank: 4 },
      { name: "Outrage", pct: 20, rank: 5 },
    ],
    items: [{ name: "Life Orb", pct: 41.5, rank: 1 }],
    abilities: [{ name: "Rough Skin", pct: 100, rank: 1 }],
    natures: [{ name: "Jolly", pct: 73.4, rank: 1 }],
    spreads: [{ name: "32/0/0/0/2/32", pct: 31, rank: 1 }],
    teammates: [],
    source_url: "https://championsbattledata.com/api/battle/Doubles/Garchomp",
    ...over,
  };
}

beforeEach(() => {
  getUsage.mockReset();
  getPokemon.mockReset();
  movesForPokemon.mockReset();
  getPokemon.mockResolvedValue({
    found: true,
    display_name: "Garchomp",
    abilities: { slot1: "sand-veil", hidden: "rough-skin" },
  });
  movesForPokemon.mockResolvedValue([
    { moveSlug: "earthquake", method: "machine" },
    { moveSlug: "protect", method: "level-up" },
    { moveSlug: "dragon-claw", method: "level-up" },
    { moveSlug: "fire-fang", method: "level-up" },
  ]);
});

describe("resolveSetTemplate — Champions live usage (CF-TEAM-AC-6.5–6.6, ADR-7)", () => {
  it("maps live usage into a Champions member: Stat Points, no Tera, level 50", async () => {
    getUsage.mockResolvedValue({ found: true, data: usageData() });

    const result = await resolveChampions("garchomp");

    expect(getUsage).toHaveBeenCalled();
    expect(getUsage.mock.calls[0][0].toString().toLowerCase()).toContain(
      "garchomp",
    );
    expect(getUsage.mock.calls[0][1]).toBe("doubles");
    expect(metaRepo.listMetaMonths).not.toHaveBeenCalled();
    expect(metaRepo.metaSpeciesDetail).not.toHaveBeenCalled();

    expect(result.found).toBe(true);
    if (!result.found || !result.member) return;
    expect(result.member.species).toBe("garchomp");
    expect(result.member.tera_type).toBeNull();
    expect(result.member.level).toBe(50);
    expect(result.member.evs).toEqual({
      hp: 32,
      atk: 0,
      def: 0,
      spa: 0,
      spd: 2,
      spe: 32,
    });
    expect(result.member.nature).toBe("jolly");
    expect(result.member.ability).toBe("rough-skin");
    expect(result.member.item).toBe("life-orb");
    expect(result.member.moves).toEqual(
      expect.arrayContaining(["earthquake", "protect", "dragon-claw"]),
    );
    expect(result.member.moves.length).toBeLessThanOrEqual(4);
    expect(result.member.moves).not.toContain("fire-fang");
    expect(result.attribution).toEqual(expect.any(String));
  });

  it("does not invent moves from another game when usage lists fewer than four (CF-TEAM-AC-6.6)", async () => {
    getUsage.mockResolvedValue({
      found: true,
      data: usageData({
        moves: [
          { name: "Earthquake", pct: 90, rank: 1 },
          { name: "Protect", pct: 80, rank: 2 },
        ],
      }),
    });

    const result = await resolveChampions("garchomp");
    expect(result.found).toBe(true);
    if (!result.found || !result.member) return;
    expect(result.member.moves).toEqual(["earthquake", "protect"]);
    expect(result.member.moves).not.toContain("fire-fang");
    expect(result.member.moves).not.toContain("dragon-claw");
    expect((result.notes ?? []).join(" ").toLowerCase()).toMatch(
      /move|empty|missing|fewer/,
    );
  });

  it("leaves item empty with a warning when usage lists none (CF-TEAM-AC-6.6)", async () => {
    getUsage.mockResolvedValue({
      found: true,
      data: usageData({ items: [] }),
    });

    const result = await resolveChampions("garchomp");
    expect(result.found).toBe(true);
    if (!result.found || !result.member) return;
    expect(result.member.item).toBeNull();
    expect((result.notes ?? []).join(" ").toLowerCase()).toMatch(
      /item/,
    );
  });

  it("skips a usage move that is not in the Champions learnset rather than substituting another game", async () => {
    getUsage.mockResolvedValue({
      found: true,
      data: usageData({
        moves: [
          { name: "Earthquake", pct: 90, rank: 1 },
          { name: "Made-Up Move", pct: 80, rank: 2 },
          { name: "Protect", pct: 70, rank: 3 },
        ],
      }),
    });

    const result = await resolveChampions("garchomp");
    expect(result.found).toBe(true);
    if (!result.found || !result.member) return;
    expect(result.member.moves).toEqual(["earthquake", "protect"]);
    expect(result.member.moves).not.toContain("made-up-move");
    expect((result.notes ?? []).join(" ").toLowerCase()).toMatch(
      /made-up|skipped|illegal|learnset/,
    );
  });

  it("returns found:false when live usage is down (CF-TEAM-AC-6.5, CF-INT-BR-6)", async () => {
    getUsage.mockRejectedValue(new Error("network down"));

    const result = await resolveChampions("garchomp");
    expect(result.found).toBe(false);
    expect(result.member).toBeUndefined();
    expect((result.notes ?? []).join(" ").toLowerCase()).toMatch(
      /unavailable|down/,
    );
    expect(JSON.stringify(result).toLowerCase()).not.toMatch(/smogon|gen9ou/);
  });

  it("returns found:false when no set is listed (CF-TEAM-AC-6.5)", async () => {
    getUsage.mockResolvedValue({ found: false, suggestions: ["Garchomp"] });

    const result = await resolveChampions("garchomp");
    expect(getUsage).toHaveBeenCalled();
    expect(result.found).toBe(false);
    expect(result.member).toBeUndefined();
    expect(JSON.stringify(result).toLowerCase()).not.toMatch(/smogon|gen9ou/);
  });
});
