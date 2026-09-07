/**
 * Route-adapter tests for PUT /api/scope (Champions-first P1 TurnScope).
 *
 * Old clients still call this after a chip pick. The request format is ignored;
 * the response always acks Champions and must not persist National Dex / gen-N
 * as a future default (CF-DATA-BR-21).
 *
 * Real migrated Postgres (Testcontainers) so conversation / account / MRU
 * repos run against the `@/data/db` singleton; only `getCurrentAccount` is
 * mocked. Guest session scope is the in-process session-store.
 *
 * Requirement refs: CF-DATA-BR-21, CF-CHAT-AC-1.1, CF-AUTH-AC-1.1
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

/** Signed-in PUT ack: always Champions; lastUsedScopes empty or ["champions"]. */
function expectChampionsAck(body: Record<string, unknown>): void {
  expect(body.format).toBe(CHAMPIONS);
  expect(body.lastUsedScope).toBe(CHAMPIONS);
  expect(Array.isArray(body.lastUsedScopes)).toBe(true);
  const scopes = body.lastUsedScopes as string[];
  expect(scopes.every((s) => s === CHAMPIONS)).toBe(true);
  expect(scopes.length).toBeLessThanOrEqual(1);
}

function expectNoOtherGamePersisted(accountId: string): Promise<void> {
  return Promise.all([
    lastUsedScopeOf(accountId),
    mru.list(accountId),
  ]).then(([last, listed]) => {
    expect(last).not.toBe(GEN7);
    expect(last).not.toBe(NATDEX);
    expect(last).not.toBe("scarlet-violet");
    if (last) expect(last).toBe(CHAMPIONS);
    expect(listed).not.toContain(GEN7);
    expect(listed).not.toContain(NATDEX);
    expect(listed).not.toContain("scarlet-violet");
    expect(listed.every((s) => s === CHAMPIONS)).toBe(true);
  });
}

// --- Format is ignored; other games still 200 (CF-DATA-BR-21) --------------

describe("PUT /api/scope — ignored format, always Champions ack (CF-DATA-BR-21)", () => {
  it.each(["gen-7", "national-dex", "scarlet-violet", "champions"] as const)(
    "PUT format %s is 200 Champions and does not persist another game",
    async (format) => {
      signedIn(ACCT_A);
      await seedAccount(ACCT_A);
      await seedConv(ACCT_A, CONV_A, NATDEX);

      const res = await put({ format, conversation_id: CONV_A });

      expect(res.status).toBe(200);
      expectChampionsAck((await res.json()) as Record<string, unknown>);

      const conv = await convRepo.getConversation(ACCT_A, CONV_A);
      // Historical National Dex may remain, or the row may be updated to
      // Champions — never rewritten to a chip-picked other game.
      expect(["national-dex", "champions"]).toContain(conv?.format);

      await expectNoOtherGamePersisted(ACCT_A);
    },
  );

  it("rejects a missing format", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);

    const res = await put({ conversation_id: CONV_A });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(errorToken(body)).toMatch(/format/i);
    await expectNoOtherGamePersisted(ACCT_A);
  });
});

// --- Signed-in -------------------------------------------------------------

describe("PUT /api/scope — signed-in (CF-DATA-BR-21, CF-CHAT-AC-1.1)", () => {
  it("no conversation_id still acks Champions and does not persist gen-7 (ADR-3)", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    const res = await put({ format: GEN7 });

    expect(res.status).toBe(200);
    expectChampionsAck((await res.json()) as Record<string, unknown>);

    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
    await expectNoOtherGamePersisted(ACCT_A);
  });

  it("conversation_id: null is the no-conversation path", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    const res = await put({ format: CHAMPIONS, conversation_id: null });

    expect(res.status).toBe(200);
    expectChampionsAck((await res.json()) as Record<string, unknown>);
    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
  });

  it("unowned conversation_id → 404 with no other-game writes", async () => {
    await seedAccount(ACCT_A);
    await seedAccount(ACCT_B);
    await seedConv(ACCT_A, CONV_A, NATDEX);

    signedIn(ACCT_B);
    const res = await put({ format: GEN7, conversation_id: CONV_A });

    expect(res.status).toBe(404);
    expect((await convRepo.getConversation(ACCT_A, CONV_A))?.format).toBe(NATDEX);
    expect(await lastUsedScopeOf(ACCT_A)).toBeNull();
    expect(await lastUsedScopeOf(ACCT_B)).not.toBe(GEN7);
    expect(await mru.list(ACCT_A)).toEqual([]);
    expect(await mru.list(ACCT_B)).not.toContain(GEN7);
  });

  it("missing conversation_id is the same 404 as unowned (no existence leak)", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);

    const res = await put({ format: GEN7, conversation_id: "does-not-exist" });
    expect(res.status).toBe(404);
    expect(await lastUsedScopeOf(ACCT_A)).not.toBe(GEN7);
    expect(await mru.list(ACCT_A)).not.toContain(GEN7);
  });

  it("repeated chip picks never accumulate other-game MRU rows (CF-DATA-BR-21)", async () => {
    signedIn(ACCT_A);
    await seedAccount(ACCT_A);

    const first = await put({ format: GEN7 });
    expect(first.status).toBe(200);
    expectChampionsAck((await first.json()) as Record<string, unknown>);

    const second = await put({ format: NATDEX });
    expect(second.status).toBe(200);
    expectChampionsAck((await second.json()) as Record<string, unknown>);

    await expectNoOtherGamePersisted(ACCT_A);
  });
});

// --- Guest -----------------------------------------------------------------

describe("PUT /api/scope — guest (CF-AUTH-AC-1.1, CF-DATA-BR-21)", () => {
  it("acks Champions and does not persist gen-7 on the session", async () => {
    guest();

    const res = await put(
      { format: GEN7 },
      `http://t/api/scope?session_id=${GUEST_SID}`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.format).toBe(CHAMPIONS);
    if (body.lastUsedScope !== undefined) {
      expect(body.lastUsedScope).toBe(CHAMPIONS);
    }
    if (body.lastUsedScopes !== undefined) {
      const scopes = body.lastUsedScopes as string[];
      expect(scopes.every((s) => s === CHAMPIONS)).toBe(true);
      expect(scopes.length).toBeLessThanOrEqual(1);
    }
    expect(await getSessionScope(GUEST_SID)).not.toBe(GEN7);
    expect([undefined, CHAMPIONS]).toContain(await getSessionScope(GUEST_SID));
    expect(await mru.list(ACCT_A)).toEqual([]);
  });

  it("body session_id path also acks Champions", async () => {
    guest();

    const res = await put({ format: NATDEX, session_id: GUEST_SID });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.format).toBe(CHAMPIONS);
    expect(await getSessionScope(GUEST_SID)).not.toBe(NATDEX);
    expect([undefined, CHAMPIONS]).toContain(await getSessionScope(GUEST_SID));
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
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.format).toBe(CHAMPIONS);
    expect(await getSessionScope(GUEST_SID)).not.toBe(GEN7);
    expect(await lastUsedScopeOf(ACCT_A)).toBeNull();
    expect(await mru.list(ACCT_A)).toEqual([]);
  });
});
