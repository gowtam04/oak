/**
 * Route tests for `GET/POST /api/voice/hydrate` (VOICE-US-3, VOICE-AC-3.1–3.3,
 * VOICE-BR-5, VOICE-BR-6). Signed-in retry starts compile again on the SAME
 * assistant row. 404 if the message is not a voice-origin thin/failed card the
 * caller owns. 409 `turn_in_progress` only if a REAL chat turn is running —
 * another hydrate is replaced, not 409'd.
 *
 * Importing `./route` is the intended red until P4 lands the module.
 */

import { sql } from "drizzle-orm";
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

import type { OakAnswer } from "@/agent/schemas";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../../../test/support/pg";
import {
  _resetStoreForTests as resetTurnStore,
  startTurn,
} from "@/server/turn-store";
import { _resetStoreForTests as resetRateLimit } from "@/server/rate-limit";

let route: typeof import("./route");
let repo: typeof import("@/data/repos/conversation-repo");
let hydrate: typeof import("@/server/voice/hydrate-store");
let fix: PgFixture;
let loadError: unknown = null;

const ACCT_A = "acct-hydrate-a";
const ACCT_B = "acct-hydrate-b";

const VOICE_DISCLAIMER =
  "This answer was spoken in voice mode, so it carries no structured " +
  "citations or inferences.";

const THIN_VOICE: OakAnswer = {
  status: "answered",
  answer_markdown: "Jolly maximizes its Speed.",
  reasoning_markdown: VOICE_DISCLAIMER,
  citations: [],
  inferences: [],
  generation_basis: { generation: "champions", fallback: false },
  origin: "voice",
};

const CHAT_CARD: OakAnswer = {
  status: "answered",
  answer_markdown: "Jolly is a Speed nature.",
  reasoning_markdown: "Looked it up.",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

const FULL_VOICE: OakAnswer = {
  status: "answered",
  answer_markdown: "Jolly is the usual Speed nature.",
  reasoning_markdown: "Looked up the nature chart.",
  citations: [{ source: "nature index", detail: "Jolly +Spe −SpA" }],
  inferences: [],
  generation_basis: { generation: "champions", fallback: false },
  origin: "voice",
};

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "none" });
    await installAsSingleton(fix);
    route = await import("./route");
    repo = await import("@/data/repos/conversation-repo");
    hydrate = await import("@/server/voice/hydrate-store");
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
  await resetRateLimit();
  await resetTurnStore();
  if (!loadError) {
    await fix.db.execute(
      sql`TRUNCATE TABLE conversation, conversation_message RESTART IDENTITY`,
    );
    hydrate._resetStoreForTests();
  }
});

afterEach(async () => {
  await resetRateLimit();
  await resetTurnStore();
  if (!loadError) hydrate._resetStoreForTests();
});

function ensureLoaded(): void {
  if (loadError) throw new Error(`hydrate route not loadable: ${String(loadError)}`);
}

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

function post(b: unknown): Promise<Response> {
  return route.POST(
    new Request("http://t/api/voice/hydrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
}

function get(qs: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams(qs);
  return route.GET(
    new Request(`http://t/api/voice/hydrate?${params.toString()}`),
  );
}

async function seed(
  accountId: string,
  conversationId: string,
  answer: OakAnswer,
): Promise<string> {
  const asstId = repo.newTurnId();
  await repo.appendTurnPair({
    accountId,
    conversationId,
    format: "champions",
    userTurnId: repo.newTurnId(),
    userMessage: "What's Garchomp's best nature?",
    assistantTurnId: asstId,
    answer,
    now: Date.now(),
  });
  return asstId;
}

describe("POST /api/voice/hydrate — signed-in retry (VOICE-US-3, VOICE-AC-3.2, VOICE-AC-3.3)", () => {
  it("returns 200 { status: \"running\" } and starts compile again on the same row", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-retry";
    const asstId = await seed(ACCT_A, conversationId, THIN_VOICE);
    hydrate.setHydrateFailed(conversationId, asstId);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "running" });
    expect(hydrate.getHydrate(conversationId)).toEqual({
      assistant_message_id: asstId,
      status: "running",
    });
    expect(compile.runVoiceCompile).toHaveBeenCalledTimes(1);
    expect(compile.runVoiceCompile).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCT_A,
        conversationId,
        assistantMessageId: asstId,
      }),
    );
    const after = await repo.getMessages(ACCT_A, conversationId);
    expect(after).toHaveLength(2);
    expect(after[1]!.id).toBe(asstId);
  });

  it("replaces another running hydrate instead of 409 (VOICE-BR-5)", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-replace-hydrate";
    const asstId = await seed(ACCT_A, conversationId, THIN_VOICE);
    hydrate.setHydrateRunning(conversationId, asstId);
    const firstSignal = hydrate.getHydrateSignal(conversationId);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "running" });
    expect(res.status).not.toBe(409);
    expect(compile.runVoiceCompile).toHaveBeenCalledTimes(1);
    expect(firstSignal).toBeDefined();
    expect(firstSignal!.aborted).toBe(true);
    expect(hydrate.getHydrate(conversationId)?.status).toBe("running");
  });
});

describe("POST /api/voice/hydrate — 404 not a voice-origin card the caller owns (VOICE-AC-3.1)", () => {
  it("returns 401 for a guest (VOICE-BR-6)", async () => {
    ensureLoaded();
    guest();
    const res = await post({
      conversation_id: "c",
      assistant_message_id: "m",
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe(
      "sign_in_required",
    );
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation belongs to another account", async () => {
    ensureLoaded();
    signedIn(ACCT_B);
    const conversationId = "conv-foreign";
    const asstId = await seed(ACCT_A, conversationId, THIN_VOICE);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(404);
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
  });

  it("returns 404 when the message is not a voice-origin card", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-chat-card";
    const asstId = await seed(ACCT_A, conversationId, CHAT_CARD);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(404);
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
  });

  it("returns 404 when the voice card is already a full hydrated card (not thin/failed)", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-already-full";
    const asstId = await seed(ACCT_A, conversationId, FULL_VOICE);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(404);
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
  });

  it("returns 404 when the assistant message id is missing", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-missing-msg";
    await seed(ACCT_A, conversationId, THIN_VOICE);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: "00000000-0000-4000-8000-000000000099",
    });
    expect(res.status).toBe(404);
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
  });
});

describe("POST /api/voice/hydrate — 409 only for a real chat turn (VOICE-BR-5)", () => {
  it("returns 409 turn_in_progress when a REAL chat turn is running", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-real-turn";
    const asstId = await seed(ACCT_A, conversationId, THIN_VOICE);
    const started = startTurn({
      sessionId: conversationId,
      accountId: ACCT_A,
      ownerKey: `acct:${ACCT_A}`,
    });
    expect("turnId" in started).toBe(true);

    const res = await post({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        code: "turn_in_progress",
        turn_id: (started as { turnId: string }).turnId,
      }),
    );
    expect(compile.runVoiceCompile).not.toHaveBeenCalled();
  });
});

describe("GET /api/voice/hydrate — status (VOICE-AC-2.1, VOICE-AC-3.1)", () => {
  it("returns 401 for a guest (VOICE-BR-6)", async () => {
    ensureLoaded();
    guest();
    const res = await get({
      conversation_id: "c",
      assistant_message_id: "m",
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 { status: \"running\" } for an in-flight compile the caller owns", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-get-running";
    const asstId = await seed(ACCT_A, conversationId, THIN_VOICE);
    hydrate.setHydrateRunning(conversationId, asstId);

    const res = await get({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({ status: "running" }),
    );
  });

  it("returns 200 { status: \"failed\" } so Retry can be offered (VOICE-AC-3.1)", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-get-failed";
    const asstId = await seed(ACCT_A, conversationId, THIN_VOICE);
    hydrate.setHydrateFailed(conversationId, asstId);

    const res = await get({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("returns 404 when the card is not a voice-origin card the caller owns", async () => {
    ensureLoaded();
    signedIn(ACCT_A);
    const conversationId = "conv-get-chat";
    const asstId = await seed(ACCT_A, conversationId, CHAT_CARD);

    const res = await get({
      conversation_id: conversationId,
      assistant_message_id: asstId,
    });
    expect(res.status).toBe(404);
  });
});
