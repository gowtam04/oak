/**
 * `/api/teams/[id]` + `/duplicate` — living vs archived (Champions-first P4).
 *
 * GET archived → 200 (client infers archived from `format !== "champions"`).
 * PUT/PATCH archived → 409 `team_archived`. DELETE archived allowed.
 * Duplicate archived → 409 `team_archived`. No rebuild-as-Champions action.
 *
 * Refs: CF-TEAM-AC-5.2, CF-TEAM-AC-5.3, CF-DATA-BR-13, CF-DATA-BR-14, ADR-3.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../../test/support/pg";

import { team } from "@/data/schema";
import type { TeamMember } from "@/data/teams/team-schema";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const CH = "champions";
const SV = "scarlet-violet";
const GEN7 = "gen-7";

type IdRoute = typeof import("./route");
type DupRoute = typeof import("./duplicate/route");
type ListRoute = typeof import("../route");
type CreateTeam = typeof import("@/data/repos/team-repo").createTeam;

let fix: PgFixture;
let byId: IdRoute;
let dup: DupRoute;
let list: ListRoute;
let createTeamRow: CreateTeam;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  byId = await import("./route");
  dup = await import("./duplicate/route");
  list = await import("../route");
  ({ createTeam: createTeamRow } = await import("@/data/repos/team-repo"));
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE team, conversation, conversation_message RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
});

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}

const spread = (v = 0) => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

function mkMember(over: Partial<TeamMember> = {}): TeamMember {
  return {
    species: "garchomp",
    ability: "rough-skin",
    item: null,
    moves: ["earthquake", "dragon-claw"],
    nature: "adamant",
    evs: spread(4),
    ivs: spread(31),
    tera_type: null,
    level: 50,
    ...over,
  };
}

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedLiving(name: string) {
  return createTeamRow({
    accountId: ACCT_A,
    format: CH,
    name,
    members: [mkMember()],
    now: Date.now(),
  });
}

async function seedArchived(opts: {
  format: string;
  name: string;
  members?: TeamMember[];
}): Promise<{ id: string; format: string; name: string }> {
  const id = randomUUID();
  const now = Date.now();
  await fix.db.insert(team).values({
    id,
    account_id: ACCT_A,
    format: opts.format,
    name: opts.name,
    members: JSON.stringify(opts.members ?? [mkMember()]),
    created_at: now,
    updated_at: now,
  });
  return { id, format: opts.format, name: opts.name };
}

async function errorBody(res: Response): Promise<{ code: string }> {
  return (await res.json()) as { code: string };
}

describe("GET /api/teams/[id]", () => {
  it("returns a living Champions team + validation", async () => {
    const created = await seedLiving("Living");
    signedIn(ACCT_A);
    const res = await byId.GET(new Request("http://t"), idCtx(created.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      team: { id: string; format: string };
      validation: unknown[];
    };
    expect(body.team.id).toBe(created.id);
    expect(body.team.format).toBe(CH);
    expect(Array.isArray(body.validation)).toBe(true);
  });

  it("GET archived team is 200 with stored format (CF-TEAM-AC-5.2)", async () => {
    const archived = await seedArchived({
      format: GEN7,
      name: "Old rain",
      members: [mkMember({ tera_type: "ground" })],
    });
    signedIn(ACCT_A);
    const res = await byId.GET(new Request("http://t"), idCtx(archived.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      team: { id: string; format: string; name: string };
      archived?: boolean;
    };
    expect(body.team.id).toBe(archived.id);
    expect(body.team.format).toBe(GEN7);
    expect(body.team.format).not.toBe(CH);
    expect(body.team.name).toBe("Old rain");
    if (body.archived !== undefined) expect(body.archived).toBe(true);
  });

  it("GET archived validates against Champions roster, not stored format (CF-TEAM-AC-5.4)", async () => {
    const archived = await seedArchived({
      format: GEN7,
      name: "Old rain",
      members: [
        mkMember({
          species: "missingno",
          evs: { hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 },
        }),
      ],
    });
    signedIn(ACCT_A);
    const res = await byId.GET(new Request("http://t"), idCtx(archived.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      validation: { code: string; message: string }[];
    };
    const codes = body.validation.map((w) => w.code);
    expect(codes).toContain("species_illegal");
    expect(
      body.validation.find((w) => w.code === "species_illegal")?.message,
    ).toMatch(/not in the Champions roster/);
    expect(codes).not.toContain("ev_total_exceeded");
    expect(codes).not.toContain("ev_stat_exceeded");
  });

  it("other account → 404 for living and archived (CF-AUTH-AC-2.1)", async () => {
    const living = await seedLiving("A living");
    const archived = await seedArchived({ format: SV, name: "A archive" });
    signedIn(ACCT_B);
    expect((await byId.GET(new Request("http://t"), idCtx(living.id))).status).toBe(404);
    expect((await byId.GET(new Request("http://t"), idCtx(archived.id))).status).toBe(404);
  });
});

describe("PUT/PATCH /api/teams/[id]", () => {
  it("PUT updates a living team", async () => {
    const created = await seedLiving("Original");
    signedIn(ACCT_A);
    const res = await byId.PUT(
      new Request("http://t", {
        method: "PUT",
        body: JSON.stringify({ name: "Renamed" }),
      }),
      idCtx(created.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { team: { name: string; format: string } };
    expect(body.team.name).toBe("Renamed");
    expect(body.team.format).toBe(CH);
  });

  it("PUT and PATCH of an archived team are 409 team_archived (CF-TEAM-AC-5.3)", async () => {
    const archived = await seedArchived({ format: SV, name: "Frozen" });
    signedIn(ACCT_A);

    const putRes = await byId.PUT(
      new Request("http://t", { method: "PUT", body: JSON.stringify({ name: "Nope" }) }),
      idCtx(archived.id),
    );
    expect(putRes.status).toBe(409);
    expect(await errorBody(putRes)).toMatchObject({ code: "team_archived" });

    const still = await byId.GET(new Request("http://t"), idCtx(archived.id));
    expect(still.status).toBe(200);
    expect(
      ((await still.json()) as { team: { name: string } }).team.name,
    ).toBe("Frozen");

    const patch = (byId as { PATCH?: typeof byId.PUT }).PATCH;
    expect(patch, "PATCH handler required (api-design: PATCH archived → 409)").toEqual(
      expect.any(Function),
    );
    const patchRes = await patch!(
      new Request("http://t", {
        method: "PATCH",
        body: JSON.stringify({ name: "Nope" }),
      }),
      idCtx(archived.id),
    );
    expect(patchRes.status).toBe(409);
    expect(await errorBody(patchRes)).toMatchObject({ code: "team_archived" });
  });
});

describe("DELETE /api/teams/[id]", () => {
  it("DELETE of an archived team is allowed and permanent (CF-TEAM-AC-5.2, CF-DATA-BR-14)", async () => {
    const archived = await seedArchived({ format: GEN7, name: "Doomed archive" });
    signedIn(ACCT_A);
    expect((await byId.DELETE(new Request("http://t"), idCtx(archived.id))).status).toBe(200);
    expect((await byId.GET(new Request("http://t"), idCtx(archived.id))).status).toBe(404);
  });

  it("does not invent a rebuild-as-Champions action on archived teams", async () => {
    const archived = await seedArchived({ format: GEN7, name: "Old rain" });
    signedIn(ACCT_A);
    const rebuild = await byId.PUT(
      new Request("http://t", {
        method: "PUT",
        body: JSON.stringify({ format: CH, name: "Now champions" }),
      }),
      idCtx(archived.id),
    );
    expect(rebuild.status).toBe(409);
    expect(await errorBody(rebuild)).toMatchObject({ code: "team_archived" });
    const got = (await (
      await byId.GET(new Request("http://t"), idCtx(archived.id))
    ).json()) as { team: { format: string; name: string } };
    expect(got.team.format).toBe(GEN7);
    expect(got.team.name).toBe("Old rain");
  });
});

describe("POST /api/teams/[id]/duplicate", () => {
  it("duplicate of a living team stays champions", async () => {
    const created = await seedLiving("Original");
    signedIn(ACCT_A);
    const res = await dup.POST(new Request("http://t"), idCtx(created.id));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { team: { id: string; name: string; format: string } };
    expect(out.team.name).toBe("Original copy");
    expect(out.team.id).not.toBe(created.id);
    expect(out.team.format).toBe(CH);
  });

  it("duplicate of an archived team is 409 team_archived (CF-TEAM-AC-5.3)", async () => {
    const archived = await seedArchived({ format: GEN7, name: "Old rain" });
    signedIn(ACCT_A);
    const res = await dup.POST(new Request("http://t"), idCtx(archived.id));
    expect(res.status).toBe(409);
    expect(await errorBody(res)).toMatchObject({ code: "team_archived" });

    const living = (await (await list.GET(new Request("http://t/api/teams"))).json()) as {
      teams: { name: string }[];
    };
    expect(living.teams.map((t) => t.name)).not.toContain("Old rain copy");
  });
});
