/**
 * INDEPENDENT ORACLE — Champions-first entity miss (ADR-8, CF-DATA-BR-5).
 *
 * Off-roster names are not found. Tools must not attach `exists_in_standard`
 * or fall back to a Scarlet/Violet evolution chain (`source_format`).
 *
 * Gen-7 index partitions are gone (P2); these cases use the champions slice
 * of seed "tools" (Garchomp on-roster; Excadrill / nonsense off-roster).
 * Dracovish, Farigiraf, and the Eevee evolution-chain row ARE in the fixture
 * (P2 remaining oracles) and must not be used as off-roster names.
 *
 * Wiring: migrate + seed an isolated Postgres schema and install it as the
 * @/data/db singleton BEFORE importing the tool layer (resolve-index Gotcha).
 *
 * Refs: ADR-8, CF-DATA-BR-5, CF-CHAT-AC-2.1, CF-CHAT-US-2.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getEvolutionChainOutputSchema,
  getPokemonOutputSchema,
  queryPokedexOutputSchema,
  queryPokedexResultSchema,
  resolveEntityOutputSchema,
  type QueryPokedexResult,
} from "@/agent/schemas";
import type { AgentContext } from "@/agent/types";
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

function ctxChampions(): Promise<AgentContext> {
  return createAgentContext({
    db: fix.db as unknown as OakDb,
    requestId: "oracle",
    mode: "champions",
  });
}

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

describe("champions get_pokemon — on-roster hit, off-roster miss (ADR-8)", () => {
  it("returns the Champions Garchomp profile", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const out = await dispatch("get_pokemon", { name: "garchomp" }, ctx);

    expect(getPokemonOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      found: true,
      display_name: "Garchomp",
      national_dex_number: 445,
    });
    expect(out).not.toHaveProperty("exists_in_standard");
  });

  it("off-roster (Excadrill) is not found, with no exists_in_standard", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const out = await dispatch("get_pokemon", { name: "excadrill" }, ctx);
    expect(getPokemonOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ found: false });
    expect(out).not.toHaveProperty("exists_in_standard");
  });

  it("a nonsense name is not found, with no exists_in_standard", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const out = await dispatch(
      "get_pokemon",
      { name: "definitely-not-a-pokemon" },
      ctx,
    );
    expect(getPokemonOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ found: false });
    expect(out).not.toHaveProperty("exists_in_standard");
  });
});

describe("champions query_pokedex — Champions roster only", () => {
  it("includes Garchomp among results", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const r = expectSuccess(await dispatch("query_pokedex", {}, ctx));
    expect(r.results.map((x) => x.display_name)).toContain("Garchomp");
  });
});

describe("champions resolve_entity / get_move miss — no exists_in_standard", () => {
  it("resolve_entity on an off-roster name returns matches: [] without exists_in_standard", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const out = await dispatch("resolve_entity", { query: "Excadrill" }, ctx);
    expect(resolveEntityOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ matches: [] });
    expect(out).not.toHaveProperty("exists_in_standard");
  });

  it("get_move on a Champions-absent slug is a plain miss", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const out = await dispatch("get_move", { name: "not-a-real-move" }, ctx);
    expect(out).toMatchObject({ found: false });
    expect(out).not.toHaveProperty("exists_in_standard");
  });
});

describe("champions get_evolution_chain — no SV fallback (ADR-8)", () => {
  it("a roster-absent species is not found, with no source_format", async () => {
    ensureLoaded();
    const ctx = await ctxChampions();
    const out = await dispatch(
      "get_evolution_chain",
      { species: "excadrill" },
      ctx,
    );
    expect(getEvolutionChainOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ found: false });
    expect(out).not.toHaveProperty("source_format");
    expect(out).not.toHaveProperty("exists_in_standard");
  });
});
