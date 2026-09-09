/**
 * GET /api/search — Champions index only (P6c).
 *
 * Typeahead lists the current Champions roster. Other-game names must not
 * appear even when extra gen-7 / National Dex rows exist, and `format=` is
 * ignored for lookup (old clients sending scarlet-violet still get Champions).
 *
 * Requirement refs: CF-DEX-US-1, CF-DEX-AC-1.1, CF-DEX-AC-1.2, CF-DEX-AC-1.3,
 * api-design.md Search.
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

import { ingest_meta, searchable_names } from "@/data/schema";
import {
  PUBLIC_READ_CONFIG,
  _resetStoreForTests,
} from "@/server/rate-limit";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../test/support/pg";

type SearchRoute = typeof import("./route");

let fix: PgFixture;
let route: SearchRoute;

type Match = {
  slug: string;
  display_name: string;
  kind: string;
  sprite_url?: string;
};

function req(params: Record<string, string>): Request {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local/api/search?${qs}`);
}

beforeAll(async () => {
  fix = await createPgSchema({
    seed: "tools",
    after: async (db) => {
      const now = Date.now();
      await db.insert(searchable_names).values([
        {
          format: "gen-7",
          kind: "pokemon",
          slug: "incineroar",
          display_name: "Incineroar",
        },
        {
          format: "national-dex",
          kind: "pokemon",
          slug: "eternatus",
          display_name: "Eternatus",
        },
        {
          format: "gen-7",
          kind: "move",
          slug: "hidden-power",
          display_name: "Hidden Power",
        },
      ]);
      await db.insert(ingest_meta).values([
        {
          format: "gen-7",
          last_success_at: now,
          pokemon_count: 1,
          learnset_count: 0,
          names_count: 2,
          schema_version: "2",
        },
        {
          format: "national-dex",
          last_success_at: now,
          pokemon_count: 1,
          learnset_count: 0,
          names_count: 1,
          schema_version: "2",
        },
      ]);
    },
  });
  await installAsSingleton(fix);
  route = await import("./route");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup?.();
});

beforeEach(() => _resetStoreForTests());
afterEach(() => _resetStoreForTests());

describe("GET /api/search — Champions only (CF-DEX-AC-1.3)", () => {
  it("400s on an unknown kind", async () => {
    const res = await route.GET(req({ kind: "trainer", q: "ga" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_kind" });
  });

  it("400s on a garbage format value", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "ga", format: "x" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid_format|invalid_request/);
  });

  it("defaults to the Champions index when format is omitted", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "garch" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Match[] };
    expect(body.matches[0]).toMatchObject({
      slug: "garchomp",
      display_name: "Garchomp",
      kind: "pokemon",
    });
  });

  it("lists the Champions kind alphabetically for a blank query (CF-DEX-AC-1.1)", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Match[] };
    const { SEARCHABLE_NAMES_SEED, POKEMON_SEED } = await import(
      "../../../../test/fixtures/tools-fixture"
    );
    const expectedPokemon = SEARCHABLE_NAMES_SEED.filter(
      (n) => n.kind === "pokemon",
    );
    expect(body.matches).toHaveLength(expectedPokemon.length);
    expect(body.matches.every((m) => m.kind === "pokemon")).toBe(true);
    const names = body.matches.map((m) => m.display_name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const slugs = new Set(body.matches.map((m) => m.slug));
    for (const p of expectedPokemon) {
      expect(slugs.has(p.slug)).toBe(true);
    }
    expect(slugs.has("incineroar")).toBe(false);
    expect(slugs.has("eternatus")).toBe(false);
    expect(slugs.has("swampert-mega")).toBe(true);
    const spriteById = new Map(POKEMON_SEED.map((p) => [p.id, p.sprite_url]));
    for (const m of body.matches) {
      const url = spriteById.get(m.slug);
      if (url) {
        expect(m.sprite_url).toBe(url);
      } else {
        expect(m).not.toHaveProperty("sprite_url");
      }
    }
  });

  it("ignores format=gen-7 / scarlet-violet and still searches Champions", async () => {
    for (const format of ["gen-7", "scarlet-violet", "national-dex"] as const) {
      const res = await route.GET(
        req({ kind: "pokemon", q: "garch", format }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { matches: Match[] };
      expect(body.matches.some((m) => m.slug === "garchomp")).toBe(true);
      expect(body.matches.some((m) => m.slug === "incineroar")).toBe(false);
    }
  });

  it("returns no hit for a gen-7-only name (CF-DEX-AC-1.3)", async () => {
    const res = await route.GET(
      req({ kind: "pokemon", q: "incineroar", format: "gen-7" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Match[] };
    expect(body.matches.every((m) => m.slug !== "incineroar")).toBe(true);
    expect(body.matches.every((m) => m.slug !== "eternatus")).toBe(true);
  });

  it("returns no hit for a National Dex-only name", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "eternatus" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Match[] };
    expect(body.matches.some((m) => m.slug === "eternatus")).toBe(false);
  });

  it("returns no hit for a gen-7-only move", async () => {
    const res = await route.GET(
      req({ kind: "move", q: "hidden-power", format: "gen-7" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Match[] };
    expect(body.matches.some((m) => m.slug === "hidden-power")).toBe(false);
  });

  it("scopes matches to the requested kind on the Champions index", async () => {
    const res = await route.GET(req({ kind: "move", q: "earth" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Match[] };
    expect(body.matches.every((m) => m.kind === "move")).toBe(true);
    expect(body.matches.some((m) => m.slug === "earthquake")).toBe(true);
    expect(body.matches.every((m) => !("sprite_url" in m))).toBe(true);
  });

  it("rate-limits a burst past PUBLIC_READ_CONFIG with 429 + Retry-After", async () => {
    const cap = PUBLIC_READ_CONFIG.maxRequestsPerWindow;
    for (let i = 0; i < cap; i++) {
      const ok = await route.GET(req({ kind: "pokemon", q: "ga" }));
      expect(ok.status).toBe(200);
    }
    const limited = await route.GET(req({ kind: "pokemon", q: "ga" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    const retryAfter = Number(limited.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });
});
