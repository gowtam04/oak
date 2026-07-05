/**
 * Subscriber-side SSE plumbing shared by BOTH the `POST /api/chat` stream and
 * the `GET /api/chat/turns/:id/stream` resume stream (background-turns/design.md
 * §5.2 step 3): "one helper, two call sites."
 *
 * A subscriber does NOT own the turn — it merely watches it. So this helper only
 * ever reads the turn: it emits the per-subscriber `turn {turn_id}` frame first,
 * replays the buffered events, then tails live via {@link subscribe}. Its
 * `cancel()` (client disconnect) ONLY unsubscribes and stops the heartbeat — it
 * never touches the turn's status or its AbortController (that is stop's job
 * alone, BT-4/BT-7). The turn keeps running server-side with nobody watching.
 *
 * The framing (guarded enqueue against a dead controller, the 15s keep-alive
 * heartbeat, close-on-terminal) is the same contract the original chat route
 * implemented inline; it now lives here so the two endpoints share one
 * implementation byte-for-byte.
 */

import {
  formatSseEvent,
  type SseEventDataMap,
  type SseEventName,
} from "@/lib/sse/sse-types";
import { subscribe, type BufferedEvent, type TurnRecord } from "@/server/turn-store";

/**
 * SSE response headers (RISK DIRECTIVE — SSE route). Identical to the set the
 * chat route used inline; hoisted here so both stream call sites share it.
 */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering (nginx etc.) so events flush immediately.
  "X-Accel-Buffering": "no",
};

const TERMINAL_EVENTS: ReadonlySet<SseEventName> = new Set<SseEventName>([
  "answer",
  "error",
  "stopped",
]);

/**
 * Build the SSE `Response` that subscribes a client to `turn`. Returned
 * SYNCHRONOUSLY (the turn drives itself independently); events flow from the
 * `subscribe` fan-out. Both the POST route and the resume route call this and
 * nothing else for their stream body.
 */
export function streamTurnResponse(turn: TurnRecord): Response {
  const encoder = new TextEncoder();

  // Shared lifecycle state reachable by both `start` (the producer) and
  // `cancel` (fired on client disconnect). `closed` makes every later write a
  // no-op; `unsubscribe` detaches this subscriber from the turn's fan-out.
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: () => void = () => {};

  const stopHeartbeat = (): void => {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Single guarded write path: once the client disconnects, enqueue throws
      // "Invalid state: Controller is already closed". We catch that, flip
      // `closed`, and detach — never letting it become an unhandledRejection.
      const enqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          stopHeartbeat();
          unsubscribe();
        }
      };

      const send = <K extends SseEventName>(
        event: K,
        data: SseEventDataMap[K],
      ): void => {
        enqueue(formatSseEvent(event, data));
      };

      const close = (): void => {
        if (closed) return;
        closed = true;
        stopHeartbeat();
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect — nothing to do.
        }
      };

      // BT-2: the server-minted turn id is the FIRST frame of every subscriber
      // stream (POST and resume alike). It is emitted per-subscriber, not from
      // the shared replay buffer.
      send("turn", { turn_id: turn.turnId });

      // Keep-alive: a turn can spend 60s+ in silent reasoning; an idle SSE
      // connection gets dropped by the proxy/browser. A comment every 15s keeps
      // it warm (comment frames are ignored by the client's frame parser).
      heartbeat = setInterval(() => {
        enqueue(": keep-alive\n\n");
      }, 15_000);

      // Tail live events. A terminal event closes the stream. This listener is
      // registered atomically with the buffer snapshot below (no await between).
      const onEvent = (ev: BufferedEvent): void => {
        send(ev.event, ev.data);
        if (TERMINAL_EVENTS.has(ev.event)) close();
      };

      const sub = subscribe(turn, onEvent);
      unsubscribe = sub.unsubscribe;

      // Replay the buffer from the start (design §5.2: for the POST stream this
      // is trivially empty; for resume it rebuilds the in-flight UI). If the
      // turn is already terminal, the replay ends WITH the terminal event, so
      // "reattach after completion" and "reattach mid-flight" are one code path.
      let sawTerminal = false;
      for (const ev of sub.replay) {
        send(ev.event, ev.data);
        if (TERMINAL_EVENTS.has(ev.event)) sawTerminal = true;
      }
      if (sawTerminal) close();
    },
    cancel() {
      // The client went away (closed the tab, navigated, lost network,
      // backgrounded). This is NOT a stop: only unsubscribe + stop the
      // heartbeat. The turn keeps generating server-side (BT-7) and any other
      // subscriber (or a later reattach) still sees it through to completion.
      closed = true;
      stopHeartbeat();
      unsubscribe();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
