/**
 * HTTP tests for `GET /api/conversations` list filters added by chat-qol
 * organize (ORG-US-1/2, ORG-BR-3/5).
 *
 * Query: `folder_id` (`unfiled` | uuid), `archived` (`0` default | `1`),
 * `include_archived=1` on search only. Summary adds `archived` + `folderId`.
 *
 * Guest list stays 200 `{ conversations: [] }` (existing BR-H1). Real
 * migrated Postgres; only `getCurrentAccount` is mocked.
 */

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../test/support/pg";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const SV = "scarlet-violet";

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

let fix: PgFixture;
let route: typeof import("./route");
let convRepo: typeof import("@/data/repos/conversation-repo");
let folderRepo: typeof import("@/data/repos/folder-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  route = await import("./route");
  convRepo = await import("@/data/repos/conversation-repo");
  folderRepo = await import("@/data/repos/folder-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message, conversation_folder RESTART IDENTITY`,
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
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function list(qs = ""): Promise<Response> {
  return route.GET(new Request(`http://t/api/conversations${qs}`));
}

async function seedConv(
  accountId: string,
  id: string,
  title: string,
  now: number,
): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format: SV,
    userTurnId: convRepo.newTurnId(),
    userMessage: title,
    assistantTurnId: convRepo.newTurnId(),
    answer: ANSWER,
    now,
  });
}

type Summary = {
  id: string;
  title: string;
  archived: boolean;
  folderId: string | null;
};

describe("GET /api/conversations — guest", () => {
  it("returns 200 empty for a guest (BR-H1)", async () => {
    guest();
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
  });
});

describe("GET /api/conversations — archive + folder filters", () => {
  it("defaults to non-archived conversations and includes archived + folderId on each summary (ORG-BR-3)", async () => {
    signedIn(ACCT_A);
    const live = randomUUID();
    const archived = randomUUID();
    await seedConv(ACCT_A, live, "live thread", 1000);
    await seedConv(ACCT_A, archived, "archived thread", 2000);
    await convRepo.setArchived(ACCT_A, archived, true);

    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.conversations as Summary[];
    expect(rows.map((c) => c.id)).toEqual([live]);
    expect(rows[0]).toMatchObject({ id: live, archived: false, folderId: null });

    const omittedSameAsZero = await (await list("?archived=0")).json();
    expect(omittedSameAsZero.conversations.map((c: Summary) => c.id)).toEqual([live]);
  });

  it("archived=1 returns only archived conversations (ORG-US-2)", async () => {
    signedIn(ACCT_A);
    const live = randomUUID();
    const archived = randomUUID();
    await seedConv(ACCT_A, live, "live thread", 1000);
    await seedConv(ACCT_A, archived, "archived thread", 2000);
    await convRepo.setArchived(ACCT_A, archived, true);

    const body = await (await list("?archived=1")).json();
    expect(body.conversations.map((c: Summary) => c.id)).toEqual([archived]);
    expect(body.conversations[0]).toMatchObject({ id: archived, archived: true, folderId: null });
  });

  it("does not show a pinned archived conversation on the default list (ORG-BR-3)", async () => {
    signedIn(ACCT_A);
    const id = randomUUID();
    await seedConv(ACCT_A, id, "pinned archived", 1000);
    await convRepo.setPinned(ACCT_A, id, true);
    await convRepo.setArchived(ACCT_A, id, true);

    expect((await (await list()).json()).conversations).toEqual([]);
    expect((await (await list("?archived=1")).json()).conversations.map((c: Summary) => c.id)).toEqual(
      [id],
    );
  });

  it("folder_id uuid lists only non-archived conversations in that folder (ORG-AC-1.3)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "VGC");
    const inFolder = randomUUID();
    const inFolderArchived = randomUUID();
    const unfiled = randomUUID();
    await seedConv(ACCT_A, inFolder, "filed live", 1000);
    await seedConv(ACCT_A, inFolderArchived, "filed archived", 2000);
    await seedConv(ACCT_A, unfiled, "unfiled live", 3000);
    await convRepo.setFolder(ACCT_A, inFolder, folder.id);
    await convRepo.setFolder(ACCT_A, inFolderArchived, folder.id);
    await convRepo.setArchived(ACCT_A, inFolderArchived, true);

    const body = await (await list(`?folder_id=${folder.id}`)).json();
    expect(body.conversations.map((c: Summary) => c.id)).toEqual([inFolder]);
    expect(body.conversations[0]).toMatchObject({
      id: inFolder,
      archived: false,
      folderId: folder.id,
    });
  });

  it("folder_id=unfiled lists only non-archived conversations with no folder (ORG-BR-1)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "Ladder");
    const filed = randomUUID();
    const unfiled = randomUUID();
    const unfiledArchived = randomUUID();
    await seedConv(ACCT_A, filed, "filed", 1000);
    await seedConv(ACCT_A, unfiled, "unfiled", 2000);
    await seedConv(ACCT_A, unfiledArchived, "unfiled archived", 3000);
    await convRepo.setFolder(ACCT_A, filed, folder.id);
    await convRepo.setArchived(ACCT_A, unfiledArchived, true);

    const body = await (await list("?folder_id=unfiled")).json();
    expect(body.conversations.map((c: Summary) => c.id)).toEqual([unfiled]);
    expect(body.conversations[0]).toMatchObject({ folderId: null, archived: false });
  });

  it("search excludes archived unless include_archived=1 (ORG-AC-2.4 / ORG-BR-5)", async () => {
    signedIn(ACCT_A);
    const live = randomUUID();
    const archived = randomUUID();
    await seedConv(ACCT_A, live, "Garchomp live", 1000);
    await seedConv(ACCT_A, archived, "Garchomp archived", 2000);
    await convRepo.setArchived(ACCT_A, archived, true);

    const defaultSearch = await (await list("?q=garchomp")).json();
    expect(defaultSearch.conversations.map((c: Summary) => c.id)).toEqual([live]);

    const withArchived = await (await list("?q=garchomp&include_archived=1")).json();
    expect(withArchived.conversations.map((c: Summary) => c.id).sort()).toEqual(
      [live, archived].sort(),
    );

    // include_archived without a search does not widen the default list.
    const includeWithoutQ = await (await list("?include_archived=1")).json();
    expect(includeWithoutQ.conversations.map((c: Summary) => c.id)).toEqual([live]);
  });

  it("does not leak another account's conversations through folder/archive filters", async () => {
    const folder = await folderRepo.createFolder(ACCT_A, "Mine");
    const id = randomUUID();
    await seedConv(ACCT_A, id, "secret", 1000);
    await convRepo.setFolder(ACCT_A, id, folder.id);
    await convRepo.setArchived(ACCT_A, id, true);

    signedIn(ACCT_B);
    expect((await (await list(`?folder_id=${folder.id}`)).json()).conversations).toEqual([]);
    expect((await (await list("?folder_id=unfiled")).json()).conversations).toEqual([]);
    expect((await (await list("?archived=1")).json()).conversations).toEqual([]);
  });
});
