/**
 * INDEPENDENT ORACLE — get_learnset (T17, B-13). Proves the tool lists a form's
 * legal movepool for the turn's format through the public dispatch, that the
 * result is scoped to `ctx.mode`'s format (the divergence between two formats is
 * observable), and that a miss reuses get_pokemon's `{ found:false, suggestions }`
 * shape. Runs against the small deterministic fixture DB (seed "tools", which
 * carries a gen-7 slice alongside scarlet-violet).
 *
 * Behaviour derived from the task contract, NOT the impl:
 *   - found → { found:true, pokemon:<slug>, format, count, moves:[{slug,method}] },
 *     moves slug-sorted and scoped to the active format.
 *   - format scoping: the SAME species under two modes returns the two formats'
 *     divergent learnsets (Garchomp: SV has `fire-fang`, gen-7 does not).
 *   - miss → { found:false, suggestions } (BR-9), suggestions naming close slugs.
 *
 * Wiring mirrors gen-scope.oracle.test.ts (resolve-index Gotcha): migrate + seed
 * an isolated Postgres schema and install it as the @/data/db singleton BEFORE
 * importing the tool layer; `import "server-only"` is neutralized for vitest node.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GetLearnsetOutput } from "@/agent/schemas";
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
let tools: import("@/agent/types").ToolDef[];
let createAgentContext: typeof import("@/agent/context").createAgentContext;

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
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

describe("get_learnset holds its fixed T17 slot (append-only order)", () => {
  it("exposes `get_learnset` at index 16 — T18+ tools (e.g. web_search) append AFTER it", () => {
    ensureLoaded();
    expect(tools[16]?.name).toBe("get_learnset");
  });
});

describe("get_learnset lists a form's legal movepool (T17)", () => {
  it("returns the standard-format learnset, slug-sorted, with methods", async () => {
    ensureLoaded();
    const ctx = await ctxFor("standard");
    const out = (await dispatch(
      "get_learnset",
      { name: "Garchomp" },
      ctx,
    )) as GetLearnsetOutput;

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.pokemon).toBe("garchomp");
    expect(out.format).toBe("scarlet-violet");
    // SV Garchomp learnset in the fixture: dragon-claw, earthquake, fire-fang.
    expect(out.moves.map((m) => m.slug)).toEqual([
      "dragon-claw",
      "earthquake",
      "fire-fang",
    ]);
    expect(out.count).toBe(3);
    // Learn method rides along and is populated (not null) for these rows.
    expect(out.moves.find((m) => m.slug === "earthquake")?.method).toBe(
      "machine",
    );
    expect(out.moves.find((m) => m.slug === "dragon-claw")?.method).toBe(
      "level-up",
    );
  });

  it("is scoped to ctx.mode's format — the gen-7 movepool diverges", async () => {
    ensureLoaded();
    const ctx = await ctxFor("gen-7");
    const out = (await dispatch(
      "get_learnset",
      { name: "garchomp" },
      ctx,
    )) as GetLearnsetOutput;

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.format).toBe("gen-7");
    // gen-7 Garchomp lacks `fire-fang` (present under scarlet-violet) — the format
    // cut is observable through the tool.
    expect(out.moves.map((m) => m.slug)).toEqual(["dragon-claw", "earthquake"]);
    expect(out.count).toBe(2);
    expect(out.moves.some((m) => m.slug === "fire-fang")).toBe(false);
  });

  it("a species seeded only under gen-7 is a miss under standard mode", async () => {
    ensureLoaded();
    const ctx = await ctxFor("standard");
    const out = (await dispatch(
      "get_learnset",
      { name: "incineroar" },
      ctx,
    )) as GetLearnsetOutput;
    // Incineroar exists only under gen-7 in the fixture → not found under SV.
    expect(out.found).toBe(false);
  });

  it("an unknown name misses with close-slug suggestions (BR-9)", async () => {
    ensureLoaded();
    const ctx = await ctxFor("standard");
    const out = (await dispatch(
      "get_learnset",
      { name: "garchom" },
      ctx,
    )) as GetLearnsetOutput;

    expect(out.found).toBe(false);
    if (out.found) return;
    expect(Array.isArray(out.suggestions)).toBe(true);
    expect(out.suggestions).toContain("garchomp");
  });
});
