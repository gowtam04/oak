/**
 * Route-adapter tests for PUT /api/scope (chat-qol api-design.md, ADR-8).
 *
 * Chip-pick persist with no follow-up message (SCOPE-US-1, SCOPE-BR-1).
 * Signed-in picks also write account.last_used_scope + MRU touch (SCOPE-US-2,
 * SCOPE-BR-2). Guests write session scope only. No turn, no model.
 *
 * Real migrated Postgres (Testcontainers) so conversation / account / MRU
 * repos run against the `@/data/db` singleton; only `getCurrentAccount` is
 * mocked. Guest session scope is the in-process session-store.
 *
 * Requirement refs: SCOPE-US-1, SCOPE-US-2, SCOPE-BR-1..3, SCOPE-AC-1.1..2.3
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../test/support/pg";
import {
  _resetStoreForTests as resetSessionStore,
  getSessionScope,
} from "@/server/session-store";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";
const CONV_A = "conv-a";
const GUEST_SID = "guest-session-1";
const NATDEX = "national-dex";
const GEN7 = "gen-7";
const CHAMPIONS = "champions";

let fix: PgFixture;
let route: typeof import("./route");
let convRepo: typeof import("@/data/repos/conversation-repo");
let accounts: typeof import("@/data/repos/accounts-repo");
let mru: typeof import("@/data/repos/scope-mru-repo");

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  route = await import("./route");
  convRepo = await import("@/data/repos/conversation-repo");
  accounts = await import("@/data/repos/accounts-repo");
  mru = await import("@/data/repos/scope-mru-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE account_scope_mru, conversation_message, conversation, account RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
  await resetSessionStore();
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

function put(body: unknown, url = "http://t/api/scope"): Promise<Response> {
  return route.PUT(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function seedAccount(id: string): Promise<void> {
  await accounts.createAccount(`${id}@x.test`, id, 0);
}

async function seedConv(
  accountId: string,
  id: string,
  format: string,
): Promise<void> {
  await convRepo.appendTurnPair({
    accountId,
    conversationId: id,
    format,
    userTurnId: convRepo.newTurnId(),
    userMessage: "q",
    assistantTurnId: convRepo.newTurnId(),
    answer: ANSWER,
    now: Date.now(),
  });
}

async function lastUsedScopeOf(accountId: string): Promise<string | null> {
  const found = await accounts.findAccountByEmail(`${accountId}@x.test`);
  return found?.lastUsedScope ?? null;
}

function errorToken(body: { error?: unknown; code?: unknown }): string {
  const token = body.error ?? body.code;
  return typeof token === "string" ? token : "";
}

// --- 400 unknown format ----------------------------------------------------

describe("PUT /api/scope — unknown format (400)", () => {
  it("rejects an unknown format and writes nothing", async () => {
    await seedAccount(ACCT_A);
    await seedConv(ACCT_A, CONV_A, NATDEX);
    signedIn(ACCT_A);

    const res = await put({ format: "gen9ou", conversation_id: CONV_A });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(errorToken(body)).toMatch(/format/i);

    expect(await lastUsedScopeOf(ACCT_A)).toBeNull();
    expect(await mru.list(ACCT_A)).toEqual([]);
    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
  });

  it("rejects a missing format", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);

    const res = await put({ conversation_id: CONV_A });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(errorToken(body)).toMatch(/format/i);
  });
});

// --- Signed-in -------------------------------------------------------------

describe("PUT /api/scope — signed-in (SCOPE-US-1, SCOPE-BR-1)", () => {
  it("owned conversation_id updates format + last_used_scope + MRU", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    const res = await put({ format: GEN7, conversation_id: CONV_A });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      format: GEN7,
      lastUsedScopes: [GEN7],
    });

    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(GEN7);
    expect(await lastUsedScopeOf(ACCT_A)).toBe(GEN7);
    expect(await mru.list(ACCT_A)).toEqual([GEN7]);
  });

  it("no conversation_id updates last_used_scope + MRU only (ADR-8)", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    const res = await put({ format: GEN7 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      format: GEN7,
      lastUsedScopes: [GEN7],
    });

    expect(await lastUsedScopeOf(ACCT_A)).toBe(GEN7);
    expect(await mru.list(ACCT_A)).toEqual([GEN7]);
    // Existing thread is untouched — this is an empty-new-chat pick.
    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
  });

  it("conversation_id: null is the no-conversation path", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    const res = await put({ format: CHAMPIONS, conversation_id: null });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      format: CHAMPIONS,
      lastUsedScopes: [CHAMPIONS],
    });
    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
    expect(await lastUsedScopeOf(ACCT_A)).toBe(CHAMPIONS);
  });

  it("unowned conversation_id → 404 with no writes", async () => {
    await seedAccount(ACCT_A);
    await seedAccount(ACCT_B);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    signedIn(ACCT_B);
    const res = await put({ format: GEN7, conversation_id: CONV_A });

    expect(res.status).toBe(404);
    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
    expect(await lastUsedScopeOf(ACCT_A)).toBeNull();
    expect(await lastUsedScopeOf(ACCT_B)).toBeNull();
    expect(await mru.list(ACCT_A)).toEqual([]);
    expect(await mru.list(ACCT_B)).toEqual([]);
  });

  it("missing conversation_id is the same 404 as unowned (no existence leak)", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);

    const res = await put({ format: GEN7, conversation_id: "does-not-exist" });
    expect(res.status).toBe(404);
    expect(await lastUsedScopeOf(ACCT_A)).toBeNull();
    expect(await mru.list(ACCT_A)).toEqual([]);
  });

  it("returns lastUsedScopes newest-first after chip picks (SCOPE-US-2, SCOPE-AC-2.1)", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);
    await mru.touch(ACCT_A, NATDEX, 1_000);

    const first = await put({ format: GEN7 });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      format: GEN7,
      lastUsedScopes: [GEN7, NATDEX],
    });

    const second = await put({ format: CHAMPIONS });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      format: CHAMPIONS,
      lastUsedScopes: [CHAMPIONS, GEN7, NATDEX],
    });

    // Re-picking an already-used scope moves it to the front (upsert).
    const again = await put({ format: NATDEX });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      format: NATDEX,
      lastUsedScopes: [NATDEX, CHAMPIONS, GEN7],
    });
    expect(await mru.list(ACCT_A)).toEqual([NATDEX, CHAMPIONS, GEN7]);
  });
});

// --- Guest -----------------------------------------------------------------

describe("PUT /api/scope — guest (SCOPE-AC-1.3, SCOPE-BR-2)", () => {
  it("persists session scope from ?session_id= and omits lastUsedScopes", async () => {
    guest();

    const res = await put(
      { format: GEN7 },
      `http://t/api/scope?session_id=${GUEST_SID}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ format: GEN7 });
    expect(await getSessionScope(GUEST_SID)).toBe(GEN7);
    expect(await mru.list(ACCT_A)).toEqual([]);
  });

  it("persists session scope from a body session_id", async () => {
    guest();

    const res = await put({ format: CHAMPIONS, session_id: GUEST_SID });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ format: CHAMPIONS });
    expect(await getSessionScope(GUEST_SID)).toBe(CHAMPIONS);
  });

  it("requires session_id (query or body) — 400 when missing", async () => {
    guest();

    const res = await put({ format: GEN7 });
    expect(res.status).toBe(400);
    expect(await getSessionScope(GUEST_SID)).toBeUndefined();
  });

  it("does not write an account preference (guests have none)", async () => {
    await seedAccount(ACCT_A);
    guest();

    const res = await put(
      { format: GEN7, conversation_id: CONV_A },
      `http://t/api/scope?session_id=${GUEST_SID}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ format: GEN7 });
    expect(await getSessionScope(GUEST_SID)).toBe(GEN7);
    expect(await lastUsedScopeOf(ACCT_A)).toBeNull();
    expect(await mru.list(ACCT_A)).toEqual([]);
  });
});
