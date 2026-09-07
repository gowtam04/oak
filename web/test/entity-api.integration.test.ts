/**
 * Integration tests for `GET /api/entity` (B-4 Phase 3, P6c Champions-only).
 * Drives the real route handler against a real migrated + seeded Postgres
 * schema (Testcontainers).
 *
 * Asserts: `ok` for each kind on the Champions roster, `not_found` for an
 * unresolvable or off-roster query (no National Dex fallback), and a 4xx for
 * each malformed param. Other `format=` values are ignored for lookup.
 * resolveEntity reads the `@/data/db` singleton, so the fixture is installed
 * via `installAsSingleton` before the first call.
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
import { CHAMPIONS_FORMAT } from "@/data/formats";
import { ENTITY_REFERENCE_SEED } from "./fixtures/entity-refs";
import { ingest_meta, pokemon, reference_cache, searchable_names } from "@/data/schema";
import { _resetStoreForTests } from "@/server/rate-limit";

import {
  entityArtifactResponseSchema,
  type EntityArtifactResponse,
} from "@/lib/entity-artifact";

// Route deps (@/data/db etc.) load dynamically at call time, so a static import
// here does NOT touch @/data/db before installAsSingleton runs.
import { GET } from "@/app/api/entity/route";

let fix: PgFixture;

const SKIP_REF_KEYS = new Set(["move/earthquake"]);

async function seedChampionsEntityRefs(db: PgDb): Promise<void> {
  const now = Date.now();
  await db.insert(reference_cache).values(
    ENTITY_REFERENCE_SEED.filter((r) => !SKIP_REF_KEYS.has(r.resource_key)).map(
      (r) => ({
        format: CHAMPIONS_FORMAT,
        resource_key: r.resource_key,
        resource_kind: r.resource_kind,
        payload: JSON.stringify(r.payload),
        endpoint_url: `https://pokeapi.co/api/v2/${r.resource_key}`,
        fetched_at: now,
      }),
    ),
  );
}

/**
 * Off-roster rows that MUST NOT leak through a National Dex / gen-7 fallback.
 * Eternatus lives ONLY in a `national-dex` partition; Tornadus is gen-7-only.
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
      await seedChampionsEntityRefs(db);
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

  it("returns not_found for Eternatus even when a national-dex row exists (no fallback)", async () => {
    const env = await envelope(
      await call({ kind: "pokemon", q: "Eternatus", format: "gen-7" }),
    );
    expect(env.status).toBe("not_found");
    if (env.status !== "not_found") throw new Error("expected not_found");
    expect(env.kind).toBe("pokemon");
    expect(env.format).toBe("champions");
    expect(JSON.stringify(env)).not.toMatch(/eternatus/i);
    expect(env.suggestions).not.toContain("Tornadus");
    expect(env.suggestions).not.toContain("Eternatus");
  });

  it("returns not_found for a fuzzy miss without inventing another game", async () => {
    const env = await envelope(
      await call({ kind: "pokemon", q: "Tornado", format: "gen-7" }),
    );
    if (env.status !== "not_found") {
      throw new Error("expected not_found");
    }
    expect(env.kind).toBe("pokemon");
    expect(env.format).toBe("champions");
    expect(env.suggestions).not.toContain("Tornadus");
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

  it("ignores format=gen-8 and still looks up Champions", async () => {
    const env = await envelope(
      await call({ kind: "pokemon", q: "garchomp", format: "gen-8" }),
    );
    if (env.status !== "ok" || env.kind !== "pokemon") {
      throw new Error("expected ok pokemon");
    }
    expect(env.format).toBe("champions");
    expect(env.resolved.slug).toBe("garchomp");
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
