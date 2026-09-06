/**
 * eval/deterministic.test.ts — the deterministic CI gate (design.md Phase 8,
 * § Testing Strategy: "eval/deterministic.ts exports the deterministically-
 * checkable subset … which is imported into a Vitest test so it runs on every
 * PR").
 *
 * Runs in the Vitest node project (the eval test glob) so the real tool layer
 * + Postgres fixture schema are available. The model client is mocked inside
 * runDeterministic (a scripted transcript, per provider), so this test NEVER
 * reaches the network — the dummy XAI_API_KEY / ANTHROPIC_API_KEY from
 * vitest.config.ts are enough and no real model call can occur.
 *
 * The subset is driven through BOTH scripted transports (T1): the Anthropic
 * content-block path AND the native Grok Responses path. Grok is the production
 * default (`DEFAULT_MODEL_KEY`), so a loop-level regression in its stream
 * adaptation / single-shot arg fallback / echo-flatten fails its own named `it`
 * here rather than slipping past CI.
 *
 * Asserts:
 *   1. Every deterministic case
 *      (G1/G3/G5/G6/G8/G11/G15/G26/G32/G35/G44/G47/G56/G57/G61) passes its
 *      structural checks against the real tools + fixture data, under EACH
 *      provider.
 *   2. The subset is exactly the one design.md + Oak v2 §7 specifies (a guard
 *      against the subset silently drifting), and every such case has a
 *      registered plan.
 *   3. Spot-checks on the load-bearing values: G15 = 169, G11 says "immune",
 *      G3 suggests "Will-O-Wisp", and G1 cites both learnsets — under each
 *      provider (the composed answer is derived from identical tool output).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The tool layer pulls in reference-cache.ts, which statically `import
// "server-only"` (it throws under the node test env). Neutralize it — the same
// pattern as src/data/repos/reference-cache.test.ts.
vi.mock("server-only", () => ({}));

import { createAgentContext } from "@/agent/context";
import type { AgentContext } from "@/agent/types";

import { deterministicCases } from "./cases";
import { createPgSchema, installAsSingleton, type PgFixture } from "../test/support/pg";
import type { AssertResult } from "./judge";
import type { DeterministicProvider } from "./deterministic";

/** IDs design.md + Oak v2 §7 pin to the deterministic CI subset. */
const EXPECTED_IDS = [
  "G1",
  "G3",
  "G5",
  "G6",
  "G8",
  "G11",
  "G15",
  "G26",
  "G32",
  "G35",
  "G44",
  "G47",
  "G56",
  "G57",
  "G61",
];

/** Both scripted transports are gated — Anthropic content-blocks AND native Grok. */
const PROVIDERS: readonly DeterministicProvider[] = ["anthropic", "grok"];

interface ProviderRun {
  results: AssertResult[];
  byId: Record<string, AssertResult>;
}

let ctx: AgentContext;
let byProvider: Record<DeterministicProvider, ProviderRun>;
let plannedIds: readonly string[];
let fix: PgFixture;

beforeAll(async () => {
  // NOTE: resolve_entity (G3) reads the @/data/db SINGLETON, not ctx.db. So we
  // migrate + seed an isolated Postgres schema and INSTALL it as that singleton
  // BEFORE the first @/data/db import — which happens when ./deterministic
  // (the runtime + tool layer) is imported dynamically below.
  fix = await createPgSchema({ seed: "eval" });
  await installAsSingleton(fix);

  // run_sql (G26/G32/G35/G44/G47) reads its OWN sandbox pool
  // (src/data/sql-sandbox.ts), not ctx.db/the singleton above — install the
  // same fixture pool there too, mirroring run-sql.oracle.test.ts.
  const { installSandboxPool } = await import("@/data/sql-sandbox");
  installSandboxPool(fix.bundle.pool);

  const { PLANNED_CASE_IDS, runDeterministic } = await import(
    "./deterministic"
  );
  plannedIds = PLANNED_CASE_IDS;

  // No `db` override → ctx binds the singleton (the seeded fixture schema), so
  // the DB-backed tools AND resolve_entity read the same data.
  ctx = await createAgentContext();
  byProvider = {} as Record<DeterministicProvider, ProviderRun>;
  for (const provider of PROVIDERS) {
    const results = await runDeterministic(deterministicCases, ctx, provider);
    byProvider[provider] = {
      results,
      byId: Object.fromEntries(results.map((r) => [r.caseId, r])),
    };
  }
}, 120_000);

afterAll(async () => {
  const { resetSandboxPool } = await import("@/data/sql-sandbox");
  resetSandboxPool();
  await fix?.cleanup();
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

for (const provider of PROVIDERS) {
  describe(`deterministic subset [${provider}] — all cases pass structural assertions`, () => {
    it("produces a result for every case", () => {
      expect(byProvider[provider].results.map((r) => r.caseId).sort()).toEqual(
        [...EXPECTED_IDS].sort(),
      );
    });

    // One assertion per case so a failure names the exact case + its failures.
    for (const id of EXPECTED_IDS) {
      it(`${id} passes`, () => {
        const r = byProvider[provider].byId[id];
        expect(r, `no result for ${id}`).toBeDefined();
        expect(r.pass, `${id} failed:\n - ${r.failures.join("\n - ")}`).toBe(
          true,
        );
      });
    }
  });

  describe(`deterministic subset [${provider}] — load-bearing spot checks`, () => {
    it("G15 computes Garchomp's Speed as exactly 169 (BR-6)", () => {
      const { byId } = byProvider[provider];
      expect(byId.G15.answer.answer_markdown).toContain("169");
      expect(byId.G15.answer.damage_calc?.result.value).toBe(169);
    });

    it("G11 reports the Ground→Flying immunity as 'immune', not a resist (BR-5)", () => {
      const md = byProvider[provider].byId.G11.answer.answer_markdown.toLowerCase();
      expect(md).toContain("immune");
      expect(md).not.toContain("not very effective");
    });

    it("G3 suggests the correctly-spelled move (BR-9)", () => {
      const a = byProvider[provider].byId.G3.answer;
      expect(a.status).toBe("clarification_needed");
      expect(a.suggestions ?? []).toContain("Will-O-Wisp");
    });

    it("G1 finds at least one intersection candidate and cites both learnsets", () => {
      const a = byProvider[provider].byId.G1.answer;
      expect(a.candidates?.total_count ?? 0).toBeGreaterThanOrEqual(1);
      const sources = a.citations.map((c) => c.source);
      expect(sources.some((s) => s.startsWith("learnset/trick-room"))).toBe(true);
      expect(sources.some((s) => s.startsWith("learnset/will-o-wisp"))).toBe(
        true,
      );
    });

    it("G35 rejects the Fire-Fang-Gen-3-bug premise: Fire Fang is Generation 4 (BQ-10)", () => {
      const md = byProvider[provider].byId.G35.answer.answer_markdown;
      expect(md).toContain("Generation 4");
    });

    it("G32 finds the fixture's real purple species (gengar/koffing/weezing/grimer) (BQ-7)", () => {
      const md = byProvider[provider].byId.G32.answer.answer_markdown;
      expect(md).toContain("gengar");
      expect(md).toMatch(/^\*\*4\*\*/);
    });

    it("G56 counts the whole-dex natdex_species table, not the narrower Champions roster", () => {
      const a = byProvider[provider].byId.G56.answer;
      // The fixture's natdex_species table (NATDEX_SPECIES_ROWS) has 9 rows —
      // asserting the literal count pins that the aggregation ran over the
      // whole table, not some narrower/filtered roster.
      expect(a.answer_markdown).toContain("9");
      expect(a.citations.some((c) => c.source.startsWith("natdex_species"))).toBe(
        true,
      );
    });

    it("G57 finds Darmanitan-Galar-Zen via LEAST/GREATEST-normalized, form-aware SQL", () => {
      const a = byProvider[provider].byId.G57.answer;
      expect(a.answer_markdown).toContain("Darmanitan");
      expect(
        a.citations.some((c) => c.source.startsWith("pokemon")),
      ).toBe(true);
    });

    it("G61 keeps kangaskhan-mega with a learnset-unavailable warning (BOX-AC-1.2)", () => {
      const a = byProvider[provider].byId.G61.answer;
      expect(a.answer_markdown).toContain("kangaskhan-mega");
      expect(a.answer_markdown).toContain("Learnset unavailable");
    });
  });
}

describe("G57 plan — type-combo slot-order normalization (production incident regression)", () => {
  it("issues a query normalized with LEAST/GREATEST, not an ordered-pair comparison", async () => {
    const { planQueries } = await import("./deterministic");
    const queries = planQueries("G57");
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q).toContain("LEAST");
      expect(q).toContain("GREATEST");
    }
  });

  it("queries the form-aware pokemon@national-dex partition, not natdex_species", async () => {
    const { planQueries } = await import("./deterministic");
    const [query] = planQueries("G57");
    expect(query).toContain("format = 'national-dex'");
    expect(query).not.toContain("natdex_species");
  });
});
