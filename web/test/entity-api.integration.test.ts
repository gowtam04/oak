/**
 * Integration tests for `GET /api/entity` (B-4 Phase 3). Drives the real route
 * handler against a real migrated + seeded Postgres schema (Testcontainers).
 *
 * Asserts: `ok` for each kind (resolution by display name AND slug), `not_found`
 * for an unresolvable query, `unavailable` when the requested format's index is
 * unbuilt (which also shows the `format` param switching the data scope), and a
 * 4xx for each malformed param. resolveEntity reads the `@/data/db` singleton, so
 * the fixture is installed via `installAsSingleton` before the first call.
 */

import {
  afterAll,
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
  type PgDb,
  type PgFixture,
} from "./support/pg";
import { seedEntityRefs } from "./fixtures/entity-refs";
import { ingest_meta, pokemon, searchable_names } from "@/data/schema";
import { _resetStoreForTests } from "@/server/rate-limit";

import {
  entityArtifactResponseSchema,
  type EntityArtifactResponse,
} from "@/lib/entity-artifact";

// Route deps (@/data/db etc.) load dynamically at call time, so a static import
// here does NOT touch @/data/db before installAsSingleton runs.
import { GET } from "@/app/api/entity/route";

let fix: PgFixture;

/**
 * Extra rows for the National-Dex fallback gate (#2). Eternatus lives ONLY in a
 * fresh `national-dex` partition (the fallback target); the `gen-7` partition
 * (seeded by the tools fixture) gets a fuzzy neighbour, Tornadus, so an
 * "Eternatus" query there fuzzes onto the WRONG species unless the exact-match
 * gate refuses it.
 */
async function seedFallbackFixture(db: PgDb): Promise<void> {
  const now = Date.now();
  await db.insert(pokemon).values({
    id: "eternatus",
    format: "national-dex",
    species_name: "eternatus",
    form_name: null,
    display_name: "Eternatus",
    national_dex_number: 890,
    type1: "poison",
    type2: "dragon",
    ability_slot1: "pressure",
    ability_slot2: null,
    ability_hidden: null,
    stat_hp: 140,
    stat_attack: 85,
    stat_defense: 95,
    stat_special_attack: 145,
    stat_special_defense: 95,
    stat_speed: 130,
    base_stat_total: 690,
    sprite_url: "https://img.example/sprite/890.png",
    artwork_url: "https://img.example/art/890.png",
    generation: "gen-8",
    is_gen9_native: 1,
    source_generation: null,
  });
  await db.insert(searchable_names).values([
    {
      format: "national-dex",
      kind: "pokemon",
      slug: "eternatus",
      display_name: "Eternatus",
    },
    // Fuzzy neighbour in the REQUESTED (gen-7) scope: "Eternatus" would fuzz
    // onto this without the exact-match gate.
    {
      format: "gen-7",
      kind: "pokemon",
      slug: "tornadus",
      display_name: "Tornadus",
    },
  ]);
  await db.insert(ingest_meta).values({
    format: "national-dex",
    last_success_at: now,
    pokemon_count: 1,
    learnset_count: 0,
    names_count: 1,
    schema_version: "2",
  });
}

beforeAll(async () => {
  fix = await createPgSchema({
    seed: "tools",
    after: async (db) => {
      await seedEntityRefs(db);
      await seedFallbackFixture(db);
    },
  });
  await installAsSingleton(fix);
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

// This route now shares the `pub:<ip>` read rate-limit bucket (EDGE-02); reset
// it between cases so accumulated calls can't trip the limiter mid-suite.
beforeEach(() => _resetStoreForTests());

function call(params: Record<string, string>): Promise<Response> {
  const qs = new URLSearchParams(params).toString();
  return GET(new Request(`http://localhost/api/entity?${qs}`));
}

async function envelope(res: Response): Promise<EntityArtifactResponse> {
  expect(res.status).toBe(200);
  const body = await res.json();
  // Every 200 body must satisfy the shared contract.
  return entityArtifactResponseSchema.parse(body);
}

describe("GET /api/entity — ok per kind", () => {
  it("resolves a Pokémon by display name and returns a full profile", async () => {
    const env = await envelope(
      await call({ kind: "pokemon", q: "Garchomp", format: "scarlet-violet" }),
    );
    if (env.status !== "ok" || env.kind !== "pokemon") {
      throw new Error("expected ok pokemon");
    }
    expect(env.resolved.slug).toBe("garchomp");
    expect(env.data.movepool.length).toBeGreaterThan(0);
    expect(env.data.matchups.immune_to).toContain("electric");
  });

  it("returns a move profile", async () => {
    const env = await envelope(
      await call({ kind: "move", q: "earthquake", format: "scarlet-violet" }),
    );
    if (env.status !== "ok" || env.kind !== "move") {
      throw new Error("expected ok move");
    }
    expect(env.data.type).toBe("ground");
  });

  it("returns an ability profile with its learned_by roster", async () => {
    const env = await envelope(
      await call({ kind: "ability", q: "rough-skin", format: "scarlet-violet" }),
    );
    if (env.status !== "ok" || env.kind !== "ability") {
      throw new Error("expected ok ability");
    }
    expect(env.data.learned_by.map((h) => h.slug)).toContain("garchomp");
  });

  it("returns an item profile", async () => {
    const env = await envelope(
      await call({ kind: "item", q: "leftovers", format: "scarlet-violet" }),
    );
    expect(env.status).toBe("ok");
    expect(env.kind).toBe("item");
  });

  it("returns a type profile", async () => {
    const env = await envelope(
      await call({ kind: "type", q: "ground", format: "scarlet-violet" }),
    );
    if (env.status !== "ok" || env.kind !== "type") {
      throw new Error("expected ok type");
    }
    expect(env.data.offensive?.no_effect_against).toContain("flying");
  });
});

describe("GET /api/entity — miss + unavailable", () => {
  it("returns not_found for an unresolvable query", async () => {
    const env = await envelope(
      await call({
        kind: "pokemon",
        q: "zzznotapokemon",
        format: "scarlet-violet",
      }),
    );
    expect(env).toMatchObject({ status: "not_found", kind: "pokemon" });
  });

  it("falls back to National Dex for a species absent in the requested scope (not the fuzzy neighbour)", async () => {
    // Eternatus has no gen-7 row; the fuzzy nearest name there is Tornadus. The
    // exact-match gate must refuse Tornadus and instead show the EXACT National
    // Dex Eternatus, marked source_format (the Eternatus∉gen-6 → Tornadus bug #2).
    const env = await envelope(
      await call({ kind: "pokemon", q: "Eternatus", format: "gen-7" }),
    );
    if (env.status !== "ok" || env.kind !== "pokemon") {
      throw new Error("expected ok pokemon");
    }
    expect(env.resolved.slug).toBe("eternatus");
    expect(env.resolved.slug).not.toBe("tornadus");
    // Envelope format stays what the profile was assembled FROM (national-dex),
    // with source_format marking the cross-scope fallback.
    expect(env.format).toBe("national-dex");
    expect(env.source_format).toBe("national-dex");
  });

  it("returns not_found with POPULATED suggestions for a fuzzy-only miss (no exact anywhere)", async () => {
    // "Tornado" fuzzes onto gen-7's Tornadus but matches nothing exactly (and
    // National Dex has no Tornadus), so the route declines to render a fuzzy hit
    // and returns not_found with the requested-scope fuzzy names as suggestions.
    const env = await envelope(
      await call({ kind: "pokemon", q: "Tornado", format: "gen-7" }),
    );
    if (env.status !== "not_found") {
      throw new Error("expected not_found");
    }
    expect(env.kind).toBe("pokemon");
    expect(env.suggestions.length).toBeGreaterThan(0);
    expect(env.suggestions).toContain("Tornadus");
  });

  it("returns an exact in-scope match with NO source_format key", async () => {
    const res = await call({
      kind: "pokemon",
      q: "garchomp",
      format: "scarlet-violet",
    });
    const body = await res.json();
    const env = entityArtifactResponseSchema.parse(body);
    if (env.status !== "ok" || env.kind !== "pokemon") {
      throw new Error("expected ok pokemon");
    }
    expect(env.resolved.slug).toBe("garchomp");
    // The in-scope path must not stamp any fallback marker.
    expect("source_format" in body).toBe(false);
    expect(env.source_format).toBeUndefined();
  });

  it("returns unavailable when the requested format's index is unbuilt", async () => {
    // The "tools" seed builds scarlet-violet, gen-7, and champions — gen-8 has
    // no index.
    const env = await envelope(
      await call({ kind: "pokemon", q: "garchomp", format: "gen-8" }),
    );
    expect(env).toEqual({
      status: "unavailable",
      kind: "pokemon",
      format: "gen-8",
    });
  });
});

describe("GET /api/entity — malformed params → 4xx", () => {
  it("rejects an unknown kind", async () => {
    const res = await call({
      kind: "berry",
      q: "leftovers",
      format: "scarlet-violet",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing query", async () => {
    const res = await call({ kind: "pokemon", q: "", format: "scarlet-violet" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid format", async () => {
    const res = await call({ kind: "pokemon", q: "garchomp", format: "gen1" });
    expect(res.status).toBe(400);
  });
});
