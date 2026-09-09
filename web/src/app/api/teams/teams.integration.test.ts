/**
 * TEAMS-BACKEND-E2E — the cross-cutting `/api/teams/*` lifecycle exercised
 * end-to-end through the REAL route handlers against a REAL migrated + seeded
 * Postgres schema (Testcontainers).
 *
 * Champions-first P4: create/import always champions; default list is living;
 * archived rows are view+delete only (409 on mutate/duplicate).
 *
 *   create/import a team → validation warnings computed → export round-trips →
 *   another account gets 404 → guests get 401.
 *
 * Only `getCurrentAccount` is mocked; the repos/services/validation/paste all
 * run for real against the installed `@/data/db` singleton.
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
import type { TeamWarning } from "@/server/teams/validate-team";

const ACCT_A = "acct-lifecycle-a";
const ACCT_B = "acct-lifecycle-b";
const CH = "champions";
const GEN7 = "gen-7";

type ListRoute = typeof import("./route");
type IdRoute = typeof import("./[id]/route");
type DupRoute = typeof import("./[id]/duplicate/route");
type ExportRoute = typeof import("./[id]/export/route");
type ImportRoute = typeof import("./import/route");

let fix: PgFixture;
let list: ListRoute;
let byId: IdRoute;
let dup: DupRoute;
let exp: ExportRoute;
let imp: ImportRoute;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  list = await import("./route");
  byId = await import("./[id]/route");
  dup = await import("./[id]/duplicate/route");
  exp = await import("./[id]/export/route");
  imp = await import("./import/route");
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

/** A partial Garchomp set (2 moves) — `incomplete` fires (<4 moves, BR-T5). */
function partialMember(over: Partial<TeamMember> = {}): TeamMember {
  return fullMember({ moves: ["earthquake", "dragon-claw"], ...over });
}

/** A fully-built Garchomp set (4 valid moves) — counts as "complete". */
function fullMember(over: Partial<TeamMember> = {}): TeamMember {
  return {
    species: "garchomp",
    ability: "rough-skin",
    item: "leftovers",
    moves: ["earthquake", "dragon-claw", "fire-fang", "earthquake"],
    nature: "adamant",
    evs: { ...spread(), atk: 32, spe: 32, hp: 2 },
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
const put = (body: unknown) =>
  new Request("http://t/api/teams", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

interface TeamBody {
  team: { id: string; name: string; format: string; members: TeamMember[] };
  validation: TeamWarning[];
}

async function seedArchived(opts: {
  accountId?: string;
  format: string;
  name: string;
  members?: TeamMember[];
}): Promise<{ id: string }> {
  const id = randomUUID();
  const now = Date.now();
  await fix.db.insert(team).values({
    id,
    account_id: opts.accountId ?? ACCT_A,
    format: opts.format,
    name: opts.name,
    members: JSON.stringify(opts.members ?? []),
    created_at: now,
    updated_at: now,
  });
  return { id };
}

// ---------------------------------------------------------------------------
// One continuous account lifecycle (create → edit → duplicate → export →
// re-import → delete) through the real route surface.
// ---------------------------------------------------------------------------

describe("teams-backend-e2e — full CRUD lifecycle", () => {
  it("creates, edits, duplicates, exports, re-imports, and deletes a living Champions team", async () => {
    signedIn(ACCT_A);

    // 1. CREATE — a partial team (one slot) → validation flags it incomplete.
    //    format is optional/ignored; the row is always champions (CF-TEAM-AC-1.1).
    const createRes = await list.POST(
      post({ name: "Ladder Core", members: [partialMember()] }),
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as TeamBody;
    expect(created.team.name).toBe("Ladder Core");
    expect(created.team.format).toBe(CH);
    expect(created.team.members).toHaveLength(1);
    expect(created.validation.map((w) => w.code)).toContain("incomplete");
    const id = created.team.id;

    // 2. LIST — default living list (no format picker).
    const listRes = await list.GET(new Request("http://t/api/teams"));
    const listed = (await listRes.json()) as {
      teams: { id: string; name: string; format: string; incomplete: boolean }[];
    };
    expect(listed.teams.find((t) => t.id === id)).toMatchObject({
      name: "Ladder Core",
      format: CH,
      incomplete: true,
    });

    // 3. EDIT — rename + replace members (the manual-builder save path).
    const editRes = await byId.PUT(
      put({ name: "Ladder Core v2", members: [fullMember(), fullMember()] }),
      idCtx(id),
    );
    expect(editRes.status).toBe(200);
    const edited = (await editRes.json()) as TeamBody;
    expect(edited.team.name).toBe("Ladder Core v2");
    expect(edited.team.format).toBe(CH);
    expect(edited.team.members).toHaveLength(2);
    expect(edited.validation.map((w) => w.code)).toEqual(
      expect.arrayContaining(["duplicate_species"]),
    );

    // 4. DUPLICATE — an independent clone named "<name> copy", still champions.
    const dupRes = await dup.POST(new Request("http://t"), idCtx(id));
    expect(dupRes.status).toBe(200);
    const duplicated = (await dupRes.json()) as TeamBody;
    expect(duplicated.team.id).not.toBe(id);
    expect(duplicated.team.name).toBe("Ladder Core v2 copy");
    expect(duplicated.team.format).toBe(CH);
    expect(duplicated.team.members).toHaveLength(2);

    // 5. EXPORT — round-trips to a Showdown paste; Tera absent; Stat Points in EVs.
    const exportRes = await exp.GET(new Request("http://t"), idCtx(id));
    expect(exportRes.status).toBe(200);
    const { paste } = (await exportRes.json()) as { paste: string };
    expect(paste).toContain("Garchomp");
    expect(paste).toContain("Earthquake");
    expect(paste).not.toMatch(/Tera Type/i);
    expect(paste).toMatch(/Level:\s*50/);

    // 6. RE-IMPORT — no format required; always a new living Champions team.
    const importRes = await imp.POST(post({ paste }));
    expect(importRes.status).toBe(200);
    const imported = (await importRes.json()) as TeamBody & {
      notes: { kind: string }[];
    };
    expect(imported.team.format).toBe(CH);
    expect(imported.team.members[0]?.species).toBe("garchomp");
    expect(imported.team.members[0]?.tera_type).toBeNull();
    expect(Array.isArray(imported.notes)).toBe(true);

    // 7. DELETE — permanent + idempotent; the team is gone afterwards.
    expect((await byId.DELETE(new Request("http://t"), idCtx(id))).status).toBe(200);
    expect((await byId.GET(new Request("http://t"), idCtx(id))).status).toBe(404);
    expect(
      (await byId.GET(new Request("http://t"), idCtx(duplicated.team.id))).status,
    ).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Archive lifecycle — view + delete; no edit/duplicate (CF-TEAM-US-5)
// ---------------------------------------------------------------------------

describe("teams-backend-e2e — archived teams", () => {
  it("keeps archived teams out of the living list, viewable, not editable, deletable", async () => {
    signedIn(ACCT_A);
    const living = (await (
      await list.POST(post({ name: "Living", members: [fullMember()] }))
    ).json()) as TeamBody;
    const archived = await seedArchived({
      format: GEN7,
      name: "Old rain",
      members: [fullMember({ tera_type: "ground" })],
    });

    const livingList = (await (
      await list.GET(new Request("http://t/api/teams"))
    ).json()) as { teams: { id: string; name: string }[] };
    expect(livingList.teams.map((t) => t.id)).toEqual([living.team.id]);

    const archivedList = (await (
      await list.GET(new Request("http://t/api/teams?archived=1"))
    ).json()) as { teams: { id: string; name: string; format: string }[] };
    expect(archivedList.teams.map((t) => t.id)).toEqual([archived.id]);
    expect(archivedList.teams[0]?.format).toBe(GEN7);

    const getRes = await byId.GET(new Request("http://t"), idCtx(archived.id));
    expect(getRes.status).toBe(200);

    const putRes = await byId.PUT(put({ name: "rewrite" }), idCtx(archived.id));
    expect(putRes.status).toBe(409);
    expect(await putRes.json()).toMatchObject({ code: "team_archived" });

    const dupRes = await dup.POST(new Request("http://t"), idCtx(archived.id));
    expect(dupRes.status).toBe(409);
    expect(await dupRes.json()).toMatchObject({ code: "team_archived" });

    expect((await byId.DELETE(new Request("http://t"), idCtx(archived.id))).status).toBe(200);
    expect((await byId.GET(new Request("http://t"), idCtx(archived.id))).status).toBe(404);
    expect((await byId.GET(new Request("http://t"), idCtx(living.team.id))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Per-account isolation — a row owned by another account is 404, never 403
// (BR-T2 / BR-A9 / CF-AUTH-AC-2.1).
// ---------------------------------------------------------------------------

describe("teams-backend-e2e — cross-account isolation is 404", () => {
  it("hides A's living and archived teams from B across every detail verb", async () => {
    signedIn(ACCT_A);
    const created = (await (
      await list.POST(post({ name: "A only", members: [fullMember()] }))
    ).json()) as TeamBody;
    const archived = await seedArchived({
      accountId: ACCT_A,
      format: GEN7,
      name: "A archive",
    });
    const id = created.team.id;

    signedIn(ACCT_B);
    expect((await byId.GET(new Request("http://t"), idCtx(id))).status).toBe(404);
    expect((await byId.PUT(put({ name: "hijack" }), idCtx(id))).status).toBe(404);
    expect((await dup.POST(new Request("http://t"), idCtx(id))).status).toBe(404);
    expect((await exp.GET(new Request("http://t"), idCtx(id))).status).toBe(404);
    expect((await byId.DELETE(new Request("http://t"), idCtx(id))).status).toBe(404);
    expect((await byId.GET(new Request("http://t"), idCtx(archived.id))).status).toBe(404);
    expect((await byId.DELETE(new Request("http://t"), idCtx(archived.id))).status).toBe(404);

    signedIn(ACCT_A);
    const stillThere = await byId.GET(new Request("http://t"), idCtx(id));
    expect(stillThere.status).toBe(200);
    expect(((await stillThere.json()) as TeamBody).team.name).toBe("A only");
    expect((await byId.GET(new Request("http://t"), idCtx(archived.id))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Guests get 401 on every /api/teams route (BR-T2).
// ---------------------------------------------------------------------------

describe("teams-backend-e2e — guest 401 everywhere", () => {
  it("rejects every verb without a session", async () => {
    guest();
    expect((await list.GET(new Request("http://t/api/teams"))).status).toBe(401);
    expect((await list.POST(post({ name: "x" }))).status).toBe(401);
    expect((await byId.GET(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await byId.PUT(put({}), idCtx("x"))).status).toBe(401);
    expect((await byId.DELETE(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await dup.POST(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await exp.GET(new Request("http://t/x"), idCtx("x"))).status).toBe(401);
    expect((await imp.POST(post({ paste: "x" }))).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Import/export round-trip + EV>255 SAFE-200 + 66/32 warn-but-allow
// ---------------------------------------------------------------------------

describe("teams-backend-e2e — import/export round-trip + Stat Point warnings", () => {
  it("round-trips a built team through export → import preserving the species as champions", async () => {
    signedIn(ACCT_A);
    const created = (await (
      await list.POST(post({ members: [fullMember()] }))
    ).json()) as TeamBody;
    expect(created.team.format).toBe(CH);

    const { paste } = (await (
      await exp.GET(new Request("http://t"), idCtx(created.team.id))
    ).json()) as { paste: string };
    expect(paste).not.toMatch(/Tera Type/i);

    const reimported = (await (await imp.POST(post({ paste }))).json()) as TeamBody;
    expect(reimported.team.format).toBe(CH);
    expect(reimported.team.members[0]?.species).toBe("garchomp");
    expect(reimported.team.members[0]?.tera_type).toBeNull();
    expect(reimported.team.id).not.toBe(created.team.id);
  });

  it("treats an EV > 255 paste as a SAFE 200 (clamped into range, cap is a warning)", async () => {
    signedIn(ACCT_A);
    const paste = [
      "Garchomp",
      "Ability: Rough Skin",
      "EVs: 300 Atk",
      "Adamant Nature",
      "- Earthquake",
    ].join("\n");

    const res = await imp.POST(post({ paste }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as TeamBody;
    expect(out.team.format).toBe(CH);
    expect(out.team.members[0]?.evs.atk).toBeLessThanOrEqual(255);
    expect(out.validation.map((w) => w.code)).toContain("ev_stat_exceeded");
  });

  it("imports a 252 EV Showdown paste as Stat Points with 66/32 warnings (CF-TEAM-AC-3.2)", async () => {
    signedIn(ACCT_A);
    const paste = [
      "Garchomp",
      "Ability: Rough Skin",
      "Tera Type: Ground",
      "EVs: 252 Atk / 4 HP / 252 Spe",
      "Adamant Nature",
      "- Earthquake",
    ].join("\n");
    const res = await imp.POST(post({ paste }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as TeamBody;
    expect(out.team.format).toBe(CH);
    expect(out.team.members[0]?.tera_type).toBeNull();
    expect(out.team.members[0]?.evs).toMatchObject({ atk: 252, spe: 252, hp: 4 });
    const codes = out.validation.map((w) => w.code);
    expect(codes).toContain("ev_stat_exceeded");
    expect(codes).toContain("ev_total_exceeded");
  });
});
