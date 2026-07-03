/**
 * Wire-format tests for the teams-assistant SSE sibling modules: the server
 * formatter (teams-assistant-sse-types) round-trips through the client parser
 * and stream reader (teams-assistant-sse-client), byte-compatible with the
 * chat route's framing.
 */
import { describe, it, expect } from "vitest";
import { formatTeamsAssistantSseEvent } from "@/lib/sse/teams-assistant-sse-types";
import {
  parseTeamsAssistantFrame,
  readTeamsAssistantSseStream,
} from "@/lib/sse/teams-assistant-sse-client";
import type { BuilderAnswer } from "@/agent/teams-assistant/schemas";

const answer: BuilderAnswer = {
  answer_markdown: "Use **Protect**.",
  team_patch: { slots: [] },
};

describe("formatTeamsAssistantSseEvent", () => {
  it("emits the chat route's exact frame shape", () => {
    expect(formatTeamsAssistantSseEvent("answer_delta", { text: "hi" })).toBe(
      'event: answer_delta\ndata: {"text":"hi"}\n\n',
    );
  });
});

describe("parseTeamsAssistantFrame", () => {
  it("round-trips every event type through the formatter", () => {
    const frames = [
      formatTeamsAssistantSseEvent("tool_activity", {
        tool: "get_learnset",
        label: "📖 Checking the learnset…",
      }),
      formatTeamsAssistantSseEvent("answer_start", {}),
      formatTeamsAssistantSseEvent("answer_delta", { text: "Use " }),
      formatTeamsAssistantSseEvent("answer", { answer }),
      formatTeamsAssistantSseEvent("error", {
        code: "agent_error",
        message: "boom",
      }),
    ];
    const parsed = frames.map((f) => parseTeamsAssistantFrame(f.trim()));
    expect(parsed.map((p) => p?.event)).toEqual([
      "tool_activity",
      "answer_start",
      "answer_delta",
      "answer",
      "error",
    ]);
    const terminal = parsed[3];
    if (terminal?.event !== "answer") throw new Error("expected answer");
    expect(terminal.data.answer.answer_markdown).toBe("Use **Protect**.");
  });

  it("ignores heartbeats, unknown events (incl. chat-only scope), and bad JSON", () => {
    expect(parseTeamsAssistantFrame(": keep-alive")).toBeNull();
    expect(
      parseTeamsAssistantFrame('event: scope\ndata: {"format":"champions"}'),
    ).toBeNull();
    expect(parseTeamsAssistantFrame("event: answer\ndata: {nope")).toBeNull();
    expect(parseTeamsAssistantFrame("data: {}")).toBeNull();
  });
});

describe("readTeamsAssistantSseStream", () => {
  it("yields events across chunk boundaries and flushes a trailing frame", async () => {
    const wire =
      formatTeamsAssistantSseEvent("answer_start", {}) +
      formatTeamsAssistantSseEvent("answer_delta", { text: "abc" }) +
      // Trailing frame WITHOUT the final \n\n (connection drop case).
      'event: answer\ndata: {"answer":{"answer_markdown":"abc"}}';
    const bytes = new TextEncoder().encode(wire);
    // Split mid-frame to exercise buffering.
    const chunks = [bytes.slice(0, 25), bytes.slice(25, 60), bytes.slice(60)];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });

    const seen: string[] = [];
    let terminal: BuilderAnswer | null = null;
    for await (const event of readTeamsAssistantSseStream(body)) {
      seen.push(event.event);
      if (event.event === "answer") terminal = event.data.answer;
    }
    expect(seen).toEqual(["answer_start", "answer_delta", "answer"]);
    expect(terminal?.answer_markdown).toBe("abc");
  });
});
