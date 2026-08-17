/**
 * Integration tests for `POST /api/calc` — public, no-auth damage estimate.
 *
 * Production route is not required to exist yet — a failed resolve is the
 * intended red (P2 TDD).
 *
 * Harness matches `search/route.test.ts`: `server-only` mock, seed "tools",
 * `installAsSingleton` BEFORE the first dynamic import of the handler,
 * `_resetStoreForTests` on the public `pub:<ip>` limiter. Dynamic-import the
 * route (same env-throw avoidance as `/api/chat`). No model is involved
 * (CALC-BR-1) — do not mock an LLM.
 *
 * Requirement refs: CALC-US-4, CALC-US-5, CALC-AC-4.2, CALC-AC-4.4,
 * CALC-AC-5.1, CALC-AC-5.4, CALC-BR-1, CALC-BR-2, CALC-BR-8.
 * ADR-3. api-design.md error matrix.
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

import { reference_cache } from "@/data/schema";
import { _resetStoreForTests } from "@/server/rate-limit";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../test/support/pg";

type CalcRoute = typeof import("./route");

let fix: PgFixture;
let route: CalcRoute;

const SV = "scarlet-violet";

const EARTHQUAKE = {
  found: true,
  display_name: "Earthquake",
  type: "ground",
  damage_class: "physical",
  power: 100,
  accuracy: 100,
  pp: 10,
  priority: 0,
  target: "all-other-pokemon",
  effect_short: "Hits every other Pokémon on the field.",
  effect_full: "Inflicts regular damage on every other active Pokémon.",
};

function req(body: unknown, init: RequestInit = {}): Request {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://test.local/api/calc", {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: payload,
    ...init,
  });
}

beforeAll(async () => {
  fix = await createPgSchema({
    seed: "tools",
    after: async (db) => {
      await db.insert(reference_cache).values({
        format: SV,
        resource_key: "move/earthquake",
        resource_kind: "move",
        payload: JSON.stringify(EARTHQUAKE),
        endpoint_url: "@pkmn/dex (Pokémon Showdown)",
        fetched_at: 0,
      });
    },
  });
  await installAsSingleton(fix);
  route = await import("./route");
});

afterAll(async () => {
  await fix?.cleanup?.();
});

beforeEach(() => _resetStoreForTests());
afterEach(() => _resetStoreForTests());

describe("POST /api/calc", () => {
  it("400s an unknown format with { error: \"invalid_format\" }", async () => {
    const res = await route.POST(
      req({
        format: "x",
        attacker: { species: "garchomp" },
        defender: { species: "farigiraf" },
        move: { slug: "earthquake" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_format" });
  });

  it("400s a missing format with { error: \"invalid_format\" }", async () => {
    const res = await route.POST(
      req({
        attacker: { species: "garchomp" },
        defender: { species: "farigiraf" },
        move: { slug: "earthquake" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_format" });
  });

  it("400s malformed JSON (api-design: 400 malformed JSON)", async () => {
    const res = await route.POST(req("{ not json"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 200 { ok: false, error: \"incomplete\" } when a side species is missing (CALC-BR-8, CALC-AC-5.4)", async () => {
    const res = await route.POST(
      req({
        format: SV,
        attacker: {},
        defender: { species: "farigiraf" },
        move: { slug: "earthquake" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      error?: string;
      estimate?: unknown;
    };
    expect(body).toMatchObject({ ok: false, error: "incomplete" });
    expect(body.estimate).toBeUndefined();
  });

  it("returns 200 success estimate with is_estimate: true and no model (CALC-BR-1, CALC-BR-2, CALC-AC-4.4, CALC-AC-5.1)", async () => {
    const res = await route.POST(
      req({
        format: SV,
        attacker: { species: "garchomp" },
        defender: { species: "farigiraf" },
        move: { slug: "earthquake" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      format?: string;
      estimate?: {
        min_damage: number;
        max_damage: number;
        is_estimate: boolean;
        ko?: { hits: number };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.format).toBe(SV);
    expect(body.estimate?.is_estimate).toBe(true);
    expect(body.estimate?.min_damage).toBeGreaterThan(0);
    expect(body.estimate?.max_damage).toBeGreaterThanOrEqual(
      body.estimate?.min_damage ?? 0,
    );
  });

  it("is public — succeeds without an auth cookie or Bearer token", async () => {
    const res = await route.POST(
      req({
        format: SV,
        attacker: { species: "garchomp" },
        defender: { species: "farigiraf" },
        move: { slug: "earthquake" },
      }),
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});
