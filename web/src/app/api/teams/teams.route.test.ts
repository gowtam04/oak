/**
 * Integration tests for the `/api/teams/*` route surface (Champions-first P4;
 * docs/features/champions-first/architecture/api-design.md).
 *
 * Exercises the real route handlers against a real migrated + seeded Postgres
 * schema (Testcontainers) with the repos/services reaching the installed
 * `@/data/db` singleton — only `getCurrentAccount` is mocked.
 *
 * Focus: living vs archived list; POST ignores format and always stores
 * champions (CF-TEAM-AC-1.1, CF-TEAM-AC-1.6, CF-TEAM-AC-1.7, CF-TEAM-AC-5.1,
 * CF-DATA-BR-9–15, CF-AUTH-AC-2.1). Archived mutate/import cases live in
 * `[id]/route.test.ts` and `import/route.test.ts`.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../test/support/pg";

import { team } from "@/data/schema";
import type { TeamMember } from "@/data/teams/team-schema";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const CH = "champions";
const SV = "scarlet-violet";
const GEN7 = "gen-7";

type ListRoute = typeof import("./route");
type IdRoute = typeof import("./[id]/route");
type DupRoute = typeof import("./[id]/duplicate/route");
type ExportRoute = typeof import("./[id]/export/route");
type ImportRoute = typeof import("./import/route");
type CreateTeam = typeof import("@/data/repos/team-repo").createTeam;

let fix: PgFixture;
let list: ListRoute;
let byId: IdRoute;
let dup: DupRoute;
let exp: ExportRoute;
let imp: ImportRoute;
let createTeamRow: CreateTeam;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  list = await import("./route");
  byId = await import("./[id]/route");
  dup = await import("./[id]/duplicate/route");
  exp = await import("./[id]/export/route");
  imp = await import("./import/route");
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

// --- Helpers ---------------------------------------------------------------

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
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
const post = (body: unknown) =>
  new Request("http://t/api/teams", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

interface TeamBody {
  team: { id: string; name: string; format: string; members: TeamMember[] };
  validation: { code: string }[];
}

async function createViaPost(over: {
  name?: string;
  members?: TeamMember[];
  format?: string;
} = {}): Promise<TeamBody> {
  signedIn(ACCT_A);
  const res = await list.POST(post(over));
  expect(res.status).toBe(200);
  const body = (await res.json()) as TeamBody;
  expect(body.team.format).toBe(CH);
  return body;
}

async function seedLiving(opts: {
  accountId?: string;
  name: string;
  members?: TeamMember[];
  now?: number;
}) {
  return createTeamRow({
    accountId: opts.accountId ?? ACCT_A,
    format: CH,
    name: opts.name,
    members: opts.members ?? [],
    now: opts.now ?? Date.now(),
  });
}

async function seedArchived(opts: {
  accountId?: string;
  format: string;
  name: string;
  members?: TeamMember[];
  now?: number;
}): Promise<{ id: string; format: string; name: string }> {
  const id = randomUUID();
  const now = opts.now ?? Date.now();
  await fix.db.insert(team).values({
    id,
    account_id: opts.accountId ?? ACCT_A,
    format: opts.format,
    name: opts.name,
    members: JSON.stringify(opts.members ?? []),
    created_at: now,
    updated_at: now,
  });
  return { id, format: opts.format, name: opts.name };
}

async function errorBody(res: Response): Promise<{ code: string; message?: string }> {
  return (await res.json()) as { code: string; message?: string };
}

// --- Guest → 401 everywhere (CF-AUTH-AC-2.1 / existing signed-in gate) ------

describe("guest → 401 on every /api/teams route", () => {
  it("rejects all verbs without a session", async () => {
    guest();
    expect((await list.GET(new Request("http://t/api/teams"))).status).toBe(401);
    expect((await list.POST(post({ name: "x" }))).status).toBe(401);
    expect((await byId.GET(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect(
      (await byId.PUT(new Request("http://t/x", { method: "PUT", body: "{}" }), idCtx("x"))).status,
    ).toBe(401);
    expect((await byId.DELETE(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await dup.POST(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await exp.GET(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await imp.POST(post({ paste: "" }))).status).toBe(401);
  });
});

// --- Create / list ---------------------------------------------------------

describe("POST /api/teams (create)", () => {
  it("creates a living Champions team with default name + validation (CF-TEAM-AC-1.1, CF-DATA-BR-9)", async () => {
    const { team, validation } = await createViaPost();
    expect(team.name).toBe("Untitled team");
    expect(team.format).toBe(CH);
    expect(team.members).toEqual([]);
    expect(Array.isArray(validation)).toBe(true);
  });

  it("does not require format and ignores a requested other-game format (CF-TEAM-AC-1.1)", async () => {
    signedIn(ACCT_A);
    const missing = await list.POST(post({ name: "No format" }));
    expect(missing.status).toBe(200);
    expect(((await missing.json()) as TeamBody).team.format).toBe(CH);

    const ignored = await list.POST(post({ format: GEN7, name: "Pretend gen7" }));
    expect(ignored.status).toBe(200);
    expect(((await ignored.json()) as TeamBody).team.format).toBe(CH);

    const bogus = await list.POST(post({ format: "nope", name: "Bogus" }));
    expect(bogus.status).toBe(200);
    expect(((await bogus.json()) as TeamBody).team.format).toBe(CH);
  });

  it("strips Tera, forces level 50, and writes IVs 31 on living create (ADR-7)", async () => {
    const { team } = await createViaPost({
      members: [
        mkMember({
          tera_type: "dragon",
          level: 100,
          ivs: spread(0),
        }),
      ],
    });
    expect(team.members[0]?.tera_type).toBeNull();
    expect(team.members[0]?.level).toBe(50);
    expect(team.members[0]?.ivs).toEqual(spread(31));
  });

  it("accepts a partial team (BR-T4) and computes warnings (CF-TEAM-AC-1.6)", async () => {
    const { team, validation } = await createViaPost({
      name: "Partial",
      members: [mkMember()], // 1 member, 2 moves → incomplete
    });
    expect(team.members).toHaveLength(1);
    expect(team.format).toBe(CH);
    const codes = validation.map((w) => w.code);
    expect(codes).toContain("incomplete");
  });

  it("saves Stat Points over 66/32 with warnings (CF-TEAM-AC-1.6, CF-DATA-BR-10)", async () => {
    const { team, validation } = await createViaPost({
      name: "Over budget",
      members: [
        mkMember({
          evs: { hp: 0, atk: 40, def: 0, spa: 0, spd: 0, spe: 40 },
        }),
      ],
    });
    expect(team.format).toBe(CH);
    expect(team.members[0]?.evs.atk).toBe(40);
    expect(team.members[0]?.evs.spe).toBe(40);
    const codes = validation.map((w) => w.code);
    expect(codes).toContain("ev_stat_exceeded");
    expect(codes).toContain("ev_total_exceeded");
  });
});

describe("GET /api/teams (list)", () => {
  it("lists living Champions teams by default and keeps format on summaries (CF-TEAM-AC-1.7, CF-TEAM-AC-5.1)", async () => {
    await seedLiving({ name: "Living A", now: 3000 });
    await seedArchived({ format: SV, name: "SV archive", now: 2000 });
    await seedArchived({ format: GEN7, name: "Gen7 archive", now: 1000 });

    signedIn(ACCT_A);
    const all = (await (await list.GET(new Request("http://t/api/teams"))).json()) as {
      teams: { name: string; format: string }[];
    };
    expect(all.teams.map((t) => t.name)).toEqual(["Living A"]);
    expect(all.teams[0]?.format).toBe(CH);
  });

  it("GET ?archived=1 and ?archived=true return non-champions teams (CF-TEAM-AC-5.1)", async () => {
    await seedLiving({ name: "Living A", now: 3000 });
    await seedArchived({ format: SV, name: "SV archive", now: 2000 });
    await seedArchived({ format: GEN7, name: "Gen7 archive", now: 1000 });

    signedIn(ACCT_A);
    for (const url of [
      "http://t/api/teams?archived=1",
      "http://t/api/teams?archived=true",
    ]) {
      const body = (await (await list.GET(new Request(url))).json()) as {
        teams: { name: string; format: string }[];
      };
      expect(body.teams.map((t) => t.name), url).toEqual(["SV archive", "Gen7 archive"]);
      expect(body.teams.map((t) => t.format), url).toEqual([SV, GEN7]);
      expect(body.teams.every((t) => t.format !== CH)).toBe(true);
    }
  });

  it("treats ?format=champions as the living list (api-design cutover)", async () => {
    await seedLiving({ name: "Living A" });
    await seedArchived({ format: GEN7, name: "Gen7 archive" });
    signedIn(ACCT_A);
    const body = (await (
      await list.GET(new Request("http://t/api/teams?format=champions"))
    ).json()) as { teams: { name: string; format: string }[] };
    expect(body.teams.map((t) => t.name)).toEqual(["Living A"]);
    expect(body.teams[0]?.format).toBe(CH);
  });

  it("400s an old other-game ?format= picker (api-design: unknown format= → invalid_request)", async () => {
    signedIn(ACCT_A);
    const res = await list.GET(new Request("http://t/api/teams?format=gen-7"));
    expect(res.status).toBe(400);
    expect(await errorBody(res)).toMatchObject({ code: "invalid_request" });
  });
});

// --- Detail / update / delete + isolation ----------------------------------

describe("GET/PUT/DELETE /api/teams/[id]", () => {
  it("GET returns full team + validation; other account → 404", async () => {
    const created = await seedLiving({ name: "Mine", members: [mkMember()] });

    signedIn(ACCT_A);
    const okRes = await byId.GET(new Request("http://t"), idCtx(created.id));
    expect(okRes.status).toBe(200);
    const ok = (await okRes.json()) as {
      team: { id: string; format: string };
      validation: unknown[];
    };
    expect(ok.team.id).toBe(created.id);
    expect(ok.team.format).toBe(CH);
    expect(Array.isArray(ok.validation)).toBe(true);

    signedIn(ACCT_B);
    expect((await byId.GET(new Request("http://t"), idCtx(created.id))).status).toBe(404);
  });

  it("PUT replaces name + members on a living team; other account → 404", async () => {
    const created = await seedLiving({ name: "Original" });
    signedIn(ACCT_A);
    const putRes = await byId.PUT(
      new Request("http://t", {
        method: "PUT",
        body: JSON.stringify({ name: "Renamed", members: [mkMember()] }),
      }),
      idCtx(created.id),
    );
    expect(putRes.status).toBe(200);
    const put = (await putRes.json()) as { team: { name: string; members: unknown[]; format: string } };
    expect(put.team.name).toBe("Renamed");
    expect(put.team.members).toHaveLength(1);
    expect(put.team.format).toBe(CH);

    signedIn(ACCT_B);
    const denied = await byId.PUT(
      new Request("http://t", { method: "PUT", body: JSON.stringify({ name: "Hijack" }) }),
      idCtx(created.id),
    );
    expect(denied.status).toBe(404);
  });

  it("DELETE is permanent + idempotent; other account → 404", async () => {
    const created = await seedLiving({ name: "Doomed" });

    signedIn(ACCT_B);
    expect((await byId.DELETE(new Request("http://t"), idCtx(created.id))).status).toBe(404);

    signedIn(ACCT_A);
    expect((await byId.DELETE(new Request("http://t"), idCtx(created.id))).status).toBe(200);
    expect((await byId.DELETE(new Request("http://t"), idCtx(created.id))).status).toBe(404);
    expect((await byId.GET(new Request("http://t"), idCtx(created.id))).status).toBe(404);
  });
});

// --- Duplicate -------------------------------------------------------------

describe("POST /api/teams/[id]/duplicate", () => {
  it("clones a living team into '<name> copy' as champions; other account → 404", async () => {
    const created = await seedLiving({ name: "Original", members: [mkMember()] });

    signedIn(ACCT_A);
    const res = await dup.POST(new Request("http://t"), idCtx(created.id));
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      team: { id: string; name: string; format: string; members: unknown[] };
    };
    expect(out.team.name).toBe("Original copy");
    expect(out.team.id).not.toBe(created.id);
    expect(out.team.format).toBe(CH);
    expect(out.team.members).toHaveLength(1);

    signedIn(ACCT_B);
    expect((await dup.POST(new Request("http://t"), idCtx(created.id))).status).toBe(404);
  });
});

// --- Export ----------------------------------------------------------------

describe("GET /api/teams/[id]/export", () => {
  it("round-trips a living team to Showdown paste without Tera, level 50 (CF-TEAM-AC-3.4)", async () => {
    const created = await seedLiving({
      name: "Export me",
      members: [
        mkMember({
          item: "leftovers",
          evs: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
          tera_type: null,
          level: 50,
        }),
      ],
    });

    signedIn(ACCT_A);
    const res = await exp.GET(new Request("http://t"), idCtx(created.id));
    expect(res.status).toBe(200);
    const { paste } = (await res.json()) as { paste: string };
    expect(paste).toContain("Garchomp");
    expect(paste).toContain("Earthquake");
    expect(paste).not.toMatch(/Tera Type/i);
    expect(paste).toMatch(/Level:\s*50/);
    expect(paste).toMatch(/EVs:/);
    expect(paste).toMatch(/32/);

    signedIn(ACCT_B);
    expect((await exp.GET(new Request("http://t"), idCtx(created.id))).status).toBe(404);
  });
});


