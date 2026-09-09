/**
 * HTTP tests for `POST /api/conversations/bulk` (chat-qol ORG-US-3, ORG-BR-4).
 *
 *   { ids, action: "delete" | "archive" | "unarchive" | "move", folder_id? }
 *   → 200 { updated: string[], skipped: string[] }
 *
 * Unknown / not-owned ids are skipped (not a 404 for the batch). Empty `ids`
 * is 400. Signed-in only. Real migrated Postgres; only `getCurrentAccount`
 * is mocked.
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

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../../test/support/pg";

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

function post(body: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/conversations/bulk", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function seedConv(accountId: string, id: string, now = Date.now()): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format: SV,
    userTurnId: convRepo.newTurnId(),
    userMessage: id,
    assistantTurnId: convRepo.newTurnId(),
    answer: ANSWER,
    now,
  });
}

describe("POST /api/conversations/bulk — auth + validation", () => {
  it("guest → 401 (ORG-BR-6)", async () => {
    guest();
    const res = await post({ ids: ["c"], action: "archive" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("empty ids → 400", async () => {
    signedIn(ACCT_A);
    expect((await post({ ids: [], action: "delete" })).status).toBe(400);
    expect((await post({ action: "delete" })).status).toBe(400);
  });

  it("unknown / missing action → 400", async () => {
    signedIn(ACCT_A);
    expect((await post({ ids: ["c"], action: "nope" })).status).toBe(400);
    expect((await post({ ids: ["c"] })).status).toBe(400);
  });

  it("move without folder_id → 400", async () => {
    signedIn(ACCT_A);
    expect((await post({ ids: ["c"], action: "move" })).status).toBe(400);
    expect((await post({ ids: ["c"], action: "move", folder_id: { id: "x" } })).status).toBe(400);
  });
});

describe("POST /api/conversations/bulk — skip foreign ids", () => {
  it("delete permanently removes owned conversations and skips the rest (ORG-BR-4)", async () => {
    signedIn(ACCT_A);
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();
    await seedConv(ACCT_A, a1, 1000);
    await seedConv(ACCT_A, a2, 2000);
    await seedConv(ACCT_B, b1, 3000);

    const res = await post({ ids: [a1, b1, "no-such-id"], action: "delete" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated.sort()).toEqual([a1].sort());
    expect(body.skipped.sort()).toEqual([b1, "no-such-id"].sort());

    expect(await convRepo.getConversation(ACCT_A, a1)).toBeNull();
    expect(await convRepo.getMessages(ACCT_A, a1)).toEqual([]);
    expect(await convRepo.getConversation(ACCT_A, a2)).not.toBeNull();
    expect(await convRepo.getConversation(ACCT_B, b1)).not.toBeNull();
  });

  it("archive / unarchive apply per owned id and do not unfile (ORG-BR-2)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "VGC");
    const a1 = randomUUID();
    const b1 = randomUUID();
    await seedConv(ACCT_A, a1);
    await seedConv(ACCT_B, b1);
    await convRepo.setFolder(ACCT_A, a1, folder.id);

    const archived = await post({ ids: [a1, b1], action: "archive" });
    expect(archived.status).toBe(200);
    expect(await archived.json()).toEqual({ updated: [a1], skipped: [b1] });
    expect(await convRepo.getConversation(ACCT_A, a1)).toMatchObject({
      archived: true,
      folderId: folder.id,
    });
    expect((await convRepo.getConversation(ACCT_B, b1))?.archived).toBe(false);

    const unarchived = await post({ ids: [a1], action: "unarchive" });
    expect(unarchived.status).toBe(200);
    expect(await convRepo.getConversation(ACCT_A, a1)).toMatchObject({
      archived: false,
      folderId: folder.id,
    });
  });

  it("move files owned ids and unfiles when folder_id is null (ORG-AC-3.3)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "Ladder");
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();
    await seedConv(ACCT_A, a1);
    await seedConv(ACCT_A, a2);
    await seedConv(ACCT_B, b1);

    const moved = await post({ ids: [a1, b1], action: "move", folder_id: folder.id });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({ updated: [a1], skipped: [b1] });
    expect((await convRepo.getConversation(ACCT_A, a1))?.folderId).toBe(folder.id);
    expect((await convRepo.getConversation(ACCT_B, b1))?.folderId ?? null).toBeNull();

    const unfiled = await post({ ids: [a1, a2], action: "move", folder_id: null });
    expect(unfiled.status).toBe(200);
    const body = await unfiled.json();
    expect(body.updated.sort()).toEqual([a1, a2].sort());
    expect(body.skipped).toEqual([]);
    expect((await convRepo.getConversation(ACCT_A, a1))?.folderId).toBeNull();
    expect((await convRepo.getConversation(ACCT_A, a2))?.folderId).toBeNull();
  });

  it("move into another account's folder does not file owned conversations", async () => {
    signedIn(ACCT_A);
    const foreign = await folderRepo.createFolder(ACCT_B, "Not yours");
    const a1 = randomUUID();
    await seedConv(ACCT_A, a1);

    const res = await post({ ids: [a1], action: "move", folder_id: foreign.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toEqual([]);
    expect(body.skipped).toEqual([a1]);
    expect((await convRepo.getConversation(ACCT_A, a1))?.folderId).toBeNull();
  });
});
