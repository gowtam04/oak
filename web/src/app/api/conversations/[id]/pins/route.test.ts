/**
 * HTTP tests for `POST /api/conversations/:id/pins` (chat-qol PIN-US-1,
 * PIN-BR-1/2).
 *
 *   { message_id, pinned } → 200 { pinnedMessageIds: string[] }
 *
 * Assistant rows only. Cap 50 → 409 pin_limit. Independent of the
 * conversation-level sidebar pin. Signed-in only.
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
let detail: typeof import("../route");
let convRepo: typeof import("@/data/repos/conversation-repo");

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  route = await import("./route");
  detail = await import("../route");
  convRepo = await import("@/data/repos/conversation-repo");
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

function errId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  if (typeof rec.code === "string") return rec.code;
  if (typeof rec.error === "string") return rec.error;
  return undefined;
}

const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function pin(id: string, body: unknown): Promise<Response> {
  return route.POST(
    new Request(`http://t/api/conversations/${id}/pins`, {
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
  now: number,
): Promise<{ userId: string; assistantId: string }> {
  const userId = convRepo.newTurnId();
  const assistantId = convRepo.newTurnId();
  await convRepo.appendTurnPair({
    accountId,
    conversationId,
    format: SV,
    userTurnId: userId,
    userMessage: `q-${now}`,
    assistantTurnId: assistantId,
    answer: ANSWER,
    now,
  });
  return { userId, assistantId };
}

describe("POST /api/conversations/:id/pins", () => {
  it("guest → 401 (PIN-AC-1.5 / ORG-BR-6)", async () => {
    guest();
    const res = await pin("c", { message_id: "m", pinned: true });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("pins and unpins assistant messages in thread order (PIN-AC-1.2 / PIN-AC-1.3)", async () => {
    signedIn(ACCT_A);
    const first = await append(ACCT_A, "c", 1000);
    const second = await append(ACCT_A, "c", 2000);

    // Pin later first so the strip is seq order, not pin time.
    const pinSecond = await pin("c", { message_id: second.assistantId, pinned: true });
    expect(pinSecond.status).toBe(200);
    expect(await pinSecond.json()).toEqual({ pinnedMessageIds: [second.assistantId] });

    const pinFirst = await pin("c", { message_id: first.assistantId, pinned: true });
    expect(pinFirst.status).toBe(200);
    expect(await pinFirst.json()).toEqual({
      pinnedMessageIds: [first.assistantId, second.assistantId],
    });

    const unpinned = await pin("c", { message_id: first.assistantId, pinned: false });
    expect(unpinned.status).toBe(200);
    expect(await unpinned.json()).toEqual({ pinnedMessageIds: [second.assistantId] });

    const detailBody = await (
      await detail.GET(new Request("http://t/api/conversations/c"), idCtx("c"))
    ).json();
    expect(detailBody.pinnedMessageIds).toEqual([second.assistantId]);
  });

  it("rejects pinning a user message (PIN-BR-1)", async () => {
    signedIn(ACCT_A);
    const { userId } = await append(ACCT_A, "c", 1000);
    const res = await pin("c", { message_id: userId, pinned: true });
    expect(res.status).toBe(400);
    expect(await convRepo.listPinnedMessageIds(ACCT_A, "c")).toEqual([]);
  });

  it("409s a 51st pin with pin_limit", async () => {
    signedIn(ACCT_A);
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) {
      ids.push((await append(ACCT_A, "c", 1000 + i)).assistantId);
    }
    for (let i = 0; i < 50; i++) {
      await convRepo.setMessagePinned(ACCT_A, "c", ids[i], true);
    }

    const res = await pin("c", { message_id: ids[50], pinned: true });
    expect(res.status).toBe(409);
    expect(errId(await res.json())).toBe("pin_limit");
    expect(await convRepo.listPinnedMessageIds(ACCT_A, "c")).toHaveLength(50);
  });

  it("conversation pin does not add or remove turn pins (PIN-AC-1.4 / PIN-BR-2)", async () => {
    signedIn(ACCT_A);
    const { assistantId } = await append(ACCT_A, "c", 1000);
    expect((await pin("c", { message_id: assistantId, pinned: true })).status).toBe(200);
    await convRepo.setPinned(ACCT_A, "c", true);
    expect(await convRepo.listPinnedMessageIds(ACCT_A, "c")).toEqual([assistantId]);
    await convRepo.setPinned(ACCT_A, "c", false);
    expect(await convRepo.listPinnedMessageIds(ACCT_A, "c")).toEqual([assistantId]);
  });

  it("400s a malformed body; 404s a missing message or another account's conversation", async () => {
    const { assistantId } = await append(ACCT_A, "c", 1000);

    signedIn(ACCT_A);
    expect((await pin("c", {})).status).toBe(400);
    expect((await pin("c", { message_id: assistantId })).status).toBe(400);
    expect((await pin("c", { message_id: randomUUID(), pinned: true })).status).toBe(404);

    signedIn(ACCT_B);
    expect((await pin("c", { message_id: assistantId, pinned: true })).status).toBe(404);
    expect(await convRepo.listPinnedMessageIds(ACCT_A, "c")).toEqual([]);
  });
});
