/**
 * Route tests for `POST /api/voice/token` (voice-mode plan §5).
 *
 * Auth + the conversation repo are mocked; the voice-prompt module is mocked
 * (workstream P may not exist yet) so the REAL voice-session module composes the
 * bootstrap — letting us assert the voice tool list, the injected history, and
 * the constants. `global.fetch` stands in for xAI's client_secrets mint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Real voice-session, mocked prompt (workstream P).
vi.mock("@/agent/prompts/voice", () => ({
  buildVoiceInstructions: (opts: {
    format: string;
    historyDigest?: string;
  }): string =>
    `PERSONA for ${opts.format}.` +
    (opts.historyDigest ? `\n\nEARLIER:\n${opts.historyDigest}` : ""),
}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const repo = vi.hoisted(() => ({
  getMessages: vi.fn(),
}));
vi.mock("@/data/repos/conversation-repo", () => repo);

const spend = vi.hoisted(() => ({
  admitAgentTurn: vi.fn(),
  assertNotDenylisted: vi.fn(),
}));
vi.mock("@/server/spend-control", () => spend);

import {
  _resetStoreForTests as resetRateLimit,
  checkRateLimit,
  type RateLimitConfig,
} from "@/server/rate-limit";
import type { VoiceTokenResponseBody } from "@/lib/voice/voice-types";
import { tools } from "@/agent/tools";
import { VOICE_EXCLUDED_TOOLS } from "@/agent/tools/voice-gating";

/** Main tool-barrel count minus the voice exclusion set — not a literal. */
const EXPECTED_VOICE_TOOL_COUNT = tools.filter(
  (t) => !VOICE_EXCLUDED_TOOLS.has(t.name),
).length;

let route: typeof import("./route");

const ACCT = "acct-voice-1";

/** Mirror of the route's inline token config, for exhausting the window. */
const TOKEN_RL: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 5,
  windowMs: 60_000,
};

beforeEach(async () => {
  route = await import("./route");
  cu.getCurrentAccount.mockReset();
  repo.getMessages.mockReset();
  repo.getMessages.mockResolvedValue([]);
  spend.admitAgentTurn.mockReset();
  spend.admitAgentTurn.mockResolvedValue({ ok: true });
  spend.assertNotDenylisted.mockReset();
  spend.assertNotDenylisted.mockResolvedValue({ ok: true });
  await resetRateLimit();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ value: "tok-abc", expires_at: 1_700_000_600 }),
          { status: 200 },
        ),
    ),
  );
});

afterEach(async () => {
  await resetRateLimit();
  vi.unstubAllGlobals();
});

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

function post(b: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
}

const body = (o: Record<string, unknown> = {}) => ({
  session_id: "sid-1",
  format: "champions",
  ...o,
});

describe("POST /api/voice/token", () => {
  it("returns 401 for a guest and never mints a token", async () => {
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("sign_in_required");
  });

  it("returns 400 for a malformed body (bad format)", async () => {
    signedIn(ACCT);
    const res = await post(body({ format: "gen-99" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with the token, the voice tool list, injected history, and constants", async () => {
    signedIn(ACCT);
    repo.getMessages.mockResolvedValue([
      { role: "user", textContent: "Tell me about Garchomp" },
      { role: "assistant", textContent: "It's a Dragon/Ground pseudo-legend." },
    ]);
    const res = await post(body({ session_id: "conv-1", format: "champions" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as VoiceTokenResponseBody;

    expect(json.token).toBe("tok-abc");
    expect(json.expires_at).toBe(1_700_000_600);
    expect(json.session.tools).toHaveLength(EXPECTED_VOICE_TOOL_COUNT);
    expect(json.session.tools.some((t) => t.name === "submit_answer")).toBe(false);
    expect(json.session.tools.some((t) => t.name === "run_sql")).toBe(false);
    expect(json.session.model).toBe("grok-voice-latest");
    expect(json.session.voice).toBe("rex");
    expect(json.session.reasoning_effort).toBe("none");
    expect(json.session.instructions).toContain("PERSONA for champions");
    expect(json.session.instructions).toContain("User: Tell me about Garchomp");

    // The mint hit xAI's client_secrets with a bearer + the TTL body.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/realtime\/client_secrets$/);
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      /^Bearer /,
    );
    const sent = JSON.parse(init.body as string) as {
      expires_after: { seconds: number };
    };
    expect(sent.expires_after.seconds).toBe(600);
  });

  it("returns 429 once the per-account token window is exhausted", async () => {
    signedIn(ACCT);
    for (let i = 0; i < TOKEN_RL.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT}`, "", TOKEN_RL);
    }
    const res = await post(body());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 502 when the xAI mint fails", async () => {
    signedIn(ACCT);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream boom", { status: 500 })),
    );
    const res = await post(body());
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("voice_upstream_error");
  });
});

// ===========================================================================
// Spend controls — admit BEFORE xAI mint (SC-US-5/6, SC-AC-5.3, SC-AC-6.3,
// SC-BR-1, SC-BR-14). Voice JSON must send both `code` and `error`.
// ===========================================================================

const SPEND_RESET_AT = "2026-09-07T00:00:00.000Z";
const SPEND_RETRY_AFTER_MS = 45_000;
const SPEND_DAILY_LIMIT_MESSAGE = `Daily limit reached. Try again tomorrow (resets at ${SPEND_RESET_AT} UTC).`;
const VOICE_DENIED_MESSAGE = "This account can't use voice.";

function dailyLimitAdmit() {
  return {
    ok: false as const,
    code: "daily_limit" as const,
    message: SPEND_DAILY_LIMIT_MESSAGE,
    resetAt: SPEND_RESET_AT,
    retryAfterMs: SPEND_RETRY_AFTER_MS,
  };
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return globalThis.fetch as ReturnType<typeof vi.fn>;
}

describe("POST /api/voice/token — spend controls (SC-US-5/6, SC-AC-5.3, SC-AC-6.3, SC-BR-1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("account_denied is 403 with code+error and does not mint (SC-AC-6.3, SC-BR-1, SC-BR-14)", async () => {
    signedIn(ACCT);
    spend.admitAgentTurn.mockResolvedValue({
      ok: false,
      code: "account_denied",
      message: VOICE_DENIED_MESSAGE,
    });

    const res = await post(body());
    expect(res.status).toBe(403);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("account_denied");
    expect(json.error).toBe("account_denied");
    expect(json.message).toBe(VOICE_DENIED_MESSAGE);
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(spend.admitAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({
          kind: "account",
          accountId: ACCT,
          email: `${ACCT}@x.test`,
        }),
        isAdmin: false,
        surface: "voice",
      }),
    );
  });

  it("daily_limit is 429 with reset_at + Retry-After, code+error, and does not mint (SC-AC-5.2/5.3, SC-BR-1)", async () => {
    signedIn(ACCT);
    spend.admitAgentTurn.mockResolvedValue(dailyLimitAdmit());

    const res = await post(body());
    expect(res.status).toBe(429);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("daily_limit");
    expect(json.error).toBe("daily_limit");
    expect(json.message).toBe(SPEND_DAILY_LIMIT_MESSAGE);
    expect(json.reset_at).toBe(SPEND_RESET_AT);
    expect(res.headers.get("Retry-After")).toBe(
      String(Math.ceil(SPEND_RETRY_AFTER_MS / 1000)),
    );
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("spend_check_failed is 503 with code+error and does not mint (SC-BR-1)", async () => {
    signedIn(ACCT);
    spend.admitAgentTurn.mockResolvedValue({
      ok: false,
      code: "spend_check_failed",
    });

    const res = await post(body());
    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("spend_check_failed");
    expect(json.error).toBe("spend_check_failed");
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("admit ok still mints and calls admit with surface voice (SC-US-5, SC-AC-5.1)", async () => {
    signedIn(ACCT);
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(spend.admitAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        isAdmin: false,
        surface: "voice",
      }),
    );
  });

  it("passes isAdmin: true when the account email is on ADMIN_EMAILS (SC-BR-6 route seam)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@oak.ai");
    signedIn(ACCT, { email: "owner@oak.ai" });

    const res = await post(body());
    expect(res.status).toBe(200);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(spend.admitAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({
          kind: "account",
          accountId: ACCT,
          email: "owner@oak.ai",
        }),
        isAdmin: true,
        surface: "voice",
      }),
    );
  });

  it("per-minute rate_limited is unchanged when admit returns ok (SC-BR-7)", async () => {
    signedIn(ACCT);
    for (let i = 0; i < TOKEN_RL.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT}`, "", TOKEN_RL);
    }
    const res = await post(body());
    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("rate_limited");
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("daily_limit wins over an exhausted per-minute window (admit before checkRateLimit)", async () => {
    signedIn(ACCT);
    spend.admitAgentTurn.mockResolvedValue(dailyLimitAdmit());
    for (let i = 0; i < TOKEN_RL.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT}`, "", TOKEN_RL);
    }
    const res = await post(body());
    expect(res.status).toBe(429);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("daily_limit");
    expect(json.error).toBe("daily_limit");
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("guest 401 happens before admit and never mints", async () => {
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
    expect(spend.admitAgentTurn).not.toHaveBeenCalled();
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
