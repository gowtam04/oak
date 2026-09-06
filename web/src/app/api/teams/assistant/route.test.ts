/**
 * Route-framing tests for `POST /api/teams/assistant` (route.ts) — the SSE
 * endpoint embedding the team-builder assistant in `/teams`. Mirrors
 * src/app/api/chat/route.test.ts's mocking conventions (vi.mock intercepts
 * the route's dynamic `import()` calls exactly like a static one).
 *
 * The runtime/model/DB are fully mocked here — this file pins the ROUTE's own
 * contract (auth-before-body-state ordering, Zod body validation, the
 * signed-in-only rate-limit tier, the SSE frame sequence, and history
 * isolation under the `teams-assistant:` key prefix), not the legality gate
 * (covered by runtime-hooks.test.ts) or the hooks seam (runtime.hooks.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const factory = vi.hoisted(() => ({
  activeModelKey: vi.fn(),
  isModelConfigured: vi.fn(),
  providerFor: vi.fn(),
}));
vi.mock("@/agent/providers/factory", () => factory);

const { mockRunWithProvider } = vi.hoisted(() => ({
  mockRunWithProvider: vi.fn(),
}));
vi.mock("@/agent/runtime", () => ({ runWithProvider: mockRunWithProvider }));

const { mockCreateCtx, captured } = vi.hoisted(() => ({
  mockCreateCtx: vi.fn(),
  captured: { options: null as Record<string, unknown> | null },
}));
vi.mock("@/agent/context", () => ({ createAgentContext: mockCreateCtx }));

const { mockBuildBuilderHooks } = vi.hoisted(() => ({
  mockBuildBuilderHooks: vi.fn(() => ({ marker: "builder-hooks" })),
}));
vi.mock("@/agent/teams-assistant/runtime-hooks", () => ({
  buildBuilderHooks: mockBuildBuilderHooks,
}));

const spend = vi.hoisted(() => ({
  admitAgentTurn: vi.fn(),
  assertNotDenylisted: vi.fn(),
}));
vi.mock("@/server/spend-control", () => spend);

import {
  _resetStoreForTests as resetRateLimit,
  checkRateLimit,
  TEAMS_ASSISTANT_CONFIG,
} from "@/server/rate-limit";
import {
  _resetStoreForTests as resetSessionStore,
  getHistory,
} from "@/server/session-store";

let route: typeof import("./route");

const ACCT_A = "acct-teams-a";

const BUILDER_ANSWER = {
  answer_markdown: "Here's your team.",
  team_patch: { slots: [{ slot: 0, member: null }] },
};

beforeEach(async () => {
  route = await import("./route");

  cu.getCurrentAccount.mockReset();

  factory.activeModelKey.mockReset();
  factory.activeModelKey.mockResolvedValue("grok-4.3");
  factory.isModelConfigured.mockReset();
  factory.isModelConfigured.mockReturnValue(true);
  factory.providerFor.mockReset();
  factory.providerFor.mockReturnValue({ kind: "xai", apiModelId: "fake" });

  mockRunWithProvider.mockReset();
  mockRunWithProvider.mockImplementation(
    async (
      _provider: unknown,
      _message: string,
      _history: unknown,
      _ctx: unknown,
      onProgress?: (a: { tool: string; label: string }) => void,
      onAnswerStart?: () => void,
      onAnswerDelta?: (t: string) => void,
    ) => {
      onProgress?.({ tool: "get_learnset", label: "Checking the learnset…" });
      onAnswerStart?.();
      onAnswerDelta?.("Here's your team.");
      return BUILDER_ANSWER;
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

  mockBuildBuilderHooks.mockClear();

  spend.admitAgentTurn.mockReset();
  spend.admitAgentTurn.mockResolvedValue({ ok: true });
  spend.assertNotDenylisted.mockReset();
  spend.assertNotDenylisted.mockResolvedValue({ ok: true });

  await resetRateLimit();
  await resetSessionStore();
});

afterEach(async () => {
  await resetRateLimit();
  await resetSessionStore();
});

// --- Helpers ---------------------------------------------------------------

function signedIn(id: string, opts?: { email?: string }): void {
  cu.getCurrentAccount.mockResolvedValue({
    id,
    email: opts?.email ?? `${id}@x.test`,
    createdAt: 0,
    lastUsedScope: null,
  });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "My Team", format: "scarlet-violet", members: [], ...overrides };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { session_id: "sid-1", message: "hi", draft: draft(), ...overrides };
}

function post(b: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/teams/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
}

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

// --- Auth / body validation ordering ---------------------------------------

describe("POST /api/teams/assistant — auth + validation ordering", () => {
  it("returns 401 when getCurrentAccount resolves null, and never runs the model", async () => {
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed draft (bad format string)", async () => {
    const res = await post(body({ draft: draft({ format: "gen-99" }) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed draft (unknown extra key, strict schema)", async () => {
    const res = await post(body({ draft: { ...draft(), extra: "nope" } }));
    expect(res.status).toBe(400);
  });

  it("400 (body validation) fires even for a guest — it happens before auth", async () => {
    guest();
    const res = await post(body({ draft: draft({ format: "gen-99" }) }));
    expect(res.status).toBe(400);
  });
});

// --- Rate limiting (signed-in only) -----------------------------------------

describe("POST /api/teams/assistant — rate limiting (signed-in only, keyed acct:<id>)", () => {
  it("returns 413 when the message exceeds the input-length cap", async () => {
    signedIn(ACCT_A);
    const res = await post(
      body({ message: "x".repeat(TEAMS_ASSISTANT_CONFIG.maxInputLength + 1) }),
    );
    expect(res.status).toBe(413);
  });

  it("returns 429 after the request window is exhausted", async () => {
    signedIn(ACCT_A);
    for (let i = 0; i < TEAMS_ASSISTANT_CONFIG.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT_A}`, "x", TEAMS_ASSISTANT_CONFIG);
    }
    const res = await post(body());
    expect(res.status).toBe(429);
  });
});

// --- SSE happy path ----------------------------------------------------------

describe("POST /api/teams/assistant — SSE happy path", () => {
  it("streams tool_activity -> answer_start -> answer_delta -> answer, carries the team_patch, and emits no scope event", async () => {
    signedIn(ACCT_A);
    const res = await post(body({ session_id: "sse-1" }));
    expect(res.status).toBe(200);
    const text = await readBody(res);

    // Trailing "\n" disambiguates the terminal "event: answer" frame from the
    // "event: answer_start" / "event: answer_delta" frames it is a prefix of.
    const order = [
      "tool_activity",
      "answer_start",
      "answer_delta",
      "answer",
    ].map((name) => text.indexOf(`event: ${name}\n`));
    for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]!);
    }

    expect(text).not.toContain("event: scope");

    const answerLine = text
      .split("\n")
      .find((line) => line.startsWith("data: ") && line.includes("team_patch"));
    expect(answerLine).toBeDefined();
    const payload = JSON.parse(answerLine!.slice("data: ".length)) as {
      answer: typeof BUILDER_ANSWER;
    };
    expect(payload.answer.team_patch).toEqual(BUILDER_ANSWER.team_patch);
  });

  it("derives the turn's mode from draft.format — no scope resolution", async () => {
    signedIn(ACCT_A);
    await readBody(
      await post(body({ session_id: "sse-2", draft: draft({ format: "gen-7" }) })),
    );
    expect((captured.options as Record<string, unknown>).mode).toBe("gen-7");
  });

  it("runs with the builder hooks built from the request draft's members", async () => {
    signedIn(ACCT_A);
    const members = [
      {
        species: "garchomp",
        ability: null,
        item: null,
        moves: [],
        nature: null,
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        tera_type: null,
        level: 50,
      },
    ];
    await readBody(
      await post(body({ session_id: "sse-3", draft: draft({ members }) })),
    );
    expect(mockBuildBuilderHooks).toHaveBeenCalledWith(members);
  });
});

// --- History isolation -------------------------------------------------------

describe("POST /api/teams/assistant — history isolation", () => {
  it("stores the plain typed message under teams-assistant:<sid>, never the bare session id", async () => {
    signedIn(ACCT_A);
    await readBody(
      await post(
        body({ session_id: "hist-1", message: "help me build a team" }),
      ),
    );

    expect(await getHistory("teams-assistant:hist-1")).toEqual([
      { role: "user", content: "help me build a team" },
      { role: "assistant", content: BUILDER_ANSWER.answer_markdown },
    ]);
    expect(await getHistory("hist-1")).toEqual([]);
  });
});

// ===========================================================================
// Spend controls — same 403/429/503 as chat; shared budget is admitAgentTurn
// (SC-US-5/6, SC-AC-5.3, SC-AC-6.2, SC-BR-1, SC-BR-14)
// ===========================================================================

const SPEND_RESET_AT = "2026-09-07T00:00:00.000Z";
const SPEND_RETRY_AFTER_MS = 45_000;
const SPEND_DAILY_LIMIT_MESSAGE = `Daily limit reached. Try again tomorrow (resets at ${SPEND_RESET_AT} UTC).`;
const ASSISTANT_DENIED_MESSAGE = "This account can't use the teams assistant.";

function dailyLimitAdmit() {
  return {
    ok: false as const,
    code: "daily_limit" as const,
    message: SPEND_DAILY_LIMIT_MESSAGE,
    resetAt: SPEND_RESET_AT,
    retryAfterMs: SPEND_RETRY_AFTER_MS,
  };
}

async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/teams/assistant — spend controls (SC-US-5/6, SC-AC-5.3, SC-AC-6.2, SC-BR-1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("guest 401 happens before admit and never runs the model", async () => {
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
    expect(spend.admitAgentTurn).not.toHaveBeenCalled();
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });

  it("account_denied is 403 and does not run the model (SC-AC-6.2, SC-BR-1, SC-BR-14)", async () => {
    signedIn(ACCT_A);
    spend.admitAgentTurn.mockResolvedValue({
      ok: false,
      code: "account_denied",
      message: ASSISTANT_DENIED_MESSAGE,
    });

    const res = await post(body({ session_id: "sc-denied" }));
    expect(res.status).toBe(403);
    expect(await jsonBody(res)).toEqual({
      code: "account_denied",
      message: ASSISTANT_DENIED_MESSAGE,
    });
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(mockRunWithProvider).not.toHaveBeenCalled();
    expect(spend.admitAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({
          kind: "account",
          accountId: ACCT_A,
          email: `${ACCT_A}@x.test`,
        }),
        isAdmin: false,
        surface: "teams_assistant",
      }),
    );
  });

  it("daily_limit is 429 with reset_at + Retry-After and does not run the model (SC-AC-5.2/5.3, SC-BR-1)", async () => {
    signedIn(ACCT_A);
    spend.admitAgentTurn.mockResolvedValue(dailyLimitAdmit());

    const res = await post(body({ session_id: "sc-cap" }));
    expect(res.status).toBe(429);
    expect(await jsonBody(res)).toEqual({
      code: "daily_limit",
      message: SPEND_DAILY_LIMIT_MESSAGE,
      reset_at: SPEND_RESET_AT,
    });
    expect(res.headers.get("Retry-After")).toBe(
      String(Math.ceil(SPEND_RETRY_AFTER_MS / 1000)),
    );
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });

  it("spend_check_failed is 503 and does not run the model (SC-BR-1)", async () => {
    signedIn(ACCT_A);
    spend.admitAgentTurn.mockResolvedValue({
      ok: false,
      code: "spend_check_failed",
    });

    const res = await post(body({ session_id: "sc-fail" }));
    expect(res.status).toBe(503);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({ code: "spend_check_failed" }),
    );
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });

  it("admit ok still runs the builder and calls admit with surface teams_assistant (SC-US-5, SC-AC-5.1, SC-AC-5.3)", async () => {
    signedIn(ACCT_A);
    const res = await post(body({ session_id: "sc-ok" }));
    expect(res.status).toBe(200);
    await readBody(res);
    expect(mockRunWithProvider).toHaveBeenCalled();
    expect(spend.admitAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        isAdmin: false,
        surface: "teams_assistant",
      }),
    );
  });

  it("passes isAdmin: true when the account email is on ADMIN_EMAILS (SC-BR-6 route seam)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    signedIn(ACCT_A, { email: "owner@oak.ai" });

    const res = await post(body({ session_id: "sc-admin" }));
    expect(res.status).toBe(200);
    await readBody(res);
    expect(mockRunWithProvider).toHaveBeenCalled();
    expect(spend.admitAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({
          kind: "account",
          accountId: ACCT_A,
          email: "owner@oak.ai",
        }),
        isAdmin: true,
        surface: "teams_assistant",
      }),
    );
  });

  it("per-minute rate_limited is unchanged when admit returns ok (SC-BR-7)", async () => {
    signedIn(ACCT_A);
    for (let i = 0; i < TEAMS_ASSISTANT_CONFIG.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT_A}`, "x", TEAMS_ASSISTANT_CONFIG);
    }
    const res = await post(body({ session_id: "sc-rl" }));
    expect(res.status).toBe(429);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({ code: "rate_limited" }),
    );
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });

  it("daily_limit wins over an exhausted per-minute window (admit before checkRateLimit)", async () => {
    signedIn(ACCT_A);
    spend.admitAgentTurn.mockResolvedValue(dailyLimitAdmit());
    for (let i = 0; i < TEAMS_ASSISTANT_CONFIG.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT_A}`, "x", TEAMS_ASSISTANT_CONFIG);
    }
    const res = await post(body({ session_id: "sc-order-cap" }));
    expect(res.status).toBe(429);
    expect(await jsonBody(res)).toEqual(
      expect.objectContaining({ code: "daily_limit", reset_at: SPEND_RESET_AT }),
    );
    expect(mockRunWithProvider).not.toHaveBeenCalled();
  });
});
