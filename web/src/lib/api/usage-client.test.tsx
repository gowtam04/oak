/**
 * Unit tests for `fetchUsageSpecies` / `usageShowdownExport`. `fetch` is stubbed.
 * Lives as `.test.tsx` so it runs in the jsdom project (no Docker globalSetup).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchUsageSpecies,
  usageShowdownExport,
} from "./usage-client";

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function notOk(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function installFetch(handler: (url: string) => Response | Promise<Response>) {
  fetchMock = vi.fn((url: unknown) => Promise.resolve(handler(String(url))));
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const foundBody = {
  available: true,
  found: true,
  slug: "garchomp",
  saved_name: "Garchomp",
  attribution: "championsbattledata.com — community",
  season: "Current",
  fetched_at: 1_700_000_000_000,
  format: "doubles",
  moves: [{ name: "Earthquake", pct: 90.3, rank: 1 }],
  items: [{ name: "Life Orb", pct: 41.5, rank: 1 }],
  abilities: [{ name: "Rough Skin", pct: 100, rank: 1 }],
  natures: [{ name: "Jolly", pct: 73.4, rank: 1 }],
  spreads: [{ name: "32/0/0/0/2/32", pct: 31, rank: 1 }],
  teammates: [{ name: "Farigiraf", pct: 28.6, rank: 1 }],
  source_url: "https://championsbattledata.com/api/battle/Doubles/Garchomp",
};

describe("fetchUsageSpecies", () => {
  it("requests /api/usage/:slug with the ladder query", async () => {
    installFetch(() => ok(foundBody));
    const body = await fetchUsageSpecies("garchomp", "singles");
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/api/usage/garchomp?");
    expect(url).toContain("ladder=singles");
    expect(body.available).toBe(true);
    if (body.available && body.found) {
      expect(body.saved_name).toBe("Garchomp");
      expect(body.moves[0]?.name).toBe("Earthquake");
    }
  });

  it("defaults to doubles", async () => {
    installFetch(() => ok(foundBody));
    await fetchUsageSpecies("garchomp");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("ladder=doubles");
  });

  it("folds not-found envelopes through", async () => {
    installFetch(() =>
      ok({ available: true, found: false, suggestions: ["Garchomp"] }),
    );
    const body = await fetchUsageSpecies("calyrex");
    expect(body).toEqual({
      available: true,
      found: false,
      suggestions: ["Garchomp"],
    });
  });

  it("never throws on network / non-2xx / malformed body", async () => {
    installFetch(() => {
      throw new Error("offline");
    });
    await expect(fetchUsageSpecies("garchomp")).resolves.toEqual({
      available: false,
      error: "upstream_unavailable",
    });

    installFetch(() => notOk(429));
    await expect(fetchUsageSpecies("garchomp")).resolves.toMatchObject({
      available: false,
    });

    installFetch(() => ok({ nope: true }));
    await expect(fetchUsageSpecies("garchomp")).resolves.toMatchObject({
      available: false,
    });
  });

  it("returns unavailable for a blank slug without fetching", async () => {
    installFetch(() => ok(foundBody));
    await expect(fetchUsageSpecies("  ")).resolves.toMatchObject({
      available: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("usageShowdownExport", () => {
  it("builds a representative set from the top shares", () => {
    expect(
      usageShowdownExport("Garchomp", {
        items: [{ name: "Life Orb" }],
        abilities: [{ name: "Rough Skin" }],
        natures: [{ name: "Jolly" }],
        spreads: [{ name: "32/0/0/0/2/32" }],
        moves: [
          { name: "Earthquake" },
          { name: "Dragon Claw" },
          { name: "Stone Edge" },
          { name: "Swords Dance" },
          { name: "Fire Fang" },
        ],
      }),
    ).toBe(
      [
        "Garchomp @ Life Orb",
        "Ability: Rough Skin",
        "EVs: 32/0/0/0/2/32",
        "Jolly Nature",
        "- Earthquake",
        "- Dragon Claw",
        "- Stone Edge",
        "- Swords Dance",
      ].join("\n"),
    );
  });
});
