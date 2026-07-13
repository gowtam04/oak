/**
 * Node + Testcontainers Postgres tests for the team-builder assistant's patch
 * legality gate (`buildBuilderHooks(draft).validateAnswer` in runtime-hooks.ts)
 * — the builder twin of the main agent's proposed_team self-healing loop
 * (runtime.ts `validateOakAnswer`), but scoped to one turn's patch and holding
 * the model only to violations ITS patch introduced, never a pre-existing hard
 * violation already sitting in an untouched draft slot (the user's own hand
 * edit).
 *
 * Real Postgres (seed "tools", Testcontainers) so legality is checked against
 * actual index rows, exactly like validate-team.test.ts. Fixture facts relied
 * on (test/fixtures/tools-fixture.ts), mode "standard" -> format
 * "scarlet-violet":
 *   - garchomp: abilities { sand-veil, rough-skin }; learns earthquake,
 *     dragon-claw, fire-fang — NOT thunderbolt.
 *   - ninetales: abilities { flash-fire, drought }; learns will-o-wisp,
 *     trick-room, flamethrower.
 *   - legal held items include "leftovers" and "life-orb".
 *
 * No singleton install is needed: every path this test exercises takes the
 * fixture's `db` handle explicitly (via createAgentContext({ db })), and the
 * only `@/data/db` import in the reachable module graph is `import type`
 * (erased at compile time) or a dynamic import gated behind a branch (default
 * db / Champions items) this test never takes.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAgentContext } from "@/agent/context";
import type { AgentContext } from "@/agent/types";
import type { OakDb } from "@/data/db";
import type { TeamMember } from "@/data/teams/team-schema";
import { createPgSchema, type PgFixture } from "../../../test/support/pg";
import { buildBuilderHooks, MAX_BUILDER_PATCH_RETRIES } from "./runtime-hooks";
import type { BuilderAnswer, TeamPatch } from "./schemas";

let fix: PgFixture;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

const ZERO: TeamMember["evs"] = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const PERFECT: TeamMember["ivs"] = {
  hp: 31,
  atk: 31,
  def: 31,
  spa: 31,
  spd: 31,
  spe: 31,
};

function blank(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { ...ZERO },
    ivs: { ...PERFECT },
    tera_type: null,
    level: 50,
    nickname: null,
    ...overrides,
  };
}

/** Garchomp with an illegal move — "thunderbolt" is not in the fixture's learnset. */
function illegalGarchomp(overrides: Partial<TeamMember> = {}): TeamMember {
  return blank({
    species: "garchomp",
    ability: "sand-veil",
    item: "leftovers",
    moves: ["thunderbolt", "dragon-claw", "fire-fang", "earthquake"],
    ...overrides,
  });
}

/** A fully-legal Ninetales set — distinct species + item from garchomp's. */
function legalNinetales(overrides: Partial<TeamMember> = {}): TeamMember {
  return blank({
    species: "ninetales",
    ability: "flash-fire",
    item: "life-orb",
    moves: ["will-o-wisp", "trick-room", "flamethrower", "will-o-wisp"],
    ...overrides,
  });
}

async function ctxFor(): Promise<AgentContext> {
  return createAgentContext({
    db: fix.db as unknown as OakDb,
    requestId: "rh-test",
    mode: "standard",
  });
}

describe("buildBuilderHooks().validateAnswer — the patch legality gate", () => {
  it("accepts an advice-only answer (no team_patch) unconditionally", async () => {
    const hooks = buildBuilderHooks([]);
    const ctx = await ctxFor();
    const answer: BuilderAnswer = { answer_markdown: "Here's some advice." };

    const verdict = await hooks.validateAnswer(answer, ctx, 0);

    expect(verdict.ok).toBe(true);
  });

  it("rejects a patch that introduces an illegal move, naming the legal moves and pointing at get_learnset", async () => {
    const hooks = buildBuilderHooks([]); // empty draft — nothing pre-existing
    const ctx = await ctxFor();
    const patch: TeamPatch = { slots: [{ slot: 0, member: illegalGarchomp() }] };
    const answer: BuilderAnswer = {
      answer_markdown: "Here's a pick.",
      team_patch: patch,
    };

    const verdict = await hooks.validateAnswer(answer, ctx, 0);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("expected a rejection");
    expect(verdict.traceError).toBe("team_patch_illegal");
    expect(verdict.feedback).toContain(
      "Legal moves for garchomp in scarlet-violet: dragon-claw, earthquake, fire-fang.",
    );
    expect(verdict.feedback).toContain("get_learnset");
  });

  it("keeps rejecting an illegal patch even after many rejections (no warn-but-allow)", async () => {
    const hooks = buildBuilderHooks([]);
    const ctx = await ctxFor();
    const patch: TeamPatch = { slots: [{ slot: 0, member: illegalGarchomp() }] };
    const answer: BuilderAnswer = {
      answer_markdown: "Here's a pick.",
      team_patch: patch,
    };

    const verdict = await hooks.validateAnswer(
      answer,
      ctx,
      MAX_BUILDER_PATCH_RETRIES,
    );

    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("expected a rejection");
    expect(verdict.traceError).toBe("team_patch_illegal");
  });

  it("does not blame the model for a hard violation already present in an UNTOUCHED draft slot", async () => {
    // Slot 0 is the user's own (illegal) hand edit — the patch never touches it.
    const draft: TeamMember[] = [illegalGarchomp()];
    const hooks = buildBuilderHooks(draft);
    const ctx = await ctxFor();
    const patch: TeamPatch = { slots: [{ slot: 1, member: legalNinetales() }] };
    const answer: BuilderAnswer = {
      answer_markdown: "Adding a special wall.",
      team_patch: patch,
    };

    const verdict = await hooks.validateAnswer(answer, ctx, 0);

    expect(verdict.ok).toBe(true);
  });

  it("still rejects when the patch ALSO introduces its own new violation, alongside a pre-existing one", async () => {
    // Slot 0 pre-existing violation (untouched) + slot 1 patch introduces its
    // OWN illegal move — only the newly-introduced one should count, but it's
    // still enough to reject.
    const draft: TeamMember[] = [illegalGarchomp()];
    const hooks = buildBuilderHooks(draft);
    const ctx = await ctxFor();
    const patch: TeamPatch = {
      slots: [
        {
          slot: 1,
          member: legalNinetales({ moves: ["psychic", "trick-room", "flamethrower", "will-o-wisp"] }),
        },
      ],
    };
    const answer: BuilderAnswer = {
      answer_markdown: "Adding a special wall.",
      team_patch: patch,
    };

    const verdict = await hooks.validateAnswer(answer, ctx, 0);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("expected a rejection");
    expect(verdict.traceError).toBe("team_patch_illegal");
    // Names the NEW offender (ninetales/psychic), not the untouched garchomp slot.
    expect(verdict.feedback).toContain("psychic");
    expect(verdict.feedback).toContain("ninetales");
  });
});
