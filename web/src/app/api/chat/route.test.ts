/**
 * Back-compat guard for `POST /api/chat` after the server-bound active-team seam
 * was removed: saved teams are now referenced by NAME in chat (resolved live via
 * the `list_teams` / `get_team` tools), so the request body no longer carries an
 * `active_team_id` and the route never binds one onto the agent context. The
 * broad SSE framing / guardrails / history contract is covered by
 * `test/api-chat.integration.test.ts`; this file asserts ONLY that:
 *
 *   - a legacy `active_team_id` field in the body is harmlessly IGNORED (no 400,
 *     never bound onto the context),
 *   - the signed-in account id IS bound (the team tools need it), and
 *   - an aborted turn persists nothing (existing guard, unchanged).
 *
 * Real migrated+seeded Postgres (Testcontainers) so `appendTurnPair`
 * (conversation-repo) runs for real against the `@/data/db` singleton; only
 * `getCurrentAccount`, `runOak`, and `createAgentContext` are mocked (no model /
 * network) — `createAgentContext` is mocked so we can CAPTURE the options it was
 * bound with.
 *
 * Chat-qol Phase 2 (recovery + mentions) is additional describes at the bottom:
 * `recovery` replace-vs-append, 409 `nothing_to_replace`, mention 400s before
 * `startTurn`, `ctx.boundTeams`, guest session-store replace, SCOPE-BR-2 MRU.
 */

import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";
import type { OnProgress } from "@/agent/types";
import type { TurnTrace } from "@/server/logger";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const { mockRunOak } = vi.hoisted(() => ({ mockRunOak: vi.fn() }));
vi.mock("@/agent/runtime", () => ({ runOak: mockRunOak }));

// createAgentContext is mocked so we can capture the options it was called with
// (so we can assert the route no longer binds an active team). It returns a
// minimal ctx the mocked runOak ignores.
const { mockCreateCtx, captured } = vi.hoisted(() => ({
  mockCreateCtx: vi.fn(),
  captured: { options: null as Record<string, unknown> | null },
}));
vi.mock("@/agent/context", () => ({
  createAgentContext: mockCreateCtx,
}));

// The usage repo (turn_record writer) is mocked so the recording calls can be
// asserted without a real INSERT — and a rejecting recorder simulated (P2:
// "recorder failure never fails/delays the turn").
const usage = vi.hoisted(() => ({
  recordTurn: vi.fn<(input: unknown) => Promise<void>>(),
  recordAuthEvent: vi.fn<(input: unknown) => Promise<void>>(),
}));
vi.mock("@/data/repos/usage-repo", () => usage);

import { createPgSchema, installAsSingleton, type PgFixture } from "../../../../test/support/pg";
import {
  _resetStoreForTests,
  checkRateLimit,
  GUEST_CONFIG,
} from "@/server/rate-limit";
import {
  appendTurn,
  getHistory,
  getSessionScope,
  setSessionScope,
  _resetStoreForTests as resetSessionStore,
} from "@/server/session-store";
import {
  _resetStoreForTests as resetTurnStore,
  findRunningBySession,
  stopTurn,
} from "@/server/turn-store";

const ACCT_A = "acct-a";

let fix: PgFixture;
let route: typeof import("./route");
let convRepo: typeof import("@/data/repos/conversation-repo");
let teamRepo: typeof import("@/data/repos/team-repo");
let mruRepo: typeof import("@/data/repos/scope-mru-repo");

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

// A per-turn trace the mocked runOak hands to the route's onTurnComplete sink
// (the real finalize() never runs because runOak itself is mocked). One tool
// entry carries an error so toolTrace round-trips a non-trivial shape.
const FAKE_TRACE: TurnTrace = {
  request_id: "test-req",
  session_id: "rec1",
  model: "grok-2-fake",
  input_tokens: 111,
  output_tokens: 222,
  thinking_tokens: 33,
  cached_input_tokens: 10,
  tool_trace: [
    { tool: "get_pokemon", args: {}, latency_ms: 5, cache_hit: false, error: null },
    { tool: "get_move", args: {}, latency_ms: 7, cache_hit: false, error: "boom" },
  ],
  turn_latency_ms: 1234,
  status: "answered",
  citation_count: 2,
};

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  route = await import("./route");
  convRepo = await import("@/data/repos/conversation-repo");
  teamRepo = await import("@/data/repos/team-repo");
  mruRepo = await import("@/data/repos/scope-mru-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE team, conversation, conversation_message, account_scope_mru, account RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
  mockRunOak.mockReset();
  // Mirror the runtime: a turn hands its assembled trace to the route's
  // onTurnComplete sink before resolving (so the route can compose a turn_record).
  mockRunOak.mockImplementation(
    async (
      _message: string,
      _history: unknown,
      ctx: { onTurnComplete?: (trace: TurnTrace) => void },
    ) => {
      ctx.onTurnComplete?.(FAKE_TRACE);
      return ANSWER;
    },
  );
  mockCreateCtx.mockReset();
  mockCreateCtx.mockImplementation(async (options: Record<string, unknown>) => {
    captured.options = options;
    return {
      db: {},
      requestId: "test-req",
      mode: options.mode,
      accountId: options.accountId,
      boundTeams: options.boundTeams,
      logger: { info() {}, warn() {}, error() {}, child: () => ({}) },
    };
  });
  captured.options = null;
  usage.recordTurn.mockReset();
  usage.recordTurn.mockResolvedValue(undefined);
  usage.recordAuthEvent.mockReset();
  usage.recordAuthEvent.mockResolvedValue(undefined);
  await _resetStoreForTests();
  await resetTurnStore();
  await resetSessionStore();
});

// --- Helpers ---------------------------------------------------------------

function signedIn(
  id: string,
  opts?: { lastUsedScope?: string | null },
): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: opts?.lastUsedScope ?? null,
  });
}

function post(
  body: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  return route.POST(
    new Request("http://t/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),
  );
}

/** Drain the SSE body so the detached task (incl. persistence) settles. */
async function drain(res: Response): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

/** Read the full SSE body text so emitted event frames can be inspected. */
async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("POST /api/chat — no active-team seam", () => {
  it("ignores a legacy active_team_id field and never binds an active team", async () => {
    signedIn(ACCT_A);

    const res = await post({
      session_id: "c1",
      message: "hi",
      active_team_id: "legacy-id",
    });
    expect(res.status).toBe(200);
    await drain(res);

    // The route no longer reads/binds an active team.
    expect(captured.options).not.toBeNull();
    expect(captured.options).not.toHaveProperty("activeTeam");

    // The turn still persisted normally.
    const conv = await convRepo.getConversation(ACCT_A, "c1");
    expect(conv).not.toBeNull();
  });

  it("binds the signed-in account id (the team tools read it)", async () => {
    signedIn(ACCT_A);
    await drain(await post({ session_id: "c2", message: "hi" }));
    expect((captured.options as Record<string, unknown>).accountId).toBe(ACCT_A);
  });

  it("a seedless fresh conversation defaults to national-dex (scope flip)", async () => {
    signedIn(ACCT_A);
    await drain(await post({ session_id: "c2-default", message: "hi" }));
    expect((captured.options as Record<string, unknown>).mode).toBe(
      "national-dex",
    );
  });

  it("a seedless fresh conversation uses the account last_used_scope preference", async () => {
    signedIn(ACCT_A, { lastUsedScope: "gen-7" });
    const text = await readBody(
      await post({ session_id: "c2-pref", message: "hi" }),
    );
    expect((captured.options as Record<string, unknown>).mode).toBe("gen-7");
    // Preference source is reported on the scope frame.
    expect(text).toContain('"source":"preference"');
    expect(text).toContain('"format":"gen-7"');
  });

  it("an explicit scope_seed chip pick binds that scope's mode (gen-2)", async () => {
    signedIn(ACCT_A);
    await drain(
      await post({ session_id: "c2-seed", message: "hi", scope_seed: "gen-2" }),
    );
    expect((captured.options as Record<string, unknown>).mode).toBe("gen-2");
  });

  // BACKGROUND TURNS (design §5.2): a client disconnect NO LONGER cancels or
  // discards the turn. The request signal is not wired to the turn — only an
  // explicit stop aborts it (BT-4) — so a turn whose request signal is already
  // aborted still runs to completion and persists (BT-1/BT-7). This reverses the
  // old "aborted turn persists nothing" guard.
  it("a client disconnect (aborted request signal) still persists the turn (BT-1/BT-7)", async () => {
    signedIn(ACCT_A);
    const res = await post({ session_id: "c3", message: "hi" }, AbortSignal.abort());
    await drain(res);
    expect(await convRepo.getConversation(ACCT_A, "c3")).not.toBeNull();
  });

  // Recording is likewise no longer gated on a live connection.
  it("a client disconnect still records the turn", async () => {
    signedIn(ACCT_A);
    await drain(await post({ session_id: "c3b", message: "hi" }, AbortSignal.abort()));
    expect(usage.recordTurn).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// P2 — non-blocking admin recording (ADMIN-US-6, ADMIN-AC-6.1/6.2/6.3,
// ADMIN-BR-3, AD-2/AD-4)
// ===========================================================================

describe("POST /api/chat — turn recording", () => {
  it("records exactly one turn_record composed from the trace + turn content", async () => {
    signedIn(ACCT_A);
    await drain(await post({ session_id: "rec1", message: "hello oak" }));

    expect(usage.recordTurn).toHaveBeenCalledTimes(1);
    const input = usage.recordTurn.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({
      sessionId: "rec1",
      accountId: ACCT_A,
      // Seedless fresh conversation → the National Dex default (the scope flip).
      mode: "national-dex",
      status: "answered",
      // From the captured TurnTrace.
      providerModel: FAKE_TRACE.model,
      inputTokens: FAKE_TRACE.input_tokens,
      outputTokens: FAKE_TRACE.output_tokens,
      thinkingTokens: FAKE_TRACE.thinking_tokens,
      citationCount: FAKE_TRACE.citation_count,
      turnLatencyMs: FAKE_TRACE.turn_latency_ms,
      // From the route's own turn content.
      imagesCount: 0,
      promptText: "hello oak",
      answerText: ANSWER.answer_markdown,
      answer: ANSWER,
    });
    // The turn PK is the request id; model is the operator-resolved ModelKey (a
    // non-null string for a real turn — only the rate-limited row has null model).
    expect(typeof input.id).toBe("string");
    expect(typeof input.model).toBe("string");
    // The full tool trace is forwarded so the repo can derive tool_error_count.
    expect(input.toolTrace).toHaveLength(FAKE_TRACE.tool_trace.length);
    // No X-Oak-Client header on this request → client is null (never invent web).
    expect(input.client).toBeNull();
  });

  it("records client platform from X-Oak-Client when present", async () => {
    signedIn(ACCT_A);
    await drain(
      await post(
        { session_id: "rec-client", message: "from ios" },
        undefined,
        { "X-Oak-Client": "ios" },
      ),
    );
    expect(usage.recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "rec-client",
        client: "ios",
        promptText: "from ios",
      }),
    );
  });

  it("a recorder that rejects never fails or delays the turn", async () => {
    signedIn(ACCT_A);
    usage.recordTurn.mockReset();
    usage.recordTurn.mockRejectedValueOnce(new Error("db unavailable"));

    const res = await post({ session_id: "rec2", message: "hi" });
    expect(res.status).toBe(200);
    const body = await readBody(res);

    // The answer still streamed and no transport `error` event was emitted.
    expect(/^event: answer$/m.test(body)).toBe(true);
    expect(/^event: error$/m.test(body)).toBe(false);
    // The recorder WAS invoked (and rejected) — and the turn still persisted.
    expect(usage.recordTurn).toHaveBeenCalledTimes(1);
    expect(await convRepo.getConversation(ACCT_A, "rec2")).not.toBeNull();
  });

  it("records a rate_limited row when the window is exhausted, but NOT for input_too_long", async () => {
    // Guest (no account) → keyed by `ip:unknown`. Prime the window to the cap so
    // the next request trips the rate limit.
    for (let i = 0; i < GUEST_CONFIG.maxRequestsPerWindow; i++) {
      await checkRateLimit("ip:unknown", "x", GUEST_CONFIG);
    }

    const limited = await post({ session_id: "rl1", message: "hi" });
    expect(limited.status).toBe(429);
    expect(usage.recordTurn).toHaveBeenCalledTimes(1);
    expect(usage.recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "rl1",
        status: "rate_limited",
        accountId: null,
        model: null,
        providerModel: null,
        answerText: null,
        answer: null,
        promptText: "hi",
      }),
    );

    // input_too_long is a distinct pre-stream rejection (413) and is NOT recorded.
    usage.recordTurn.mockClear();
    const tooLong = await post({ session_id: "rl2", message: "x".repeat(2_001) });
    expect(tooLong.status).toBe(413);
    expect(usage.recordTurn).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Chat-qol Phase 2 — mentions (MEN-US-1, MEN-BR-1..4, AUTH-BR-4)
// ===========================================================================

const MISSING_TEAM_ID = "00000000-0000-4000-8000-000000000001";

async function seedOwnedTeam(
  accountId: string,
  name: string,
  format: "scarlet-violet" | "champions" = "scarlet-violet",
): Promise<{ id: string; name: string; format: string }> {
  return teamRepo.createTeam({
    accountId,
    format,
    name,
    members: [],
    now: Date.now(),
  });
}

async function seedSignedInPair(
  conversationId: string,
  userMessage: string,
  answerMarkdown: string,
): Promise<void> {
  await convRepo.appendTurnPair({
    accountId: ACCT_A,
    conversationId,
    format: "national-dex",
    userTurnId: convRepo.newTurnId(),
    userMessage,
    assistantTurnId: convRepo.newTurnId(),
    answer: {
      ...ANSWER,
      answer_markdown: answerMarkdown,
    },
    now: Date.now(),
  });
}

function deferRunOak(): {
  resolve: (a?: OakAnswer) => void;
  onProgressReady: () => Promise<void>;
} {
  let resolveFn: (a: OakAnswer) => void = () => {};
  let captured: OnProgress | null = null;
  const promise = new Promise<OakAnswer>((resolve) => {
    resolveFn = resolve;
  });
  mockRunOak.mockImplementation(
    async (
      _message: string,
      _history: unknown,
      ctx: { onTurnComplete?: (trace: TurnTrace) => void },
      onProgress?: OnProgress,
    ) => {
      captured = onProgress ?? null;
      const answer = await promise;
      ctx.onTurnComplete?.(FAKE_TRACE);
      return answer;
    },
  );
  return {
    resolve: (a = ANSWER) => resolveFn(a),
    onProgressReady: async () => {
      for (let i = 0; i < 200 && captured === null; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
    },
  };
}

async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/chat — mentions (MEN-US-1, MEN-BR-1..4, AUTH-BR-4)", () => {
  it("guest + non-empty mentioned_team_ids is 400 unbound_mention before startTurn (MEN-BR-4)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);

    const res = await post({
      session_id: "guest-mention",
      message: "try @Rain",
      mentioned_team_ids: [MISSING_TEAM_ID],
    });

    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({
        error: "unbound_mention",
        id: MISSING_TEAM_ID,
      }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("guest-mention")).toBeUndefined();
  });

  it("guest + empty mentioned_team_ids is not a mention and still starts (MEN-BR-4)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);

    const res = await post({
      session_id: "guest-empty-ids",
      message: "hi",
      mentioned_team_ids: [],
    });
    expect(res.status).toBe(200);
    await drain(res);
    expect(mockRunOak).toHaveBeenCalled();
  });

  it("a missing team id is 400 unbound_mention before startTurn (MEN-BR-2)", async () => {
    signedIn(ACCT_A);

    const res = await post({
      session_id: "miss-mention",
      message: "use @Gone",
      mentioned_team_ids: [MISSING_TEAM_ID],
    });

    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({
        error: "unbound_mention",
        id: MISSING_TEAM_ID,
      }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("miss-mention")).toBeUndefined();
  });

  it("a foreign account's team is unbound (AUTH-BR-4, MEN-BR-2)", async () => {
    signedIn(ACCT_A);
    const foreign = await seedOwnedTeam("acct-b", "Not yours");

    const res = await post({
      session_id: "foreign-mention",
      message: "use @Not yours",
      mentioned_team_ids: [foreign.id],
    });

    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({
        error: "unbound_mention",
        id: foreign.id,
      }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("foreign-mention")).toBeUndefined();
  });

  it("any miss in a mixed list 400s that id and never startTurn (MEN-BR-2)", async () => {
    signedIn(ACCT_A);
    const owned = await seedOwnedTeam(ACCT_A, "Rain");

    const res = await post({
      session_id: "mixed-mention",
      message: "use @Rain and @Gone",
      mentioned_team_ids: [owned.id, MISSING_TEAM_ID],
    });

    expect(res.status).toBe(400);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({
        error: "unbound_mention",
        id: MISSING_TEAM_ID,
      }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("mixed-mention")).toBeUndefined();
  });

  it("owned mentions bind onto ctx.boundTeams — no 21st tool (MEN-US-1, MEN-BR-1, MEN-BR-3)", async () => {
    signedIn(ACCT_A);
    const rain = await seedOwnedTeam(ACCT_A, "Rain", "scarlet-violet");
    const cup = await seedOwnedTeam(ACCT_A, "Worlds cup", "champions");

    const res = await post({
      session_id: "bind-mention",
      message: "compare @Rain and @Worlds cup",
      mentioned_team_ids: [rain.id, cup.id],
    });
    expect(res.status).toBe(200);
    await drain(res);

    expect(captured.options).not.toBeNull();
    expect(captured.options).toHaveProperty("boundTeams");
    expect(captured.options!.boundTeams).toEqual([
      { id: rain.id, name: "Rain", format: "scarlet-violet" },
      { id: cup.id, name: "Worlds cup", format: "champions" },
    ]);
    // Mentions ride ctx.boundTeams + existing get_team — they are not a new tool.
    expect(captured.options).not.toHaveProperty("activeTeam");
  });

  it("does not add a mentions tool (ADR-5)", async () => {
    const { tools } = await import("@/agent/tools");
    // T22 lookup_box is the real 21st tool; mentions still are not a tool.
    expect(tools).toHaveLength(21);
    expect(tools.map((t) => t.name)).not.toContain("get_bound_teams");
  });

  it("dead mention + scope_seed does not persist last_used_scope, conversation format, or session scope", async () => {
    // Signed-in: existing thread + account preference must stay put.
    await fix.db.execute(sql`
      INSERT INTO account (id, email, created_at, last_used_scope)
      VALUES (${ACCT_A}, ${`${ACCT_A}@x.test`}, 0, ${"national-dex"})
      ON CONFLICT (id) DO UPDATE SET last_used_scope = ${"national-dex"}
    `);
    signedIn(ACCT_A, { lastUsedScope: "national-dex" });
    await seedSignedInPair("dead-mention-scope", "prior q", "prior a");

    const signed = await post({
      session_id: "dead-mention-scope",
      message: "use @Gone in gen 7",
      scope_seed: "gen-7",
      mentioned_team_ids: [MISSING_TEAM_ID],
    });
    expect(signed.status).toBe(400);
    expect(await jsonBody(signed)).toEqual(
      expect.objectContaining({
        error: "unbound_mention",
        id: MISSING_TEAM_ID,
      }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("dead-mention-scope")).toBeUndefined();

    const accounts = await import("@/data/repos/accounts-repo");
    expect(
      (await accounts.findAccountByEmail(`${ACCT_A}@x.test`))?.lastUsedScope,
    ).toBe("national-dex");
    expect(
      (await convRepo.getConversation(ACCT_A, "dead-mention-scope"))?.format,
    ).toBe("national-dex");

    // Guest: session sticky scope must stay put too.
    cu.getCurrentAccount.mockResolvedValue(null);
    mockRunOak.mockClear();
    await setSessionScope("guest-dead-mention-scope", "national-dex");
    const guest = await post({
      session_id: "guest-dead-mention-scope",
      message: "use @Gone",
      scope_seed: "gen-7",
      mentioned_team_ids: [MISSING_TEAM_ID],
    });
    expect(guest.status).toBe(400);
    expect(await jsonBody(guest)).toEqual(
      expect.objectContaining({
        error: "unbound_mention",
        id: MISSING_TEAM_ID,
      }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("guest-dead-mention-scope")).toBeUndefined();
    expect(await getSessionScope("guest-dead-mention-scope")).toBe(
      "national-dex",
    );
  });
});

// ===========================================================================
// Chat-qol Phase 2 — recovery persist (REC-US-1..3, REC-BR-1..8, ADR-2/4)
// ===========================================================================

describe("POST /api/chat — recovery persist (REC-US-1..3, REC-BR-1..8)", () => {
  it("recovery retry on success replaces the last pair — exactly one current pair (REC-US-1, REC-BR-2)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-retry", "What beats Garchomp?", "Ice types.");

    const res = await post({
      session_id: "rec-retry",
      message: "What beats Garchomp?",
      recovery: "retry",
    });
    expect(res.status).toBe(200);
    await drain(res);

    const stored = await convRepo.getMessages(ACCT_A, "rec-retry");
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "What beats Garchomp?"],
      [1, "assistant", ANSWER.answer_markdown],
    ]);
    expect(stored).toHaveLength(2);
  });

  it("recovery edit on success replaces the last pair with the new user text (REC-US-2, REC-BR-2)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-edit", "What beats Garchomp?", "Ice types.");

    const res = await post({
      session_id: "rec-edit",
      message: "What beats Garchomp in gen 7?",
      recovery: "edit",
    });
    expect(res.status).toBe(200);
    await drain(res);

    const stored = await convRepo.getMessages(ACCT_A, "rec-edit");
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "What beats Garchomp in gen 7?"],
      [1, "assistant", ANSWER.answer_markdown],
    ]);
  });

  it("omitted recovery still appends a new pair (ADR-4)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-append", "first question", "first answer");

    const res = await post({
      session_id: "rec-append",
      message: "second question",
    });
    expect(res.status).toBe(200);
    await drain(res);

    const stored = await convRepo.getMessages(ACCT_A, "rec-append");
    expect(stored.map((t) => [t.seq, t.role, t.textContent])).toEqual([
      [0, "user", "first question"],
      [1, "assistant", "first answer"],
      [2, "user", "second question"],
      [3, "assistant", ANSWER.answer_markdown],
    ]);
  });

  it("recovery with no completed user+assistant pair is 409 nothing_to_replace before startTurn (ADR-4)", async () => {
    signedIn(ACCT_A);

    const res = await post({
      session_id: "rec-empty",
      message: "What beats Garchomp?",
      recovery: "retry",
    });

    expect(res.status).toBe(409);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({ error: "nothing_to_replace" }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("rec-empty")).toBeUndefined();
  });

  it("recovery when the last messages are not user+assistant is 409 nothing_to_replace (ADR-4)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-trailing", "q1", "a1");
    await fix.db.execute(
      sql`INSERT INTO conversation_message (id, conversation_id, account_id, seq, role, text_content, answer_json, created_at)
          VALUES (${"00000000-0000-4000-8000-000000000099"}, ${"rec-trailing"}, ${ACCT_A}, 2, 'user', 'trailing user', NULL, ${Date.now()})`,
    );

    const res = await post({
      session_id: "rec-trailing",
      message: "edited",
      recovery: "edit",
    });

    expect(res.status).toBe(409);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({ error: "nothing_to_replace" }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("rec-trailing")).toBeUndefined();

    const stored = await convRepo.getMessages(ACCT_A, "rec-trailing");
    expect(stored.map((t) => t.textContent)).toEqual(["q1", "a1", "trailing user"]);
  });

  it("recovery still 409s turn_in_progress and does not start a second turn (REC-BR-3)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-inflight", "q", "a");
    const d = deferRunOak();

    const first = await post({
      session_id: "rec-inflight",
      message: "q",
      recovery: "retry",
    });
    expect(first.status).toBe(200);
    await d.onProgressReady();

    const clash = await post({
      session_id: "rec-inflight",
      message: "q",
      recovery: "retry",
    });
    expect(clash.status).toBe(409);
    expect(await jsonBody(clash)).toEqual(
      expect.objectContaining({ code: "turn_in_progress" }),
    );

    d.resolve();
    await drain(first);
  });

  it("a stopped recovery leaves the old pair in place (REC-US-1/2, REC-BR-2, REC-BR-4, REC-US-3)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-stop", "What beats Garchomp?", "Ice types.");
    const d = deferRunOak();

    const res = await post({
      session_id: "rec-stop",
      message: "What beats Garchomp?",
      recovery: "retry",
    });
    expect(res.status).toBe(200);
    await d.onProgressReady();

    const running = findRunningBySession("rec-stop");
    expect(running).toBeDefined();
    stopTurn(running!);

    d.resolve();
    await drain(res);

    const stored = await convRepo.getMessages(ACCT_A, "rec-stop");
    expect(stored.map((t) => [t.role, t.textContent])).toEqual([
      ["user", "What beats Garchomp?"],
      ["assistant", "Ice types."],
    ]);
  });

  it("a transport-error recovery leaves the old pair in place (REC-BR-2)", async () => {
    signedIn(ACCT_A);
    await seedSignedInPair("rec-err", "What beats Garchomp?", "Ice types.");
    mockRunOak.mockReset();
    mockRunOak.mockRejectedValueOnce(new Error("provider down"));

    const res = await post({
      session_id: "rec-err",
      message: "What beats Garchomp?",
      recovery: "retry",
    });
    expect(res.status).toBe(200);
    await drain(res);

    const stored = await convRepo.getMessages(ACCT_A, "rec-err");
    expect(stored.map((t) => [t.role, t.textContent])).toEqual([
      ["user", "What beats Garchomp?"],
      ["assistant", "Ice types."],
    ]);
  });

  it("guest recovery on success replaces the last session-store pair (REC-BR-8, ADR-2)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);
    await appendTurn("guest-rec", { role: "user", content: "What beats Garchomp?" });
    await appendTurn("guest-rec", { role: "assistant", content: "Ice types." });

    const res = await post({
      session_id: "guest-rec",
      message: "What beats Garchomp really?",
      recovery: "edit",
    });
    expect(res.status).toBe(200);
    await drain(res);

    expect(await getHistory("guest-rec")).toEqual([
      { role: "user", content: "What beats Garchomp really?" },
      { role: "assistant", content: ANSWER.answer_markdown },
    ]);
  });

  it("guest recovery with no pair is 409 nothing_to_replace (REC-BR-8, ADR-4)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);

    const res = await post({
      session_id: "guest-rec-empty",
      message: "hi",
      recovery: "retry",
    });
    expect(res.status).toBe(409);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({ error: "nothing_to_replace" }),
    );
    expect(mockRunOak).not.toHaveBeenCalled();
    expect(findRunningBySession("guest-rec-empty")).toBeUndefined();
    expect(await getHistory("guest-rec-empty")).toEqual([]);
  });
});

// ===========================================================================
// Chat-qol Phase 2 — MRU touch on a signed-in completed turn (SCOPE-BR-2)
// ===========================================================================

describe("POST /api/chat — scope MRU on completed signed-in turn (SCOPE-BR-2)", () => {
  it("fire-and-forget touches the resolved format after a successful signed-in turn", async () => {
    signedIn(ACCT_A);
    const res = await post({
      session_id: "mru-touch",
      message: "hi",
      scope_seed: "gen-7",
    });
    expect(res.status).toBe(200);
    await drain(res);

    let listed = await mruRepo.list(ACCT_A);
    for (let i = 0; i < 50 && listed[0] !== "gen-7"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      listed = await mruRepo.list(ACCT_A);
    }
    expect(listed[0]).toBe("gen-7");
  });

  it("a guest completed turn does not write an account MRU row (SCOPE-BR-2)", async () => {
    cu.getCurrentAccount.mockResolvedValue(null);
    await drain(
      await post({
        session_id: "mru-guest",
        message: "hi",
        scope_seed: "gen-7",
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(await mruRepo.list(ACCT_A)).toEqual([]);
  });
});

// ===========================================================================
// Answer-cards P4 — abortVoiceCompile before startTurn (VOICE-BR-5)
// ===========================================================================

describe("POST /api/chat — abortVoiceCompile before startTurn (VOICE-BR-5)", () => {
  afterEach(async () => {
    const hydrate = await import("@/server/voice/hydrate-store").catch(
      () => null,
    );
    hydrate?._resetStoreForTests();
  });

  it("aborts an in-flight voice hydrate then proceeds; does not 409 from hydrate (VOICE-BR-5)", async () => {
    const hydrate = await import("@/server/voice/hydrate-store");
    signedIn(ACCT_A);
    const sessionId = "voice-hydrate-chat";
    await seedSignedInPair(sessionId, "spoken question", "spoken answer");
    const msgs = await convRepo.getMessages(ACCT_A, sessionId);
    const asstId = msgs[1]!.id;

    hydrate.setHydrateRunning(sessionId, asstId);
    expect(hydrate.getHydrate(sessionId)?.status).toBe("running");

    const order: string[] = [];
    const abortSpy = vi.spyOn(hydrate, "abortVoiceCompile").mockImplementation(
      ((id: string) => {
        order.push("abort");
        abortSpy.mockRestore();
        hydrate.abortVoiceCompile(id);
      }) as typeof hydrate.abortVoiceCompile,
    );
    const turnStore = await import("@/server/turn-store");
    const startSpy = vi.spyOn(turnStore, "startTurn").mockImplementation(
      ((meta: Parameters<typeof turnStore.startTurn>[0]) => {
        order.push("start");
        startSpy.mockRestore();
        return turnStore.startTurn(meta);
      }) as typeof turnStore.startTurn,
    );

    const res = await post({
      session_id: sessionId,
      message: "follow up in text",
    });
    expect(res.status).toBe(200);
    const text = await readBody(res);
    expect(text).not.toContain("turn_in_progress");
    expect(mockRunOak).toHaveBeenCalled();

    expect(order[0]).toBe("abort");
    expect(order).toContain("start");
    expect(hydrate.getHydrate(sessionId)?.status).not.toBe("running");

    abortSpy.mockRestore();
    startSpy.mockRestore();
  });
});
