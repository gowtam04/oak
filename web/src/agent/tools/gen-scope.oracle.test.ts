/**
 * INDEPENDENT ORACLE — generation-scope (GS-A/GS-B, §2.8). Proves a
 * `ctx.mode = "gen-7"` turn reads the GEN-7 row-set through the public tool
 * dispatch, and that the gen-7 learnset diverges from gen 9, against the small
 * deterministic fixture DB (seed "tools" now carries a gen-7 slice alongside
 * scarlet-violet).
 *
 * Behaviour derived from the plan (locked decisions GS-D1/D2/D3) — NOT the impl:
 *   - Scope is SERVER-controlled: the turn's mode selects the data format via
 *     `formatForMode` (gen scopes map 1:1). The model has no scope tool input.
 *   - get_pokemon / query_pokedex under gen-7 return the gen-7 rows; a species
 *     seeded ONLY under gen-7 (Incineroar) is a miss under standard/gen-9.
 *   - The DIVERGENCE: `hidden-power` is gen-7-legal (Incineroar learns it) but
 *     absent from every scarlet-violet learnset — a moves filter resolves it
 *     under gen-7 yet reports `unresolved` under standard, pinning the cut.
 *   - resolve_entity is per-format: a gen-7 name resolves against the gen-7
 *     searchable_names slice.
 *
 * Wiring (per the RISK DIRECTIVES / the resolve-index Gotcha):
 *   - migrate + seed an isolated Postgres schema (createPgSchema) and install it
 *     as the @/data/db singleton (installAsSingleton) BEFORE importing the tool
 *     layer — resolve_entity reads the SINGLETON (not ctx.db), while the DB-backed
 *     tools read the bound ctx.db.
 *   - `import "server-only"` is neutralized so the repos/tools load under the
 *     vitest node environment.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPokemonOutputSchema,
  queryPokedexOutputSchema,
  queryPokedexResultSchema,
  resolveEntityOutputSchema,
  type QueryPokedexResult,
} from "@/agent/schemas";
import type { AgentContext, AgentMode } from "@/agent/types";
import type { OakDb } from "@/data/db";

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

type Dispatch = (
  name: string,
  args: unknown,
  ctx: AgentContext,
) => Promise<unknown>;

let fix: PgFixture;
let loadError: unknown = null;

let dispatch: Dispatch;
let createAgentContext: typeof import("@/agent/context").createAgentContext;

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
    await installAsSingleton(fix);

    ({ dispatch } = await import("@/agent/tools"));
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

/** Assert a query_pokedex call returned the success union, and return it. */
function expectSuccess(out: unknown): QueryPokedexResult {
  expect(
    queryPokedexOutputSchema.safeParse(out).success,
    `query_pokedex output failed schema: ${JSON.stringify(out)}`,
  ).toBe(true);
  const result = queryPokedexResultSchema.safeParse(out);
  expect(
    result.success,
    `expected a success result (total_count/results), got: ${JSON.stringify(out)}`,
  ).toBe(true);
  return result.data as QueryPokedexResult;
}

describe("get_pokemon reads the active format's row-set (GS-A)", () => {
  it("gen-7 mode returns the gen-7 Incineroar profile", async () => {
    ensureLoaded();
    const ctx = await ctxFor("gen-7");
    const out = await dispatch("get_pokemon", { name: "incineroar" }, ctx);

    expect(getPokemonOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      found: true,
      display_name: "Incineroar",
      national_dex_number: 727,
      types: ["fire", "dark"],
      abilities: { slot1: "blaze", hidden: "intimidate" },
      base_stats: {
        hp: 95,
        attack: 115,
        defense: 90,
        special_attack: 80,
        special_defense: 90,
        speed: 60,
      },
      base_stat_total: 530,
      // Native to THIS format's game — the field name is historical (§0).
      is_gen9_native: true,
    });
  });

  it("a gen-7-only species is a miss under standard (gen-9) mode — the formats are isolated", async () => {
    ensureLoaded();
    const ctx = await ctxFor("standard");
    const out = await dispatch("get_pokemon", { name: "incineroar" }, ctx);
    // Incineroar is seeded ONLY under gen-7, so standard mode never sees it.
    expect(out).toMatchObject({ found: false });
  });
});

describe("query_pokedex reads the active format's row-set (GS-A)", () => {
  it("gen-7 mode with no filters returns exactly the three gen-7 rows", async () => {
    ensureLoaded();
    const ctx = await ctxFor("gen-7");
    const r = expectSuccess(await dispatch("query_pokedex", {}, ctx));
    expect(r.total_count).toBe(3);
    expect(new Set(r.results.map((x) => x.display_name))).toEqual(
      new Set(["Incineroar", "Decidueye", "Garchomp"]),
    );
  });
});

describe("the gen-7 learnset diverges from gen 9 (GS-A divergence)", () => {
  it("gen-7 mode resolves `hidden-power` and returns Incineroar", async () => {
    ensureLoaded();
    const ctx = await ctxFor("gen-7");
    const r = expectSuccess(
      await dispatch("query_pokedex", { moves: ["hidden-power"] }, ctx),
    );
    expect(r.total_count).toBe(1);
    expect(r.results.map((x) => x.display_name)).toEqual(["Incineroar"]);
  });

  it("standard (gen-9) mode reports `hidden-power` UNRESOLVED — it was removed in Gen 8+", async () => {
    ensureLoaded();
    const ctx = await ctxFor("standard");
    const out = await dispatch(
      "query_pokedex",
      { moves: ["hidden-power"] },
      ctx,
    );
    // Not a throw, not a silent empty: the slug isn't in the gen-9 learnset.
    expect(queryPokedexOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toHaveProperty("unresolved");
    expect((out as { unresolved: string[] }).unresolved).toContain(
      "hidden-power",
    );
  });
});

describe("resolve_entity is per-format (resolve-index Gotcha)", () => {
  it("gen-7 mode resolves a gen-7 species name to its slug", async () => {
    ensureLoaded();
    const ctx = await ctxFor("gen-7");
    const out = await dispatch("resolve_entity", { query: "Incineroar" }, ctx);
    expect(resolveEntityOutputSchema.safeParse(out).success).toBe(true);
    const matches = (out as { matches: { slug: string }[] }).matches;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.slug).toBe("incineroar");
  });
});
