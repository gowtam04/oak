/**
 * Oracle tests for src/data/repos/team-repo.ts — the sole Postgres reader/writer
 * for saved teams. Asserts behaviour against a real migrated Postgres schema
 * (Testcontainers).
 *
 * Champions-first (P4 / ADR-3): a row is **living** iff `format === "champions"`
 * and **archived** iff `format !== "champions"` (no `archived_at` column).
 * `listTeams` filters on that derived flag; `createTeam` always stores
 * champions (CF-DATA-BR-9, CF-TEAM-AC-1.1). Archived rows are seeded via a
 * direct insert so tests do not depend on create accepting another format.
 *
 * Like conversation-repo.test.ts the repo reads the `@/data/db` SINGLETON, so the
 * harness installs the fixture as the singleton BEFORE the first dynamic import
 * of the repo, and `server-only` is neutralised under the vitest node env.
 *
 * Account isolation (BR-T2 / CF-DATA-BR-11 / CF-AUTH-AC-2.1) is asserted
 * explicitly: every read/write is account-scoped and a different account sees
 * null/[] / a no-op (never a 403).
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

import { team } from "@/data/schema";
import type { TeamMember } from "@/data/teams/team-schema";

type Repo = typeof import("./team-repo");

let fix: PgFixture;
let repo: Repo;

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  repo = await import("./team-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE team, conversation, conversation_message RESTART IDENTITY`,
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCT_A = "account-a";
const ACCT_B = "account-b";
const SV = "scarlet-violet";
const CH = "champions";
const GEN7 = "gen-7";

const ZERO_SPREAD = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** A fully-built member (species + 4 moves) — counts as "complete". */
function fullMember(species: string): TeamMember {
  return {
    species,
    ability: "intimidate",
    item: "leftovers",
    moves: ["earthquake", "rock-slide", "protect", "stealth-rock"],
    nature: "adamant",
    evs: { ...ZERO_SPREAD, atk: 32, spe: 32, hp: 2 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
  };
}

/** An empty slot (no species, no moves) — partial. */
function emptyMember(): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { ...ZERO_SPREAD },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
  };
}

function sixComplete(): TeamMember[] {
  return [
    "garchomp",
    "rotom-wash",
    "amoonguss",
    "great-tusk",
    "iron-hands",
    "flutter-mane",
  ].map(fullMember);
}

/** Insert a non-champions row so it is archived by definition (ADR-3). */
async function insertArchived(opts: {
  accountId: string;
  format: string;
  name: string;
  members?: TeamMember[];
  now?: number;
}): Promise<{ id: string; format: string; name: string }> {
  const id = randomUUID();
  const now = opts.now ?? 1000;
  await fix.db.insert(team).values({
    id,
    account_id: opts.accountId,
    format: opts.format,
    name: opts.name,
    members: JSON.stringify(opts.members ?? []),
    created_at: now,
    updated_at: now,
  });
  return { id, format: opts.format, name: opts.name };
}

async function createLiving(opts: {
  accountId?: string;
  name: string;
  members?: TeamMember[];
  now?: number;
  /** Ignored — create always stores champions (CF-DATA-BR-9). */
  format?: string;
}) {
  return repo.createTeam({
    accountId: opts.accountId ?? ACCT_A,
    format: opts.format ?? CH,
    name: opts.name,
    members: opts.members ?? [],
    now: opts.now ?? 1000,
  });
}

// ---------------------------------------------------------------------------
// createTeam + getTeam — JSON round-trip, camelCase mapping (TEAM-US-1, TEAM-US-3)
// ---------------------------------------------------------------------------

describe("createTeam + getTeam", () => {
  it("round-trips the members JSON and maps snake_case → camelCase", async () => {
    const members = [fullMember("garchomp"), emptyMember()];
    const created = await createLiving({
      name: "My Team",
      members,
      now: 1000,
    });

    expect(created).toMatchObject({
      accountId: ACCT_A,
      format: CH,
      name: "My Team",
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(created.id).toBeTruthy();

    const fetched = await repo.getTeam(ACCT_A, created.id);
    expect(fetched).toEqual(created);
    // Deep round-trip of a member (nested EV/IV spreads + moves array).
    expect(fetched?.members[0]).toEqual(members[0]);
    expect(fetched?.members[1].species).toBeNull();
  });

  it("accepts an empty (0-member) team (BR-T4)", async () => {
    const created = await createLiving({
      name: "Untitled team",
      members: [],
      now: 1000,
    });
    const fetched = await repo.getTeam(ACCT_A, created.id);
    expect(fetched?.members).toEqual([]);
  });

  it("always stores champions, ignoring a requested other-game format (CF-DATA-BR-9, CF-TEAM-AC-1.1)", async () => {
    const created = await repo.createTeam({
      accountId: ACCT_A,
      format: SV,
      name: "Pretend SV",
      members: [],
      now: 1000,
    });
    expect(created.format).toBe(CH);
    expect((await repo.getTeam(ACCT_A, created.id))?.format).toBe(CH);
  });

  it("getTeam returns null for a missing id", async () => {
    expect(await repo.getTeam(ACCT_A, "no-such-id")).toBeNull();
  });

  it("getTeam still returns an archived (non-champions) row for its owner (CF-TEAM-AC-5.2)", async () => {
    const archived = await insertArchived({
      accountId: ACCT_A,
      format: GEN7,
      name: "Old rain",
      members: [fullMember("garchomp")],
    });
    const fetched = await repo.getTeam(ACCT_A, archived.id);
    expect(fetched).toMatchObject({
      id: archived.id,
      format: GEN7,
      name: "Old rain",
    });
    expect(fetched?.format).not.toBe(CH);
  });
});

// ---------------------------------------------------------------------------
// listTeams — living vs archived (CF-TEAM-AC-1.7, CF-TEAM-AC-5.1, ADR-3)
// ---------------------------------------------------------------------------

describe("listTeams", () => {
  it("orders most-recently-edited first and projects a cheap summary", async () => {
    const older = await createLiving({
      name: "older",
      members: sixComplete(),
      now: 1000,
    });
    const newer = await createLiving({
      name: "newer",
      members: [fullMember("garchomp"), emptyMember()],
      now: 2000,
    });

    const list = await repo.listTeams(ACCT_A);
    expect(list.map((t) => t.name)).toEqual(["newer", "older"]);

    const newerSummary = list.find((t) => t.id === newer.id)!;
    expect(newerSummary).toMatchObject({
      format: CH,
      memberCount: 2,
      incomplete: true, // <6 members
      // species slugs of the filled slots only (the empty slot is omitted).
      species: ["garchomp"],
      updatedAt: 2000,
    });
    const olderSummary = list.find((t) => t.id === older.id)!;
    expect(olderSummary).toMatchObject({
      format: CH,
      memberCount: 6,
      incomplete: false,
    });
  });

  it("flags incomplete when a member is missing species or a 4th move", async () => {
    // Six members but one has only 3 moves → incomplete.
    const members = sixComplete();
    members[3] = { ...members[3], moves: ["earthquake", "protect", "rock-slide"] };
    const created = await createLiving({
      name: "three-move-mon",
      members,
      now: 1000,
    });
    const summary = (await repo.listTeams(ACCT_A)).find((t) => t.id === created.id)!;
    expect(summary).toMatchObject({ memberCount: 6, incomplete: true });
  });

  it("defaults to living Champions teams only (CF-TEAM-AC-1.7, CF-DATA-BR-12)", async () => {
    await createLiving({ name: "living", members: [], now: 3000 });
    await insertArchived({
      accountId: ACCT_A,
      format: SV,
      name: "sv-archive",
      now: 2000,
    });
    await insertArchived({
      accountId: ACCT_A,
      format: GEN7,
      name: "gen7-archive",
      now: 1000,
    });

    const living = await repo.listTeams(ACCT_A);
    expect(living.map((t) => t.name)).toEqual(["living"]);
    expect(living.every((t) => t.format === CH)).toBe(true);

    const alsoDefault = await repo.listTeams(ACCT_A, { archived: false });
    expect(alsoDefault.map((t) => t.name)).toEqual(["living"]);
  });

  it("archived:true lists every non-champions team and keeps format for labels (CF-TEAM-AC-5.1, ADR-3)", async () => {
    await createLiving({ name: "living", members: [], now: 4000 });
    await insertArchived({
      accountId: ACCT_A,
      format: SV,
      name: "sv-archive",
      now: 3000,
    });
    await insertArchived({
      accountId: ACCT_A,
      format: GEN7,
      name: "gen7-archive",
      now: 2000,
    });
    await insertArchived({
      accountId: ACCT_A,
      format: "national-dex",
      name: "natdex-archive",
      now: 1000,
    });

    const archived = await repo.listTeams(ACCT_A, { archived: true });
    expect(archived.map((t) => t.name)).toEqual([
      "sv-archive",
      "gen7-archive",
      "natdex-archive",
    ]);
    expect(archived.map((t) => t.format)).toEqual([SV, GEN7, "national-dex"]);
    expect(archived.every((t) => t.format !== CH)).toBe(true);
  });

  it("does not archive a Champions team just because it has warnings (CF-DATA-BR-15)", async () => {
    await createLiving({
      name: "incomplete living",
      members: [emptyMember()],
      now: 1000,
    });
    const living = await repo.listTeams(ACCT_A);
    expect(living).toHaveLength(1);
    expect(living[0]).toMatchObject({
      name: "incomplete living",
      format: CH,
      incomplete: true,
    });
    expect(await repo.listTeams(ACCT_A, { archived: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateTeam — replace name/members, bump updated_at (TEAM-US-2)
// ---------------------------------------------------------------------------

describe("updateTeam", () => {
  it("replaces name + members and bumps updated_at", async () => {
    const created = await createLiving({
      name: "before",
      members: [emptyMember()],
      now: 1000,
    });

    const newMembers = [fullMember("garchomp")];
    const updated = await repo.updateTeam({
      accountId: ACCT_A,
      id: created.id,
      name: "after",
      members: newMembers,
      now: 2000,
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: "after",
      format: CH,
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(updated?.members).toEqual(newMembers);
  });

  it("supports a partial update (name only — members preserved)", async () => {
    const members = [fullMember("garchomp")];
    const created = await createLiving({
      name: "before",
      members,
      now: 1000,
    });
    const updated = await repo.updateTeam({
      accountId: ACCT_A,
      id: created.id,
      name: "renamed",
      now: 2000,
    });
    expect(updated?.name).toBe("renamed");
    expect(updated?.members).toEqual(members); // unchanged
  });

  it("returns null for a missing / not-owned team (no-op)", async () => {
    const created = await createLiving({
      name: "A's",
      members: [],
      now: 1000,
    });
    expect(
      await repo.updateTeam({ accountId: ACCT_B, id: created.id, name: "hijack", now: 2000 }),
    ).toBeNull();
    // A's team untouched.
    expect((await repo.getTeam(ACCT_A, created.id))?.name).toBe("A's");
  });
});

// ---------------------------------------------------------------------------
// duplicateTeam — independent clone (AC-4.2); living copy stays champions
// ---------------------------------------------------------------------------

describe("duplicateTeam", () => {
  it('clones members into a new "<name> copy" team that is independent', async () => {
    const original = await createLiving({
      name: "Rain",
      members: [fullMember("garchomp")],
      now: 1000,
    });

    const copy = await repo.duplicateTeam(ACCT_A, original.id, 2000);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.name).toBe("Rain copy");
    expect(copy!.format).toBe(CH);
    expect(copy!.members).toEqual(original.members);

    // Editing the copy does not touch the original (independent thereafter).
    await repo.updateTeam({
      accountId: ACCT_A,
      id: copy!.id,
      members: [fullMember("dragonite")],
      now: 3000,
    });
    expect((await repo.getTeam(ACCT_A, original.id))?.members[0].species).toBe("garchomp");
    expect((await repo.getTeam(ACCT_A, copy!.id))?.members[0].species).toBe("dragonite");
  });

  it("returns null for a missing / not-owned source", async () => {
    const original = await createLiving({
      name: "A's",
      members: [],
      now: 1000,
    });
    expect(await repo.duplicateTeam(ACCT_B, original.id, 2000)).toBeNull();
    expect(await repo.duplicateTeam(ACCT_A, "no-such-id", 2000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteTeam — permanent, account-scoped (TEAM-US-4, CF-DATA-BR-14)
// ---------------------------------------------------------------------------

describe("deleteTeam", () => {
  it("removes the team", async () => {
    const created = await createLiving({
      name: "doomed",
      members: [],
      now: 1000,
    });
    await repo.deleteTeam(ACCT_A, created.id);
    expect(await repo.getTeam(ACCT_A, created.id)).toBeNull();
  });

  it("deletes an archived team permanently (CF-TEAM-AC-5.2, CF-DATA-BR-14)", async () => {
    const archived = await insertArchived({
      accountId: ACCT_A,
      format: GEN7,
      name: "doomed archive",
    });
    await repo.deleteTeam(ACCT_A, archived.id);
    expect(await repo.getTeam(ACCT_A, archived.id)).toBeNull();
  });

  it("is idempotent (deleting an absent id is a no-op)", async () => {
    await expect(repo.deleteTeam(ACCT_A, "no-such-id")).resolves.toBeUndefined();
  });

  it("does not delete another account's team", async () => {
    const created = await createLiving({
      name: "A's",
      members: [],
      now: 1000,
    });
    await repo.deleteTeam(ACCT_B, created.id); // wrong account → no-op
    expect(await repo.getTeam(ACCT_A, created.id)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Account isolation (BR-T2 / CF-DATA-BR-11 / CF-AUTH-AC-2.1)
// ---------------------------------------------------------------------------

describe("account isolation", () => {
  it("getTeam / listTeams only see the asking account's living and archived teams", async () => {
    const aLiving = await createLiving({
      accountId: ACCT_A,
      name: "A living",
      now: 2000,
    });
    const aArchived = await insertArchived({
      accountId: ACCT_A,
      format: GEN7,
      name: "A archive",
      now: 1000,
    });
    await createLiving({ accountId: ACCT_B, name: "B living", now: 2000 });
    await insertArchived({
      accountId: ACCT_B,
      format: SV,
      name: "B archive",
      now: 1000,
    });

    expect(await repo.getTeam(ACCT_B, aLiving.id)).toBeNull();
    expect(await repo.getTeam(ACCT_B, aArchived.id)).toBeNull();
    expect((await repo.listTeams(ACCT_A)).map((t) => t.name)).toEqual(["A living"]);
    expect((await repo.listTeams(ACCT_A, { archived: true })).map((t) => t.name)).toEqual([
      "A archive",
    ]);
    expect((await repo.listTeams(ACCT_B)).map((t) => t.name)).toEqual(["B living"]);
    expect((await repo.listTeams(ACCT_B, { archived: true })).map((t) => t.name)).toEqual([
      "B archive",
    ]);
  });
});
