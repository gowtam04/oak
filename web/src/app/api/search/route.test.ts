/**
 * Integration tests for `GET /api/search` — the team-builder typeahead.
 *
 * Exercises the real route handler against a real migrated + seeded Postgres
 * schema (Testcontainers) with `resolveEntity` reaching the installed
 * `@/data/db` singleton. Mirrors teams.route.test.ts: install the fixture as the
 * singleton BEFORE the first dynamic import of the handler and neutralise
 * `server-only` under the vitest node env.
 *
 * Focus: param validation (bad kind/format → 400), blank query → alphabetical
 * listing, a ranked match by kind, and never-throws (in-domain results 200).
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

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../test/support/pg";
import {
  PUBLIC_READ_CONFIG,
  _resetStoreForTests,
} from "@/server/rate-limit";

type SearchRoute = typeof import("./route");

let fix: PgFixture;
let route: SearchRoute;

const SV = "scarlet-violet";

function req(params: Record<string, string>): Request {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local/api/search?${qs}`);
}

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  route = await import("./route");
});

afterAll(async () => {
  await fix?.cleanup?.();
});

// The public read routes share a `pub:<ip>` rate-limit bucket (EDGE-02). Reset
// the in-process store around every case so a burst test can't leak budget into
// (or starve) the functional cases, and vice versa.
beforeEach(() => _resetStoreForTests());
afterEach(() => _resetStoreForTests());

describe("GET /api/search", () => {
  it("400s on an unknown kind", async () => {
    const res = await route.GET(req({ kind: "trainer", q: "ga", format: SV }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_kind" });
  });

  it("400s on an unknown format", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "ga", format: "x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_format" });
  });

  it("lists the kind's options (alphabetical) for a blank query", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "", format: SV }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: { slug: string; display_name: string; kind: string }[];
    };
    // Focusing an empty picker browses options, not an empty list.
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches.every((m) => m.kind === "pokemon")).toBe(true);
    const names = body.matches.map((m) => m.display_name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("returns ranked, slug-bearing matches for a partial name", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "garch", format: SV }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: { slug: string; display_name: string; kind: string }[];
    };
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches[0]).toEqual({
      slug: "garchomp",
      display_name: "Garchomp",
      kind: "pokemon",
    });
  });

  it("scopes matches to the requested kind", async () => {
    const res = await route.GET(req({ kind: "move", q: "earth", format: SV }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: { slug: string; kind: string }[];
    };
    expect(body.matches.every((m) => m.kind === "move")).toBe(true);
    expect(body.matches.some((m) => m.slug === "earthquake")).toBe(true);
  });

  it("rate-limits a burst past PUBLIC_READ_CONFIG with 429 + Retry-After (EDGE-02)", async () => {
    const cap = PUBLIC_READ_CONFIG.maxRequestsPerWindow;
    // The header-less test Request resolves to clientIp "unknown", so every call
    // lands in the same `pub:unknown` bucket. The first `cap` are allowed…
    for (let i = 0; i < cap; i++) {
      const ok = await route.GET(req({ kind: "pokemon", q: "ga", format: SV }));
      expect(ok.status).toBe(200);
    }
    // …the next one trips the limiter.
    const limited = await route.GET(req({ kind: "pokemon", q: "ga", format: SV }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    const retryAfter = Number(limited.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });
});
