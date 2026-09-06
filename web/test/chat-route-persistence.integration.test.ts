/**
 * Integration test for the SIGNED-IN chat persistence + resume seam of
 * `POST /api/chat` (docs/features/chat-history Phase 4; HIST-US-1, HIST-US-5,
 * AC-1.1, AC-1.2, AC-5.1, AC-5.3, AC-5.4, BR-H2, BR-H5, BR-H6).
 *
 * Like api-chat.integration.test.ts the runtime + context are mocked (no model),
 * but here `getCurrentAccount` resolves a real account and the conversation-repo
 * writes/reads a real migrated Postgres schema (Testcontainers). Asserts:
 *   - a signed-in turn creates the conversation (title from message) + stores the
 *     full OakAnswer,
 *   - a follow-up feeds the DB-derived history to the model and continues the
 *     SAME conversation (seq advances),
 *   - a resumed conversation's mode follows its stored format (BR-H6),
 *   - an aborted turn persists nothing,
 *   - the guest path persists nothing to the DB.
 *
 * Chat-qol Phase 2 adds recovery persist (replaceLastPair vs appendTurnPair)
 * and the signed-in completed-turn MRU touch (SCOPE-BR-2). Mentions have no
 * persist side effects and are covered in route.test.ts.
 */

import { randomUUID } from "node:crypto";

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

import type { ChatMessage } from "@/agent/types";
import type { OakAnswer } from "@/agent/schemas";
import type { Account } from "@/data/repos/accounts-repo";

vi.mock("server-only", () => ({}));

const { meMock } = vi.hoisted(() => ({ meMock: vi.fn() }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentAccount: meMock }));
vi.mock("@/server/spend-control", () => ({
  admitAgentTurn: vi.fn(async () => ({ ok: true })),
  assertNotDenylisted: vi.fn(async () => ({ ok: true })),
}));

const { mockRunOak, capturedHistories, capturedModes } = vi.hoisted(() => ({
  mockRunOak: vi.fn(),
  capturedHistories: [] as ChatMessage[][],
  capturedModes: [] as string[],
}));
vi.mock("@/agent/runtime", () => ({ runOak: mockRunOak }));
vi.mock("@/agent/context", () => ({
  createAgentContext: vi.fn(async (opts: { mode: string }) => {
    capturedModes.push(opts.mode);
    return {
      db: {},
      requestId: "test-req",
      mode: opts.mode,
      logger: { info: () => {}, error: () => {}, bindings: () => ({}) },
    };
  }),
}));

import { POST } from "@/app/api/chat/route";
import { _resetStoreForTests } from "@/server/rate-limit";
import {
  appendTurn,
  getHistory,
  _resetStoreForTests as resetSessionStore,
} from "@/server/session-store";
import {
  _resetStoreForTests as resetTurnStore,
  findRunningBySession,
  stopTurn,
} from "@/server/turn-store";
import { createPgSchema, installAsSingleton, type PgFixture } from "./support/pg";

let fix: PgFixture;
type Repo = typeof import("@/data/repos/conversation-repo");
let repo: Repo;
let mruRepo: typeof import("@/data/repos/scope-mru-repo");

const ACCT: Account = {
  id: "acct-persist",
  email: "p@x.com",
  createdAt: 1,
  lastUsedScope: null,
};

let nextAnswer: OakAnswer;

function makeAnswer(markdown: string): OakAnswer {
  return {
    status: "answered",
    answer_markdown: markdown,
    reasoning_markdown: "r",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false },
  };
}

beforeAll(async () => {
  fix = await createPgSchema({ seed: "none" });
  await installAsSingleton(fix);
  repo = await import("@/data/repos/conversation-repo");
  mruRepo = await import("@/data/repos/scope-mru-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await _resetStoreForTests();
  await resetTurnStore();
  await resetSessionStore();
  capturedHistories.length = 0;
  capturedModes.length = 0;
  nextAnswer = makeAnswer("default answer");
  meMock.mockResolvedValue(ACCT);
  mockRunOak.mockImplementation(async (_message: string, history: ChatMessage[]) => {
    capturedHistories.push(history);
    return nextAnswer;
  });
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message, account, account_scope_mru RESTART IDENTITY`,
  );
  // Seed the signed-in account row so last_used_scope writes land (no FK, but
  // updateLastUsedScope is a real UPDATE against account.id).
  await fix.db.execute(sql`
    INSERT INTO account (id, email, created_at)
    VALUES (${ACCT.id}, ${ACCT.email}, ${ACCT.createdAt})
  `);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(
  body: {
    session_id: string;
    message: string;
    champions_mode?: boolean;
    scope_seed?: string;
    recovery?: "retry" | "edit";
    mentioned_team_ids?: string[];
  },
  init?: { signal?: AbortSignal },
): Promise<Response> {
  const res = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: init?.signal,
    }),
  );
  // Drain the stream so the detached async task (persistence) completes.
  await res.text();
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signed-in persistence", () => {
  it("creates the conversation + stores the full answer on the first turn (AC-1.1)", async () => {
    const sid = randomUUID();
    nextAnswer = makeAnswer("Ice and Fairy types beat it.");
    await post({ session_id: sid, message: "What beats Garchomp?" });

    const conv = await repo.getConversation(ACCT.id, sid);
    expect(conv).toMatchObject({
      id: sid,
      title: "What beats Garchomp?",
      // A plain post with no seed now defaults to National Dex (the new default).
      format: "national-dex",
      pinned: false,
    });
    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "What beats Garchomp?"],
      [1, "assistant", "Ice and Fairy types beat it."],
    ]);
    expect(JSON.parse(stored[1].answerJson!).answer_markdown).toBe(
      "Ice and Fairy types beat it.",
    );
  });

  it("feeds DB-derived history and continues the SAME conversation on a follow-up (AC-5.1)", async () => {
    const sid = randomUUID();
    nextAnswer = makeAnswer("first answer");
    await post({ session_id: sid, message: "first question" });

    nextAnswer = makeAnswer("second answer");
    await post({ session_id: sid, message: "second question" });

    // The follow-up's history (2nd call) is the DB-stored prior turns.
    const followUpHistory = capturedHistories[1];
    expect(followUpHistory).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);

    // Same conversation, four ordered turns.
    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => t.seq)).toEqual([0, 1, 2, 3]);
  });

  it("overrides mode from the stored format when resuming (BR-H6)", async () => {
    const sid = randomUUID();
    // Seed a champions conversation directly.
    await repo.appendTurnPair({
      accountId: ACCT.id,
      conversationId: sid,
      format: "champions",
      userTurnId: repo.newTurnId(),
      userMessage: "champ q",
      assistantTurnId: repo.newTurnId(),
      answer: makeAnswer("champ a"),
      now: 1000,
    });

    // Continue WITHOUT champions_mode in the body — mode must follow the stored
    // format, not the body.
    await post({ session_id: sid, message: "follow up", champions_mode: false });
    expect(capturedModes[0]).toBe("champions");
  });

  it("switches a resumed conversation's scope on an explicit in-message signal, and persists it (GS-D3 / §3.6d)", async () => {
    const sid = randomUUID();
    // Seed a champions conversation directly.
    await repo.appendTurnPair({
      accountId: ACCT.id,
      conversationId: sid,
      format: "champions",
      userTurnId: repo.newTurnId(),
      userMessage: "champ q",
      assistantTurnId: repo.newTurnId(),
      answer: makeAnswer("champ a"),
      now: 1000,
    });

    // Resume it with an EXPLICIT Scarlet/Violet signal (no champions_mode). The
    // detector switches the turn's scope, and — unlike the sticky BR-H6 case —
    // the conversation's stored format is UPDATED to follow the new scope.
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          message: "in scarlet and violet, what beats garchomp?",
        }),
      }),
    );
    const text = await res.text();

    // The `scope` event reports the switch to scarlet-violet, message-sourced.
    const scopeFrame = text
      .split("\n\n")
      .find((f) => f.startsWith("event: scope"));
    expect(scopeFrame, "a scope event was emitted").toBeTruthy();
    const scopeData = JSON.parse(scopeFrame!.split("\ndata: ")[1]!) as {
      format: string;
      source: string;
    };
    expect(scopeData).toEqual({ format: "scarlet-violet", source: "message" });

    // The tools ran under standard (Gen 9), not the stored champions scope.
    expect(capturedModes[0]).toBe("standard");

    // The stored conversation.format was UPDATED (fire-and-forget), so a later
    // resume sticks to scarlet-violet. Poll until the async write lands.
    let conv = await repo.getConversation(ACCT.id, sid);
    for (let i = 0; i < 50 && conv?.format !== "scarlet-violet"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      conv = await repo.getConversation(ACCT.id, sid);
    }
    expect(conv?.format).toBe("scarlet-violet");
  });

  it("switches a resumed conversation's scope on an explicit scope_seed chip pick, and persists it", async () => {
    const sid = randomUUID();
    // Seed a champions conversation directly.
    await repo.appendTurnPair({
      accountId: ACCT.id,
      conversationId: sid,
      format: "champions",
      userTurnId: repo.newTurnId(),
      userMessage: "champ q",
      assistantTurnId: repo.newTurnId(),
      answer: makeAnswer("champ a"),
      now: 1000,
    });

    // Resume it with an explicit scope_seed chip pick (no in-message signal).
    // The seed ranks above the sticky champions scope, and — like the
    // in-message-signal switch above — the conversation's stored format is
    // UPDATED to follow the new scope.
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          message: "what beats garchomp?",
          scope_seed: "scarlet-violet",
        }),
      }),
    );
    const text = await res.text();

    // The `scope` event reports the switch to scarlet-violet, seed-sourced.
    const scopeFrame = text
      .split("\n\n")
      .find((f) => f.startsWith("event: scope"));
    expect(scopeFrame, "a scope event was emitted").toBeTruthy();
    const scopeData = JSON.parse(scopeFrame!.split("\ndata: ")[1]!) as {
      format: string;
      source: string;
    };
    expect(scopeData).toEqual({ format: "scarlet-violet", source: "seed" });

    // The tools ran under standard (Gen 9), not the stored champions scope.
    expect(capturedModes[0]).toBe("standard");

    // The stored conversation.format was UPDATED (fire-and-forget), so a later
    // resume sticks to scarlet-violet. Poll until the async write lands.
    let conv = await repo.getConversation(ACCT.id, sid);
    for (let i = 0; i < 50 && conv?.format !== "scarlet-violet"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      conv = await repo.getConversation(ACCT.id, sid);
    }
    expect(conv?.format).toBe("scarlet-violet");
  });

  it("still delivers the answer event to the client (persist is off the critical path)", async () => {
    const sid = randomUUID();
    nextAnswer = makeAnswer("delivered");
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, message: "q" }),
      }),
    );
    const text = await res.text();
    expect(text).toContain("event: answer");
    expect(text).toContain("delivered");
  });

  // BACKGROUND TURNS (design §5.2): a client disconnect no longer discards the
  // turn — the request signal is not wired to the turn, only an explicit stop
  // aborts it (BT-4). A turn whose request signal is already aborted still runs
  // to completion and persists (BT-1). This reverses the old AC-1.2 guard.
  it("a client disconnect no longer discards the turn — it still persists (BT-1)", async () => {
    const sid = randomUUID();
    await post({ session_id: sid, message: "q" }, { signal: AbortSignal.abort() });
    expect(await repo.getConversation(ACCT.id, sid)).not.toBeNull();
  });

  it("persists last_used_scope on the account after a resolved turn", async () => {
    const sid = randomUUID();
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          message: "hi",
          scope_seed: "gen-7",
        }),
      }),
    );
    await res.text();

    // Poll for the fire-and-forget account update.
    const accounts = await import("@/data/repos/accounts-repo");
    let found = await accounts.findAccountByEmail(ACCT.email);
    for (let i = 0; i < 50 && found?.lastUsedScope !== "gen-7"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      found = await accounts.findAccountByEmail(ACCT.email);
    }
    expect(found?.lastUsedScope).toBe("gen-7");
  });

  it("a new conversation uses the account last_used_scope when no seed/sticky", async () => {
    // Prefill the preference and expose it on the mocked account (the chat
    // route reads lastUsedScope from getCurrentAccount, not a re-query).
    const accounts = await import("@/data/repos/accounts-repo");
    await accounts.updateLastUsedScope(ACCT.id, "gen-7");
    meMock.mockResolvedValue({ ...ACCT, lastUsedScope: "gen-7" });

    const sid = randomUUID();
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, message: "plain question" }),
      }),
    );
    const text = await res.text();

    const scopeFrame = text
      .split("\n\n")
      .find((f) => f.startsWith("event: scope"));
    expect(scopeFrame).toBeTruthy();
    const scopeData = JSON.parse(scopeFrame!.split("\ndata: ")[1]!) as {
      format: string;
      source: string;
    };
    expect(scopeData).toEqual({ format: "gen-7", source: "preference" });
    expect(capturedModes[0]).toBe("gen-7");

    const conv = await repo.getConversation(ACCT.id, sid);
    expect(conv?.format).toBe("gen-7");
  });
});

describe("guest path", () => {
  it("persists nothing to the DB for a guest", async () => {
    meMock.mockResolvedValue(null);
    const sid = randomUUID();
    await post({ session_id: sid, message: "guest question" });
    // No account → no DB write. (Listing under the seeded account stays empty.)
    expect(await repo.listConversations(ACCT.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Chat-qol Phase 2 — recovery persist via DB after mocked runOak
// REC-US-1..3, REC-BR-1..8, ADR-2, ADR-4
// ---------------------------------------------------------------------------

async function seedPair(
  sid: string,
  userMessage: string,
  answerMarkdown: string,
  now = 1000,
): Promise<void> {
  await repo.appendTurnPair({
    accountId: ACCT.id,
    conversationId: sid,
    format: "national-dex",
    userTurnId: repo.newTurnId(),
    userMessage,
    assistantTurnId: repo.newTurnId(),
    answer: makeAnswer(answerMarkdown),
    now,
  });
}

async function pollUntil<T>(
  read: () => Promise<T>,
  pred: (value: T) => boolean,
  ticks = 50,
): Promise<T> {
  let value = await read();
  for (let i = 0; i < ticks && !pred(value); i++) {
    await new Promise((r) => setTimeout(r, 10));
    value = await read();
  }
  return value;
}

describe("signed-in recovery persist (REC-BR-2, ADR-2, ADR-4)", () => {
  it("recovery retry + success calls replaceLastPair — still exactly one pair (REC-US-1, REC-BR-2)", async () => {
    const sid = randomUUID();
    await seedPair(sid, "What beats Garchomp?", "Ice types.");
    nextAnswer = makeAnswer("Ice and Fairy.");

    const res = await post({
      session_id: sid,
      message: "What beats Garchomp?",
      recovery: "retry",
    });
    expect(res.status).toBe(200);

    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "What beats Garchomp?"],
      [1, "assistant", "Ice and Fairy."],
    ]);
    expect(stored.filter((t) => t.textContent === "Ice types.")).toHaveLength(0);
  });

  it("recovery edit + success replaces the last user text and the assistant answer (REC-US-2)", async () => {
    const sid = randomUUID();
    await seedPair(sid, "What beats Garchomp?", "Ice types.");
    nextAnswer = makeAnswer("In Gen 7, Ice and Fairy.");

    const res = await post({
      session_id: sid,
      message: "What beats Garchomp in gen 7?",
      recovery: "edit",
    });
    expect(res.status).toBe(200);

    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "What beats Garchomp in gen 7?"],
      [1, "assistant", "In Gen 7, Ice and Fairy."],
    ]);
  });

  it("omitted recovery still appends (existing path)", async () => {
    const sid = randomUUID();
    await seedPair(sid, "first question", "first answer");
    nextAnswer = makeAnswer("second answer");

    await post({ session_id: sid, message: "second question" });

    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "first question"],
      [1, "assistant", "first answer"],
      [2, "user", "second question"],
      [3, "assistant", "second answer"],
    ]);
  });

  it("recovery + transport error leaves the old pair (REC-BR-2)", async () => {
    const sid = randomUUID();
    await seedPair(sid, "What beats Garchomp?", "Ice types.");
    mockRunOak.mockReset();
    mockRunOak.mockRejectedValueOnce(new Error("provider down"));

    const res = await post({
      session_id: sid,
      message: "What beats Garchomp?",
      recovery: "retry",
    });
    expect(res.status).toBe(200);

    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => t.textContent)).toEqual([
      "What beats Garchomp?",
      "Ice types.",
    ]);
  });

  it("recovery + stop leaves the old pair (REC-BR-2, REC-BR-4, REC-US-3)", async () => {
    const sid = randomUUID();
    await seedPair(sid, "What beats Garchomp?", "Ice types.");

    let resolveOak: ((answer: OakAnswer) => void) | undefined;
    mockRunOak.mockReset();
    mockRunOak.mockImplementation(
      () =>
        new Promise<OakAnswer>((resolve) => {
          resolveOak = resolve;
        }),
    );

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          message: "What beats Garchomp?",
          recovery: "retry",
        }),
      }),
    );
    expect(res.status).toBe(200);

    for (let i = 0; i < 200 && !findRunningBySession(sid); i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const running = findRunningBySession(sid);
    expect(running).toBeDefined();
    stopTurn(running!);
    resolveOak?.(makeAnswer("should not persist"));
    await res.text();

    const stored = await repo.getMessages(ACCT.id, sid);
    expect(stored.map((t) => t.textContent)).toEqual([
      "What beats Garchomp?",
      "Ice types.",
    ]);
  });

  it("recovery with no last user+assistant pair is 409 nothing_to_replace (ADR-4)", async () => {
    const sid = randomUUID();
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          message: "What beats Garchomp?",
          recovery: "retry",
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: "nothing_to_replace" }),
    );
    expect(await repo.getConversation(ACCT.id, sid)).toBeNull();
    expect(mockRunOak).not.toHaveBeenCalled();
  });
});

describe("guest recovery persist (REC-BR-8, ADR-2)", () => {
  it("recovery set + success replaces the last session-store pair, not the DB", async () => {
    meMock.mockResolvedValue(null);
    const sid = randomUUID();
    await appendTurn(sid, { role: "user", content: "What beats Garchomp?" });
    await appendTurn(sid, { role: "assistant", content: "Ice types." });
    nextAnswer = makeAnswer("Ice and Fairy.");

    const res = await post({
      session_id: sid,
      message: "What beats Garchomp really?",
      recovery: "edit",
    });
    expect(res.status).toBe(200);

    expect(await getHistory(sid)).toEqual([
      { role: "user", content: "What beats Garchomp really?" },
      { role: "assistant", content: "Ice and Fairy." },
    ]);
    expect(await repo.listConversations(ACCT.id)).toEqual([]);
  });

  it("omitted recovery still appends in the session store", async () => {
    meMock.mockResolvedValue(null);
    const sid = randomUUID();
    await appendTurn(sid, { role: "user", content: "q1" });
    await appendTurn(sid, { role: "assistant", content: "a1" });
    nextAnswer = makeAnswer("a2");

    await post({ session_id: sid, message: "q2" });

    expect(await getHistory(sid)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
  });
});

describe("signed-in completed turn MRU (SCOPE-BR-2)", () => {
  it("touches the resolved format so scope-mru-repo.list sees it", async () => {
    const sid = randomUUID();
    await post({
      session_id: sid,
      message: "hi",
      scope_seed: "gen-7",
    });

    const listed = await pollUntil(
      () => mruRepo.list(ACCT.id),
      (formats) => formats[0] === "gen-7",
    );
    expect(listed[0]).toBe("gen-7");
  });
});
