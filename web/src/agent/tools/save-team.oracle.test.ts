/**
 * INDEPENDENT ORACLE — T13 `save_team` (conversational save; TEAM-AD-7),
 * exercised against a small migrated Postgres schema (seed "tools").
 *
 * Champions-first P4: save_team always stores `format: "champions"` even when
 * the proposed team still carries another format (CF-DATA-BR-9, CF-TEAM-AC-1.1).
 *
 * Behaviour derived from the design — NOT the impl:
 *   - on approval it persists the SERVER-BOUND proposed team (ctx.proposedTeam)
 *     and reports { saved:true, team_id, name, format: "champions" }, also
 *     setting ctx.savedTeam;
 *   - `name` renames; an explicit `team` is the build-and-save fallback;
 *   - a guest (no accountId) → { saved:false, reason:"not_signed_in" } and NO
 *     write; nothing to save → { saved:false, reason:"no_team" };
 *   - it never throws in-domain.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";
import type { OakDb } from "@/data/db";
import type { TeamMember } from "@/data/teams/team-schema";
import type { ProposedTeam, SaveTeamOutput } from "@/agent/schemas";

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
let getTeam: typeof import("@/data/repos/team-repo").getTeam;

const MEMBER: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "life-orb",
  moves: ["earthquake", "dragon-claw", "fire-fang"],
  nature: "jolly",
  evs: { hp: 0, atk: 32, def: 0, spa: 0, spd: 2, spe: 32 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: null,
  level: 50,
};

/** A proposal that still claims another game — save_team must store champions. */
const PROPOSED: ProposedTeam = {
  name: "Dragon Offense",
  format: "scarlet-violet",
  members: [MEMBER],
};

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
    await installAsSingleton(fix);

    ({ dispatch } = await import("@/agent/tools"));
    ({ createAgentContext } = await import("@/agent/context"));
    ({ getTeam } = await import("@/data/repos/team-repo"));
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(`Agent/team layer not loadable: ${String(loadError)}`);
  }
}

async function ctxWith(
  over: Partial<{
    accountId: string;
    sessionId: string;
    proposedTeam: ProposedTeam;
    mode: "standard" | "champions";
  }>,
): Promise<AgentContext> {
  return createAgentContext({
    db: fix.db as unknown as OakDb,
    requestId: "oracle",
    mode: over.mode ?? "champions",
    accountId: over.accountId,
    sessionId: over.sessionId,
    proposedTeam: over.proposedTeam,
  });
}

describe("save_team tool (T13)", () => {
  it("persists the server-bound proposed team as champions regardless of proposed format (CF-DATA-BR-9)", async () => {
    ensureLoaded();
    const ctx = await ctxWith({
      accountId: "acct-1",
      sessionId: "conv-1",
      proposedTeam: PROPOSED,
    });

    const out = (await dispatch("save_team", {}, ctx)) as SaveTeamOutput;
    expect(out.saved).toBe(true);
    if (!out.saved) throw new Error("expected saved");
    expect(out.name).toBe("Dragon Offense");
    expect(out.format).toBe("champions");

    expect(ctx.savedTeam).toEqual({
      id: out.team_id,
      name: "Dragon Offense",
      format: "champions",
    });

    const saved = await getTeam("acct-1", out.team_id);
    expect(saved).not.toBeNull();
    expect(saved!.format).toBe("champions");
    expect(saved!.members).toEqual([MEMBER]);
  });

  it("still stores champions when ctx.mode is a leftover other-game value", async () => {
    ensureLoaded();
    const ctx = await ctxWith({
      accountId: "acct-mode",
      sessionId: "conv-mode",
      mode: "standard",
      proposedTeam: PROPOSED,
    });
    const out = (await dispatch("save_team", {}, ctx)) as SaveTeamOutput;
    expect(out.saved).toBe(true);
    if (!out.saved) throw new Error("expected saved");
    expect(out.format).toBe("champions");
    const saved = await getTeam("acct-mode", out.team_id);
    expect(saved!.format).toBe("champions");
  });

  it("renames the saved team via the optional `name` arg", async () => {
    ensureLoaded();
    const ctx = await ctxWith({
      accountId: "acct-1",
      sessionId: "conv-2",
      proposedTeam: PROPOSED,
    });
    const out = (await dispatch(
      "save_team",
      { name: "Sun Team" },
      ctx,
    )) as SaveTeamOutput;
    expect(out.saved).toBe(true);
    if (!out.saved) throw new Error("expected saved");
    expect(out.name).toBe("Sun Team");
    expect(out.format).toBe("champions");
  });

  it("returns not_signed_in for a guest (no accountId), without writing", async () => {
    ensureLoaded();
    const ctx = await ctxWith({ sessionId: "conv-3", proposedTeam: PROPOSED });
    const out = (await dispatch("save_team", {}, ctx)) as SaveTeamOutput;
    expect(out).toEqual({ saved: false, reason: "not_signed_in" });
    expect(ctx.savedTeam).toBeUndefined();
  });

  it("returns no_team when nothing is proposed and none is passed", async () => {
    ensureLoaded();
    const ctx = await ctxWith({ accountId: "acct-1", sessionId: "conv-4" });
    const out = (await dispatch("save_team", {}, ctx)) as SaveTeamOutput;
    expect(out).toEqual({ saved: false, reason: "no_team" });
  });

  it("saves an explicitly-passed team as champions when there's no prior proposal", async () => {
    ensureLoaded();
    const ctx = await ctxWith({ accountId: "acct-2", sessionId: "conv-5" });
    const out = (await dispatch(
      "save_team",
      { team: PROPOSED },
      ctx,
    )) as SaveTeamOutput;
    expect(out.saved).toBe(true);
    if (!out.saved) throw new Error("expected saved");
    expect(out.format).toBe("champions");
    const saved = await getTeam("acct-2", out.team_id);
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe("Dragon Offense");
    expect(saved!.format).toBe("champions");
  });

  it("refuses an out-of-roster member with illegal_team, without writing", async () => {
    ensureLoaded();
    const ctx = await ctxWith({ accountId: "acct-3", sessionId: "conv-6" });
    const illegal: ProposedTeam = {
      name: "Bad Team",
      format: "champions",
      members: [{ ...MEMBER, species: "heatran" }],
    };
    const out = (await dispatch(
      "save_team",
      { team: illegal },
      ctx,
    )) as SaveTeamOutput;

    expect(out.saved).toBe(false);
    if (out.saved) throw new Error("expected refusal");
    expect(out.reason).toBe("illegal_team");
    expect(out.warnings?.some((w) => w.code === "species_illegal")).toBe(true);
    expect(ctx.savedTeam).toBeUndefined();
  });

  it("refuses a duplicate held item (item clause) with illegal_team, without writing", async () => {
    ensureLoaded();
    const ctx = await ctxWith({ accountId: "acct-4", sessionId: "conv-7" });
    const illegal: ProposedTeam = {
      name: "Triple Life Orb",
      format: "champions",
      members: [
        MEMBER,
        { ...MEMBER, species: "ninetales", ability: "flash-fire" },
      ],
    };
    const out = (await dispatch(
      "save_team",
      { team: illegal },
      ctx,
    )) as SaveTeamOutput;

    expect(out.saved).toBe(false);
    if (out.saved) throw new Error("expected refusal");
    expect(out.reason).toBe("illegal_team");
    expect(out.warnings?.some((w) => w.code === "duplicate_item")).toBe(true);
    expect(ctx.savedTeam).toBeUndefined();
  });
});
