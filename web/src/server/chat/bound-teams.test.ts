/**
 * Oracle tests for src/server/chat/bound-teams.ts — resolve `mentioned_team_ids`
 * to `{ id, name, format }` for this turn (docs/features/chat-qol ADR-5,
 * MEN-US-1, MEN-BR-1..4, AUTH-BR-4).
 *
 * Mentions are server-bound via `getTeam(accountId, id)`, never name-matched.
 * Any miss (deleted, not owned, unknown) is `{ ok:false, error:"unbound_mention", id }`.
 * There is no 21st tool — the route binds `AgentContext.boundTeams` and the
 * model calls existing `get_team`.
 *
 * Expected export:
 *   resolveBoundTeams(accountId, ids) →
 *     { ok:true, teams: BoundTeam[] } | { ok:false, error:"unbound_mention", id }
 */

import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

import type { Format } from "@/data/formats";

type BoundTeam = { id: string; name: string; format: Format };
type ResolveBoundTeams = (
  accountId: string,
  ids: string[],
) => Promise<
  | { ok: true; teams: BoundTeam[] }
  | { ok: false; error: "unbound_mention"; id: string }
>;

const ACCT_A = "acct-bound-a";
const ACCT_B = "acct-bound-b";
const MISSING_ID = "00000000-0000-4000-8000-0000000000aa";

let fix: PgFixture;
let resolveBoundTeams: ResolveBoundTeams;
let teamRepo: typeof import("@/data/repos/team-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  teamRepo = await import("@/data/repos/team-repo");
  let mod: Record<string, unknown>;
  try {
    // Variable specifier so typecheck does not require the impl file to exist
    // yet (Phase 2 red). Runtime still resolves `./bound-teams`.
    const specifier = "./bound-teams";
    mod = (await import(specifier)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      "expected web/src/server/chat/bound-teams.ts to export resolveBoundTeams (MEN-BR-1 / ADR-5)",
      { cause: err },
    );
  }
  const fn = mod.resolveBoundTeams as ResolveBoundTeams | undefined;
  if (typeof fn !== "function") {
    throw new Error("resolveBoundTeams is not exported from bound-teams");
  }
  resolveBoundTeams = fn;
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(sql`TRUNCATE TABLE team RESTART IDENTITY`);
});

async function seedTeam(
  accountId: string,
  name: string,
  format: "scarlet-violet" | "champions",
) {
  return teamRepo.createTeam({
    accountId,
    format,
    name,
    members: [],
    now: Date.now(),
  });
}

describe("resolveBoundTeams (MEN-US-1, MEN-BR-1..3, AUTH-BR-4)", () => {
  it("returns { ok:true, teams } with id/name/format for every owned id (MEN-BR-1, MEN-BR-3)", async () => {
    const rain = await seedTeam(ACCT_A, "Rain", "scarlet-violet");
    const cup = await seedTeam(ACCT_A, "Worlds cup", "champions");

    await expect(
      resolveBoundTeams(ACCT_A, [rain.id, cup.id]),
    ).resolves.toEqual({
      ok: true,
      teams: [
        { id: rain.id, name: "Rain", format: "scarlet-violet" },
        { id: cup.id, name: "Worlds cup", format: "champions" },
      ],
    });
  });

  it("preserves request order when binding multiple teams (MEN-BR-3)", async () => {
    const first = await seedTeam(ACCT_A, "First", "scarlet-violet");
    const second = await seedTeam(ACCT_A, "Second", "champions");

    const result = await resolveBoundTeams(ACCT_A, [second.id, first.id]);
    expect(result).toEqual({
      ok: true,
      teams: [
        { id: second.id, name: "Second", format: "champions" },
        { id: first.id, name: "First", format: "scarlet-violet" },
      ],
    });
  });

  it("an empty id list is a successful empty bind", async () => {
    await expect(resolveBoundTeams(ACCT_A, [])).resolves.toEqual({
      ok: true,
      teams: [],
    });
  });

  it("a missing id is { ok:false, error:unbound_mention, id } (MEN-BR-2)", async () => {
    const owned = await seedTeam(ACCT_A, "Rain", "scarlet-violet");

    await expect(
      resolveBoundTeams(ACCT_A, [owned.id, MISSING_ID]),
    ).resolves.toEqual({
      ok: false,
      error: "unbound_mention",
      id: MISSING_ID,
    });
  });

  it("another account's team is unbound — not name-matched (AUTH-BR-4, MEN-BR-2)", async () => {
    const foreign = await seedTeam(ACCT_B, "Rain", "scarlet-violet");

    await expect(resolveBoundTeams(ACCT_A, [foreign.id])).resolves.toEqual({
      ok: false,
      error: "unbound_mention",
      id: foreign.id,
    });
  });

  it("a deleted team is unbound (MEN-BR-2)", async () => {
    const gone = await seedTeam(ACCT_A, "Gone", "scarlet-violet");
    await teamRepo.deleteTeam(ACCT_A, gone.id);

    await expect(resolveBoundTeams(ACCT_A, [gone.id])).resolves.toEqual({
      ok: false,
      error: "unbound_mention",
      id: gone.id,
    });
  });
});
