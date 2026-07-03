/**
 * Route tests for `POST /api/voice/token` (voice-mode plan §5).
 *
 * Auth + the conversation repo are mocked; the voice-prompt module is mocked
 * (workstream P may not exist yet) so the REAL voice-session module composes the
 * bootstrap — letting us assert the 16-tool list, the injected history, and the
 * constants. `global.fetch` stands in for xAI's client_secrets mint.
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

import {
  _resetStoreForTests as resetRateLimit,
  checkRateLimit,
  type RateLimitConfig,
} from "@/server/rate-limit";
import type { VoiceTokenResponseBody } from "@/lib/voice/voice-types";

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
  resetRateLimit();
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

afterEach(() => {
  resetRateLimit();
  vi.unstubAllGlobals();
});

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({ id, email: `${id}@x.test`, createdAt: 0 });
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

  it("returns 200 with the token, 16 tools, injected history, and constants", async () => {
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
    expect(json.session.tools).toHaveLength(16);
    expect(json.session.tools.some((t) => t.name === "submit_answer")).toBe(false);
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
      checkRateLimit(`acct:${ACCT}`, "", TOKEN_RL);
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
