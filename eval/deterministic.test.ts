/**
 * eval/deterministic.test.ts — the deterministic CI gate (design.md Phase 8,
 * § Testing Strategy: "eval/deterministic.ts exports the deterministically-
 * checkable subset … which is imported into a Vitest test so it runs on every
 * PR").
 *
 * Runs in the Vitest node project (the eval test glob) so the real tool layer
 * + better-sqlite3 fixture DB are available. The Anthropic client is mocked
 * inside runDeterministic (a scripted transcript via runPokebotWith), so this
 * test NEVER reaches the network — the dummy ANTHROPIC_API_KEY from
 * vitest.config.ts is enough and no real model call can occur.
 *
 * Asserts:
 *   1. Every deterministic case (G1/G3/G5/G6/G8/G11/G15) passes its structural
 *      checks against the real tools + fixture data.
 *   2. The subset is exactly the one design.md specifies (a guard against the
 *      subset silently drifting), and every such case has a registered plan.
 *   3. Spot-checks on the load-bearing values: G15 = 169, G11 says "immune",
 *      G3 suggests "Will-O-Wisp", and G1 used query_pokedex with zero per-mon
 *      fetches.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The tool layer pulls in reference-cache.ts, which statically `import
// "server-only"` (it throws under the node test env). Neutralize it — the same
// pattern as src/data/repos/reference-cache.test.ts.
vi.mock("server-only", () => ({}));

import { createAgentContext } from "@/agent/context";
import type { AgentContext } from "@/agent/types";

import { deterministicCases } from "./cases";
import { createFixtureFile } from "./fixtures/seed-fixture-db";
import type { AssertResult } from "./judge";

/** IDs design.md pins to the deterministic CI subset. */
const EXPECTED_IDS = ["G1", "G3", "G5", "G6", "G8", "G11", "G15"];

let ctx: AgentContext;
let results: AssertResult[];
let byId: Record<string, AssertResult>;
let plannedIds: readonly string[];
let fixtureDir: string;

beforeAll(async () => {
  // NOTE: resolve_entity (G3) reads the @/data/db SINGLETON, not ctx.db. So we
  // point that singleton at a freshly-seeded on-disk fixture and clear the
  // global memo BEFORE the first @/data/db import — which happens when
  // ./deterministic (the runtime + tool layer) is imported dynamically below.
  fixtureDir = mkdtempSync(path.join(tmpdir(), "pokebot-deterministic-"));
  const fixturePath = path.join(fixtureDir, "fixture.sqlite");
  process.env.POKEBOT_DB_PATH = fixturePath;
  delete (globalThis as { __pokebotDb?: unknown }).__pokebotDb;

  // Build + seed the on-disk fixture, then close it so the singleton reads it.
  const seeded = createFixtureFile(fixturePath);
  (seeded as unknown as { $client?: { close?: () => void } }).$client?.close?.();

  const { PLANNED_CASE_IDS, runDeterministic } = await import(
    "./deterministic"
  );
  plannedIds = PLANNED_CASE_IDS;

  // No `db` override → ctx binds the singleton (the seeded fixture file), so the
  // DB-backed tools AND resolve_entity read the same data.
  ctx = await createAgentContext();
  results = await runDeterministic(deterministicCases, ctx);
  byId = Object.fromEntries(results.map((r) => [r.caseId, r]));
});

afterAll(async () => {
  const dbMod = (await import("@/data/db")) as { sqlite?: { close?: () => void } };
  dbMod.sqlite?.close?.();
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

describe("deterministic subset — membership", () => {
  it("matches the design.md-pinned set of case IDs", () => {
    const got = deterministicCases.map((c) => c.id).sort();
    expect(got).toEqual([...EXPECTED_IDS].sort());
  });

  it("has a registered plan for every deterministic case", () => {
    for (const c of deterministicCases) {
      expect(plannedIds).toContain(c.id);
    }
  });
});

describe("deterministic subset — all cases pass structural assertions", () => {
  it("produces a result for every case", () => {
    expect(results.map((r) => r.caseId).sort()).toEqual(
      [...EXPECTED_IDS].sort(),
    );
  });

  // One assertion per case so a failure names the exact case + its failures.
  for (const id of EXPECTED_IDS) {
    it(`${id} passes`, () => {
      const r = byId[id];
      expect(r, `no result for ${id}`).toBeDefined();
      expect(r.pass, `${id} failed:\n - ${r.failures.join("\n - ")}`).toBe(
        true,
      );
    });
  }
});

describe("deterministic subset — load-bearing spot checks", () => {
  it("G15 computes Garchomp's Speed as exactly 169 (BR-6)", () => {
    expect(byId.G15.answer.answer_markdown).toContain("169");
    expect(byId.G15.answer.damage_calc?.result.value).toBe(169);
  });

  it("G11 reports the Ground→Flying immunity as 'immune', not a resist (BR-5)", () => {
    const md = byId.G11.answer.answer_markdown.toLowerCase();
    expect(md).toContain("immune");
    expect(md).not.toContain("not very effective");
  });

  it("G3 suggests the correctly-spelled move (BR-9)", () => {
    expect(byId.G3.answer.status).toBe("clarification_needed");
    expect(byId.G3.answer.suggestions ?? []).toContain("Will-O-Wisp");
  });

  it("G1 finds at least one intersection candidate and cites both learnsets", () => {
    const a = byId.G1.answer;
    expect(a.candidates?.total_count ?? 0).toBeGreaterThanOrEqual(1);
    const sources = a.citations.map((c) => c.source);
    expect(sources.some((s) => s.startsWith("learnset/trick-room"))).toBe(true);
    expect(sources.some((s) => s.startsWith("learnset/will-o-wisp"))).toBe(
      true,
    );
  });
});
