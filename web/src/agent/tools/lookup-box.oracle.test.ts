/**
 * INDEPENDENT ORACLE — lookup_box (T22, team-from-box). Proves one tool call
 * bulk-looks-up many names (BOX-AC-3.2) and returns compact move info, not a
 * complete movepool (BOX-AC-3.4, BOX-BR-5). `get_learnset` stays the
 * full-movepool API at tools[16] (BOX-BR-7).
 *
 * Wiring mirrors get-learnset.oracle.test.ts: migrate + seed an isolated
 * Postgres schema, install it as the @/data/db singleton BEFORE importing the
 * tool layer; `import "server-only"` is neutralized for vitest node.
 *
 * Empty-learnset species is inserted here (not in tools-fixture.ts): a pokemon
 * + searchable_names row with ZERO learnset rows. That is found:true with
 * learnset.available:false — not a miss.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext, AgentMode } from "@/agent/types";
import type { OakDb } from "@/data/db";
import { pokemon, searchable_names } from "@/data/schema";

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

type CompactMove = {
  slug: string;
  method: string | null;
  type: string | null;
  category: string | null;
  power: number | null;
};

type LookupBoxHit = {
  query: string;
  found: true;
  pokemon: { display_name?: string; found?: boolean };
  learnset: {
    available: boolean;
    count: number;
    truncated: boolean;
    compact_moves: CompactMove[];
  };
};

type LookupBoxMiss = {
  query: string;
  found: false;
  suggestions: string[];
  exists_in_standard?: boolean;
};

type LookupBoxOutput = {
  format: string;
  truncated_input: boolean;
  results: Array<LookupBoxHit | LookupBoxMiss>;
};

type Dispatch = (
  name: string,
  args: unknown,
  ctx: AgentContext,
) => Promise<unknown>;

const EMPTY_LEARNSET_SLUG = "kangaskhan-mega";

async function seedEmptyLearnsetForm(db: PgFixture["db"]): Promise<void> {
  await db.insert(pokemon).values({
    id: EMPTY_LEARNSET_SLUG,
    format: "scarlet-violet",
    species_name: "kangaskhan",
    form_name: "mega",
    display_name: "Kangaskhan (Mega)",
    national_dex_number: 115,
    type1: "normal",
    type2: null,
    ability_slot1: "parental-bond",
    ability_slot2: null,
    ability_hidden: null,
    stat_hp: 105,
    stat_attack: 125,
    stat_defense: 100,
    stat_special_attack: 60,
    stat_special_defense: 100,
    stat_speed: 100,
    base_stat_total: 590,
    sprite_url: "https://img.example/sprite/115-mega.png",
    artwork_url: "https://img.example/art/115-mega.png",
    generation: "gen-6",
    is_gen9_native: 0,
    source_generation: "gen-6",
    required_item: "kangaskhanite",
  });
  await db.insert(searchable_names).values({
    format: "scarlet-violet",
    kind: "pokemon",
    slug: EMPTY_LEARNSET_SLUG,
    display_name: "Kangaskhan (Mega)",
  });
}

let fix: PgFixture;
let loadError: unknown = null;

let dispatch: Dispatch;
let tools: import("@/agent/types").ToolDef[];
let createAgentContext: typeof import("@/agent/context").createAgentContext;

beforeAll(async () => {
  try {
    fix = await createPgSchema({
      seed: "tools",
      after: seedEmptyLearnsetForm,
    });
    await installAsSingleton(fix);

    ({ dispatch, tools } = await import("@/agent/tools"));
    ({ createAgentContext } = await import("@/agent/context"));
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(`Tool layer not loadable: ${String(loadError)}`);
  }
}

function ctxFor(mode: AgentMode): Promise<AgentContext> {
  return createAgentContext({
    db: fix.db as unknown as OakDb,
    requestId: "oracle",
    mode,
  });
}

async function lookupBox(
  names: string[],
  mode: AgentMode = "standard",
): Promise<LookupBoxOutput> {
  const ctx = await ctxFor(mode);
  return (await dispatch("lookup_box", { names }, ctx)) as LookupBoxOutput;
}

describe("lookup_box holds the appended T22 slot (append-only order, BOX-BR-7)", () => {
  it("keeps get_learnset at index 16 and appends lookup_box as the last tools[].name", () => {
    ensureLoaded();
    expect(tools[16]?.name).toBe("get_learnset");
    expect(tools.at(-1)?.name).toBe("lookup_box");
  });
});

describe("lookup_box bulk species + compact learnset (BOX-AC-3.2, BOX-AC-3.4, BOX-BR-5)", () => {
  it("finds Garchomp in one call with compact_moves ≤ 16 and count ≥ compact length", async () => {
    ensureLoaded();
    const out = await lookupBox(["Garchomp"]);

    expect(out.format).toBe("scarlet-violet");
    expect(out.truncated_input).toBe(false);
    expect(out.results).toHaveLength(1);

    const hit = out.results[0];
    expect(hit?.found).toBe(true);
    if (!hit?.found) return;

    expect(hit.query).toBe("Garchomp");
    expect(hit.pokemon).toEqual(
      expect.objectContaining({ display_name: "Garchomp" }),
    );
    expect(hit.learnset.available).toBe(true);
    expect(hit.learnset.compact_moves.length).toBeLessThanOrEqual(16);
    expect(hit.learnset.count).toBeGreaterThanOrEqual(
      hit.learnset.compact_moves.length,
    );
    expect(hit.learnset.truncated).toBe(
      hit.learnset.compact_moves.length < hit.learnset.count,
    );
    expect(hit.learnset.count).toBe(3);
    expect(hit.learnset.truncated).toBe(false);
    expect(hit.learnset.compact_moves.map((m) => m.slug)).toEqual(
      expect.arrayContaining(["dragon-claw", "earthquake", "fire-fang"]),
    );
    expect(hit.learnset.compact_moves).toHaveLength(3);
    expect(
      hit.learnset.compact_moves.find((m) => m.slug === "earthquake")?.method,
    ).toBe("machine");
    for (const m of hit.learnset.compact_moves) {
      expect(m).toEqual(
        expect.objectContaining({
          slug: expect.any(String),
        }),
      );
      expect(m).toHaveProperty("method");
      expect(m).toHaveProperty("type");
      expect(m).toHaveProperty("category");
      expect(m).toHaveProperty("power");
    }
  });

  it("returns one results[] entry per query from a single call (BOX-AC-3.2)", async () => {
    ensureLoaded();
    const names = ["Garchomp", "Farigiraf", "Ninetales"];
    const out = await lookupBox(names);

    expect(out.results).toHaveLength(3);
    expect(out.results.map((r) => r.query)).toEqual(names);
    expect(out.results.every((r) => r.found)).toBe(true);
    if (
      !out.results[0]?.found ||
      !out.results[1]?.found ||
      !out.results[2]?.found
    ) {
      return;
    }
    expect(out.results[0].pokemon).toEqual(
      expect.objectContaining({ display_name: "Garchomp" }),
    );
    expect(out.results[1].pokemon).toEqual(
      expect.objectContaining({ display_name: "Farigiraf" }),
    );
    expect(out.results[2].pokemon).toEqual(
      expect.objectContaining({ display_name: "Ninetales" }),
    );
  });

  it("one call returns mixed hits and misses in input order (BOX-AC-3.2)", async () => {
    ensureLoaded();
    const out = await lookupBox(["Garchomp", "garchom"]);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]?.query).toBe("Garchomp");
    expect(out.results[0]?.found).toBe(true);
    expect(out.results[1]?.query).toBe("garchom");
    expect(out.results[1]?.found).toBe(false);
  });

  it("a miss returns found:false and a suggestions array", async () => {
    ensureLoaded();
    const out = await lookupBox(["garchom"]);

    expect(out.results).toHaveLength(1);
    const miss = out.results[0];
    expect(miss?.found).toBe(false);
    if (miss?.found) return;
    expect(miss.query).toBe("garchom");
    expect(Array.isArray(miss.suggestions)).toBe(true);
    expect(miss.suggestions).toContain("garchomp");
  });

  it("an empty learnset is found:true with learnset.available:false and count 0", async () => {
    ensureLoaded();
    const out = await lookupBox([EMPTY_LEARNSET_SLUG]);

    expect(out.results).toHaveLength(1);
    const hit = out.results[0];
    expect(hit?.found).toBe(true);
    if (!hit?.found) return;
    expect(hit.query).toBe(EMPTY_LEARNSET_SLUG);
    expect(hit.pokemon).toEqual(
      expect.objectContaining({ display_name: "Kangaskhan (Mega)" }),
    );
    expect(hit.learnset.available).toBe(false);
    expect(hit.learnset.count).toBe(0);
    expect(hit.learnset.compact_moves).toEqual([]);
    expect(hit.learnset.truncated).toBe(false);
  });

  it("names.length > 40 sets truncated_input and processes only the first 40", async () => {
    ensureLoaded();
    const names = [
      "Garchomp",
      ...Array.from({ length: 40 }, (_, i) => `not-a-mon-${i}`),
    ];
    expect(names).toHaveLength(41);

    const out = await lookupBox(names);

    expect(out.truncated_input).toBe(true);
    expect(out.results).toHaveLength(40);
    expect(out.results.map((r) => r.query)).toEqual(names.slice(0, 40));
    expect(out.results[0]?.found).toBe(true);
  });

  it("champions-mode miss includes exists_in_standard when the name exists in standard", async () => {
    ensureLoaded();
    const out = await lookupBox(["dracovish"], "champions");

    expect(out.format).toBe("champions");
    expect(out.results).toHaveLength(1);
    const miss = out.results[0];
    expect(miss?.found).toBe(false);
    if (miss?.found) return;
    expect(miss.exists_in_standard).toBe(true);
  });

  it("champions-mode miss on a nonsense name sets exists_in_standard: false", async () => {
    ensureLoaded();
    const out = await lookupBox(["definitely-not-a-pokemon"], "champions");

    const miss = out.results[0];
    expect(miss?.found).toBe(false);
    if (miss?.found) return;
    expect(miss.exists_in_standard).toBe(false);
  });

  it("standard-mode miss does not include exists_in_standard", async () => {
    ensureLoaded();
    const out = await lookupBox(["definitely-not-a-pokemon"]);
    const miss = out.results[0];
    expect(miss?.found).toBe(false);
    if (miss?.found) return;
    expect(miss).not.toHaveProperty("exists_in_standard");
  });
});
