/**
 * INDEPENDENT ORACLE — T14 `get_encounters`, exercised through the PUBLIC tool
 * dispatch (src/agent/tools/index.ts) against the deterministic "tools" fixture.
 *
 * Behaviour under test (derived from the tool contract, not the implementation):
 *   - a covered species returns found:true with grouped, version-grouped data
 *   - a covered-but-empty species returns found:true, empty list + coverage_note
 *   - a species with NO encounter row falls back to found:true, empty + a note
 *     (graceful pre-feature-index behaviour, NOT index_unavailable)
 *   - an unknown name returns { found:false, suggestions } and NEVER throws
 *   - a CHAMPIONS-mode turn short-circuits to not_available_in_champions
 *     (encounters are standard-only) without reading the DB
 *   - B-12: a gen-scoped turn (mode "gen-5".."gen-8") stable-partitions the
 *     groups (active gen first), flags every group `in_active_scope`, and sets
 *     `scope_note` when nothing matches — nothing is ever dropped, and a
 *     "standard" turn stays byte-identical to pre-B-12 output (no new keys)
 *
 * Wiring mirrors tools-pokedex.oracle.test.ts: migrate + seed an isolated schema,
 * install it as the @/data/db singleton, then dynamic-import the tool surface.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// src/data/db.ts does `import "server-only"`, whose Node variant throws.
vi.mock("server-only", () => ({}));

import { getEncountersOutputSchema } from "@/agent/schemas";
import type { AgentContext } from "@/agent/types";

import { createPgSchema, installAsSingleton, type PgFixture } from "./support/pg";
import { loadToolSurface } from "./fixtures/tools-fixture";

let dispatch: (
  name: string,
  args: unknown,
  ctx: AgentContext,
) => Promise<unknown>;
let ctx: AgentContext;
let loadError: unknown = null;
let fix: PgFixture;

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
    await installAsSingleton(fix);
    const surface = await loadToolSurface();
    dispatch = surface.dispatch;
    ctx = surface.ctx;
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

function parse(out: unknown): void {
  expect(
    getEncountersOutputSchema.safeParse(out).success,
    `get_encounters output failed schema: ${JSON.stringify(out)}`,
  ).toBe(true);
}

describe("get_encounters oracle (T14)", () => {
  it("covered species → found:true with version-grouped locations", async () => {
    ensureLoaded();
    const out = await dispatch("get_encounters", { name: "garchomp" }, ctx);
    parse(out);
    expect(out).toMatchObject({ found: true, name: "Garchomp" });
    const detail = out as {
      encounters: {
        version_group: string;
        generation: number;
        versions: string[];
        locations: { location_display: string; method: string }[];
      }[];
      coverage_note?: string | null;
    };
    expect(detail.encounters.length).toBeGreaterThan(0);
    const swsh = detail.encounters.find(
      (g) => g.version_group === "sword-shield",
    );
    expect(swsh).toBeDefined();
    expect(swsh?.generation).toBe(8);
    expect(swsh?.locations[0]?.location_display).toBe("Lake of Outrage");
    // coverage_note is absent/null when there IS data.
    expect(detail.coverage_note ?? null).toBeNull();
  });

  it("covered-but-empty species → found:true, empty list + coverage_note", async () => {
    ensureLoaded();
    const out = await dispatch("get_encounters", { name: "dracovish" }, ctx);
    parse(out);
    const detail = out as {
      found: boolean;
      encounters: unknown[];
      coverage_note?: string | null;
    };
    expect(detail.found).toBe(true);
    expect(detail.encounters).toEqual([]);
    expect(typeof detail.coverage_note).toBe("string");
    expect(detail.coverage_note!.length).toBeGreaterThan(0);
  });

  it("species with no encounter row → graceful empty + note (NOT index_unavailable)", async () => {
    ensureLoaded();
    // Farigiraf is in the fixture pokemon table but has no encounters/* row.
    const out = await dispatch("get_encounters", { name: "farigiraf" }, ctx);
    parse(out);
    expect(out).toMatchObject({ found: true, name: "Farigiraf" });
    const detail = out as { encounters: unknown[]; coverage_note?: string | null };
    expect(detail.encounters).toEqual([]);
    expect(typeof detail.coverage_note).toBe("string");
  });

  it("unknown name → { found:false, suggestions } and NEVER throws", async () => {
    ensureLoaded();
    let out: unknown;
    await expect(
      (async () => {
        out = await dispatch(
          "get_encounters",
          { name: "definitely-not-a-mon" },
          ctx,
        );
      })(),
    ).resolves.toBeUndefined();
    parse(out);
    expect(out).toMatchObject({ found: false });
    expect(Array.isArray((out as { suggestions: unknown }).suggestions)).toBe(
      true,
    );
  });

  it("Champions mode → not_available_in_champions (standard-only feature)", async () => {
    ensureLoaded();
    const champCtx = { ...ctx, mode: "champions" } as AgentContext;
    const out = await dispatch("get_encounters", { name: "garchomp" }, champCtx);
    parse(out);
    expect(out).toEqual({ error: "not_available_in_champions" });
  });

  it("standard mode → byte-identical to pre-B-12 shape (no in_active_scope/scope_note keys)", async () => {
    ensureLoaded();
    const out = await dispatch("get_encounters", { name: "garchomp" }, ctx);
    parse(out);
    const detail = out as {
      found: true;
      name: string;
      encounters: Record<string, unknown>[];
      coverage_note: string | null;
    };
    expect(detail.encounters.length).toBe(2);
    for (const group of detail.encounters) {
      expect(group).not.toHaveProperty("in_active_scope");
    }
    expect(out).not.toHaveProperty("scope_note");
  });

  it("gen-7 scope → active-gen group foregrounded, all groups flagged, nothing dropped", async () => {
    ensureLoaded();
    const gen7Ctx = { ...ctx, mode: "gen-7" } as AgentContext;
    const out = await dispatch("get_encounters", { name: "garchomp" }, gen7Ctx);
    parse(out);
    const detail = out as {
      found: true;
      encounters: {
        version_group: string;
        generation: number;
        in_active_scope?: boolean;
      }[];
      scope_note?: string | null;
    };
    expect(detail.encounters.length).toBe(2);
    // Gen-7 (sun-moon) group sorts first; gen-8 (sword-shield) follows.
    expect(detail.encounters[0]?.version_group).toBe("sun-moon");
    expect(detail.encounters[0]?.in_active_scope).toBe(true);
    expect(detail.encounters[1]?.version_group).toBe("sword-shield");
    expect(detail.encounters[1]?.in_active_scope).toBe(false);
    expect(detail.scope_note ?? null).toBeNull();
  });

  it("gen-5 scope, species with no gen-5 groups → scope_note set, all groups kept and flagged false", async () => {
    ensureLoaded();
    const gen5Ctx = { ...ctx, mode: "gen-5" } as AgentContext;
    const out = await dispatch("get_encounters", { name: "garchomp" }, gen5Ctx);
    parse(out);
    const detail = out as {
      found: true;
      encounters: { in_active_scope?: boolean }[];
      scope_note?: string | null;
    };
    expect(detail.encounters.length).toBe(2);
    for (const group of detail.encounters) {
      expect(group.in_active_scope).toBe(false);
    }
    expect(detail.scope_note).toBe(
      "No Generation 5 catch locations are recorded for this Pokémon; the " +
        "locations below are from other generations' games.",
    );
  });
});
