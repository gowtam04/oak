/**
 * SSE client hook — the frontend counterpart of `POST /api/chat`.
 *
 * Sends a chat request via `fetch POST`, then reads the response body as an
 * SSE stream using a **manual TextDecoder + ReadableStream reader** (NOT
 * EventSource — per the risk directive). Frames are split on `\n\n`.
 *
 * Wire format emitted by the route (design.md § API Design; background-turns
 * §4 adds the `turn` and `stopped` frames):
 *   event: turn            data: { turn_id }          (exactly one; FIRST frame
 *                                                      of both the POST stream and
 *                                                      the resume stream — BT-2)
 *   event: scope           data: { format, source }   (exactly one; GS-C)
 *   event: tool_activity   data: { tool, label }     (zero or more; progress)
 *   event: answer_start    data: {}                  (zero or more; buffer reset)
 *   event: answer_delta    data: { text }            (zero or more; prose chunk)
 *   event: answer          data: { answer }           (terminal)
 *   event: error           data: { code, message }    (terminal — transport only)
 *   event: stopped         data: {}                  (terminal — explicit stop)
 *
 * IMPORTANT: every in-domain failure (resolution_failed, clarification_needed,
 * insufficient_data) arrives as a normal `answer` event — it is NEVER surfaced
 * as an `error` event. Check `answer.status` to distinguish success from an
 * in-domain failure.
 *
 * Background turns (background-turns/design.md §6.1): a turn is a durable
 * SERVER object, so the SSE connection is a droppable/reattachable SUBSCRIPTION,
 * not the turn's lifetime. The hook captures the `turn_id` (first frame), can
 * `resume(turnId)` a running turn's live stream through the SAME consume loop
 * (the server replays the full buffer, then tails), and `stop()`s a turn via an
 * explicit endpoint call. The old whole-turn auto-re-POST retry machinery is
 * GONE — reattach (idempotent by construction) replaces it.
 *
 * Exports for unit tests:
 *   parseFrame(frame)    — pure frame → SseEvent parser
 *   readSseStream(body)  — async generator over a ReadableStream<Uint8Array>
 *
 * React hook:
 *   useSseClient()       — manages fetch + stream lifecycle + React state
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OakAnswer } from "@/agent/schemas";
import type {
  AnswerDeltaEvent,
  AnswerEvent,
  AnswerStartEvent,
  ChatRequestBody,
  ErrorEvent,
  ScopeEvent,
  SseEvent,
  SseEventName,
  StoppedEvent,
  ToolActivityEvent,
  TurnEvent,
} from "@/lib/sse/sse-types";

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Parse one SSE frame (the text segment between two `\n\n` separators) into a
 * typed `SseEvent`.
 *
 * Returns `null` for:
 *   - frames that have no `event:` field (comment-only / heartbeat / unknown),
 *   - frames that have no `data:` field,
 *   - frames whose `data:` is not valid JSON,
 *   - frames whose event name is not one the endpoint emits.
 *
 * The route always sends a single `event:` line and a single `data:` line per
 * frame (via `formatSseEvent`), so multi-line `data:` concatenation is not
 * required.
 */
export function parseFrame(frame: string): SseEvent | null {
  let eventName: string | null = null;
  let dataLine: string | null = null;

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      // Take the first data line found (server always sends exactly one).
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

  // Only the event names this endpoint emits are accepted.
  switch (eventName as SseEventName) {
    case "turn":
      return { event: "turn", data: data as TurnEvent };
    case "scope":
      return { event: "scope", data: data as ScopeEvent };
    case "tool_activity":
      return { event: "tool_activity", data: data as ToolActivityEvent };
    case "answer_start":
      return { event: "answer_start", data: data as AnswerStartEvent };
    case "answer_delta":
      return { event: "answer_delta", data: data as AnswerDeltaEvent };
    case "answer":
      return { event: "answer", data: data as AnswerEvent };
    case "error":
      return { event: "error", data: data as ErrorEvent };
    case "stopped":
      return { event: "stopped", data: data as StoppedEvent };
    default:
      return null;
  }
}

/**
 * Async generator that reads a `ReadableStream<Uint8Array>` and yields parsed
 * `SseEvent` objects one at a time, splitting the byte stream on `\n\n`.
 *
 * This is the pure stream-processing layer. The React hook (`useSseClient`)
 * wraps it with state management. Exporting it separately makes it unit-
 * testable in the Node environment without React.
 *
 * @param body    The response body from a `fetch` call to `POST /api/chat`.
 * @param signal  Optional AbortSignal; iteration stops when aborted.
 */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on the SSE frame separator. The last element after the split may
      // be an incomplete frame — keep it in the buffer until more bytes arrive.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed) continue;
        const parsed = parseFrame(trimmed);
        if (parsed !== null) yield parsed;
      }
    }

    // Flush any trailing data (server closed without a trailing \n\n — rare
    // but possible on connection drops mid-stream).
    const trailing = buffer.trim();
    if (trailing) {
      const parsed = parseFrame(trailing);
      if (parsed !== null) yield parsed;
    }
  } finally {
    // Always release the lock so the stream can be consumed again if needed.
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// React hook state types
// ---------------------------------------------------------------------------

/** Lifecycle status of the current (or most recent) SSE request. */
export type SseClientStatus = "idle" | "thinking" | "done" | "error";

export interface SseClientState {
  /** Lifecycle status of the current turn. */
  status: SseClientStatus;
  /**
   * The server-minted turn id for the current turn (background-turns/design.md
   * §4 / BT-2), captured from the `turn` event — the FIRST frame of both the
   * POST stream and a resume stream. `null` before that frame lands, and after a
   * terminal `stopped` / a `reset` / a fresh `send` (until the next turn frame).
   * The hosting component records this as the conversation's PENDING turn so it
   * can reattach (`resume`) after navigating away and back, and target `stop`.
   */
  turnId: string | null;
  /**
   * The server-resolved game scope for the current turn, from the single
   * `scope` event the route emits first (before any tool activity). `null`
   * until that frame lands (and on a fresh `send`, or a transport error that
   * precedes it). Carries the resolved `format` and the `source` that decided
   * it (an in-message signal, the conversation's sticky scope, or the
   * `champions_mode` toggle seed) — the scope chip renders from this, so a
   * server override of the toggle is visible rather than silently applied.
   */
  scope: ScopeEvent | null;
  /**
   * Tool-activity progress events accumulated for the current turn (cleared on
   * each `send` call). Used by the progress UI while the agent loop runs.
   */
  activities: ToolActivityEvent[];
  /**
   * The terminal `OakAnswer` for the current turn, or `null` while the
   * request is in-flight or when there is a transport error.
   *
   * Check `answer.status` for in-domain failure kinds
   * (`resolution_failed`, `clarification_needed`, `insufficient_data`).
   */
  answer: OakAnswer | null;
  /**
   * Answer prose accumulated from `answer_delta` events for the in-flight turn.
   * Reset to "" on each `send` and on `answer_start` (a re-emitted answer), and
   * cleared when the terminal `answer` lands (the committed AnswerCard becomes
   * the single source of truth). Render this for token-by-token streaming.
   */
  streamingMarkdown: string;
  /**
   * Transport-level error (null unless `status === "error"`).
   * In-domain failures arrive in `answer`, not here.
   */
  error: ErrorEvent | null;
  /**
   * True only while an automatic REATTACH is in progress after a mid-stream
   * connection drop (phone screen turned off / suspended tab). The turn stays
   * in-flight server-side; the UI shows a "Reconnecting…" affordance instead of
   * a dead-end error. Cleared as soon as the reattached stream produces output
   * again (the server replays the buffer), or on a terminal answer/error/stopped.
   * A deliberate `resume` (host reopening a thread) does NOT set this — it is a
   * normal reattach, not a blip.
   */
  reconnecting: boolean;
}

const INITIAL_STATE: SseClientState = {
  status: "idle",
  turnId: null,
  scope: null,
  activities: [],
  answer: null,
  streamingMarkdown: "",
  error: null,
  reconnecting: false,
};

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseSseClientReturn extends SseClientState {
  /**
   * Send a new question to `POST /api/chat`. Any in-flight subscription is
   * dropped first (unsubscribe — the server keeps generating; see `reset`), so
   * only one stream is ever consumed at a time. The FIRST frame is the durable
   * turn's `turn_id` (captured into `turnId`). A 409 `turn_in_progress` response
   * (a turn already runs for this conversation) transparently REATTACHES to the
   * returned turn instead of surfacing an error (background-turns §6 / BT-5).
   *
   * Suggestion-chip and candidate-row follow-ups are plain `send` calls with the
   * same `session_id` — there is no special protocol (ux-design.md).
   */
  send: (body: ChatRequestBody) => void;
  /**
   * Reattach to a durable turn's live stream via
   * `GET /api/chat/turns/:id/stream` (background-turns §6.1). The server replays
   * the full buffered event list from the start, then tails live until a
   * terminal event — so "reattach mid-flight" and "reattach after completion"
   * are one code path (a completed turn's replay simply ends with its terminal
   * `answer`). Runs the SAME consume loop as `send`. `sessionId` is the guest
   * ownership key (`?session_id=`); harmless to include when signed-in. Used by
   * the host to resume a conversation's pending turn on reopen, and internally
   * on `visibilitychange`→visible / a mid-stream drop.
   */
  resume: (turnId: string, sessionId?: string) => void;
  /**
   * Explicitly STOP the current turn (background-turns §6 / BT-4): `POST
   * /api/chat/turns/:id/stop`, then tear down the local stream. Stopping is now
   * an explicit API call, no longer implied by a disconnect — a stopped turn is
   * discarded server-side (nothing persisted). The local teardown stands even if
   * the endpoint call fails.
   */
  stop: () => void;
  /**
   * Reset to `idle`, DROPPING the current subscription. With durable turns this
   * is a pure UNSUBSCRIBE — aborting the fetch no longer cancels the server-side
   * turn (only `stop` does), so `reset` is how the host detaches when switching
   * conversations / starting a new chat while a turn keeps running server-side.
   */
  reset: () => void;
  /**
   * Re-send the most recent turn (same message + images). A no-op once a turn
   * has succeeded/stopped (the retained body is released then); used by the
   * manual "Retry" affordance shown on a surfaced transport error or an
   * interrupted (resume-404) turn.
   */
  retry: () => void;
}

/**
 * useSseClient
 *
 * Client hook for `POST /api/chat` + the durable-turn reattach/stop protocol
 * (background-turns/design.md §6.1). Orchestrates fetch → manual SSE stream
 * parsing → React state updates.
 *
 * Usage:
 * ```tsx
 * const { status, activities, answer, error, send, reset } = useSseClient();
 *
 * // Send a question:
 * send({ session_id: "abc", message: "Which Fire-types learn Will-O-Wisp?" });
 *
 * // While status === "thinking", render activities[] as progress items.
 * // When status === "done", render <AnswerCard answer={answer} />.
 * // When status === "error", show a retry affordance.
 * ```
 */
/**
 * Bounded reattach attempts after a MID-STREAM connection drop (a clean EOF or
 * read throw with no terminal event, while a `turnId` is known). Small on
 * purpose: reattach is idempotent (the server replays the buffer), so a couple
 * of tries with a short backoff heals a transient blip; past that we surface the
 * interrupted affordance rather than hammer a genuinely dead turn. A `visible`
 * transition (screen back on) also fires an unconditional reattach — that path
 * is not budget-bounded because it is user-driven, not a retry loop.
 */
const MAX_REATTACHES = 2;
/** Base backoff between bounded mid-stream reattach attempts (×attempt number). */
const REATTACH_BACKOFF_MS = 500;

export function useSseClient(): UseSseClientReturn {
  const [state, setState] = useState<SseClientState>(INITIAL_STATE);

  // AbortController for the CURRENTLY-consumed stream. Aborting it unsubscribes
  // (drops the socket) — with durable turns that no longer cancels the server
  // turn, so it is safe to abort on send/resume/reset/stop.
  const abortRef = useRef<AbortController | null>(null);

  // ── Durable-turn bookkeeping (all refs so the mounted-once visibility
  // listener and the stable consume loop never read stale values) ───────────
  // The body of the most recent turn, retained for the manual Retry affordance.
  // Released on a terminal answer/stopped (nothing to retry then).
  const lastBodyRef = useRef<ChatRequestBody | null>(null);
  // The current turn's server-minted id (captured from the `turn` frame). Read
  // by the visibility listener + the drop-reattach path to know what to resume.
  const turnIdRef = useRef<string | null>(null);
  // The conversation/session id the current turn belongs to — the guest resume/
  // stop ownership key. Set on send (from the body) and on resume (from arg).
  const sessionIdRef = useRef<string | null>(null);
  // True once the current turn reached a terminal event (answer/error/stopped),
  // so neither the visibility listener nor a drop reattaches a finished turn.
  const terminalRef = useRef(false);
  // Bounded mid-stream reattach attempts spent on the current turn (reset on
  // real progress — any content frame — and on a fresh send/resume).
  const reattachCountRef = useRef(0);

  // Cross-references between the mutually-recursive stream helpers, held in refs
  // to break the useCallback dependency cycle (consume → reattach → resume →
  // consume). Each is kept in sync by a small effect below; all read only refs +
  // the stable `setState`, so their identities never need to change.
  const maybeReattachRef = useRef<(controller: AbortController) => boolean>(
    () => false,
  );
  const runResumeRef =
    useRef<
      (turnId: string, sessionId: string | null, c: AbortController) => void
    >(() => {});

  // Consume ONE open SSE stream (from a POST or a resume GET) into React state.
  // Shared by `runRequest` and `runResume` — the `turn` frame resets the
  // in-flight view so a resume rebuilds the UI from the replay exactly like a
  // live stream (background-turns §6.1). Stable (reads only refs + setState).
  const consumeStream = useCallback(
    async (
      response: Response,
      controller: AbortController,
    ): Promise<void> => {
      let sawTerminal = false;
      try {
        for await (const event of readSseStream(
          response.body as ReadableStream<Uint8Array>,
          controller.signal,
        )) {
          // Abort may fire mid-iteration; check before each state update.
          if (controller.signal.aborted) return;
          // Any CONTENT frame is real progress → refresh the drop-reattach
          // budget (a long stream with an occasional blip keeps recovering). The
          // bare `turn` id echo is not progress, so a turn that only ever
          // replays its id still exhausts the budget → interrupted.
          if (event.event !== "turn") reattachCountRef.current = 0;

          if (event.event === "turn") {
            // FIRST frame of both the POST and resume streams (BT-2). Capture the
            // id and RESET the in-flight view: on a fresh POST the buffers are
            // already empty; on a resume this discards the pre-drop partial so
            // the replay rebuilds it cleanly.
            turnIdRef.current = event.data.turn_id;
            terminalRef.current = false;
            setState((prev) => ({
              ...prev,
              turnId: event.data.turn_id,
              reconnecting: false,
              activities: [],
              streamingMarkdown: "",
            }));
          } else if (event.event === "scope") {
            // The turn's server-resolved game scope — always the first content
            // frame. Output has resumed → clear any "Reconnecting…" state too.
            setState((prev) => ({
              ...prev,
              reconnecting: false,
              scope: event.data,
            }));
          } else if (event.event === "tool_activity") {
            setState((prev) => ({
              ...prev,
              reconnecting: false,
              activities: [...prev.activities, event.data],
            }));
          } else if (event.event === "answer_start") {
            // A fresh submit_answer began streaming — reset the in-flight buffer
            // (drops a prior attempt that failed validation and is re-emitting).
            setState((prev) => ({
              ...prev,
              reconnecting: false,
              streamingMarkdown: "",
            }));
          } else if (event.event === "answer_delta") {
            setState((prev) => ({
              ...prev,
              reconnecting: false,
              streamingMarkdown: prev.streamingMarkdown + event.data.text,
            }));
          } else if (event.event === "answer") {
            // Terminal success (any answer.status — in-domain failures ride here).
            sawTerminal = true;
            terminalRef.current = true;
            lastBodyRef.current = null;
            setState((prev) => ({
              ...prev,
              status: "done",
              reconnecting: false,
              answer: event.data.answer,
              streamingMarkdown: "",
            }));
          } else if (event.event === "error") {
            // In-band transport fault — the connection was healthy enough to
            // deliver it, so it is a real model/agent fault; surface it. The
            // retained body stays so the manual Retry affordance can re-send.
            sawTerminal = true;
            terminalRef.current = true;
            setState((prev) => ({
              ...prev,
              status: "error",
              reconnecting: false,
              error: event.data,
            }));
          } else if (event.event === "stopped") {
            // Terminal stop (BT-4): the turn was explicitly stopped (by this
            // client or another subscriber). Discard the in-flight prose and
            // return to a clean idle — matching today's Stop semantics. Nothing
            // was persisted, so drop the retained body + turn id too.
            sawTerminal = true;
            terminalRef.current = true;
            lastBodyRef.current = null;
            turnIdRef.current = null;
            setState((prev) => ({
              ...prev,
              status: "idle",
              reconnecting: false,
              activities: [],
              streamingMarkdown: "",
              turnId: null,
            }));
          }
        }

        // The stream ended. A conformant server always emits a terminal event;
        // its absence means the socket closed (a dropped connection can return a
        // clean EOF instead of throwing). Reattach if we know the turn id;
        // otherwise fall back to `done` (defensive, pre-existing behavior).
        if (controller.signal.aborted) return;
        if (!sawTerminal) {
          if (maybeReattachRef.current(controller)) return;
          setState((prev) =>
            prev.status === "thinking"
              ? { ...prev, status: "done", reconnecting: false }
              : prev,
          );
        }
      } catch (streamError) {
        if (controller.signal.aborted) return;
        // A mid-stream read throw is a connection drop — reattach if we can.
        if (maybeReattachRef.current(controller)) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          reconnecting: false,
          error: {
            code: "stream_error",
            message:
              streamError instanceof Error
                ? streamError.message
                : "Stream read failed",
          },
        }));
      }
    },
    [],
  );

  // Reattach to `turnId`'s live stream (design §6.1). Fetch the resume endpoint,
  // then hand the body to the shared consume loop. A 404 means the turn is
  // unknown/expired → surface the interrupted affordance (manual Retry stays).
  const runResume = useCallback(
    async (
      turnId: string,
      sessionId: string | null,
      controller: AbortController,
    ): Promise<void> => {
      turnIdRef.current = turnId;
      sessionIdRef.current = sessionId;
      const qs = sessionId
        ? `?session_id=${encodeURIComponent(sessionId)}`
        : "";
      let response: Response;
      try {
        response = await fetch(
          `/api/chat/turns/${encodeURIComponent(turnId)}/stream${qs}`,
          { method: "GET", signal: controller.signal },
        );
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        if (maybeReattachRef.current(controller)) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          reconnecting: false,
          error: {
            code: "network_error",
            message:
              fetchError instanceof Error
                ? fetchError.message
                : "Network request failed",
          },
        }));
        return;
      }

      if (response.status === 404) {
        // Unknown/expired turn — the turn is gone (process restart, retention
        // sweep, or never existed). Surface the interrupted affordance; the
        // retained body (if any) still backs the manual Retry re-send (§6).
        terminalRef.current = true;
        turnIdRef.current = null;
        setState((prev) => ({
          ...prev,
          status: "error",
          reconnecting: false,
          turnId: null,
          error: {
            code: "turn_not_found",
            message: "This response was interrupted. Retry to ask again.",
            status: 404,
          },
        }));
        return;
      }

      if (!response.ok || !response.body) {
        // Other pre-stream error (e.g. 403 ownership). Surface the server's
        // JSON `{ code, message }` when present, else the raw HTTP status.
        let errorEvent = {
          code: `http_${response.status}`,
          message: `HTTP ${response.status} ${response.statusText}`,
        } as { code: string; message: string; status?: number };
        try {
          const data = (await response.json()) as {
            code?: unknown;
            message?: unknown;
          };
          if (
            typeof data?.code === "string" &&
            typeof data?.message === "string"
          ) {
            errorEvent = {
              code: data.code,
              message: data.message,
              status: response.status,
            };
          }
        } catch {
          /* non-JSON body — keep the http_<status> fallback */
        }
        setState((prev) => ({
          ...prev,
          status: "error",
          reconnecting: false,
          error: errorEvent,
        }));
        return;
      }

      await consumeStream(response, controller);
    },
    [consumeStream],
  );
  useEffect(() => {
    runResumeRef.current = (turnId, sessionId, controller) =>
      void runResume(turnId, sessionId, controller);
  }, [runResume]);

  // A mid-stream drop happened. If we still have an unresolved turn and budget,
  // fire a bounded, backed-off REATTACH (reconnecting: true → "Reconnecting…").
  // Returns true iff it took ownership (so the caller does not surface an error).
  const maybeReattach = useCallback(
    (currentController: AbortController): boolean => {
      const turnId = turnIdRef.current;
      if (
        turnId === null ||
        terminalRef.current ||
        currentController.signal.aborted ||
        reattachCountRef.current >= MAX_REATTACHES
      ) {
        return false;
      }
      reattachCountRef.current += 1;
      const controller = new AbortController();
      abortRef.current = controller;
      const sessionId = sessionIdRef.current;
      const backoff = REATTACH_BACKOFF_MS * reattachCountRef.current;
      setState((prev) => ({
        ...prev,
        status: "thinking",
        reconnecting: true,
      }));
      window.setTimeout(() => {
        if (controller.signal.aborted) return;
        runResumeRef.current(turnId, sessionId, controller);
      }, backoff);
      return true;
    },
    [],
  );
  useEffect(() => {
    maybeReattachRef.current = maybeReattach;
  }, [maybeReattach]);

  // One POST attempt: fetch → 409-reattach / HTTP errors → consume the stream.
  const runRequest = useCallback(
    async (
      body: ChatRequestBody,
      controller: AbortController,
    ): Promise<void> => {
      sessionIdRef.current = body.session_id;

      // ── Step 1: open the connection ────────────────────────────────────────
      let response: Response;
      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchError) {
        // An AbortError is expected when send/reset/stop fires — ignore it. A
        // pre-stream throw before any turn id means there is nothing to reattach
        // to (the server may or may not have started a turn — a manual retry
        // will 409→reattach if it did); surface a network error.
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          reconnecting: false,
          error: {
            code: "network_error",
            message:
              fetchError instanceof Error
                ? fetchError.message
                : "Network request failed",
          },
        }));
        return;
      }

      // ── Step 2a: 409 turn_in_progress → REATTACH (background-turns §6/BT-5) ─
      // A turn already runs for this conversation; the server hands back its id
      // so we subscribe to it instead of double-generating.
      if (response.status === 409) {
        let turnId: string | null = null;
        try {
          const data = (await response.json()) as {
            code?: unknown;
            turn_id?: unknown;
          };
          if (
            data?.code === "turn_in_progress" &&
            typeof data.turn_id === "string"
          ) {
            turnId = data.turn_id;
          }
        } catch {
          /* non-JSON 409 — fall through to the generic error path below */
        }
        if (turnId !== null) {
          reattachCountRef.current = 0;
          await runResume(turnId, body.session_id, controller);
          return;
        }
      }

      // ── Step 2b: other HTTP errors (413 / 429 too_many_turns / 503) ────────
      if (!response.ok || !response.body) {
        // Prefer the server's JSON `{ code, message }` so the UI shows a
        // meaningful, actionable error and can react to the code (e.g. auto-
        // revert the model). Fall back to the raw HTTP status for a non-JSON body.
        let errorEvent = {
          code: `http_${response.status}`,
          message: `HTTP ${response.status} ${response.statusText}`,
        } as { code: string; message: string; status?: number };
        try {
          const data = (await response.json()) as {
            code?: unknown;
            message?: unknown;
          };
          if (
            typeof data?.code === "string" &&
            typeof data?.message === "string"
          ) {
            errorEvent = {
              code: data.code,
              message: data.message,
              status: response.status,
            };
          }
        } catch {
          /* non-JSON body — keep the http_<status> fallback */
        }
        setState((prev) => ({
          ...prev,
          status: "error",
          reconnecting: false,
          error: errorEvent,
        }));
        return;
      }

      // ── Step 3: consume the SSE stream ─────────────────────────────────────
      await consumeStream(response, controller);
    },
    [consumeStream, runResume],
  );

  // Single page-visibility listener (mounted once). On return to the foreground
  // with an UNRESOLVED turn, reattach: abort any frozen read and start a clean
  // resume. The server replays the buffer, so this is idempotent even if the old
  // socket was actually still alive (background-turns §6.1). Screen-off no longer
  // arms an auto re-POST — reattach replaces the whole retry machinery.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") return;
      const turnId = turnIdRef.current;
      if (turnId === null || terminalRef.current) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      reattachCountRef.current = 0;
      setState((prev) => ({ ...prev, status: "thinking", reconnecting: true }));
      void runResume(turnId, sessionIdRef.current, controller);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [runResume]);

  const send = useCallback(
    (body: ChatRequestBody): void => {
      // Drop the previous subscription if still open (unsubscribe — the server
      // keeps any prior turn running; only `stop` cancels).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // New turn → reset per-turn bookkeeping.
      lastBodyRef.current = body;
      sessionIdRef.current = body.session_id;
      turnIdRef.current = null;
      terminalRef.current = false;
      reattachCountRef.current = 0;

      // Immediately transition to "thinking" and clear previous turn state.
      setState({
        status: "thinking",
        turnId: null,
        scope: null,
        activities: [],
        answer: null,
        streamingMarkdown: "",
        error: null,
        reconnecting: false,
      });

      void runRequest(body, controller);
    },
    [runRequest],
  );

  const resume = useCallback(
    (turnId: string, sessionId?: string): void => {
      // Drop any current subscription, then reattach to `turnId`. A deliberate
      // reattach (host reopening a thread) — status "thinking", not the
      // "Reconnecting…" blip state.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      turnIdRef.current = turnId;
      sessionIdRef.current = sessionId ?? null;
      terminalRef.current = false;
      reattachCountRef.current = 0;

      setState((prev) => ({
        ...prev,
        status: "thinking",
        turnId,
        scope: null,
        activities: [],
        answer: null,
        streamingMarkdown: "",
        error: null,
        reconnecting: false,
      }));

      void runResume(turnId, sessionId ?? null, controller);
    },
    [runResume],
  );

  const stop = useCallback((): void => {
    const turnId = turnIdRef.current;
    const sessionId = sessionIdRef.current;

    // Tear down the local subscription and finalize to idle immediately — this
    // stands even if the endpoint call below fails (design §6).
    abortRef.current?.abort();
    abortRef.current = null;
    terminalRef.current = true;
    reattachCountRef.current = 0;
    lastBodyRef.current = null;
    turnIdRef.current = null;
    setState((prev) => ({
      ...prev,
      status: "idle",
      reconnecting: false,
      activities: [],
      streamingMarkdown: "",
      turnId: null,
    }));

    if (turnId === null) return;
    // Explicit stop (BT-4): fire-and-forget. Include the guest session id so the
    // ownership check passes; harmless when signed-in (cookie/Bearer wins).
    void fetch(`/api/chat/turns/${encodeURIComponent(turnId)}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    }).catch(() => {
      /* local teardown already stands (design §6) */
    });
  }, []);

  const reset = useCallback((): void => {
    // Unsubscribe from the current stream (the server keeps the turn running —
    // reattachable later via `resume`) and drop all per-turn bookkeeping.
    abortRef.current?.abort();
    abortRef.current = null;
    lastBodyRef.current = null;
    turnIdRef.current = null;
    sessionIdRef.current = null;
    terminalRef.current = false;
    reattachCountRef.current = 0;
    setState(INITIAL_STATE);
  }, []);

  // Manual re-send of the last turn (the Retry affordance on a surfaced error /
  // interrupted turn). `send` drops the stale subscription first.
  const retry = useCallback((): void => {
    if (lastBodyRef.current) send(lastBodyRef.current);
  }, [send]);

  return { ...state, send, resume, stop, reset, retry };
}
