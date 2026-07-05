/**
 * jsdom tests for the `useSseClient` React hook — the durable-turn client
 * behaviour (background-turns/design.md §6.1). The pure `parseFrame` /
 * `readSseStream` exports are covered in the node project (`sse-client.test.ts`);
 * this file drives the HOOK (fetch + stream lifecycle + React state) that the
 * node project can't render.
 *
 * Coverage: turn_id capture, `resume` (reattach through the shared consume loop),
 * a 409 `turn_in_progress` response transparently reattaching, the `stopped`
 * terminal event returning to idle, the explicit `stop()` endpoint call + local
 * teardown, and the resume-404 "interrupted" affordance.
 *
 * `fetch` is stubbed with a fake that returns Response-like objects whose body
 * is a real `ReadableStream<Uint8Array>` (so `readSseStream` runs for real).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSseClient } from "@/lib/sse/sse-client";
import type { ChatRequestBody } from "@/lib/sse/sse-types";

// ---------------------------------------------------------------------------
// Fetch / stream fakes
// ---------------------------------------------------------------------------

/** Canonical SSE frame produced by the server's `formatSseEvent`. */
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A minimal valid-enough OakAnswer for `answer` frames. */
function answerPayload(markdown = "Done") {
  return {
    status: "answered",
    answer_markdown: markdown,
    reasoning_markdown: "because",
    citations: [],
    inferences: [],
    generation_basis: { generation: "gen-9", fallback: false },
  };
}

/** A closed ReadableStream that enqueues every frame then closes. */
function closedStream(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
}

/** An OPEN ReadableStream (never closes) — models a turn still generating. */
function openStream(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      // Deliberately no close() — the reader awaits the next (never-arriving)
      // chunk, so the consume loop suspends until the caller aborts it.
    },
  });
}

/**
 * A ReadableStream whose frames are pushed on demand (and closed on demand) —
 * lets a test hold the stream open, drive `stop()`, then deliver the `turn`
 * frame afterwards.
 */
function controllableStream(): {
  body: ReadableStream<Uint8Array>;
  push: (frame: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
    },
  });
  return {
    body,
    push: (frame) => ctrl.enqueue(encoder.encode(frame)),
    close: () => ctrl.close(),
  };
}

/** A Response-like object carrying an SSE body. */
function sseResponse(body: ReadableStream<Uint8Array>): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body,
  } as unknown as Response;
}

/** A Response-like JSON error (no body). */
function jsonResponse(status: number, obj: unknown): Response {
  return {
    ok: status < 400,
    status,
    statusText: "",
    body: null,
    json: async () => obj,
  } as unknown as Response;
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Install a fetch stub whose handler maps (url, method) → a Response. Records
 * every call so tests can assert on the resume/stop URLs + bodies.
 */
function stubFetch(
  handler: (url: string, method: string, body: unknown) => Response,
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      return handler(url, method, body);
    }),
  );
  return calls;
}

/** Let the microtask queue (stream reads + setState) drain fully. */
async function drain(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

const BODY: ChatRequestBody = { session_id: "sess-1", message: "hi" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSseClient — turn_id capture", () => {
  it("captures the turn_id from the first `turn` frame of a POST", async () => {
    stubFetch(() =>
      sseResponse(
        closedStream(
          frame("turn", { turn_id: "turn-abc" }),
          frame("scope", { format: "champions", source: "default" }),
          frame("answer", { answer: answerPayload() }),
        ),
      ),
    );

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });

    expect(result.current.turnId).toBe("turn-abc");
    expect(result.current.status).toBe("done");
    expect(result.current.answer?.answer_markdown).toBe("Done");
  });
});

describe("useSseClient — resume path", () => {
  it("reattaches via GET /turns/:id/stream and rebuilds from the replay", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("/turns/turn-9/stream")) {
        return sseResponse(
          closedStream(
            frame("turn", { turn_id: "turn-9" }),
            frame("scope", { format: "gen-7", source: "message" }),
            frame("tool_activity", { tool: "get_pokemon", label: "fetching…" }),
            frame("answer_delta", { text: "Par" }),
            frame("answer_delta", { text: "tial" }),
            frame("answer", { answer: answerPayload("Resumed") }),
          ),
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.resume("turn-9", "sess-1");
      await drain();
    });

    // The resume endpoint was hit with the guest session id.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      "/api/chat/turns/turn-9/stream?session_id=sess-1",
    );
    // The replay drove the same state a live stream would.
    expect(result.current.turnId).toBe("turn-9");
    expect(result.current.scope).toEqual({ format: "gen-7", source: "message" });
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.status).toBe("done");
    expect(result.current.answer?.answer_markdown).toBe("Resumed");
    // Streaming buffer cleared once the terminal answer committed.
    expect(result.current.streamingMarkdown).toBe("");
  });

  it("resets activities/streamingMarkdown on the replayed `turn` frame", async () => {
    // Prime state with a first turn, then resume a different turn: the reattach's
    // `turn` frame must wipe the prior turn's activities before the replay.
    let phase: "first" | "resume" = "first";
    stubFetch((url) => {
      if (phase === "first") {
        return sseResponse(
          closedStream(
            frame("turn", { turn_id: "turn-1" }),
            frame("tool_activity", { tool: "a", label: "a" }),
            frame("tool_activity", { tool: "b", label: "b" }),
            frame("answer", { answer: answerPayload("first") }),
          ),
        );
      }
      expect(url).toContain("/turns/turn-2/stream");
      return sseResponse(
        closedStream(
          frame("turn", { turn_id: "turn-2" }),
          frame("tool_activity", { tool: "c", label: "c" }),
          frame("answer", { answer: answerPayload("second") }),
        ),
      );
    });

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });
    expect(result.current.activities).toHaveLength(2);

    phase = "resume";
    await act(async () => {
      result.current.resume("turn-2", "sess-1");
      await drain();
    });
    // Only the resumed turn's single activity — the prior two were wiped.
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].tool).toBe("c");
    expect(result.current.answer?.answer_markdown).toBe("second");
  });

  it("surfaces the interrupted affordance on a resume 404", async () => {
    stubFetch(() => jsonResponse(404, { code: "not_found", message: "gone" }));

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.resume("turn-dead", "sess-1");
      await drain();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe("turn_not_found");
    expect(result.current.turnId).toBeNull();
  });
});

describe("useSseClient — 409 turn_in_progress reattach", () => {
  it("reattaches to the returned turn_id instead of surfacing an error", async () => {
    const calls = stubFetch((url, method) => {
      if (url === "/api/chat" && method === "POST") {
        return jsonResponse(409, {
          code: "turn_in_progress",
          message: "already generating",
          turn_id: "turn-existing",
        });
      }
      if (url.includes("/turns/turn-existing/stream")) {
        return sseResponse(
          closedStream(
            frame("turn", { turn_id: "turn-existing" }),
            frame("answer", { answer: answerPayload("From the running turn") }),
          ),
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });

    // POST first, then a reattach GET to the returned turn (with session id).
    expect(calls[0]).toMatchObject({ url: "/api/chat", method: "POST" });
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toBe(
      "/api/chat/turns/turn-existing/stream?session_id=sess-1",
    );
    // Ended on the running turn's answer — NOT an error.
    expect(result.current.status).toBe("done");
    expect(result.current.error).toBeNull();
    expect(result.current.turnId).toBe("turn-existing");
    expect(result.current.answer?.answer_markdown).toBe("From the running turn");
  });
});

describe("useSseClient — stopped terminal event", () => {
  it("returns to idle and clears the in-flight prose on a `stopped` frame", async () => {
    stubFetch(() =>
      sseResponse(
        closedStream(
          frame("turn", { turn_id: "turn-s" }),
          frame("answer_start", {}),
          frame("answer_delta", { text: "half a sen" }),
          frame("stopped", {}),
        ),
      ),
    );

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.answer).toBeNull();
    expect(result.current.streamingMarkdown).toBe("");
    expect(result.current.turnId).toBeNull();
  });
});

describe("useSseClient — explicit stop()", () => {
  it("POSTs the stop endpoint with the session id and finalizes to idle", async () => {
    const calls = stubFetch((url, method) => {
      if (url === "/api/chat" && method === "POST") {
        // A turn that has started (turn + activity) but not finished.
        return sseResponse(
          openStream(
            frame("turn", { turn_id: "turn-live" }),
            frame("tool_activity", { tool: "x", label: "working…" }),
          ),
        );
      }
      if (url.includes("/turns/turn-live/stop")) {
        return jsonResponse(200, { turn_id: "turn-live", status: "stopped" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });
    // The turn is live (streaming), id captured.
    expect(result.current.turnId).toBe("turn-live");
    expect(result.current.status).toBe("thinking");

    await act(async () => {
      result.current.stop();
      await drain();
    });

    const stopCall = calls.find((c) => c.url.includes("/stop"));
    expect(stopCall).toBeDefined();
    expect(stopCall?.method).toBe("POST");
    expect(stopCall?.body).toEqual({ session_id: "sess-1" });
    // Local teardown: back to idle, in-flight view cleared, no reattach possible.
    expect(result.current.status).toBe("idle");
    expect(result.current.turnId).toBeNull();
    expect(result.current.streamingMarkdown).toBe("");
  });

  it("stops a turn even when Stop is pressed BEFORE the turn frame lands", async () => {
    // The pre-`turn`-frame race: quick-stop during connection setup + the
    // server's pre-stream work. We have no id yet, so the hook must keep the
    // stream reading to capture the `turn` frame, then fire the stop endpoint —
    // otherwise the server turn keeps generating (ghost turn).
    const live = controllableStream();
    const calls = stubFetch((url, method) => {
      if (url === "/api/chat" && method === "POST") return sseResponse(live.body);
      if (url.includes("/turns/turn-late/stop")) {
        return jsonResponse(200, { turn_id: "turn-late", status: "stopped" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });
    // No turn frame yet — the id is still unknown.
    expect(result.current.turnId).toBeNull();
    expect(result.current.status).toBe("thinking");

    // Stop now, before any id exists → UI goes idle, but no /stop call yet.
    await act(async () => {
      result.current.stop();
      await drain();
    });
    expect(result.current.status).toBe("idle");
    expect(calls.some((c) => c.url.includes("/stop"))).toBe(false);

    // The turn frame finally arrives → the deferred stop fires with its id.
    await act(async () => {
      live.push('event: turn\ndata: {"turn_id":"turn-late"}\n\n');
      await drain();
    });

    const stopCall = calls.find((c) => c.url.includes("/turns/turn-late/stop"));
    expect(stopCall).toBeDefined();
    expect(stopCall?.method).toBe("POST");
    expect(stopCall?.body).toEqual({ session_id: "sess-1" });
    // Still idle — the captured turn id never drove any UI state.
    expect(result.current.status).toBe("idle");
    expect(result.current.turnId).toBeNull();
  });

  it("keeps the local teardown even if the stop endpoint call fails", async () => {
    stubFetch((url, method) => {
      if (url === "/api/chat" && method === "POST") {
        return sseResponse(
          openStream(frame("turn", { turn_id: "turn-live-2" })),
        );
      }
      if (url.includes("/stop")) throw new Error("network down");
      throw new Error(`unexpected fetch ${url}`);
    });

    const { result } = renderHook(() => useSseClient());
    await act(async () => {
      result.current.send(BODY);
      await drain();
    });

    await act(async () => {
      result.current.stop();
      await drain();
    });

    // The failed endpoint call does not block the local return to idle.
    expect(result.current.status).toBe("idle");
    expect(result.current.turnId).toBeNull();
  });
});
