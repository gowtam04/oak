/**
 * Route tests for `POST /api/voice/transcript` (voice-mode plan §5).
 *
 * Auth is mocked; the REAL conversation repo writes to the "none" fixture DB
 * (installed as the `@/data/db` singleton). Pins the 401 gate, the empty-text
 * rejection, and the happy path: two messages land in the conversation and the
 * synthesized assistant answer_json parses against the real oakAnswerSchema.
 *
 * Needs Docker (Testcontainers Postgres) via the node project's globalSetup.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({
  getCurrentAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/server/auth/current-user", () => cu);

const compile = vi.hoisted(() => ({
  runVoiceCompile: vi.fn(async () => {}),
}));
vi.mock("@/server/voice/run-voice-compile", () => compile);

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
import { oakAnswerSchema } from "@/agent/schemas";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../test/support/pg";

let route: typeof import("./route");
let repo: typeof import("@/data/repos/conversation-repo");
let fix: PgFixture;
let loadError: unknown = null;

const ACCT = "acct-voice-tx";

/** Mirror of the route's inline transcript config, for exhausting the window. */
const TRANSCRIPT_RL: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 30,
  windowMs: 60_000,
};

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "none" });
    await installAsSingleton(fix);
    route = await import("./route");
    repo = await import("@/data/repos/conversation-repo");
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  cu.getCurrentAccount.mockReset();
  compile.runVoiceCompile.mockReset();
  compile.runVoiceCompile.mockResolvedValue(undefined);
  spend.admitAgentTurn.mockReset();
  spend.admitAgentTurn.mockResolvedValue({ ok: true });
  spend.assertNotDenylisted.mockReset();
  spend.assertNotDenylisted.mockResolvedValue({ ok: true });
  await resetRateLimit();
});
afterEach(() => resetRateLimit());

function ensureLoaded(): void {
  if (loadError) throw new Error(`Route/repo not loadable: ${String(loadError)}`);
}
function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({ id, email: `${id}@x.test`, createdAt: 0, lastUsedScope: null });
}
function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function post(b: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/voice/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
}

const body = (o: Record<string, unknown> = {}) => ({
  session_id: "conv-tx-1",
  format: "champions",
  user_text: "What's Garchomp's best nature?",
  assistant_text: "Jolly maximizes its Speed.",
  ...o,
});

describe("POST /api/voice/transcript", () => {
  it("returns 401 for a guest", async () => {
    ensureLoaded();
    guest();
    const res = await post(body());
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty assistant_text", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const res = await post(body({ assistant_text: "   " }));
    expect(res.status).toBe(400);
  });

  it("persists the turn pair; assistant answer_json parses against the schema", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const sessionId = `conv-${Date.now()}`;
    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(200);

    const stored = await repo.getMessages(ACCT, sessionId);
    expect(stored).toHaveLength(2);
    expect(stored[0]!.role).toBe("user");
    expect(stored[0]!.textContent).toBe("How fast is Dragapult?");
    expect(stored[1]!.role).toBe("assistant");
    expect(stored[1]!.textContent).toBe("Base one-forty-two Speed — very fast.");

    // The stored answer_json must be a valid OakAnswer.
    const parsed = oakAnswerSchema.safeParse(JSON.parse(stored[1]!.answerJson!));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("answered");
      expect(parsed.data.answer_markdown).toBe(
        "Base one-forty-two Speed — very fast.",
      );
      expect(parsed.data.generation_basis.generation).toBe("champions");
    }
  });
});

describe("POST /api/voice/transcript — compile is fire-and-forget (VOICE-BR-1, VOICE-AC-2.1)", () => {
  afterEach(async () => {
    const hydrate = await import("@/server/voice/hydrate-store").catch(
      () => null,
    );
    hydrate?._resetStoreForTests();
  });

  it("returns the existing 200 without waiting for compile to finish (VOICE-BR-1)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    let release!: () => void;
    const hung = new Promise<void>((r) => {
      release = r;
    });
    compile.runVoiceCompile.mockReturnValue(hung);

    const sessionId = `conv-nofinish-${Date.now()}`;
    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(compile.runVoiceCompile).toHaveBeenCalled();
    // Compile is still pending — the 200 must not have awaited it.
    const stored = await repo.getMessages(ACCT, sessionId);
    expect(stored).toHaveLength(2);
    release();
  });

  it("starts hydrate running for the persisted assistant message (VOICE-AC-2.1)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    compile.runVoiceCompile.mockReturnValue(new Promise(() => {}));

    const sessionId = `conv-hydrate-run-${Date.now()}`;
    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(200);

    const stored = await repo.getMessages(ACCT, sessionId);
    expect(stored).toHaveLength(2);
    const asstId = stored[1]!.id;

    const hydrate = await import("@/server/voice/hydrate-store");
    expect(hydrate.getHydrate(sessionId)).toEqual({
      assistant_message_id: asstId,
      status: "running",
    });
    expect(compile.runVoiceCompile).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: sessionId,
        assistantMessageId: asstId,
      }),
    );
  });
});

const VOICE_DENIED_MESSAGE = "This account can't use voice.";

describe("POST /api/voice/transcript — spend controls denylist-only (SC-AC-6.3, SC-BR-1)", () => {
  it("account_denied is 403 with code+error, does not persist, and does not increment (SC-BR-1, SC-BR-14)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    spend.assertNotDenylisted.mockResolvedValue({
      ok: false,
      code: "account_denied",
      message: VOICE_DENIED_MESSAGE,
    });
    const sessionId = `conv-denied-${Date.now()}`;

    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("account_denied");
    expect(json.error).toBe("account_denied");
    expect(json.message).toBe(VOICE_DENIED_MESSAGE);
    expect(spend.assertNotDenylisted).toHaveBeenCalledWith(`${ACCT}@x.test`);
    expect(spend.admitAgentTurn).not.toHaveBeenCalled();
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
    expect(await repo.getMessages(ACCT, sessionId)).toEqual([]);
  });

  it("admit ok still persists and never increments (denylist only)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    const sessionId = `conv-ok-${Date.now()}`;
    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(200);
    expect(spend.assertNotDenylisted).toHaveBeenCalledWith(`${ACCT}@x.test`);
    expect(spend.admitAgentTurn).not.toHaveBeenCalled();
    expect(await repo.getMessages(ACCT, sessionId)).toHaveLength(2);
  });

  it("spend_check_failed is 503 with code+error, does not persist, and does not increment", async () => {
    ensureLoaded();
    signedIn(ACCT);
    spend.assertNotDenylisted.mockResolvedValue({
      ok: false,
      code: "spend_check_failed",
    });
    const sessionId = `conv-fail-${Date.now()}`;

    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("spend_check_failed");
    expect(json.error).toBe("spend_check_failed");
    expect(spend.admitAgentTurn).not.toHaveBeenCalled();
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
    expect(await repo.getMessages(ACCT, sessionId)).toEqual([]);
  });

  it("account_denied wins over an exhausted per-minute window (denylist before checkRateLimit)", async () => {
    ensureLoaded();
    signedIn(ACCT);
    spend.assertNotDenylisted.mockResolvedValue({
      ok: false,
      code: "account_denied",
      message: VOICE_DENIED_MESSAGE,
    });
    for (let i = 0; i < TRANSCRIPT_RL.maxRequestsPerWindow; i++) {
      await checkRateLimit(`acct:${ACCT}`, "", TRANSCRIPT_RL);
    }
    const sessionId = `conv-order-${Date.now()}`;

    const res = await post(
      body({
        session_id: sessionId,
        user_text: "How fast is Dragapult?",
        assistant_text: "Base one-forty-two Speed — very fast.",
      }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe("account_denied");
    expect(json.error).toBe("account_denied");
    expect(spend.admitAgentTurn).not.toHaveBeenCalled();
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
    expect(await repo.getMessages(ACCT, sessionId)).toEqual([]);
  });
});
