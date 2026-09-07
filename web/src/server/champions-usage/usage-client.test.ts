/**
 * Unit tests for the championsbattledata.com client — `fetch` is stubbed, so
 * these are pure (no network). They pin the wire contract Oak depends on:
 *   - URL construction (capitalized format path + season query) and row
 *     normalization ("90.3%" -> 90.3, rank-sorted),
 *   - name -> saved_name resolution via the index, with a /api/metadata fallback,
 *   - a miss returns suggestions; a battle 404 is a miss with no retry,
 *   - a transient network error retries once then succeeds,
 *   - per-Pokémon usage is cached (a repeat call refetches nothing),
 *   - listLeaderboard (P5 / ADR-5): bulk index ranks, no N+1; names-only
 *     index → available:false rather than per-species battle GETs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getUsage, __resetUsageCachesForTests } from "./usage-client";

const BASE = "https://championsbattledata.com";

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function notFound(): Response {
  return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
}

const INDEX = {
  defaultSeason: "Season M-3",
  seasons: ["Season M-3"],
  pokemon: ["Garchomp", "Rillaboom", "Incineroar"],
};

const GARCHOMP_BATTLE = {
  pokemon: "Garchomp",
  format: "Doubles",
  season: "Season M-3",
  rows: [
    { position: 2, category: "move", rank: 2, name: "Protect", percentage: "84.1%" },
    { position: 1, category: "move", rank: 1, name: "Earthquake", percentage: "90.3%" },
    { position: 1, category: "item", rank: 1, name: "Life Orb", percentage: "41.5%" },
    { position: 1, category: "ability", rank: 1, name: "Rough Skin", percentage: "100%" },
    { position: 1, category: "nature", rank: 1, name: "Jolly", percentage: "73.4%" },
    { position: 1, category: "spread", rank: 1, name: "0/252/0/0/4/252", percentage: "31.0%" },
    { position: 1, category: "teammate", rank: 1, name: "Rillaboom", percentage: "28.6%" },
  ],
};

/** Live championsbattledata battle rows (held_item / stat_alignment / stat_points). */
const GARCHOMP_BATTLE_LIVE = {
  pokemon: "Garchomp",
  format: "Doubles",
  season: "Season M-3",
  rows: [
    { position: 1, category: "move", rank: 1, name: "Earthquake", percentage: "90.3%" },
    { position: 2, category: "move", rank: 2, name: "Protect", percentage: "84.1%" },
    { position: 1, category: "held_item", rank: 1, name: "Life Orb", percentage: "41.5%" },
    { position: 1, category: "ability", rank: 1, name: "Rough Skin", percentage: "100%" },
    { position: 1, category: "stat_alignment", rank: 1, name: "Jolly", percentage: "73.4%" },
    {
      position: 1,
      category: "stat_points",
      rank: 1,
      name: "",
      percentage: "31.0%",
      hp_points: 32,
      attack_points: 0,
      defense_points: 0,
      sp_atk_points: 0,
      sp_def_points: 2,
      speed_points: 32,
    },
    { position: 1, category: "teammate", rank: 1, name: "Rillaboom", percentage: "28.6%" },
  ],
};

const OGERPON_META = {
  pokemon: "Ogerpon",
  rows: [
    { base_name: "Ogerpon", saved_name: "Ogerpon", form: "" },
    { base_name: "Ogerpon", saved_name: "Ogerpon Wellspring", form: "Wellspring" },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function installFetch(handler: (url: string) => Response | Promise<Response>) {
  fetchMock = vi.fn((url: unknown) => Promise.resolve(handler(String(url))));
  vi.stubGlobal("fetch", fetchMock);
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  __resetUsageCachesForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getUsage — happy path", () => {
  beforeEach(() => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/battle/Doubles/Garchomp`)) return ok(GARCHOMP_BATTLE);
      return notFound();
    });
  });

  it("fetches the index + battle and normalizes the rows", async () => {
    const res = await getUsage("garchomp", "doubles", { now: 1000 });
    expect(res.found).toBe(true);
    if (!res.found) return;

    expect(res.data.saved_name).toBe("Garchomp");
    expect(res.data.season).toBe("Season M-3");
    expect(res.data.fetched_at).toBe(1000);
    // Parsed "90.3%" -> 90.3 and sorted by rank (Earthquake #1 before Protect #2).
    expect(res.data.moves[0]).toEqual({ name: "Earthquake", pct: 90.3, rank: 1 });
    expect(res.data.moves[1]).toEqual({ name: "Protect", pct: 84.1, rank: 2 });
    expect(res.data.abilities[0]).toEqual({ name: "Rough Skin", pct: 100, rank: 1 });
    expect(res.data.teammates[0].name).toBe("Rillaboom");
    // Capitalized format path + season query in the cited URL.
    expect(res.data.source_url).toBe(
      `${BASE}/api/battle/Doubles/Garchomp?season=Season%20M-3`,
    );
    // index + battle, no metadata call needed (direct index hit).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uppercases the format in the path for singles", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/battle/Singles/Garchomp`))
        return ok({ ...GARCHOMP_BATTLE, format: "Singles" });
      return notFound();
    });
    const res = await getUsage("garchomp", "singles", { now: 1 });
    expect(res.found).toBe(true);
    expect(calledUrls().some((u) => u.includes("/api/battle/Singles/Garchomp"))).toBe(
      true,
    );
  });

  it("caches per-Pokémon usage — a repeat call refetches nothing", async () => {
    await getUsage("garchomp", "doubles", { now: 1000 });
    await getUsage("garchomp", "doubles", { now: 2000 });
    // Still just the first call's index + battle.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps live categories held_item/stat_alignment/stat_points and synthesizes SP spreads", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/battle/Doubles/Garchomp`)) {
        return ok(GARCHOMP_BATTLE_LIVE);
      }
      return notFound();
    });
    const res = await getUsage("garchomp", "doubles", { now: 1 });
    expect(res.found).toBe(true);
    if (!res.found) return;
    expect(res.data.items[0]).toEqual({ name: "Life Orb", pct: 41.5, rank: 1 });
    expect(res.data.natures[0]).toEqual({ name: "Jolly", pct: 73.4, rank: 1 });
    expect(res.data.spreads[0]).toEqual({
      name: "32/0/0/0/2/32",
      pct: 31,
      rank: 1,
    });
    expect(res.data.moves[0].name).toBe("Earthquake");
  });

  it("still synthesizes spreads from special_attack_points / special_defense_points fallbacks", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/battle/Doubles/Garchomp`)) {
        return ok({
          ...GARCHOMP_BATTLE_LIVE,
          rows: [
            {
              position: 1,
              category: "stat_points",
              rank: 1,
              name: "",
              percentage: "31.0%",
              hp_points: 32,
              attack_points: 0,
              defense_points: 0,
              special_attack_points: 0,
              special_defense_points: 2,
              speed_points: 32,
            },
          ],
        });
      }
      return notFound();
    });
    const res = await getUsage("garchomp", "doubles", { now: 1 });
    expect(res.found).toBe(true);
    if (!res.found) return;
    expect(res.data.spreads[0]?.name).toBe("32/0/0/0/2/32");
  });
});

describe("getUsage — resolution + misses", () => {
  it("falls back to /api/metadata when the name isn't in the index", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/metadata/ogerpon`)) return ok(OGERPON_META);
      if (url.startsWith(`${BASE}/api/battle/Doubles/Ogerpon`))
        return ok({ rows: [{ category: "move", rank: 1, name: "Ivy Cudgel", percentage: "99%" }] });
      return notFound();
    });
    const res = await getUsage("ogerpon", "doubles", { now: 1 });
    expect(res.found).toBe(true);
    if (!res.found) return;
    // Picked the base-form saved_name from metadata.
    expect(res.data.saved_name).toBe("Ogerpon");
    expect(calledUrls().some((u) => u.includes("/api/metadata/ogerpon"))).toBe(true);
  });

  it("returns a miss with token-ranked suggestions for an unrecognized name", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      return notFound(); // no metadata, no battle
    });
    const res = await getUsage("Mega Garchomp", "doubles", { now: 1 });
    expect(res.found).toBe(false);
    if (res.found) return;
    expect(res.suggestions).toContain("Garchomp");
  });

  it("treats a battle 404 as a miss and does not retry it", async () => {
    let battleCalls = 0;
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/battle/Doubles/Garchomp`)) {
        battleCalls += 1;
        return notFound();
      }
      return notFound();
    });
    const res = await getUsage("garchomp", "doubles", { now: 1 });
    expect(res.found).toBe(false);
    expect(battleCalls).toBe(1); // 404 is not retried
  });
});

describe("getUsage — network resilience", () => {
  it("retries once on a transient network error then succeeds", async () => {
    let battleCalls = 0;
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.startsWith(`${BASE}/api/battle/Doubles/Garchomp`)) {
        battleCalls += 1;
        if (battleCalls === 1) throw new TypeError("network down");
        return ok(GARCHOMP_BATTLE);
      }
      return notFound();
    });
    const res = await getUsage("garchomp", "doubles", { now: 1 });
    expect(res.found).toBe(true);
    expect(battleCalls).toBe(2); // failed once, retried once
  });

  it("propagates a persistent network fault after the retry", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      throw new TypeError("network down");
    });
    await expect(getUsage("garchomp", "doubles", { now: 1 })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listLeaderboard — bulk ranks, no N+1 (ADR-5, CF-USAGE-US-1, CF-INT-BR-4)
// ---------------------------------------------------------------------------

type LeaderboardRow = {
  rank: number;
  name: string;
  usage_pct?: number;
};

type LeaderboardResult =
  | {
      available: true;
      season: string;
      fetched_at: number;
      rows: LeaderboardRow[];
    }
  | { available: false };

type ListLeaderboard = (
  ladder: "doubles" | "singles",
  signal?: AbortSignal,
) => Promise<LeaderboardResult>;

async function loadListLeaderboard(): Promise<ListLeaderboard> {
  const mod = (await import("./usage-client")) as {
    listLeaderboard?: ListLeaderboard;
  };
  expect(mod.listLeaderboard).toEqual(expect.any(Function));
  return mod.listLeaderboard as ListLeaderboard;
}

function battleUrls(): string[] {
  return calledUrls().filter((u) => u.includes("/api/battle/"));
}

/** Community `/api` index with per-ladder `position` ranks in one payload. */
function bulkIndex() {
  return {
    defaultSeason: "Current",
    seasons: ["Current"],
    pokemon: [
      {
        name: "Kingambit",
        slug: "kingambit",
        showdownId: "kingambit",
        summary: {
          sprite: "pokemon_champions_assets/pokemon/Kingambit.png",
          battleSummary: {
            Current: {
              Doubles: { position: 1 },
              Singles: { position: 5 },
            },
          },
        },
      },
      {
        name: "Garchomp",
        slug: "garchomp",
        showdownId: "garchomp",
        summary: {
          sprite: "pokemon_champions_assets/pokemon/Garchomp.png",
          battleSummary: {
            Current: {
              Doubles: { position: 2 },
              Singles: { position: 1 },
            },
          },
        },
      },
      {
        name: "Rillaboom",
        slug: "rillaboom",
        showdownId: "rillaboom",
        summary: {
          sprite: "pokemon_champions_assets/pokemon/Rillaboom.png",
          battleSummary: {
            Current: {
              Doubles: { position: 3 },
              Singles: { position: 8 },
            },
          },
        },
      },
    ],
  };
}

describe("listLeaderboard — bulk ranks, no N+1 (ADR-5, CF-USAGE-US-1, CF-INT-BR-4)", () => {
  it("maps a bulk index payload into available:true ranked rows without per-species fetches", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api` || url === `${BASE}/api/index`) return ok(bulkIndex());
      return notFound();
    });

    const listLeaderboard = await loadListLeaderboard();
    const res = await listLeaderboard("doubles");

    expect(res.available).toBe(true);
    if (!res.available) return;
    expect(res.season).toBe("Current");
    expect(typeof res.fetched_at).toBe("number");
    expect(res.rows.map((r) => r.name)).toEqual([
      "Kingambit",
      "Garchomp",
      "Rillaboom",
    ]);
    expect(res.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    // Rank-only bulk: do not invent usage_pct: 0.
    expect(res.rows.every((r) => r.usage_pct === undefined)).toBe(true);
    // One (or a handful of) index requests — never one battle GET per species.
    expect(battleUrls()).toEqual([]);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("reads Singles ranks from the same bulk payload (no extra per-species GETs)", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api` || url === `${BASE}/api/index`) return ok(bulkIndex());
      return notFound();
    });

    const listLeaderboard = await loadListLeaderboard();
    const res = await listLeaderboard("singles");

    expect(res.available).toBe(true);
    if (!res.available) return;
    expect(res.rows[0]).toMatchObject({ rank: 1, name: "Garchomp" });
    expect(res.rows.map((r) => r.name)).toEqual([
      "Garchomp",
      "Kingambit",
      "Rillaboom",
    ]);
    expect(battleUrls()).toEqual([]);
  });

  it("returns available:false when the index has names but no ranks (must not N+1)", async () => {
    // Existing INDEX fixture is a name list only — ranks would require
    // /api/battle/:format/:name per species. ADR-5: unavailable instead.
    installFetch((url) => {
      if (url === `${BASE}/api`) return ok(INDEX);
      if (url.includes("/api/battle/")) {
        throw new Error("listLeaderboard must not N+1 per-species battle fetches (ADR-5)");
      }
      return notFound();
    });

    const listLeaderboard = await loadListLeaderboard();
    const res = await listLeaderboard("doubles");

    expect(res).toEqual({ available: false });
    expect(battleUrls()).toEqual([]);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("returns available:false when pokemon objects lack ladder position/rank", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api`) {
        return ok({
          defaultSeason: "Current",
          pokemon: [
            { name: "Garchomp", slug: "garchomp" },
            { name: "Rillaboom", slug: "rillaboom" },
          ],
        });
      }
      if (url.includes("/api/battle/")) {
        throw new Error("listLeaderboard must not N+1 per-species battle fetches (ADR-5)");
      }
      return notFound();
    });

    const listLeaderboard = await loadListLeaderboard();
    const res = await listLeaderboard("doubles");
    expect(res).toEqual({ available: false });
    expect(battleUrls()).toEqual([]);
  });

  it("returns available:false on an upstream fault (does not throw)", async () => {
    installFetch(() => {
      throw new TypeError("network down");
    });

    const listLeaderboard = await loadListLeaderboard();
    const res = await listLeaderboard("doubles");
    expect(res).toEqual({ available: false });
  });

  it("does not require Redis — an in-process cache miss simply refetches the bulk index", async () => {
    installFetch((url) => {
      if (url === `${BASE}/api` || url === `${BASE}/api/index`) return ok(bulkIndex());
      return notFound();
    });

    const listLeaderboard = await loadListLeaderboard();
    const first = await listLeaderboard("doubles");
    const second = await listLeaderboard("doubles");
    expect(first.available).toBe(true);
    expect(second.available).toBe(true);
    // Cached index: still no per-species battle GETs, and no Redis.
    expect(battleUrls()).toEqual([]);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
