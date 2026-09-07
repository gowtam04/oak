/**
 * Route-adapter tests for GET /api/usage/:slug (Champions-first P5).
 *
 * Species drill-in + apply-set source (CF-USAGE-AC-1.4, CF-INT-BR-5–6).
 * Production route is not required to exist yet — a failed import is the
 * intended red until the implementer adds `route.ts`.
 *
 * Same harness as `../route.test.ts`: fixture DB for champions resolve,
 * mocked usage-client (no network), public (no auth).
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const usage = vi.hoisted(() => ({
  listLeaderboard: vi.fn(),
  getUsage: vi.fn(),
}));

vi.mock("@/server/champions-usage/usage-client", () => ({
  listLeaderboard: (...args: unknown[]) => usage.listLeaderboard(...args),
  getUsage: (...args: unknown[]) => usage.getUsage(...args),
  USAGE_ATTRIBUTION: "ATTR",
}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../test/support/pg";
import { _resetStoreForTests } from "@/server/rate-limit";

type SlugRoute = typeof import("./route");

let fix: PgFixture;
let route: SlugRoute;

function req(
  slug: string,
  params: Record<string, string> = {},
): Request {
  const qs = new URLSearchParams(params).toString();
  const url = qs
    ? `http://test.local/api/usage/${slug}?${qs}`
    : `http://test.local/api/usage/${slug}`;
  return new Request(url);
}

const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });

function usageData(over: Record<string, unknown> = {}) {
  return {
    saved_name: "Garchomp",
    format: "doubles",
    season: "Current",
    fetched_at: 1_700_000_000_000,
    moves: [{ name: "Earthquake", pct: 90.3, rank: 1 }],
    items: [{ name: "Life Orb", pct: 41.5, rank: 1 }],
    abilities: [{ name: "Rough Skin", pct: 100, rank: 1 }],
    natures: [{ name: "Jolly", pct: 73.4, rank: 1 }],
    spreads: [{ name: "32/0/0/0/2/32", pct: 31, rank: 1 }],
    teammates: [{ name: "Farigiraf", pct: 28.6, rank: 1 }],
    source_url: "https://championsbattledata.com/api/battle/Doubles/Garchomp",
    ...over,
  };
}

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  route = await import("./route");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup?.();
});

beforeEach(() => {
  _resetStoreForTests();
  usage.listLeaderboard.mockReset();
  usage.getUsage.mockReset();
});
afterEach(() => _resetStoreForTests());

describe("GET /api/usage/:slug (CF-USAGE-AC-1.4, CF-INT-BR-5–6)", () => {
  it("is public and returns UsageData + slug when the species is on the roster", async () => {
    usage.getUsage.mockResolvedValue({ found: true, data: usageData() });

    const res = await route.GET(req("garchomp"), slugCtx("garchomp"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      found: boolean;
      slug: string;
      season: string;
      fetched_at: number;
      attribution?: string;
      moves: unknown[];
      format: string;
    };
    expect(body.available).toBe(true);
    expect(body.found).toBe(true);
    expect(body.slug).toBe("garchomp");
    expect(body.season).toBe("Current");
    expect(body.fetched_at).toBe(1_700_000_000_000);
    expect(body.format).toBe("doubles");
    expect(body.moves.length).toBeGreaterThan(0);
    expect(body.attribution ?? "ATTR").toEqual(expect.any(String));
    expect(usage.getUsage).toHaveBeenCalled();
    expect(usage.getUsage.mock.calls[0][1]).toBe("doubles");
  });

  it("passes ladder=singles through (CF-USAGE-AC-1.2)", async () => {
    usage.getUsage.mockResolvedValue({
      found: true,
      data: usageData({ format: "singles" }),
    });

    const res = await route.GET(
      req("garchomp", { ladder: "singles" }),
      slugCtx("garchomp"),
    );
    expect(res.status).toBe(200);
    expect(usage.getUsage.mock.calls[0][1]).toBe("singles");
    const body = (await res.json()) as { available: boolean; format?: string };
    expect(body.available).toBe(true);
  });

  it("returns found:false for a slug not on the Champions roster (CF-USAGE-AC-1.5)", async () => {
    const res = await route.GET(req("calyrex"), slugCtx("calyrex"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      found?: boolean;
      suggestions?: string[];
      error?: string;
    };
    expect(body.available).toBe(true);
    expect(body.found).toBe(false);
    expect(Array.isArray(body.suggestions ?? [])).toBe(true);
    expect(usage.getUsage).not.toHaveBeenCalled();
  });

  it("returns found:false with suggestions when live usage has no set (CF-TEAM-AC-6.5)", async () => {
    usage.getUsage.mockResolvedValue({
      found: false,
      suggestions: ["Garchomp"],
    });

    const res = await route.GET(req("garchomp"), slugCtx("garchomp"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      found?: boolean;
      suggestions?: string[];
    };
    expect(body.available).toBe(true);
    expect(body.found).toBe(false);
    expect(body.suggestions).toContain("Garchomp");
  });

  it("returns 200 { available:false, error: upstream_unavailable } when usage throws (CF-USAGE-AC-1.6, CF-INT-BR-6)", async () => {
    usage.getUsage.mockRejectedValue(new Error("network down"));

    const res = await route.GET(req("garchomp"), slugCtx("garchomp"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      error?: string;
    };
    expect(body.available).toBe(false);
    expect(body.error).toBe("upstream_unavailable");
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/smogon|gen9ou/);
  });

  it("400s on an unknown ladder", async () => {
    const res = await route.GET(
      req("garchomp", { ladder: "gen9ou" }),
      slugCtx("garchomp"),
    );
    expect(res.status).toBe(400);
    expect(usage.getUsage).not.toHaveBeenCalled();
  });
});
