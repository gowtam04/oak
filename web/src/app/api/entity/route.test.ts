/**
 * GET /api/entity — Champions-only lookup (P6c).
 *
 * Default and only data format is champions. Other `format=` values are
 * ignored for lookup (old clients must not 400). There is no National Dex
 * secondary lookup: an off-roster name is `not_found`, even when a
 * national-dex / gen-N row exists in the fixture.
 *
 * Requirement refs: CF-DEX-US-1, CF-DEX-AC-1.3, CF-DEX-AC-1.4,
 * api-design.md Entity.
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

import { ingest_meta, pokemon, reference_cache, searchable_names } from "@/data/schema";
import { CHAMPIONS_FORMAT, CHAMPIONS_REGULATION } from "@/data/formats";
import { entityArtifactResponseSchema } from "@/lib/entity-artifact";
import { _resetStoreForTests } from "@/server/rate-limit";
import { ENTITY_REFERENCE_SEED } from "../../../../test/fixtures/entity-refs";
import {
  createPgSchema,
  installAsSingleton,
  type PgDb,
  type PgFixture,
} from "../../../../test/support/pg";

type EntityRoute = typeof import("./route");

let fix: PgFixture;
let route: EntityRoute;

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

/** Off-roster rows that MUST NOT leak through a National Dex / gen-7 fallback. */
async function seedOtherGameOnly(db: PgDb): Promise<void> {
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
    {
      format: "gen-7",
      kind: "pokemon",
      slug: "tornadus",
      display_name: "Tornadus",
    },
    {
      format: "gen-7",
      kind: "pokemon",
      slug: "incineroar",
      display_name: "Incineroar",
    },
  ]);
  await db.insert(ingest_meta).values([
    {
      format: "national-dex",
      last_success_at: now,
      pokemon_count: 1,
      learnset_count: 0,
      names_count: 1,
      schema_version: "2",
    },
    {
      format: "gen-7",
      last_success_at: now,
      pokemon_count: 1,
      learnset_count: 0,
      names_count: 2,
      schema_version: "2",
    },
  ]);
}

function req(params: Record<string, string>): Request {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local/api/entity?${qs}`);
}

beforeAll(async () => {
  fix = await createPgSchema({
    seed: "tools",
    after: async (db) => {
      await seedChampionsEntityRefs(db);
      await seedOtherGameOnly(db);
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

describe("GET /api/entity — Champions default (api-design Entity, CF-DEX-AC-1.4)", () => {
  it("looks up champions when format is omitted (does not 400)", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "Garchomp" }));
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    expect(body.status).toBe("ok");
    if (body.status !== "ok" || body.kind !== "pokemon") {
      throw new Error("expected ok pokemon");
    }
    expect(body.format).toBe(CHAMPIONS_FORMAT);
    expect(body.resolved.slug).toBe("garchomp");
    expect(body.generation).toMatch(new RegExp(CHAMPIONS_REGULATION));
    expect("source_format" in body ? body.source_format : undefined).toBeUndefined();
  });

  it("ignores format=gen-7 and still returns the Champions profile (no 400)", async () => {
    const res = await route.GET(
      req({ kind: "pokemon", q: "garchomp", format: "gen-7" }),
    );
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    if (body.status !== "ok" || body.kind !== "pokemon") {
      throw new Error("expected ok pokemon");
    }
    expect(body.format).toBe(CHAMPIONS_FORMAT);
    expect(body.resolved.slug).toBe("garchomp");
    expect(body.format).not.toBe("gen-7");
    expect(body.format).not.toBe("national-dex");
  });

  it("ignores format=scarlet-violet and format=national-dex for lookup", async () => {
    for (const format of ["scarlet-violet", "national-dex"] as const) {
      const res = await route.GET(
        req({ kind: "pokemon", q: "garchomp", format }),
      );
      expect(res.status).toBe(200);
      const body = entityArtifactResponseSchema.parse(await res.json());
      if (body.status !== "ok") throw new Error(`expected ok for ${format}`);
      expect(body.format).toBe(CHAMPIONS_FORMAT);
      expect(body.resolved.slug).toBe("garchomp");
    }
  });
});

describe("GET /api/entity — no National Dex secondary lookup (CF-DEX-AC-1.4)", () => {
  it("returns not_found for Eternatus even when a national-dex row exists", async () => {
    const res = await route.GET(
      req({ kind: "pokemon", q: "Eternatus", format: "gen-7" }),
    );
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    expect(body.status).toBe("not_found");
    if (body.status !== "not_found") throw new Error("expected not_found");
    expect(body.kind).toBe("pokemon");
    expect(body.format).toBe(CHAMPIONS_FORMAT);
    expect(JSON.stringify(body)).not.toMatch(/eternatus/i);
    expect(body.suggestions).not.toContain("Tornadus");
    expect(body.suggestions).not.toContain("Eternatus");
  });

  it("returns not_found for a gen-7-only name (Incineroar), not a fallback profile", async () => {
    const res = await route.GET(
      req({ kind: "pokemon", q: "Incineroar" }),
    );
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    expect(body.status).toBe("not_found");
    if (body.status !== "not_found") throw new Error("expected not_found");
    expect(body.format).toBe(CHAMPIONS_FORMAT);
    expect(JSON.stringify(body)).not.toMatch(/incineroar/i);
  });

  it("returns not_found for an unresolved query without inventing another game", async () => {
    const res = await route.GET(
      req({ kind: "pokemon", q: "zzznotapokemon" }),
    );
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    expect(body).toMatchObject({
      status: "not_found",
      kind: "pokemon",
      format: CHAMPIONS_FORMAT,
    });
  });
});

describe("GET /api/entity — in-roster kinds (CF-DEX-AC-1.5)", () => {
  it("returns a Champions move profile", async () => {
    const res = await route.GET(req({ kind: "move", q: "earthquake" }));
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    if (body.status !== "ok" || body.kind !== "move") {
      throw new Error("expected ok move");
    }
    expect(body.format).toBe(CHAMPIONS_FORMAT);
    expect(body.data.type).toBe("ground");
  });

  it("returns a Champions ability profile", async () => {
    const res = await route.GET(req({ kind: "ability", q: "rough-skin" }));
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    if (body.status !== "ok" || body.kind !== "ability") {
      throw new Error("expected ok ability");
    }
    expect(body.format).toBe(CHAMPIONS_FORMAT);
    expect(body.data.learned_by.map((h) => h.slug)).toContain("garchomp");
  });

  it("returns a Champions item profile", async () => {
    const res = await route.GET(req({ kind: "item", q: "leftovers" }));
    expect(res.status).toBe(200);
    const body = entityArtifactResponseSchema.parse(await res.json());
    expect(body.status).toBe("ok");
    expect(body.kind).toBe("item");
    if (body.status === "ok") expect(body.format).toBe(CHAMPIONS_FORMAT);
  });
});

describe("GET /api/entity — malformed params", () => {
  it("400s an unknown kind", async () => {
    const res = await route.GET(req({ kind: "berry", q: "leftovers" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_kind" });
  });

  it("400s a missing query", async () => {
    const res = await route.GET(req({ kind: "pokemon", q: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_query" });
  });

  it("400s a garbage format value (not a stored Format) as invalid_request/invalid_format", async () => {
    const res = await route.GET(
      req({ kind: "pokemon", q: "garchomp", format: "gen1" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid_format|invalid_request/);
  });
});
