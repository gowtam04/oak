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
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";
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

const ACCT_A = "acct-a";

let fix: PgFixture;
let route: typeof import("./route");
let convRepo: typeof import("@/data/repos/conversation-repo");

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
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE team, conversation, conversation_message RESTART IDENTITY`,
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
      logger: { info() {}, warn() {}, error() {}, child: () => ({}) },
    };
  });
  captured.options = null;
  usage.recordTurn.mockReset();
  usage.recordTurn.mockResolvedValue(undefined);
  usage.recordAuthEvent.mockReset();
  usage.recordAuthEvent.mockResolvedValue(undefined);
  _resetStoreForTests();
});

// --- Helpers ---------------------------------------------------------------

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({ id, email: `${id}@x.test`, createdAt: 0 });
}

function post(body: unknown, signal?: AbortSignal): Promise<Response> {
  return route.POST(
    new Request("http://t/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  it("an aborted turn persists nothing (existing guard)", async () => {
    signedIn(ACCT_A);
    const res = await post({ session_id: "c3", message: "hi" }, AbortSignal.abort());
    await drain(res);
    expect(await convRepo.getConversation(ACCT_A, "c3")).toBeNull();
  });

  // An interrupted turn must not record either — recording lives after the
  // abort guard, on the same non-blocking post-answer path as persistence.
  it("an aborted turn records no turn_record", async () => {
    signedIn(ACCT_A);
    await drain(await post({ session_id: "c3b", message: "hi" }, AbortSignal.abort()));
    expect(usage.recordTurn).not.toHaveBeenCalled();
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
      mode: "standard",
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
      checkRateLimit("ip:unknown", "x", GUEST_CONFIG);
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
