/**
 * Integration tests for `GET /api/search` — the team-builder typeahead.
 *
 * Exercises the real route handler against a real migrated + seeded Postgres
 * schema (Testcontainers) with `resolveEntity` reaching the installed
 * `@/data/db` singleton. Mirrors teams.route.test.ts: install the fixture as the
 * singleton BEFORE the first dynamic import of the handler and neutralise
 * `server-only` under the vitest node env.
 *
 * Focus: param validation (bad kind/format → 400), blank query → empty list,
 * a ranked match by kind, and never-throws (in-domain results always 200).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../test/support/pg";

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

  it("returns an empty list for a blank query (not an error)", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "", format: SV }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [] });
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
});
