/**
 * @vitest-environment jsdom
 *
 * FULL-STACK-E2E CHECKPOINT (frontend half) — drives the REAL `useSseClient`
 * hook with a SIMULATED SSE stream framed exactly like the route
 * (`formatSseEvent`, design.md § API Design): several `tool_activity` frames then
 * one terminal `answer` frame. Asserts the hook surfaces the progress labels in
 * order and then exposes the final `OakAnswer`.
 *
 * Mirrors the backend checkpoint (test/api-chat.integration.test.ts) from the
 * client side: there the route emits frames; here the hook parses them. `fetch`
 * is stubbed to return a `Response` whose body is a `ReadableStream` of those
 * frames — no server/db/runtime is imported (those open a Postgres connection
 * which fails under jsdom). The file runs under jsdom (via the docblock above) so
 * the hook's React state can be observed with `renderHook`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { useSseClient } from "@/lib/sse/sse-client";
import { formatSseEvent } from "@/lib/sse/sse-types";
import type { OakAnswer } from "@/components/types";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const ANSWERED: OakAnswer = {
  status: "answered",
  answer_markdown:
    "Only **Ninetales** can learn both Trick Room and Will-O-Wisp in Gen 9.",
  reasoning_markdown: "Intersection of the two Gen-9 learnsets → Ninetales.",
  citations: [
    {
      source: "learnset/will-o-wisp (gen-9)",
      detail: "learned_by includes ninetales",
    },
  ],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
  candidates: {
    total_count: 1,
    truncated: false,
    sort: null,
    shown: [{ name: "Ninetales", dex_number: 38, types: ["fire"] }],
  },
};

const RESOLUTION_FAILED: OakAnswer = {
  status: "resolution_failed",
  answer_markdown: "I couldn't find 'Garchoph'. Did you mean Garchomp?",
  reasoning_markdown: "Fuzzy match failed above threshold.",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
  suggestions: ["Garchomp"],
};

/** Build a `Response` whose body streams the given pre-framed SSE strings. */
function sseResponse(frames: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
    ...init,
  });
}

/**
 * Build a `Response` whose body delivers `frames` (one per read) and THEN errors
 * the stream — a dropped connection mid-turn. PULL-based on purpose: calling
 * `controller.error()` discards any still-queued chunks (Streams spec resets the
 * queue), so an enqueue-all-then-error stream would drop the frames too. Pulling
 * one frame per read guarantees each is consumed before the error surfaces.
 */
function erroringResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i]!));
        i += 1;
      } else {
        controller.error(new Error("network gone"));
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** An SSE `Response` whose body stays OPEN (never closes) — models a turn still
 * generating server-side, so the consume loop suspends awaiting the next chunk. */
function openResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      // Deliberately no close() / error().
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** A non-OK HTTP response with a JSON `{ code, message }` body (e.g. 503). */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub global.fetch to return `response` (and capture the request body). */
function stubFetch(response: Response): { calls: unknown[] } {
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.body);
      return response;
    }),
  );
  return { calls };
}

interface RouterCall {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Stub global.fetch with a URL/method router — the durable-turn client hits
 * distinct endpoints (`POST /api/chat`, `GET /api/chat/turns/:id/stream`,
 * `POST /api/chat/turns/:id/stop`), so tests route by URL and assert on the
 * captured calls. Each `handler` call returns a FRESH `Response` (a
 * `ReadableStream` body is single-use, so a reattach needs a new one).
 */
function stubRouter(
  handler: (url: string, method: string) => Response,
): RouterCall[] {
  const calls: RouterCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      return handler(url, method);
    }),
  );
  return calls;
}

// Page-visibility control: `document.hidden` / `visibilityState` are prototype
// getters in jsdom, so shadow them with configurable own-props we can drive.
let docHidden = false;
function installVisibilityControl(): void {
  docHidden = false;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => docHidden,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (docHidden ? "hidden" : "visible"),
  });
}
function restoreVisibilityControl(): void {
  Reflect.deleteProperty(document, "hidden");
  Reflect.deleteProperty(document, "visibilityState");
  docHidden = false;
}
/** Flip visibility and fire the `visibilitychange` event the hook listens for. */
function setHidden(hidden: boolean): void {
  docHidden = hidden;
  document.dispatchEvent(new Event("visibilitychange"));
}

const TURN = { session_id: "s-bg", message: "what is this image" };
const ANSWER_FRAME = formatSseEvent("answer", { answer: ANSWERED });
const TURN_FRAME = formatSseEvent("turn", { turn_id: "turn-bg" });
const TOOL_FRAME = formatSseEvent("tool_activity", {
  tool: "resolve_entity",
  label: "🔍 Resolving…",
});

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSseClient — full-stack SSE consumption", () => {
  it("surfaces tool_activity progress labels in order, then the final answer", async () => {
    const frames = [
      formatSseEvent("tool_activity", {
        tool: "resolve_entity",
        label: "🔍 Resolving entities…",
      }),
      formatSseEvent("tool_activity", {
        tool: "query_pokedex",
        label: "📊 Querying the Pokédex…",
      }),
      formatSseEvent("answer", { answer: ANSWERED }),
    ];
    const captured = stubFetch(sseResponse(frames));

    const { result } = renderHook(() => useSseClient());

    act(() => {
      result.current.send({
        session_id: "s-1",
        message: "trick room + will-o-wisp",
      });
    });

    // Reaches the terminal answer.
    await waitFor(() => expect(result.current.status).toBe("done"));

    // Progress labels were surfaced in the order they were streamed.
    expect(result.current.activities.map((a) => a.label)).toEqual([
      "🔍 Resolving entities…",
      "📊 Querying the Pokédex…",
    ]);
    expect(result.current.activities.map((a) => a.tool)).toEqual([
      "resolve_entity",
      "query_pokedex",
    ]);

    // The terminal OakAnswer is exposed; no transport error.
    expect(result.current.answer).toEqual(ANSWERED);
    expect(result.current.answer?.candidates?.total_count).toBe(1);
    expect(result.current.error).toBeNull();

    // The request POSTed the session id + message body.
    expect(captured.calls).toHaveLength(1);
    expect(JSON.parse(captured.calls[0] as string)).toEqual({
      session_id: "s-1",
      message: "trick room + will-o-wisp",
    });
  });

  it("accumulates answer_delta text into streamingMarkdown while in-flight", async () => {
    // No terminal `answer` frame → the streamed buffer is retained (not cleared),
    // which lets us observe the accumulation deterministically.
    stubFetch(
      sseResponse([
        formatSseEvent("answer_start", {}),
        formatSseEvent("answer_delta", { text: "Only " }),
        formatSseEvent("answer_delta", { text: "**Ninetales**" }),
      ]),
    );

    const { result } = renderHook(() => useSseClient());
    act(() => {
      result.current.send({ session_id: "s-stream", message: "..." });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.streamingMarkdown).toBe("Only **Ninetales**");
    expect(result.current.answer).toBeNull();
  });

  it("clears streamingMarkdown when the terminal answer lands", async () => {
    stubFetch(
      sseResponse([
        formatSseEvent("answer_start", {}),
        formatSseEvent("answer_delta", { text: "Only Ninetales" }),
        formatSseEvent("answer", { answer: ANSWERED }),
      ]),
    );

    const { result } = renderHook(() => useSseClient());
    act(() => {
      result.current.send({ session_id: "s-stream2", message: "..." });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.answer).toEqual(ANSWERED);
    // The committed AnswerCard is authoritative; the in-flight buffer is cleared.
    expect(result.current.streamingMarkdown).toBe("");
  });

  it("surfaces an in-domain failure (resolution_failed) as a normal answer, not an error", async () => {
    stubFetch(
      sseResponse([formatSseEvent("answer", { answer: RESOLUTION_FAILED })]),
    );

    const { result } = renderHook(() => useSseClient());
    act(() => {
      result.current.send({ session_id: "s-2", message: "Garchoph?" });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.error).toBeNull();
    expect(result.current.answer?.status).toBe("resolution_failed");
    expect(result.current.answer?.suggestions).toEqual(["Garchomp"]);
  });

  it("routes a transport `error` frame to the error state (never as an answer)", async () => {
    stubFetch(
      sseResponse([
        formatSseEvent("tool_activity", {
          tool: "resolve_entity",
          label: "🔍 Resolving…",
        }),
        formatSseEvent("error", {
          code: "agent_error",
          message: "Anthropic 529 overloaded",
        }),
      ]),
    );

    const { result } = renderHook(() => useSseClient());
    act(() => {
      result.current.send({ session_id: "s-3", message: "boom" });
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.answer).toBeNull();
    expect(result.current.error).toEqual({
      code: "agent_error",
      message: "Anthropic 529 overloaded",
    });
  });
});

// ---------------------------------------------------------------------------
// Durable-turn reattach (background-turns/design.md §6.1): a turn is a
// first-class SERVER object, so a dropped/suspended connection UNSUBSCRIBES
// rather than cancels. The hook reattaches — via `GET /api/chat/turns/:id/stream`
// — on foreground and on a mid-stream drop (the server replays the buffer, then
// tails). The old whole-turn auto-re-POST retry machinery is GONE.
// ---------------------------------------------------------------------------

describe("useSseClient — durable-turn reattach", () => {
  beforeEach(() => installVisibilityControl());
  afterEach(() => restoreVisibilityControl());

  it("reattaches to the running turn when the tab returns to the foreground", async () => {
    const calls = stubRouter((url, method) => {
      if (url === "/api/chat" && method === "POST") {
        // Turn starts and keeps generating (open stream, no terminal).
        return openResponse([TURN_FRAME, TOOL_FRAME]);
      }
      if (url.includes("/api/chat/turns/turn-bg/stream")) {
        return sseResponse([TURN_FRAME, ANSWER_FRAME]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));
    // The turn id is captured from the first frame; the turn is unresolved.
    await waitFor(() => expect(result.current.turnId).toBe("turn-bg"));

    // Tab hidden (unsubscribe — server keeps generating), then visible → reattach.
    act(() => setHidden(true));
    act(() => setHidden(false));

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.answer).toEqual(ANSWERED);

    // The reattach hit the resume endpoint (GET) with the guest session id.
    const resume = calls.find((c) => c.url.includes("/stream"));
    expect(resume?.method).toBe("GET");
    expect(resume?.url).toContain("session_id=s-bg");
  });

  it("auto-reattaches after a mid-stream drop (Reconnecting…) and recovers", async () => {
    const calls = stubRouter((url) => {
      if (url === "/api/chat") {
        // Delivers the turn id + a tool frame, then the socket drops.
        return erroringResponse([TURN_FRAME, TOOL_FRAME]);
      }
      if (url.includes("/api/chat/turns/turn-bg/stream")) {
        return sseResponse([TURN_FRAME, ANSWER_FRAME]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));

    // The drop triggers a bounded reattach → "Reconnecting…".
    await waitFor(() => expect(result.current.reconnecting).toBe(true));
    expect(result.current.error).toBeNull();

    // The backed-off resume completes the turn.
    await waitFor(() => expect(result.current.status).toBe("done"), {
      timeout: 2000,
    });
    expect(result.current.answer).toEqual(ANSWERED);
    expect(result.current.reconnecting).toBe(false);
    expect(calls.some((c) => c.url.includes("/stream"))).toBe(true);
  });

  it("surfaces a drop that happened before any turn id (nothing to reattach to)", async () => {
    const calls = stubRouter(() => erroringResponse([])); // errors before the turn frame
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("stream_error");
    expect(calls).toHaveLength(1); // no reattach — the turn id was never seen
  });

  it("stops reattaching after the bounded budget and surfaces the error", async () => {
    const calls = stubRouter((url) => {
      // Every attempt delivers only the turn id (no content → the budget is not
      // refreshed) then drops, so the bounded reattach budget is exhausted.
      if (url === "/api/chat") return erroringResponse([TURN_FRAME]);
      if (url.includes("/api/chat/turns/turn-bg/stream")) {
        return erroringResponse([TURN_FRAME]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));

    await waitFor(() => expect(result.current.status).toBe("error"), {
      timeout: 4000,
    });
    expect(result.current.error?.code).toBe("stream_error");
    // POST + exactly MAX_REATTACHES (2) resume attempts, then it gives up.
    const resumeCalls = calls.filter((c) => c.url.includes("/stream"));
    expect(resumeCalls).toHaveLength(2);
  });

  it("surfaces a clean HTTP error without reattaching", async () => {
    const calls = stubRouter(() =>
      jsonResponse(503, { code: "model_unavailable", message: "Grok is down" }),
    );
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("model_unavailable");
    expect(calls).toHaveLength(1); // a clean response → never reattached
  });

  it("routes an in-band error frame to the error state (terminal, no reattach)", async () => {
    const calls = stubRouter(() =>
      sseResponse([
        TURN_FRAME,
        formatSseEvent("error", { code: "model_provider_error", message: "xAI 429" }),
      ]),
    );
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("model_provider_error");
    expect(calls).toHaveLength(1);
  });

  it("reset() unsubscribes without calling the stop endpoint (turn keeps running)", async () => {
    const calls = stubRouter((url) => {
      if (url === "/api/chat") return openResponse([TURN_FRAME, TOOL_FRAME]);
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));
    await waitFor(() => expect(result.current.turnId).toBe("turn-bg"));

    act(() => result.current.reset());
    expect(result.current.status).toBe("idle");
    // A detach must NOT hit /stop — only an explicit stop() cancels the turn.
    expect(calls.every((c) => !c.url.includes("/stop"))).toBe(true);
    expect(calls).toHaveLength(1); // only the POST
  });

  it("retry() manually re-sends after a surfaced error", async () => {
    let n = 0;
    const calls = stubRouter((url) => {
      if (url === "/api/chat") {
        n += 1;
        return n === 1
          ? erroringResponse([]) // first send drops before any turn id → surfaces
          : sseResponse([TURN_FRAME, ANSWER_FRAME]); // manual retry succeeds
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useSseClient());

    act(() => result.current.send(TURN));
    await waitFor(() => expect(result.current.status).toBe("error"));

    // The body was retained on error → manual Retry reuses it.
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.answer).toEqual(ANSWERED);
    expect(calls.filter((c) => c.url === "/api/chat")).toHaveLength(2);
  });
});
