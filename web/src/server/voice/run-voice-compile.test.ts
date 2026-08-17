/**
 * Tests for `runVoiceCompile` (ADR-7, Phase 4). Mock provider — no live model.
 * Success overwrites the SAME assistant row via `updateAssistantAnswer`;
 * fail leaves the thin card + hydrate failed; abort mid-flight does not write;
 * compile is not a second user/assistant pair. Tools = `submit_answer` only;
 * thinking off. Compile output is forced to keep `origin: "voice"`.
 *
 * Importing `@/server/voice/run-voice-compile` is the intended red until P4
 * lands the module.
 */

import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const factory = vi.hoisted(() => ({
  providerFor: vi.fn(),
  activeModelKey: vi.fn(async () => "grok-4.6" as const),
  isModelConfigured: vi.fn(() => true),
}));
vi.mock("@/agent/providers/factory", () => factory);

import { oakAnswerSchema, type OakAnswer } from "@/agent/schemas";
import type {
  FinalTurn,
  LLMProvider,
  ProviderStream,
  ProviderStreamEvent,
  TurnRequest,
} from "@/agent/providers/types";
import {
  createPgSchema,
  installAsSingleton,
  type PgFixture,
} from "../../../test/support/pg";

const ACCT = "acct-voice-compile";
const THIN_TEXT = "Jolly maximizes its Speed.";
const FULL_TEXT = "Jolly is the usual Speed nature for Garchomp.";
const VOICE_DISCLAIMER =
  "This answer was spoken in voice mode, so it carries no structured " +
  "citations or inferences.";

const THIN: OakAnswer = {
  status: "answered",
  answer_markdown: THIN_TEXT,
  reasoning_markdown: VOICE_DISCLAIMER,
  citations: [],
  inferences: [],
  generation_basis: { generation: "champions", fallback: false },
  origin: "voice",
};

const FULL: OakAnswer = {
  status: "answered",
  answer_markdown: FULL_TEXT,
  reasoning_markdown: "Looked up the nature chart and Garchomp's Speed role.",
  citations: [{ source: "nature index", detail: "Jolly +Spe −SpA" }],
  inferences: [],
  generation_basis: { generation: "champions", fallback: false },
};

let fix: PgFixture;
let repo: typeof import("@/data/repos/conversation-repo");
let compile: typeof import("./run-voice-compile");
let hydrate: typeof import("./hydrate-store");
let traces: typeof import("./tool-trace-store");
let loadError: unknown = null;

beforeAll(async () => {
  try {
    fix = await createPgSchema({ seed: "none" });
    await installAsSingleton(fix);
    repo = await import("@/data/repos/conversation-repo");
    compile = await import("./run-voice-compile");
    hydrate = await import("./hydrate-store");
    traces = await import("./tool-trace-store");
  } catch (e) {
    loadError = e;
  }
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  if (loadError) return;
  await fix.db.execute(
    sql`TRUNCATE TABLE conversation, conversation_message RESTART IDENTITY`,
  );
  factory.providerFor.mockReset();
  factory.activeModelKey.mockReset();
  factory.activeModelKey.mockResolvedValue("grok-4.6");
  factory.isModelConfigured.mockReturnValue(true);
  hydrate._resetStoreForTests();
  traces._resetStoreForTests();
});

afterEach(() => {
  if (loadError) return;
  hydrate._resetStoreForTests();
  traces._resetStoreForTests();
});

function ensureLoaded(): void {
  if (loadError) {
    throw new Error(`runVoiceCompile not loadable: ${String(loadError)}`);
  }
}

function submitStream(
  input: unknown,
  opts?: {
    hang?: Promise<void>;
    onRequest?: (req: TurnRequest) => void;
  },
): { provider: LLMProvider; streamTurn: ReturnType<typeof vi.fn> } {
  const inputJson = JSON.stringify(input);
  const streamTurn = vi.fn<(req: TurnRequest) => ProviderStream>((req) => {
    opts?.onRequest?.(req);
    const events: ProviderStreamEvent[] = [
      { type: "tool_call_start", index: 0, id: "sa1", name: "submit_answer" },
      { type: "tool_call_args_delta", index: 0, argChunk: inputJson },
      { type: "tool_call_stop", index: 0 },
    ];
    const final: FinalTurn = {
      assistantContentToEcho: { role: "assistant", name: "submit_answer" },
      toolCalls: [
        { id: "sa1", name: "submit_answer", inputJson, input },
      ],
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        thinkingTokens: 0,
        cachedTokens: 0,
      },
    };
    return {
      async *[Symbol.asyncIterator]() {
        if (opts?.hang) await opts.hang;
        for (const e of events) yield e;
      },
      async final() {
        if (opts?.hang) await opts.hang;
        return final;
      },
    };
  });

  const provider: LLMProvider = {
    kind: "xai",
    apiModelId: "fake-voice-compile",
    createTranscript: (history, message) => [
      ...history,
      { role: "user", content: message },
    ],
    streamTurn,
    buildUserMessage: (text) => ({ role: "user", content: text }),
    buildToolResultMessages: (results) =>
      results.map((r) => ({ role: "tool", ...r })),
  };
  return { provider, streamTurn };
}

async function seedThin(conversationId: string): Promise<{
  userId: string;
  asstId: string;
}> {
  const userId = repo.newTurnId();
  const asstId = repo.newTurnId();
  await repo.appendTurnPair({
    accountId: ACCT,
    conversationId,
    format: "champions",
    userTurnId: userId,
    userMessage: "What's Garchomp's best nature?",
    assistantTurnId: asstId,
    answer: THIN,
    now: Date.now(),
  });
  return { userId, asstId };
}

async function run(conversationId: string, asstId: string): Promise<void> {
  await compile.runVoiceCompile({
    accountId: ACCT,
    conversationId,
    assistantMessageId: asstId,
    sessionId: conversationId,
    userText: "What's Garchomp's best nature?",
    assistantText: THIN_TEXT,
    format: "champions",
  });
}

describe("runVoiceCompile — same-row success (VOICE-US-1, VOICE-AC-1.1, VOICE-AC-2.2, VOICE-BR-2)", () => {
  it("overwrites the SAME assistant message id via updateAssistantAnswer; not a second pair", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-ok";
    const { userId, asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);

    const { provider } = submitStream(FULL);
    factory.providerFor.mockReturnValue(provider);

    await run(conversationId, asstId);

    const after = await repo.getMessages(ACCT, conversationId);
    expect(after).toHaveLength(2);
    expect(after.map((t) => [t.seq, t.role, t.id])).toEqual([
      [0, "user", userId],
      [1, "assistant", asstId],
    ]);
    expect(after[1]!.textContent).toBe(FULL_TEXT);
    const parsed = oakAnswerSchema.parse(JSON.parse(after[1]!.answerJson!));
    expect(parsed.answer_markdown).toBe(FULL_TEXT);
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.reasoning_markdown).toContain("nature chart");
    expect(hydrate.getHydrate(conversationId)).toBeUndefined();
  });

  it("forces origin: \"voice\" on compile output even if the model omitted it (VOICE-AC-1.2)", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-origin";
    const { asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);

    expect(FULL.origin).toBeUndefined();
    const { provider } = submitStream(FULL);
    factory.providerFor.mockReturnValue(provider);

    await run(conversationId, asstId);

    const after = await repo.getMessages(ACCT, conversationId);
    const parsed = oakAnswerSchema.parse(JSON.parse(after[1]!.answerJson!));
    expect(parsed.origin).toBe("voice");
  });
});

describe("runVoiceCompile — tools + thinking (ADR-7)", () => {
  it("tools = submit_answer only; thinking is off (ADR-7)", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-tools";
    const { asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);

    let captured: TurnRequest | undefined;
    const { provider, streamTurn } = submitStream(FULL, {
      onRequest: (req) => {
        captured = req;
      },
    });
    factory.providerFor.mockReturnValue(provider);

    await run(conversationId, asstId);

    expect(streamTurn).toHaveBeenCalled();
    expect(captured).toBeDefined();
    expect(captured!.tools.map((t) => t.name)).toEqual(["submit_answer"]);
    const effort = (captured as TurnRequest & { effort?: string }).effort ?? "none";
    const thinking = (captured as TurnRequest & { thinking?: unknown }).thinking;
    expect(effort).toBe("none");
    expect(thinking === undefined || thinking === false || thinking === "off").toBe(
      true,
    );
  });

  it("feeds the in-process tool-trace into the compile turn (ADR-7, ADR-8)", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-trace";
    const { asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);
    traces.appendVoiceTrace(conversationId, {
      name: "get_move",
      input: { name: "earthquake" },
      output: { found: true, display_name: "Earthquake" },
    });

    let captured: TurnRequest | undefined;
    const { provider } = submitStream(FULL, {
      onRequest: (req) => {
        captured = req;
      },
    });
    factory.providerFor.mockReturnValue(provider);

    await run(conversationId, asstId);

    const blob =
      JSON.stringify(captured?.system) + JSON.stringify(captured?.transcript);
    expect(blob).toMatch(/get_move|earthquake/i);
  });
});

describe("runVoiceCompile — fail leaves thin card (VOICE-US-3, VOICE-AC-3.1, VOICE-AC-3.2, VOICE-BR-4)", () => {
  it("leaves the thin spoken card and sets hydrate failed; no invented structure", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-fail";
    const { userId, asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);

    factory.providerFor.mockReturnValue({
      kind: "xai",
      apiModelId: "fake-voice-compile",
      createTranscript: () => [],
      streamTurn: () => {
        throw new Error("model error");
      },
      buildUserMessage: (text: string) => ({ role: "user", content: text }),
      buildToolResultMessages: () => [],
    } satisfies LLMProvider);

    await compile
      .runVoiceCompile({
        accountId: ACCT,
        conversationId,
        assistantMessageId: asstId,
        sessionId: conversationId,
        userText: "What's Garchomp's best nature?",
        assistantText: THIN_TEXT,
        format: "champions",
      })
      .catch(() => undefined);

    const after = await repo.getMessages(ACCT, conversationId);
    expect(after).toHaveLength(2);
    expect(after.map((t) => t.id)).toEqual([userId, asstId]);
    expect(after[1]!.textContent).toBe(THIN_TEXT);
    const parsed = oakAnswerSchema.parse(JSON.parse(after[1]!.answerJson!));
    expect(parsed.answer_markdown).toBe(THIN_TEXT);
    expect(parsed.citations).toEqual([]);
    expect(parsed.origin).toBe("voice");
    expect(hydrate.getHydrate(conversationId)).toEqual({
      assistant_message_id: asstId,
      status: "failed",
    });
  });

  it("does not automatically retry after a compile failure (VOICE-AC-3.3)", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-no-loop";
    const { asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);

    const streamTurn = vi.fn(() => {
      throw new Error("timeout");
    });
    factory.providerFor.mockReturnValue({
      kind: "xai",
      apiModelId: "fake-voice-compile",
      createTranscript: () => [],
      streamTurn,
      buildUserMessage: (text: string) => ({ role: "user", content: text }),
      buildToolResultMessages: () => [],
    } satisfies LLMProvider);

    await compile
      .runVoiceCompile({
        accountId: ACCT,
        conversationId,
        assistantMessageId: asstId,
        sessionId: conversationId,
        userText: "What's Garchomp's best nature?",
        assistantText: THIN_TEXT,
        format: "champions",
      })
      .catch(() => undefined);

    expect(streamTurn).toHaveBeenCalledTimes(1);
    expect(hydrate.getHydrate(conversationId)?.status).toBe("failed");
  });
});

describe("runVoiceCompile — abort mid-flight does not write (VOICE-BR-5)", () => {
  it("abortVoiceCompile during compile leaves the thin card unchanged", async () => {
    ensureLoaded();
    const conversationId = "conv-compile-abort";
    const { asstId } = await seedThin(conversationId);
    hydrate.setHydrateRunning(conversationId, asstId);

    let release!: () => void;
    const hang = new Promise<void>((r) => {
      release = r;
    });
    let sawRequest = false;
    const { provider } = submitStream(FULL, {
      hang,
      onRequest: () => {
        sawRequest = true;
      },
    });
    factory.providerFor.mockReturnValue(provider);

    const pending = compile.runVoiceCompile({
      accountId: ACCT,
      conversationId,
      assistantMessageId: asstId,
      sessionId: conversationId,
      userText: "What's Garchomp's best nature?",
      assistantText: THIN_TEXT,
      format: "champions",
    });

    for (let i = 0; i < 200 && !sawRequest; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    hydrate.abortVoiceCompile(conversationId);
    release();
    await pending.catch(() => undefined);

    const after = await repo.getMessages(ACCT, conversationId);
    expect(after).toHaveLength(2);
    expect(after[1]!.id).toBe(asstId);
    expect(after[1]!.textContent).toBe(THIN_TEXT);
    const parsed = oakAnswerSchema.parse(JSON.parse(after[1]!.answerJson!));
    expect(parsed.answer_markdown).toBe(THIN_TEXT);
    expect(parsed.citations).toEqual([]);
  });
});
