/**
 * HTTP tests for `POST /api/conversations/:id/fork` (chat-qol FORK-US-1,
 * FORK-BR-1/2, ADR-14).
 *
 *   { through_message_id } → 201 { id, title }
 *
 * Copies the prefix through that assistant card (turns + prefix pins +
 * sticky scope). The fork is unfiled, not archived, and uses a
 * server-minted id. Source is unchanged. Signed-in only.
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

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../../../test/support/pg";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const CH = "champions";
const SV = "scarlet-violet";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ANSWER = (markdown: string): OakAnswer => ({
  status: "answered",
  answer_markdown: markdown,
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
});

let fix: PgFixture;
let route: typeof import("./route");
let detail: typeof import("../route");
let convRepo: typeof import("@/data/repos/conversation-repo");
let folderRepo: typeof import("@/data/repos/folder-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  route = await import("./route");
  detail = await import("../route");
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

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function fork(id: string, body: unknown): Promise<Response> {
  return route.POST(
    new Request(`http://t/api/conversations/${id}/fork`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    idCtx(id),
  );
}

async function append(
  accountId: string,
  conversationId: string,
  format: string,
  userMessage: string,
  answer: string,
  now: number,
): Promise<{ userId: string; assistantId: string }> {
  const userId = convRepo.newTurnId();
  const assistantId = convRepo.newTurnId();
  await convRepo.appendTurnPair({
    accountId,
    conversationId,
    format,
    userTurnId: userId,
    userMessage,
    assistantTurnId: assistantId,
    answer: ANSWER(answer),
    now,
  });
  return { userId, assistantId };
}

describe("POST /api/conversations/:id/fork", () => {
  it("guest → 401 (FORK-AC-1.5 / ORG-BR-6)", async () => {
    guest();
    const res = await fork("c", { through_message_id: "m" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("400s a missing through_message_id", async () => {
    signedIn(ACCT_A);
    const { assistantId } = await append(ACCT_A, "c", SV, "q", "a", 1000);
    expect(assistantId).toBeTruthy();
    expect((await fork("c", {})).status).toBe(400);
    expect((await fork("c", { through_message_id: "" })).status).toBe(400);
  });

  it("copies the prefix through the chosen assistant card, including pins + scope (FORK-AC-1.1–1.4)", async () => {
    signedIn(ACCT_A);
    const sourceId = randomUUID();
    const first = await append(ACCT_A, sourceId, CH, "rain team", "here is rain", 1000);
    const second = await append(ACCT_A, sourceId, CH, "make it sun", "here is sun", 2000);
    const third = await append(ACCT_A, sourceId, CH, "add TR", "here is TR", 3000);
    await convRepo.setMessagePinned(ACCT_A, sourceId, first.assistantId, true);
    await convRepo.setMessagePinned(ACCT_A, sourceId, third.assistantId, true);
    await convRepo.setPinned(ACCT_A, sourceId, true);

    const res = await fork(sourceId, { through_message_id: first.assistantId });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toEqual({ id: expect.any(String), title: "rain team (fork)" });
    expect(created.id).not.toBe(sourceId);
    expect(created.id).toMatch(UUID_RE);

    const forkBody = await (
      await detail.GET(new Request(`http://t/api/conversations/${created.id}`), idCtx(created.id))
    ).json();
    expect(forkBody).toMatchObject({
      id: created.id,
      title: "rain team (fork)",
      format: CH,
      archived: false,
      folderId: null,
    });
    expect(forkBody.turns.map((t: { role: string }) => t.role)).toEqual(["user", "assistant"]);
    expect(forkBody.turns[0].content).toBe("rain team");
    expect(forkBody.turns[1].answer.answer_markdown).toBe("here is rain");
    expect(forkBody.pinnedMessageIds).toEqual([forkBody.turns[1].id]);

    const source = await (
      await detail.GET(new Request(`http://t/api/conversations/${sourceId}`), idCtx(sourceId))
    ).json();
    expect(source.turns).toHaveLength(6);
    expect(source.pinned).toBe(true);
    expect(source.pinnedMessageIds).toEqual([first.assistantId, third.assistantId]);
    expect(source.turns.map((t: { role: string }) => t.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(second.assistantId).toBeTruthy();
  });

  it("does not copy pins after the fork point (FORK-AC-1.3)", async () => {
    signedIn(ACCT_A);
    const sourceId = randomUUID();
    const first = await append(ACCT_A, sourceId, SV, "q1", "a1", 1000);
    const second = await append(ACCT_A, sourceId, SV, "q2", "a2", 2000);
    await convRepo.setMessagePinned(ACCT_A, sourceId, first.assistantId, true);
    await convRepo.setMessagePinned(ACCT_A, sourceId, second.assistantId, true);

    const created = await (await fork(sourceId, { through_message_id: first.assistantId })).json();
    const forkBody = await (
      await detail.GET(new Request(`http://t/api/conversations/${created.id}`), idCtx(created.id))
    ).json();
    expect(forkBody.turns).toHaveLength(2);
    expect(forkBody.pinnedMessageIds).toHaveLength(1);
    expect(forkBody.pinnedMessageIds[0]).toBe(forkBody.turns[1].id);
  });

  it("truncates '{sourceTitle} (fork)' to 120 characters (ADR-14)", async () => {
    signedIn(ACCT_A);
    const sourceId = randomUUID();
    const { assistantId } = await append(ACCT_A, sourceId, SV, "short", "a", 1000);
    const longTitle = "x".repeat(120);
    await convRepo.renameConversation(ACCT_A, sourceId, longTitle);

    const res = await fork(sourceId, { through_message_id: assistantId });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.title.length).toBeLessThanOrEqual(120);
    expect(created.title).toBe(`${longTitle} (fork)`.slice(0, 120));
  });

  it("fork of an archived, filed source is unfiled and not archived (FORK-AC-1.4)", async () => {
    signedIn(ACCT_A);
    const folder = await folderRepo.createFolder(ACCT_A, "VGC");
    const sourceId = randomUUID();
    const { assistantId } = await append(ACCT_A, sourceId, SV, "source", "a", 1000);
    await convRepo.setFolder(ACCT_A, sourceId, folder.id);
    await convRepo.setArchived(ACCT_A, sourceId, true);

    const created = await (await fork(sourceId, { through_message_id: assistantId })).json();
    const forkRow = await convRepo.getConversation(ACCT_A, created.id);
    expect(forkRow).toMatchObject({ archived: false, folderId: null, format: SV });
    expect(await convRepo.getConversation(ACCT_A, sourceId)).toMatchObject({
      archived: true,
      folderId: folder.id,
    });
  });

  it("404s another account's conversation, a user-row fork point, and a missing id", async () => {
    const sourceId = randomUUID();
    const { userId, assistantId } = await append(ACCT_A, sourceId, SV, "private", "secret", 1000);

    signedIn(ACCT_B);
    expect((await fork(sourceId, { through_message_id: assistantId })).status).toBe(404);
    expect(await convRepo.getConversation(ACCT_B, sourceId)).toBeNull();

    signedIn(ACCT_A);
    expect((await fork(sourceId, { through_message_id: userId })).status).toBe(404);
    expect((await fork(sourceId, { through_message_id: randomUUID() })).status).toBe(404);
    expect((await fork(randomUUID(), { through_message_id: assistantId })).status).toBe(404);

    expect((await convRepo.getMessages(ACCT_A, sourceId)).map((t) => t.textContent)).toEqual([
      "private",
      "secret",
    ]);
  });
});
