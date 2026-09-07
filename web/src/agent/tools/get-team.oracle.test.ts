/**
 * INDEPENDENT ORACLE — T12 `get_team` + T16 `list_teams` and the active-team
 * service they wrap, exercised against a small deterministic fixture DB
 * (seed "tools").
 *
 * Champions-first P4:
 *   - list_teams returns living Champions teams only (CF-TEAM-AC-1.7)
 *   - get_team on an archived / other-format id returns { found: false }
 *     (CF-TEAM-AC-5.3 — the model must not use archived rosters)
 *
 * Wiring: migrate + seed an isolated Postgres schema (createPgSchema) and
 * install it as the @/data/db singleton BEFORE importing the server-only
 * modules. `import "server-only"` is neutralized so the repos/services load
 * under the vitest node environment.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";
import type { OakDb } from "@/data/db";
import { team } from "@/data/schema";
import type { TeamMember } from "@/data/teams/team-schema";
import type { GetTeamOutput, ListTeamsOutput } from "@/agent/schemas";

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
let createTeam: typeof import("@/data/repos/team-repo").createTeam;

/** A Garchomp set: legal item/ability, but a partial moveset with one move
 *  (will-o-wisp) Garchomp can't learn in the fixture — so the warnings are
 *  deterministic (incomplete + move_not_in_learnset). */
const MEMBER: TeamMember = {
  species: "garchomp",
  ability: "rough-skin",
  item: "leftovers",
  moves: ["earthquake", "will-o-wisp"],
  nature: "jolly",
  evs: { hp: 0, atk: 32, def: 0, spa: 0, spd: 2, spe: 32 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  tera_type: null,
  level: 50,
};

const ACCOUNT = "acct-1";

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "tools" });
    await installAsSingleton(fix);

    ({ dispatch } = await import("@/agent/tools"));
    ({ createAgentContext } = await import("@/agent/context"));
    ({ createTeam } = await import("@/data/repos/team-repo"));
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

async function ctxFor(opts: {
  accountId?: string;
  mode?: "standard" | "champions";
}): Promise<AgentContext> {
  return createAgentContext({
    db: fix.db as unknown as OakDb,
    requestId: "oracle",
    accountId: opts.accountId,
    mode: opts.mode ?? "champions",
  });
}

async function insertArchived(opts: {
  accountId: string;
  format: string;
  name: string;
  members?: TeamMember[];
}): Promise<{ id: string }> {
  const id = randomUUID();
  const now = Date.now();
  await fix.db.insert(team).values({
    id,
    account_id: opts.accountId,
    format: opts.format,
    name: opts.name,
    members: JSON.stringify(opts.members ?? [MEMBER]),
    created_at: now,
    updated_at: now,
  });
  return { id };
}

describe("get_team tool (T12)", () => {
  it("returns { found: false } for a guest and for an unknown id, never throwing", async () => {
    ensureLoaded();
    const guest = await ctxFor({});
    expect(await dispatch("get_team", { team_id: "anything" }, guest)).toEqual({
      found: false,
    });

    const signedIn = await ctxFor({ accountId: ACCOUNT });
    expect(
      await dispatch("get_team", { team_id: "does-not-exist" }, signedIn),
    ).toEqual({ found: false });
  });

  it("returns { found: true, team } for a living Champions team with display names + warnings", async () => {
    ensureLoaded();
    const created = await createTeam({
      accountId: ACCOUNT,
      format: "champions",
      name: "Test Team",
      members: [MEMBER],
      now: Date.now(),
    });

    const ctx = await ctxFor({ accountId: ACCOUNT });
    const out = (await dispatch(
      "get_team",
      { team_id: created.id },
      ctx,
    )) as GetTeamOutput;

    expect(out.found).toBe(true);
    if (!out.found) throw new Error("expected found team");

    expect(out.team.name).toBe("Test Team");
    expect(out.team.format).toBe("champions");

    const m = out.team.members[0]!;
    expect(m.species).toBe("garchomp");
    expect(m.species_display).toBe("Garchomp");
    expect(m.ability_display).toBe("Rough Skin");
    expect(m.item_display).toBe("Leftovers");
    expect(m.moves_display).toEqual(["Earthquake", "Will-O-Wisp"]);

    const codes = out.team.warnings.map((w) => w.code);
    expect(codes).toContain("incomplete");
    expect(codes).toContain("move_not_in_learnset");
  });

  it("rejects a not-owned team (BR-T2 / CF-DATA-BR-11)", async () => {
    ensureLoaded();
    const created = await createTeam({
      accountId: ACCOUNT,
      format: "champions",
      name: "Owned",
      members: [MEMBER],
      now: Date.now(),
    });

    const other = await ctxFor({ accountId: "other-acct" });
    expect(await dispatch("get_team", { team_id: created.id }, other)).toEqual({
      found: false,
    });
  });

  it("returns { found: false } for an archived / other-format team (CF-TEAM-AC-5.3)", async () => {
    ensureLoaded();
    const archived = await insertArchived({
      accountId: ACCOUNT,
      format: "scarlet-violet",
      name: "Old SV rain",
    });
    const gen7 = await insertArchived({
      accountId: ACCOUNT,
      format: "gen-7",
      name: "Old gen7",
    });

    const ctx = await ctxFor({ accountId: ACCOUNT, mode: "champions" });
    expect(await dispatch("get_team", { team_id: archived.id }, ctx)).toEqual({
      found: false,
    });
    expect(await dispatch("get_team", { team_id: gen7.id }, ctx)).toEqual({
      found: false,
    });
  });
});

describe("list_teams tool (T16)", () => {
  it("returns { signed_in: false } for a guest", async () => {
    ensureLoaded();
    const guest = await ctxFor({});
    expect(await dispatch("list_teams", {}, guest)).toEqual({
      signed_in: false,
    });
  });

  it("lists living Champions teams only, with species display names (CF-TEAM-AC-1.7)", async () => {
    ensureLoaded();
    const account = "acct-list";
    await createTeam({
      accountId: account,
      format: "champions",
      name: "Champs Squad",
      members: [MEMBER],
      now: Date.now(),
    });
    await insertArchived({
      accountId: account,
      format: "scarlet-violet",
      name: "Rain Offense",
    });
    await insertArchived({
      accountId: account,
      format: "gen-7",
      name: "Old sun",
    });

    const ctx = await ctxFor({ accountId: account });
    const out = (await dispatch("list_teams", {}, ctx)) as ListTeamsOutput;

    expect(out.signed_in).toBe(true);
    if (!out.signed_in) throw new Error("expected signed_in");

    expect(out.teams.map((t) => t.name)).toEqual(["Champs Squad"]);
    const row = out.teams[0]!;
    expect(row.member_count).toBe(1);
    expect(row.incomplete).toBe(true); // < 6 members
    expect(row.species).toEqual(["Garchomp"]);
    expect(typeof row.team_id).toBe("string");

    // Living-only is not the turn's leftover mode: even `standard` must not
    // surface archived scarlet-violet teams (CF-TEAM-AC-1.7, CF-TEAM-AC-5.3).
    const leftover = await ctxFor({ accountId: account, mode: "standard" });
    const leftoverOut = (await dispatch(
      "list_teams",
      {},
      leftover,
    )) as ListTeamsOutput;
    expect(leftoverOut.signed_in).toBe(true);
    if (!leftoverOut.signed_in) throw new Error("expected signed_in");
    expect(leftoverOut.teams.map((t) => t.name)).toEqual(["Champs Squad"]);
  });
});
