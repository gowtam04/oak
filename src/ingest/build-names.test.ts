/**
 * Unit tests for src/ingest/build-names.ts
 *
 * Tests are fully offline — no live PokeAPI calls. The PokeApiClient is mocked
 * inline using vi.fn(), so tests run in CI without any network access.
 *
 * Coverage:
 *   slugToDisplayName — pure helper
 *   buildNames        — five entity kinds, pseudo-type exclusion, display_name
 *                       pass-through for pokemon, error propagation
 */

import { describe, expect, it, vi } from "vitest";
import type { PokeApiClient } from "@/data/pokeapi-client";
import {
  buildNames,
  slugToDisplayName,
  type NameRow,
  type PokemonNameSource,
} from "./build-names";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type StubLists = {
  move: Array<{ name: string; url: string }>;
  ability: Array<{ name: string; url: string }>;
  type: Array<{ name: string; url: string }>;
  item: Array<{ name: string; url: string }>;
};

/**
 * Build a mock PokeApiClient whose `get()` routes by path prefix.
 * Each call returning a list result wraps it in the PokeAPI list-response shape.
 */
function makeMockClient(lists: StubLists): PokeApiClient {
  return {
    get: vi.fn().mockImplementation((path: string) => {
      for (const [prefix, results] of Object.entries(lists) as [
        keyof StubLists,
        (typeof lists)[keyof StubLists],
      ][]) {
        if (path.startsWith(prefix)) {
          return Promise.resolve({
            ok: true,
            value: { count: results.length, results },
          });
        }
      }
      return Promise.resolve({
        ok: false,
        error: { code: "http_error", status: 404, url: path, attempts: 1 },
      });
    }),
  } as unknown as PokeApiClient;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const STUB_LISTS: StubLists = {
  move: [
    { name: "fake-out", url: "https://pokeapi.co/api/v2/move/252/" },
    { name: "will-o-wisp", url: "https://pokeapi.co/api/v2/move/261/" },
    { name: "earthquake", url: "https://pokeapi.co/api/v2/move/89/" },
  ],
  ability: [
    { name: "flash-fire", url: "https://pokeapi.co/api/v2/ability/18/" },
    { name: "armor-tail", url: "https://pokeapi.co/api/v2/ability/296/" },
    { name: "sap-sipper", url: "https://pokeapi.co/api/v2/ability/157/" },
  ],
  // Includes two pseudo-types that must be excluded from the index
  type: [
    { name: "fire", url: "https://pokeapi.co/api/v2/type/10/" },
    { name: "water", url: "https://pokeapi.co/api/v2/type/11/" },
    { name: "dragon", url: "https://pokeapi.co/api/v2/type/16/" },
    { name: "unknown", url: "https://pokeapi.co/api/v2/type/10001/" },
    { name: "shadow", url: "https://pokeapi.co/api/v2/type/10002/" },
  ],
  item: [
    { name: "leftovers", url: "https://pokeapi.co/api/v2/item/234/" },
    { name: "choice-band", url: "https://pokeapi.co/api/v2/item/220/" },
  ],
};

const STUB_POKEMON: PokemonNameSource[] = [
  { id: "garchomp", display_name: "Garchomp" },
  { id: "tauros-paldea-aqua", display_name: "Tauros (Paldean Aqua)" },
  { id: "farigiraf", display_name: "Farigiraf" },
];

// ---------------------------------------------------------------------------
// slugToDisplayName
// ---------------------------------------------------------------------------

describe("slugToDisplayName", () => {
  it("capitalizes a single-word slug", () => {
    expect(slugToDisplayName("fire")).toBe("Fire");
    expect(slugToDisplayName("garchomp")).toBe("Garchomp");
    expect(slugToDisplayName("water")).toBe("Water");
  });

  it("capitalizes each hyphenated segment and preserves hyphens", () => {
    expect(slugToDisplayName("will-o-wisp")).toBe("Will-O-Wisp");
    expect(slugToDisplayName("fake-out")).toBe("Fake-Out");
    expect(slugToDisplayName("armor-tail")).toBe("Armor-Tail");
    expect(slugToDisplayName("choice-band")).toBe("Choice-Band");
    expect(slugToDisplayName("sap-sipper")).toBe("Sap-Sipper");
    expect(slugToDisplayName("flash-fire")).toBe("Flash-Fire");
  });

  it("handles multi-segment slugs correctly", () => {
    expect(slugToDisplayName("tauros-paldea-aqua")).toBe("Tauros-Paldea-Aqua");
    expect(slugToDisplayName("mr-mime")).toBe("Mr-Mime");
  });

  it("returns an empty string unchanged", () => {
    expect(slugToDisplayName("")).toBe("");
  });

  it("does not double-capitalize already-uppercase letters", () => {
    // Input is always lowercase from PokeAPI slugs; but ensure idempotency
    expect(slugToDisplayName("earthquake")).toBe("Earthquake");
    expect(slugToDisplayName("Earthquake")).toBe("Earthquake"); // already capitalized
  });
});

// ---------------------------------------------------------------------------
// buildNames
// ---------------------------------------------------------------------------

describe("buildNames — pokemon rows (DS-2, no extra fetch)", () => {
  it("emits one pokemon row per input PokemonRow", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const pokemonRows = rows.filter((r) => r.kind === "pokemon");
    expect(pokemonRows).toHaveLength(STUB_POKEMON.length);
  });

  it("passes display_name through unchanged (not re-derived from slug)", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const pokemonRows = rows.filter((r) => r.kind === "pokemon");

    // "Tauros (Paldean Aqua)" must not be mangled by slug conversion
    expect(
      pokemonRows.find((r) => r.slug === "tauros-paldea-aqua")?.display_name,
    ).toBe("Tauros (Paldean Aqua)");
    expect(pokemonRows.find((r) => r.slug === "garchomp")?.display_name).toBe(
      "Garchomp",
    );
    expect(pokemonRows.find((r) => r.slug === "farigiraf")?.display_name).toBe(
      "Farigiraf",
    );
  });

  it("uses the pokemon id as the slug", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const pokemonRows = rows.filter((r) => r.kind === "pokemon");
    const slugs = pokemonRows.map((r) => r.slug);
    expect(slugs).toContain("garchomp");
    expect(slugs).toContain("tauros-paldea-aqua");
    expect(slugs).toContain("farigiraf");
  });
});

describe("buildNames — move rows", () => {
  it("emits one move row per slug returned by PokeAPI", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const moveRows = rows.filter((r) => r.kind === "move");
    expect(moveRows).toHaveLength(STUB_LISTS.move.length);
  });

  it("applies slugToDisplayName to move slugs", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const moveRows = rows.filter((r) => r.kind === "move");

    expect(moveRows.find((r) => r.slug === "will-o-wisp")?.display_name).toBe(
      "Will-O-Wisp",
    );
    expect(moveRows.find((r) => r.slug === "fake-out")?.display_name).toBe(
      "Fake-Out",
    );
    expect(moveRows.find((r) => r.slug === "earthquake")?.display_name).toBe(
      "Earthquake",
    );
  });
});

describe("buildNames — ability rows", () => {
  it("emits one ability row per slug returned by PokeAPI", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const abilityRows = rows.filter((r) => r.kind === "ability");
    expect(abilityRows).toHaveLength(STUB_LISTS.ability.length);
  });

  it("applies slugToDisplayName to ability slugs", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const abilityRows = rows.filter((r) => r.kind === "ability");

    expect(abilityRows.find((r) => r.slug === "armor-tail")?.display_name).toBe(
      "Armor-Tail",
    );
    expect(abilityRows.find((r) => r.slug === "flash-fire")?.display_name).toBe(
      "Flash-Fire",
    );
    expect(abilityRows.find((r) => r.slug === "sap-sipper")?.display_name).toBe(
      "Sap-Sipper",
    );
  });
});

describe("buildNames — type rows (pseudo-type exclusion)", () => {
  it("excludes 'unknown' from the type index", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    expect(
      rows.find((r) => r.kind === "type" && r.slug === "unknown"),
    ).toBeUndefined();
  });

  it("excludes 'shadow' from the type index", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    expect(
      rows.find((r) => r.kind === "type" && r.slug === "shadow"),
    ).toBeUndefined();
  });

  it("keeps all real battle types", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const typeRows = rows.filter((r) => r.kind === "type");
    // 5 in stub minus 2 excluded = 3
    expect(typeRows).toHaveLength(3);
    expect(typeRows.find((r) => r.slug === "fire")?.display_name).toBe("Fire");
    expect(typeRows.find((r) => r.slug === "water")?.display_name).toBe(
      "Water",
    );
    expect(typeRows.find((r) => r.slug === "dragon")?.display_name).toBe(
      "Dragon",
    );
  });
});

describe("buildNames — item rows", () => {
  it("emits one item row per slug returned by PokeAPI", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const itemRows = rows.filter((r) => r.kind === "item");
    expect(itemRows).toHaveLength(STUB_LISTS.item.length);
  });

  it("applies slugToDisplayName to item slugs", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const itemRows = rows.filter((r) => r.kind === "item");

    expect(itemRows.find((r) => r.slug === "leftovers")?.display_name).toBe(
      "Leftovers",
    );
    expect(itemRows.find((r) => r.slug === "choice-band")?.display_name).toBe(
      "Choice-Band",
    );
  });
});

describe("buildNames — overall structure", () => {
  it("covers all five entity kinds: pokemon, move, ability, type, item", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const kinds = new Set(rows.map((r) => r.kind));
    expect(kinds).toContain("pokemon");
    expect(kinds).toContain("move");
    expect(kinds).toContain("ability");
    expect(kinds).toContain("type");
    expect(kinds).toContain("item");
  });

  it("returns the correct total row count across all kinds", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const expected =
      STUB_POKEMON.length +
      STUB_LISTS.move.length +
      STUB_LISTS.ability.length +
      (STUB_LISTS.type.length - 2) + // minus "unknown" and "shadow"
      STUB_LISTS.item.length;
    expect(rows).toHaveLength(expected);
  });

  it("every row satisfies the searchable_names schema (kind, slug, display_name all present)", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames(STUB_POKEMON, client);
    const validKinds: NameRow["kind"][] = [
      "pokemon",
      "move",
      "ability",
      "type",
      "item",
    ];
    for (const row of rows) {
      expect(validKinds).toContain(row.kind);
      expect(typeof row.slug).toBe("string");
      expect(row.slug.length).toBeGreaterThan(0);
      expect(typeof row.display_name).toBe("string");
      expect(row.display_name.length).toBeGreaterThan(0);
    }
  });

  it("handles an empty pokemon list (no DS-2 rows) without error", async () => {
    const client = makeMockClient(STUB_LISTS);
    const rows = await buildNames([], client);
    expect(rows.filter((r) => r.kind === "pokemon")).toHaveLength(0);
    // Other kinds still populated from PokeAPI
    expect(rows.filter((r) => r.kind === "move").length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.kind === "item").length).toBeGreaterThan(0);
  });
});

describe("buildNames — error handling", () => {
  it("throws with a descriptive message when PokeAPI is unreachable", async () => {
    const failingClient: PokeApiClient = {
      get: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: "network_error",
          url: "https://pokeapi.co/api/v2/move?limit=100000&offset=0",
          detail: "ECONNREFUSED",
          attempts: 4,
        },
      }),
    } as unknown as PokeApiClient;

    await expect(buildNames(STUB_POKEMON, failingClient)).rejects.toThrow(
      /build-names: failed to fetch PokeAPI \/move list/,
    );
  });

  it("throws with a descriptive message on a non-retryable HTTP error (e.g. 503)", async () => {
    const errorClient: PokeApiClient = {
      get: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: "http_error",
          status: 503,
          url: "https://pokeapi.co/api/v2/move?limit=100000&offset=0",
          attempts: 4,
        },
      }),
    } as unknown as PokeApiClient;

    await expect(buildNames(STUB_POKEMON, errorClient)).rejects.toThrow(
      /build-names: failed to fetch/,
    );
  });

  it("error message includes JSON-serialised PokeApiError for diagnostics", async () => {
    const failingClient: PokeApiClient = {
      get: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "http_error", status: 429, url: "...", attempts: 4 },
      }),
    } as unknown as PokeApiClient;

    let thrown: Error | null = null;
    try {
      await buildNames(STUB_POKEMON, failingClient);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    // The serialised error should appear in the message for debuggability
    expect(thrown?.message).toContain("http_error");
  });
});
