/**
 * SSE client hook for `POST /api/teams/assistant` — the builder-panel
 * counterpart of ./sse-client.ts (same manual TextDecoder + `\n\n` frame
 * splitting, NOT EventSource), against the builder event map. A deliberate
 * SIBLING of the chat hook: that module's parser/state are hardcoded to the
 * chat route's event union (its `answer` is an OakAnswer), so the builder gets
 * its own, much leaner hook (no scope events, no image previews, no
 * retry/visibility machinery — the panel is a focused side surface).
 *
 * Exports for unit tests:
 *   parseTeamsAssistantFrame(frame)  — pure frame → event parser
 *   readTeamsAssistantSseStream(body) — async generator over the byte stream
 */
"use client";

import { useCallback, useRef, useState } from "react";
import type { BuilderAnswer } from "@/agent/teams-assistant/schemas";
import type {
  BuilderAnswerEvent,
  TeamsAssistantDraft,
  TeamsAssistantRequestBody,
  TeamsAssistantSseEvent,
  TeamsAssistantSseEventName,
} from "@/lib/sse/teams-assistant-sse-types";
import type {
  AnswerDeltaEvent,
  AnswerStartEvent,
  ErrorEvent,
  ToolActivityEvent,
} from "@/lib/sse/sse-types";

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Parse one SSE frame into a typed builder event (null ⇒ ignore the frame). */
export function parseTeamsAssistantFrame(
  frame: string,
): TeamsAssistantSseEvent | null {
  let eventName: string | null = null;
  let dataLine: string | null = null;

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      if (dataLine === null) {
        dataLine = line.slice("data:".length).trim();
      }
    }
  }

  if (eventName === null || dataLine === null) return null;

  let data: unknown;
  try {
    data = JSON.parse(dataLine);
  } catch {
    return null;
  }

  switch (eventName as TeamsAssistantSseEventName) {
    case "tool_activity":
      return { event: "tool_activity", data: data as ToolActivityEvent };
    case "answer_start":
      return { event: "answer_start", data: data as AnswerStartEvent };
    case "answer_delta":
      return { event: "answer_delta", data: data as AnswerDeltaEvent };
    case "answer":
      return { event: "answer", data: data as BuilderAnswerEvent };
    case "error":
      return { event: "error", data: data as ErrorEvent };
    default:
      return null;
  }
}

/** Async generator over a fetch body's SSE frames (split on `\n\n`). */
export async function* readTeamsAssistantSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<TeamsAssistantSseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed) continue;
        const parsed = parseTeamsAssistantFrame(trimmed);
        if (parsed !== null) yield parsed;
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const parsed = parseTeamsAssistantFrame(trailing);
      if (parsed !== null) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/** One committed exchange in the panel's thread. */
export interface AssistantTurn {
  id: number;
  user: string;
  /** Null while this turn is still streaming. */
  answer: BuilderAnswer | null;
}

export type AssistantStatus = "idle" | "thinking" | "error";

export interface UseTeamsAssistantReturn {
  turns: AssistantTurn[];
  status: AssistantStatus;
  /** Latest tool-activity label while thinking (or null). */
  activity: string | null;
  /** Incrementally streamed answer_markdown for the in-flight turn. */
  streamingMarkdown: string;
  /** Transport-fault message (in-domain failures ride a normal answer). */
  error: string | null;
  /** Send one turn. No-ops while a turn is already in flight. */
  send: (message: string, draft: TeamsAssistantDraft) => Promise<void>;
  /** Drop the thread (e.g. when the panel switches to a different team). */
  reset: () => void;
}

export function useTeamsAssistant(): UseTeamsAssistantReturn {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [activity, setActivity] = useState<string | null>(null);
  const [streamingMarkdown, setStreamingMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);

  // One in-memory conversation per mounted panel (server keeps history under
  // this id, namespaced; a remount starts a fresh thread by design).
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ta-${Math.random().toString(36).slice(2)}`,
  );
  const inFlightRef = useRef(false);
  const nextIdRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    inFlightRef.current = false;
    sessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ta-${Math.random().toString(36).slice(2)}`;
    setTurns([]);
    setStatus("idle");
    setActivity(null);
    setStreamingMarkdown("");
    setError(null);
  }, []);

  const send = useCallback(
    async (message: string, draft: TeamsAssistantDraft): Promise<void> => {
      if (inFlightRef.current) return;
      const text = message.trim();
      if (!text) return;

      inFlightRef.current = true;
      const id = nextIdRef.current++;
      const controller = new AbortController();
      abortRef.current = controller;

      setTurns((prev) => [...prev, { id, user: text, answer: null }]);
      setStatus("thinking");
      setActivity(null);
      setStreamingMarkdown("");
      setError(null);

      const body: TeamsAssistantRequestBody = {
        session_id: sessionIdRef.current,
        message: text,
        draft,
      };

      try {
        const res = await fetch("/api/teams/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let message = "The assistant is unavailable right now.";
          try {
            const payload = (await res.json()) as { message?: string };
            if (payload.message) message = payload.message;
          } catch {
            // Non-JSON error body — keep the generic message.
          }
          throw new Error(message);
        }

        let terminal: BuilderAnswer | null = null;
        let transportError: string | null = null;

        for await (const event of readTeamsAssistantSseStream(
          res.body,
          controller.signal,
        )) {
          if (event.event === "tool_activity") {
            setActivity(event.data.label);
          } else if (event.event === "answer_start") {
            setStreamingMarkdown("");
          } else if (event.event === "answer_delta") {
            setStreamingMarkdown((prev) => prev + event.data.text);
          } else if (event.event === "answer") {
            terminal = event.data.answer;
          } else {
            transportError = event.data.message;
          }
        }

        if (terminal !== null) {
          const answer = terminal;
          setTurns((prev) =>
            prev.map((t) => (t.id === id ? { ...t, answer } : t)),
          );
          setStatus("idle");
        } else {
          throw new Error(
            transportError ?? "The stream ended without an answer.",
          );
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Panel reset / unmount — drop silently.
          return;
        }
        // Drop the half-finished turn so a retry re-sends cleanly.
        setTurns((prev) => prev.filter((t) => t.id !== id));
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        inFlightRef.current = false;
        setActivity(null);
        setStreamingMarkdown("");
      }
    },
    [],
  );

  return { turns, status, activity, streamingMarkdown, error, send, reset };
}
