/**
 * Route-adapter tests for GET /api/usage (Champions-first P5 UsageGateway).
 *
 * Public live ladder (CF-USAGE-US-1, CF-AS-1, CF-INT-BR-4–6, ADR-5).
 * Production route is not required to exist yet — a failed import is the
 * intended red until the implementer adds `route.ts`.
 *
 * Harness matches `search/route.test.ts`: `server-only` mock, seed "tools",
 * `installAsSingleton` BEFORE the first dynamic import of the handler,
 * `_resetStoreForTests` on the public `pub:<ip>` limiter. The community
 * client is mocked (no network); the Champions roster join is real.
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
} from "../../../../test/support/pg";
import {
  PUBLIC_READ_CONFIG,
  _resetStoreForTests,
} from "@/server/rate-limit";

type UsageRoute = typeof import("./route");

let fix: PgFixture;
let route: UsageRoute;

function req(params: Record<string, string> = {}): Request {
  const qs = new URLSearchParams(params).toString();
  const url = qs
    ? `http://test.local/api/usage?${qs}`
    : "http://test.local/api/usage";
  return new Request(url);
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

describe("GET /api/usage (CF-USAGE-US-1, CF-AS-1, CF-INT-BR-4–6, ADR-5)", () => {
  it("is public — 200 without auth when the ladder is available (CF-USAGE-AC-1.1, CF-AS-1)", async () => {
    usage.listLeaderboard.mockResolvedValue({
      available: true,
      season: "Current",
      fetched_at: 1_700_000_000_000,
      rows: [
        { rank: 2, name: "Garchomp", usage_pct: 18.4 },
        { rank: 8, name: "Farigiraf", usage_pct: 9.1 },
      ],
    });

    const res = await route.GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      ladder: string;
      season: string;
      fetched_at: number;
      attribution: string;
      rows: { rank: number; name: string; slug: string; usage_pct: number }[];
    };
    expect(body.available).toBe(true);
    expect(body.ladder).toBe("doubles");
    expect(body.season).toBe("Current");
    expect(body.fetched_at).toBe(1_700_000_000_000);
    expect(body.attribution).toEqual(expect.any(String));
    expect(body.attribution.toLowerCase()).toMatch(/champions|attr/);
    expect(usage.listLeaderboard.mock.calls[0][0]).toBe("doubles");
    expect(usage.listLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("defaults ladder to doubles and accepts singles (CF-USAGE-AC-1.2, CF-AS-2)", async () => {
    usage.listLeaderboard.mockResolvedValue({
      available: true,
      season: "Current",
      fetched_at: 1,
      rows: [{ rank: 1, name: "Garchomp", usage_pct: 20 }],
    });

    const doubles = await route.GET(req());
    expect(doubles.status).toBe(200);
    expect(((await doubles.json()) as { ladder: string }).ladder).toBe(
      "doubles",
    );
    expect(usage.listLeaderboard.mock.calls[0][0]).toBe("doubles");

    usage.listLeaderboard.mockClear();
    const singles = await route.GET(req({ ladder: "singles" }));
    expect(singles.status).toBe(200);
    expect(((await singles.json()) as { ladder: string }).ladder).toBe(
      "singles",
    );
    expect(usage.listLeaderboard.mock.calls[0][0]).toBe("singles");

    const explicitDoubles = await route.GET(req({ ladder: "doubles" }));
    expect(explicitDoubles.status).toBe(200);
    expect(
      ((await explicitDoubles.json()) as { ladder: string }).ladder,
    ).toBe("doubles");
  });

  it("joins slugs via champions resolve and skips names not on the roster (CF-USAGE-AC-1.5)", async () => {
    usage.listLeaderboard.mockResolvedValue({
      available: true,
      season: "Current",
      fetched_at: 1,
      rows: [
        { rank: 1, name: "Garchomp", usage_pct: 22.0 },
        { rank: 2, name: "Calyrex", usage_pct: 15.0 },
        { rank: 3, name: "Farigiraf", usage_pct: 11.0 },
      ],
    });

    const res = await route.GET(req({ ladder: "doubles" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      rows: { rank: number; name: string; slug: string; usage_pct: number }[];
    };
    expect(body.available).toBe(true);
    const slugs = body.rows.map((r) => r.slug);
    expect(slugs).toContain("garchomp");
    expect(slugs).toContain("farigiraf");
    expect(slugs).not.toContain("calyrex");
    expect(body.rows.every((r) => typeof r.usage_pct === "number")).toBe(
      true,
    );
    expect(
      body.rows.find((r) => r.slug === "garchomp"),
    ).toMatchObject({ rank: 1, name: "Garchomp", slug: "garchomp" });
  });

  it("does not invent usage_pct: 0 when the live ladder is rank-only", async () => {
    usage.listLeaderboard.mockResolvedValue({
      available: true,
      season: "Current",
      fetched_at: 1,
      rows: [
        { rank: 1, name: "Garchomp" },
        { rank: 3, name: "Farigiraf" },
      ],
    });

    const res = await route.GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      rows: { slug: string; usage_pct?: number }[];
    };
    expect(body.available).toBe(true);
    expect(body.rows.map((r) => r.slug).sort()).toEqual([
      "farigiraf",
      "garchomp",
    ]);
    expect(body.rows.every((r) => r.usage_pct === undefined)).toBe(true);
  });

  it("returns 200 { available:false, error: upstream_unavailable } when usage is down (CF-USAGE-AC-1.6, CF-INT-BR-6)", async () => {
    usage.listLeaderboard.mockResolvedValue({ available: false });

    const res = await route.GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      ladder: string;
      error?: string;
      rows?: unknown;
    };
    expect(body.available).toBe(false);
    expect(body.ladder).toBe("doubles");
    expect(body.error).toBe("upstream_unavailable");
    expect(body.rows ?? []).toEqual([]);
  });

  it("does not fall back to Smogon OU when the live ladder is empty (CF-INT-BR-6, CF-INT-BR-7)", async () => {
    usage.listLeaderboard.mockResolvedValue({ available: false });

    const res = await route.GET(req({ ladder: "doubles" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/smogon|gen9ou/);
    expect(body.available).toBe(false);
  });

  it("400s on an unknown ladder", async () => {
    const res = await route.GET(req({ ladder: "gen9ou" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.error ?? body.code).toMatch(/invalid/);
    expect(usage.listLeaderboard).not.toHaveBeenCalled();
  });

  it("rate-limits a burst past PUBLIC_READ_CONFIG with 429 (public read)", async () => {
    usage.listLeaderboard.mockResolvedValue({
      available: true,
      season: "Current",
      fetched_at: 1,
      rows: [{ rank: 1, name: "Garchomp", usage_pct: 20 }],
    });
    const cap = PUBLIC_READ_CONFIG.maxRequestsPerWindow;
    for (let i = 0; i < cap; i++) {
      const ok = await route.GET(req());
      expect(ok.status).toBe(200);
    }
    const limited = await route.GET(req());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });
});
