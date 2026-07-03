/**
 * Unit test for `runWithProvider`'s HOOKS SEAM (`AnswerRunHooks<TAnswer>`) —
 * proves an alternate agent (the team-builder assistant is the first
 * consumer) can swap in its own tool list, submit tool, answer schema, system
 * prompt, and domain validation WITHOUT the loop's mechanics changing.
 * Companion to runtime.test.ts, which pins `DEFAULT_OAK_HOOKS` (the original
 * OakAnswer behavior) byte-for-byte via the Anthropic-client-scripted seam
 * (`runOakWith`); this file drives `runWithProvider` directly against a
 * minimal fake {@link LLMProvider} (the provider-neutral seam itself) with a
 * CUSTOM hooks object, so it never touches DEFAULT_OAK_HOOKS at all.
 *
 * `@/agent/tools` / `@/agent/enrich-answer` / `@/server/teams/validate-team`
 * are mocked exactly like runtime.test.ts: importing `./runtime` always pulls
 * those in for DEFAULT_OAK_HOOKS's module-load wiring (unconditionally, even
 * though this test never exercises that path), and the real tool barrel must
 * never open a Postgres pool in a unit test.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/agent/tools", () => ({ tools: [], dispatch: vi.fn() }));
vi.mock("@/agent/enrich-answer", () => ({
  enrichAnswer: async (answer: unknown) => answer,
}));
vi.mock("@/server/teams/validate-team", () => ({
  validateTeamDetailed: vi.fn(async () => ({
    warnings: [],
    legalMoves: new Map(),
    legalAbilities: new Map(),
  })),
  isHardViolation: () => false,
}));

import { runWithProvider, type AnswerRunHooks } from "./runtime";
import type { AgentContext } from "@/agent/types";
import type {
  FinalTurn,
  LLMProvider,
  ProviderStream,
  ProviderStreamEvent,
  TurnRequest,
} from "@/agent/providers/types";
import { submitBuilderAnswerTool } from "@/agent/tools/submit-builder-answer";
import {
  builderAnswerSchema,
  type BuilderAnswer,
} from "@/agent/teams-assistant/schemas";

/** A minimal, fully scripted LLMProvider: one turn, one tool call, one chunk. */
function buildFakeProvider(toolName: string, input: unknown) {
  const inputJson = JSON.stringify(input);
  const streamTurn = vi.fn<(req: TurnRequest) => ProviderStream>(() => {
    const events: ProviderStreamEvent[] = [
      { type: "tool_call_start", index: 0, id: "b1", name: toolName },
      { type: "tool_call_args_delta", index: 0, argChunk: inputJson },
      { type: "tool_call_stop", index: 0 },
    ];
    const final: FinalTurn = {
      assistantContentToEcho: { role: "assistant", echoedTool: toolName },
      toolCalls: [{ id: "b1", name: toolName, inputJson, input }],
      usage: { inputTokens: 1, outputTokens: 1, thinkingTokens: 0 },
    };
    return {
      async *[Symbol.asyncIterator]() {
        for (const e of events) yield e;
      },
      final: () => Promise.resolve(final),
    };
  });

  const provider: LLMProvider = {
    kind: "anthropic",
    apiModelId: "fake-builder-model",
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

const ctx = {
  db: {},
  requestId: "hooks-test",
  mode: "standard",
  logger: { info: vi.fn(), bindings: () => ({}) },
} as unknown as AgentContext;

describe("runWithProvider — custom AnswerRunHooks are honored end-to-end", () => {
  it("drives a submit_builder_answer turn using ONLY the custom hooks (tools, system, schema, streaming)", async () => {
    const { provider, streamTurn } = buildFakeProvider("submit_builder_answer", {
      answer_markdown: "hi",
    });

    const dispatchSpy = vi.fn(() => {
      throw new Error(
        "dispatch must never be called — no non-submit tool was invoked this turn",
      );
    });
    const buildSystemSpy = vi.fn(() => [
      { text: "MARKER_SYSTEM_SEGMENT" },
      { text: "few-shot", cacheBreakpoint: true },
    ]);

    const hooks: AnswerRunHooks<BuilderAnswer> = {
      tools: [submitBuilderAnswerTool],
      dispatch: dispatchSpy,
      submitToolName: "submit_builder_answer",
      answerSchema: builderAnswerSchema,
      buildSystem: buildSystemSpy,
      validateAnswer: async () => ({ ok: true }),
      synthesizeInsufficient: () => ({ answer_markdown: "insufficient" }),
      synthesizeFromProse: (prose) => ({ answer_markdown: prose }),
      emptyTurnNudge: "empty turn nudge",
      submitNudge: "submit nudge",
    };

    const starts: number[] = [];
    const deltas: string[] = [];
    const onProgress = vi.fn();

    const result = await runWithProvider(
      provider,
      "help me build a team",
      [],
      ctx,
      onProgress,
      () => starts.push(1),
      (text) => deltas.push(text),
      hooks,
    );

    // The builder answer came back verbatim — the loop never touched
    // DEFAULT_OAK_HOOKS's OakAnswer machinery.
    expect(result).toEqual({ answer_markdown: "hi" });
    expect(dispatchSpy).not.toHaveBeenCalled();

    // The CUSTOM system builder ran (not the default Oak prompt assembly),
    // and the provider actually received those exact segments.
    expect(buildSystemSpy).toHaveBeenCalledWith(provider.kind, ctx);
    const req = streamTurn.mock.calls[0]![0] as TurnRequest;
    expect(req.system.some((s) => s.text === "MARKER_SYSTEM_SEGMENT")).toBe(
      true,
    );

    // ONLY the builder tool defs were offered to the model — not the main
    // agent's 17-tool barrel.
    expect(req.tools).toHaveLength(1);
    expect(req.tools.map((t) => t.name)).toEqual(["submit_builder_answer"]);

    // Streaming callbacks fired for the submit_builder_answer arg stream.
    expect(starts).toHaveLength(1);
    expect(deltas.join("")).toBe("hi");
  });
});
