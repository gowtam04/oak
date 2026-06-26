/**
 * Unit tests for src/ingest/warm-cache.ts
 *
 * Two suites:
 *
 * 1. Normalizer functions — pure, no DB, no network. Verified against inline
 *    fixtures whose expected values come from the tool output shapes in
 *    tools.md (T4–T8) and data-sources.md DS-4.
 *
 * 2. warmCache integration — in-memory SQLite (migration applied directly),
 *    mocked PokeApiClient (no live crawl). Verifies skip-if-fresh, upsert,
 *    per-entry failure isolation, and report counts.
 *
 * The in-memory DB is created with better-sqlite3 + drizzle (the same stack as
 * production) so the Drizzle schema types are satisfied without importing the
 * db singleton (which carries `import "server-only"`).
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/data/schema";
import type { PokeApiClient } from "@/data/pokeapi-client";
import { ok, err } from "@/lib/result";

import {
  normalizeMove,
  normalizeAbility,
  normalizeType,
  normalizeEvolutionChain,
  flattenChainLinks,
  normalizeItem,
  warmCache,
} from "./warm-cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../drizzle/0000_medical_blur.sql",
);

function parseMigration(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  for (const stmt of parseMigration(sql)) {
    sqlite.exec(stmt);
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

// ---------------------------------------------------------------------------
// 1. normalizeMove (T4)
// ---------------------------------------------------------------------------

describe("normalizeMove", () => {
  const FAKE_OUT_RAW = {
    name: "fake-out",
    names: [
      { name: "Fake Out", language: { name: "en" } },
      { name: "Finta", language: { name: "it" } },
    ],
    type: { name: "normal" },
    damage_class: { name: "physical" },
    power: 40,
    accuracy: 100,
    pp: 10,
    priority: 3,
    target: { name: "selected-pokemon" },
    effect_entries: [
      {
        effect: "Inflicts regular damage. Has +3 priority.",
        short_effect: "Hits first (priority +3) and makes the target flinch.",
        language: { name: "en" },
      },
    ],
  };

  it("maps display_name from English names[]", () => {
    const r = normalizeMove(FAKE_OUT_RAW);
    expect(r?.display_name).toBe("Fake Out");
  });

  it("maps type, damage_class, power, accuracy, pp, priority, target", () => {
    const r = normalizeMove(FAKE_OUT_RAW);
    expect(r).toMatchObject({
      found: true,
      type: "normal",
      damage_class: "physical",
      power: 40,
      accuracy: 100,
      pp: 10,
      priority: 3,
      target: "selected-pokemon",
    });
  });

  it("maps effect_short and effect_full from English effect_entries", () => {
    const r = normalizeMove(FAKE_OUT_RAW);
    expect(r?.effect_short).toContain("priority +3");
    expect(r?.effect_full).toContain("regular damage");
  });

  it("allows null power for status moves", () => {
    const statusMove = {
      ...FAKE_OUT_RAW,
      power: null,
      damage_class: { name: "status" },
    };
    const r = normalizeMove(statusMove);
    expect(r?.power).toBeNull();
    expect(r?.damage_class).toBe("status");
  });

  it("returns null for an empty object", () => {
    expect(normalizeMove({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. normalizeAbility (T5)
// ---------------------------------------------------------------------------

describe("normalizeAbility", () => {
  const ARMOR_TAIL_RAW = {
    name: "armor-tail",
    names: [{ name: "Armor Tail", language: { name: "en" } }],
    effect_entries: [
      {
        effect:
          "The Pokémon and its allies cannot be targeted by opposing moves with positive priority.",
        short_effect:
          "Prevents the holder from being hit by moves with increased priority.",
        language: { name: "en" },
      },
    ],
  };

  it("extracts display_name from English names[]", () => {
    const r = normalizeAbility(ARMOR_TAIL_RAW);
    expect(r?.display_name).toBe("Armor Tail");
  });

  it("has found: true and both effect fields", () => {
    const r = normalizeAbility(ARMOR_TAIL_RAW);
    expect(r?.found).toBe(true);
    expect(r?.effect_short).toContain("increased priority");
    expect(r?.effect_full).toContain("allies cannot be targeted");
  });

  it("returns null when name is absent", () => {
    expect(normalizeAbility({ effect_entries: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. normalizeType (T6) — immunities must not be collapsed into resists
// ---------------------------------------------------------------------------

describe("normalizeType", () => {
  const GROUND_RAW = {
    name: "ground",
    damage_relations: {
      double_damage_to: [
        { name: "fire" },
        { name: "electric" },
        { name: "poison" },
        { name: "rock" },
        { name: "steel" },
      ],
      half_damage_to: [{ name: "bug" }, { name: "grass" }],
      no_damage_to: [{ name: "flying" }],
      double_damage_from: [
        { name: "water" },
        { name: "grass" },
        { name: "ice" },
      ],
      half_damage_from: [{ name: "poison" }, { name: "rock" }],
      no_damage_from: [{ name: "electric" }],
    },
  };

  it("includes offensive profile for a single type", () => {
    const r = normalizeType(GROUND_RAW);
    expect(r?.offensive?.super_effective_against).toContain("fire");
    expect(r?.offensive?.not_very_effective_against).toContain("bug");
    expect(r?.offensive?.no_effect_against).toContain("flying");
  });

  it("includes defensive profile with immunities separate from resists", () => {
    const r = normalizeType(GROUND_RAW);
    expect(r?.defensive.weak_to).toContain("water");
    expect(r?.defensive.resists).toContain("poison");
    // Flying immunity (0×) must appear in immune_to, NOT resists
    expect(r?.defensive.immune_to).toContain("electric");
    expect(r?.defensive.resists).not.toContain("electric");
  });

  it("sets types to [slug]", () => {
    const r = normalizeType(GROUND_RAW);
    expect(r?.types).toEqual(["ground"]);
  });

  it("returns null when name is absent", () => {
    expect(normalizeType({ damage_relations: {} })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. flattenChainLinks + normalizeEvolutionChain (T7)
// ---------------------------------------------------------------------------

describe("flattenChainLinks", () => {
  it("returns empty array for a base species with no evolutions", () => {
    const link = {
      species: { name: "snorlax" },
      evolves_to: [],
      evolution_details: [],
    };
    expect(flattenChainLinks(link)).toEqual([]);
  });

  it("extracts a single evolution edge with trigger", () => {
    const link = {
      species: { name: "eevee" },
      evolves_to: [
        {
          species: { name: "vaporeon" },
          evolution_details: [
            { trigger: { name: "use-item" }, item: { name: "water-stone" } },
          ],
          evolves_to: [],
        },
      ],
      evolution_details: [],
    };

    const edges = flattenChainLinks(link);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: "eevee", to: "vaporeon" });
    expect(edges[0].conditions[0]).toMatchObject({
      trigger: "use-item",
      item: "water-stone",
    });
  });

  it("handles branching evolutions (Eevee with 2 eeveelutions)", () => {
    const link = {
      species: { name: "eevee" },
      evolves_to: [
        {
          species: { name: "vaporeon" },
          evolution_details: [
            { trigger: { name: "use-item" }, item: { name: "water-stone" } },
          ],
          evolves_to: [],
        },
        {
          species: { name: "espeon" },
          evolution_details: [
            {
              trigger: { name: "level-up" },
              min_happiness: 160,
              time_of_day: "day",
            },
          ],
          evolves_to: [],
        },
      ],
      evolution_details: [],
    };

    const edges = flattenChainLinks(link);
    expect(edges).toHaveLength(2);
    const espeon = edges.find((e) => e.to === "espeon");
    expect(espeon?.conditions[0]).toMatchObject({
      trigger: "level-up",
      min_happiness: 160,
      time_of_day: "day",
    });
  });

  it("handles multi-stage chains (rattata → raticate)", () => {
    const link = {
      species: { name: "rattata" },
      evolves_to: [
        {
          species: { name: "raticate" },
          evolution_details: [{ trigger: { name: "level-up" }, min_level: 20 }],
          evolves_to: [],
        },
      ],
      evolution_details: [],
    };

    const edges = flattenChainLinks(link);
    expect(edges).toHaveLength(1);
    expect(edges[0].conditions[0]).toMatchObject({
      trigger: "level-up",
      min_level: 20,
    });
  });

  it("omits null/false/0/empty-string condition fields", () => {
    const link = {
      species: { name: "haunter" },
      evolves_to: [
        {
          species: { name: "gengar" },
          evolution_details: [
            {
              trigger: { name: "trade" },
              item: null,
              min_happiness: 0,
              time_of_day: "",
              needs_overworld_rain: false,
            },
          ],
          evolves_to: [],
        },
      ],
      evolution_details: [],
    };

    const edges = flattenChainLinks(link);
    const cond = edges[0].conditions[0];
    expect(cond).toEqual({ trigger: "trade" });
    expect(cond).not.toHaveProperty("item");
    expect(cond).not.toHaveProperty("min_happiness");
  });
});

describe("normalizeEvolutionChain", () => {
  it("wraps flattenChainLinks with found:true", () => {
    const raw = {
      id: 66,
      chain: {
        species: { name: "abra" },
        evolves_to: [
          {
            species: { name: "kadabra" },
            evolution_details: [
              { trigger: { name: "level-up" }, min_level: 16 },
            ],
            evolves_to: [
              {
                species: { name: "alakazam" },
                evolution_details: [{ trigger: { name: "trade" } }],
                evolves_to: [],
              },
            ],
          },
        ],
        evolution_details: [],
      },
    };

    const r = normalizeEvolutionChain(raw);
    expect(r?.found).toBe(true);
    expect(r?.chain).toHaveLength(2);
    expect(r?.chain[0]).toMatchObject({ from: "abra", to: "kadabra" });
    expect(r?.chain[1]).toMatchObject({ from: "kadabra", to: "alakazam" });
  });

  it("returns null when chain field is absent", () => {
    expect(normalizeEvolutionChain({ id: 1 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. normalizeItem (T8)
// ---------------------------------------------------------------------------

describe("normalizeItem", () => {
  const LEFTOVERS_RAW = {
    name: "leftovers",
    names: [{ name: "Leftovers", language: { name: "en" } }],
    effect_entries: [
      {
        effect:
          "At the end of each turn, the holder recovers 1/16 of its maximum HP.",
        short_effect:
          "Holder restores 1/16 of its max HP at the end of each turn.",
        language: { name: "en" },
      },
    ],
    held_by_pokemon: [
      {
        pokemon: { name: "snorlax" },
        version_details: [{ rarity: 100 }, { rarity: 50 }],
      },
    ],
  };

  it("maps display_name, effect_short, effect_full", () => {
    const r = normalizeItem(LEFTOVERS_RAW);
    expect(r?.display_name).toBe("Leftovers");
    expect(r?.effect_short).toContain("1/16");
    expect(r?.effect_full).toContain("maximum HP");
  });

  it("includes held_by_wild with max rarity across versions", () => {
    const r = normalizeItem(LEFTOVERS_RAW);
    expect(r?.held_by_wild).toEqual([
      { pokemon: "snorlax", rarity_percent: 100 },
    ]);
  });

  it("omits held_by_wild when held_by_pokemon is empty", () => {
    const noHeld = { ...LEFTOVERS_RAW, held_by_pokemon: [] };
    const r = normalizeItem(noHeld);
    expect(r?.held_by_wild).toBeUndefined();
  });

  it("returns null when name is absent", () => {
    expect(normalizeItem({ effect_entries: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. warmCache integration — mocked client + in-memory DB
// ---------------------------------------------------------------------------

describe("warmCache", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    const bundle = buildTestDb();
    sqlite = bundle.sqlite;
    db = bundle.db;

    // Seed: one move in searchable_names so the warm loop has something to fetch.
    sqlite.exec(`
      INSERT INTO searchable_names (kind, slug, display_name)
      VALUES ('move', 'fake-out', 'Fake Out')
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  function makeMockClient(responses: Record<string, object>): PokeApiClient {
    return {
      get: vi.fn(async (path: string) => {
        const key = path
          .replace(/^https?:\/\/[^/]+\/api\/v2\//, "")
          .replace(/^\//, "");
        const data = responses[key] ?? responses[path];
        if (data) return ok(data);
        return err({
          code: "http_error" as const,
          status: 404,
          url: path,
          attempts: 1,
        });
      }),
    } as unknown as PokeApiClient;
  }

  const FAKE_OUT_RESPONSE = {
    name: "fake-out",
    names: [{ name: "Fake Out", language: { name: "en" } }],
    type: { name: "normal" },
    damage_class: { name: "physical" },
    power: 40,
    accuracy: 100,
    pp: 10,
    priority: 3,
    target: { name: "selected-pokemon" },
    effect_entries: [
      {
        effect: "Inflicts damage.",
        short_effect: "Hits first.",
        language: { name: "en" },
      },
    ],
  };

  it("fetches and stores a move entry that is not yet cached", async () => {
    const client = makeMockClient({ "move/fake-out": FAKE_OUT_RESPONSE });

    const report = await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["move"],
      baseUrl: "https://pokeapi.co/api/v2",
    });

    expect(report.attempted).toBe(1);
    expect(report.stored).toBe(1);
    expect(report.skipped).toBe(0);
    expect(report.failed).toBe(0);

    const row = sqlite
      .prepare(
        "SELECT * FROM reference_cache WHERE resource_key = 'move/fake-out'",
      )
      .get() as { payload: string; resource_kind: string } | undefined;

    expect(row).toBeDefined();
    expect(row?.resource_kind).toBe("move");
    const payload = JSON.parse(row!.payload) as {
      found: boolean;
      display_name: string;
    };
    expect(payload.found).toBe(true);
    expect(payload.display_name).toBe("Fake Out");
  });

  it("skips an entry that is already fresh within the TTL window", async () => {
    // Pre-seed the cache with a very recent timestamp.
    const now = Date.now();
    sqlite.exec(`
      INSERT INTO reference_cache
        (resource_key, resource_kind, payload, endpoint_url, fetched_at)
      VALUES
        ('move/fake-out', 'move', '{"found":true}',
         'https://pokeapi.co/api/v2/move/fake-out', ${now})
    `);

    const client = makeMockClient({});

    const report = await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["move"],
      skipIfFreshWithinMs: 24 * 60 * 60 * 1000,
      baseUrl: "https://pokeapi.co/api/v2",
    });

    expect(report.skipped).toBe(1);
    expect(report.stored).toBe(0);
    expect((client.get as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("re-fetches an entry whose cached fetched_at is older than the TTL", async () => {
    const staleAt = Date.now() - 48 * 60 * 60 * 1000; // 48 h ago
    sqlite.exec(`
      INSERT INTO reference_cache
        (resource_key, resource_kind, payload, endpoint_url, fetched_at)
      VALUES
        ('move/fake-out', 'move', '{"found":true,"display_name":"old"}',
         'https://pokeapi.co/api/v2/move/fake-out', ${staleAt})
    `);

    const client = makeMockClient({ "move/fake-out": FAKE_OUT_RESPONSE });

    const report = await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["move"],
      skipIfFreshWithinMs: 24 * 60 * 60 * 1000,
      baseUrl: "https://pokeapi.co/api/v2",
    });

    expect(report.stored).toBe(1);
    expect(report.skipped).toBe(0);

    const row = sqlite
      .prepare(
        "SELECT payload FROM reference_cache WHERE resource_key='move/fake-out'",
      )
      .get() as { payload: string };
    const payload = JSON.parse(row.payload) as { display_name: string };
    // Updated to the fresh response.
    expect(payload.display_name).toBe("Fake Out");
  });

  it("records a failed entry when the client returns an HTTP error", async () => {
    const client = makeMockClient({}); // 404 for everything

    const report = await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["move"],
      baseUrl: "https://pokeapi.co/api/v2",
    });

    expect(report.failed).toBe(1);
    expect(report.stored).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].key).toBe("move/fake-out");
  });

  it("warms all 18 type entries regardless of searchable_names", async () => {
    // Types come from the hardcoded TYPE_NAMES list, not the DB.
    const TYPE_RESPONSE = {
      name: "fire",
      damage_relations: {
        double_damage_to: [],
        half_damage_to: [],
        no_damage_to: [],
        double_damage_from: [],
        half_damage_from: [],
        no_damage_from: [],
      },
    };
    // Return the same response for any type path.
    const client: PokeApiClient = {
      get: vi.fn(async (path: string) => {
        if (path.startsWith("type/")) {
          const typeName = path.replace("type/", "");
          return ok({ ...TYPE_RESPONSE, name: typeName });
        }
        return err({
          code: "http_error" as const,
          status: 404,
          url: path,
          attempts: 1,
        });
      }),
    } as unknown as PokeApiClient;

    const report = await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["type"],
      baseUrl: "https://pokeapi.co/api/v2",
    });

    expect(report.attempted).toBe(18);
    expect(report.stored).toBe(18);
    expect(report.failed).toBe(0);
  });

  it("calls onProgress for each entry", async () => {
    const client = makeMockClient({ "move/fake-out": FAKE_OUT_RESPONSE });
    const progress: string[] = [];

    await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["move"],
      baseUrl: "https://pokeapi.co/api/v2",
      onProgress: (msg) => progress.push(msg),
    });

    expect(progress.some((m) => m.includes("fake-out"))).toBe(true);
  });

  it("warms evolution-chain entries using a two-step species→chain fetch", async () => {
    // Seed one Pokémon so collectEntries produces one evolution entry.
    sqlite.exec(`
      INSERT INTO pokemon
        (id, species_name, form_name, display_name, national_dex_number,
         type1, type2, ability_slot1, ability_slot2, ability_hidden,
         stat_hp, stat_attack, stat_defense, stat_special_attack,
         stat_special_defense, stat_speed, base_stat_total,
         sprite_url, artwork_url, generation, is_gen9_native, source_generation)
      VALUES
        ('haunter', 'haunter', NULL, 'Haunter', 93,
         'ghost', 'poison', 'levitate', NULL, NULL,
         45, 50, 45, 115, 55, 95, 405,
         'https://sprites/93.png', 'https://art/93.png',
         'gen-1', 0, 'gen-1')
    `);

    const SPECIES_RESPONSE = {
      name: "haunter",
      evolution_chain: { url: "https://pokeapi.co/api/v2/evolution-chain/66" },
    };
    const CHAIN_RESPONSE = {
      id: 66,
      chain: {
        species: { name: "gastly" },
        evolves_to: [
          {
            species: { name: "haunter" },
            evolution_details: [
              { trigger: { name: "level-up" }, min_level: 25 },
            ],
            evolves_to: [
              {
                species: { name: "gengar" },
                evolution_details: [{ trigger: { name: "trade" } }],
                evolves_to: [],
              },
            ],
          },
        ],
        evolution_details: [],
      },
    };

    const client: PokeApiClient = {
      get: vi.fn(async (path: string) => {
        if (path === "pokemon-species/haunter") return ok(SPECIES_RESPONSE);
        if (path === "https://pokeapi.co/api/v2/evolution-chain/66")
          return ok(CHAIN_RESPONSE);
        return err({
          code: "http_error" as const,
          status: 404,
          url: path,
          attempts: 1,
        });
      }),
    } as unknown as PokeApiClient;

    const report = await warmCache({
      db: db as unknown as Parameters<typeof warmCache>[0]["db"],
      client,
      kinds: ["evolution"],
      baseUrl: "https://pokeapi.co/api/v2",
    });

    expect(report.stored).toBe(1);
    expect(report.failed).toBe(0);

    const row = sqlite
      .prepare(
        "SELECT payload, endpoint_url FROM reference_cache WHERE resource_key='evolution-chain/haunter'",
      )
      .get() as { payload: string; endpoint_url: string } | undefined;

    expect(row).toBeDefined();
    // endpoint_url should point to the actual chain URL, not the species URL
    expect(row?.endpoint_url).toContain("evolution-chain/66");

    const payload = JSON.parse(row!.payload) as {
      found: boolean;
      chain: unknown[];
    };
    expect(payload.found).toBe(true);
    expect(payload.chain).toHaveLength(2); // gastly→haunter, haunter→gengar
  });
});
