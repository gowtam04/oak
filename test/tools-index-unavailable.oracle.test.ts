/**
 * INDEPENDENT ORACLE — query_pokedex must report a structured
 * { error: "index_unavailable" } (never throw, never fabricate) when the index
 * is empty / not yet ingested.
 *
 * Source of truth: tools.md T2 failure modes + design.md § Data Model
 * (ingest_meta "lets the app detect a missing/stale/empty index and return
 * index_unavailable gracefully"). evaluation.md G22 / integration.md map this to
 * an insufficient_data answer downstream.
 *
 * This file deliberately points POKEBOT_DB_PATH at its OWN fresh, MIGRATED but
 * EMPTY database (no rows, no ingest_meta) so the seeded-DB oracle and this one
 * never share a connection. Kept in a separate file so the @/data/db globalThis
 * singleton is bound to the empty fixture for the whole file.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Neutralize `import "server-only"` (db.ts) under the vitest node environment.
vi.mock("server-only", () => ({}));

import { queryPokedexOutputSchema } from "@/agent/schemas";
import type { AgentContext } from "@/agent/types";

import { loadToolSurface } from "./fixtures/tools-fixture";

let dispatch: (
  name: string,
  args: unknown,
  ctx: AgentContext,
) => Promise<unknown>;
let ctx: AgentContext;
let loadError: unknown = null;
let fixtureDir: string;

beforeAll(async () => {
  try {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "pokebot-oracle-empty-"));
    process.env.POKEBOT_DB_PATH = path.join(fixtureDir, "empty.sqlite");

    // Fresh connection bound to the empty fixture; migrations create the tables
    // (so the schema exists) but we insert NO rows and NO ingest_meta.
    delete (globalThis as { __pokebotDb?: unknown }).__pokebotDb;
    await import("@/data/db");

    const surface = await loadToolSurface();
    dispatch = surface.dispatch;
    ctx = surface.ctx;
  } catch (e) {
    loadError = e;
  }
}, 30_000);

afterAll(() => {
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(
      `Tool layer not loadable yet (Phase 4 incomplete): ${String(loadError)}`,
    );
  }
}

describe("query_pokedex oracle — empty index (T2 failure mode)", () => {
  it('reports { error: "index_unavailable" } against an un-ingested DB, without throwing', async () => {
    ensureLoaded();
    let out: unknown;
    await expect(
      (async () => {
        out = await dispatch(
          "query_pokedex",
          { sort_by: "speed", order: "desc" },
          ctx,
        );
      })(),
    ).resolves.toBeUndefined();

    expect(queryPokedexOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({ error: "index_unavailable" });
  });
});
