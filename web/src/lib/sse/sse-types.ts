/**
 * SSE event protocol for `POST /api/chat` (design.md § API Design).
 *
 * The route emits, in order (background-turns/design.md §4):
 *   event: turn            data: { turn_id }          (exactly one, FIRST frame
 *                                                      of both the POST stream and
 *                                                      the resume stream — the
 *                                                      server-minted turn id)
 *   event: scope           data: { format, source }  (exactly one, first; the
 *                                                      server-resolved game scope
 *                                                      for this turn — GS-C)
 *   event: tool_activity   data: { tool, label }     (zero or more)
 *   event: answer_start    data: {}                  (zero or more; resets the
 *                                                      client's in-flight buffer
 *                                                      when a fresh submit_answer
 *                                                      begins streaming)
 *   event: answer_delta    data: { text }            (zero or more; incremental
 *                                                      chunks of answer_markdown)
 *   event: answer          data: { answer }          (terminal, authoritative)
 *   event: error           data: { code, message }   (terminal — transport faults
 *                                                      ONLY)
 *   event: stopped         data: {}                  (terminal alternative to
 *                                                      answer/error when the turn
 *                                                      was explicitly stopped —
 *                                                      §4/BT-4; nothing persisted)
 *
 * The terminal event is exactly one of answer | error | stopped. The `turn`
 * frame is emitted PER-SUBSCRIBER (it is NOT part of the buffered replay list),
 * so the POST stream and the resume stream both open with it.
 *
 * IMPORTANT: every in-domain failure (unresolved entity, clarification, PokeAPI
 * down, index missing, loop-max, invalid-after-retry) is delivered as a NORMAL
 * `answer` event carrying a OakAnswer with the appropriate `status`
 * (resolution_failed / clarification_needed / insufficient_data) — NEVER as an
 * `error` event. The `error` event is reserved for model/API transport faults.
 *
 * `answer_start` / `answer_delta` stream the `answer_markdown` prose token-by-
 * token while the loop runs; the single terminal `answer` event always carries
 * the full validated OakAnswer and is authoritative (the client replaces any
 * streamed buffer with it).
 */

import type { OakAnswer } from "@/agent/schemas";
import type { Format } from "@/data/formats";

/**
 * One image attached to a chat message (wire shape). `data` is RAW base64 (no
 * `data:` prefix). The server re-sniffs the bytes to determine the canonical MIME
 * type, so `mimeType` here is only the client's best-effort declaration. The
 * client downscales/recompresses before sending; the server enforces count + size
 * caps (`@/server/image-upload`).
 */
export interface ChatRequestImage {
  mimeType: string;
  data: string;
}

/** Request body for `POST /api/chat`. */
export interface ChatRequestBody {
  session_id: string;
  message: string;
  /**
   * Images attached to this message (≤ 4). Optional ⇒ a text-only turn. The
   * accompanying `message` MAY be empty when one or more images are present (an
   * image-only "what is this?" upload).
   */
  images?: ChatRequestImage[];
  /**
   * @deprecated legacy seed; still honored below the sticky scope for old
   * clients — new clients send `scope_seed`. Champions-mode toggle (server
   * scopes the turn to Pokémon Champions when true). Optional ⇒ old clients
   * that omit it fall through to the champions default.
   */
  champions_mode?: boolean;
  /**
   * Explicit scope pick from the client's scope chip, applied as this turn's
   * seed. Ranks ABOVE the conversation's sticky scope (it is explicit user
   * intent) but BELOW an in-message signal. Optional — omitted means "no pick".
   */
  scope_seed?: Format;
}

/**
 * `event: scope` payload — the server-resolved game scope for this turn (GS-C).
 * Emitted exactly once, as the FIRST event of the turn, before any
 * `tool_activity`. `format` is the resolved scope the tools/prompt ran under;
 * `source` records how it was resolved: an explicit in-message signal
 * (`"message"`), the conversation's sticky scope (`"conversation"`), an
 * explicit seed (`"seed"` — a `scope_seed` chip pick, or the legacy
 * `champions_mode` boolean from an old client), or the champions default
 * (`"default"` — no signal/sticky/seed at all). Additive — old clients that
 * don't listen for `scope` simply ignore it.
 */
export interface ScopeEvent {
  format: Format;
  source: "message" | "conversation" | "seed" | "default";
}

/**
 * `event: turn` payload — the server-minted turn id (background-turns/design.md
 * §4 / BT-2). Emitted exactly once, as the very FIRST frame of both the POST
 * stream and the resume stream, so a client can record the turn as its
 * conversation's pending turn and later reattach/stop it. Additive — old clients
 * that don't listen for `turn` simply ignore it.
 */
export interface TurnEvent {
  turn_id: string;
}

/** `event: tool_activity` payload — progress shown while the loop runs. */
export interface ToolActivityEvent {
  tool: string;
  label: string;
}

/**
 * `event: answer_start` payload — a reset signal sent when a fresh submit_answer
 * block begins streaming. Empty object `{}`; the client clears its in-flight
 * markdown buffer (handles the validate-and-re-emit case).
 */
export type AnswerStartEvent = Record<string, never>;

/** `event: answer_delta` payload — one newly-decoded chunk of answer_markdown. */
export interface AnswerDeltaEvent {
  text: string;
}

/** `event: answer` payload — the one terminal answer for the turn. */
export interface AnswerEvent {
  answer: OakAnswer;
}

/**
 * `event: stopped` payload — the terminal event for a turn that was explicitly
 * stopped via `POST /api/chat/turns/:id/stop` (background-turns/design.md §4 /
 * BT-4). Empty object `{}`; nothing is persisted or recorded for a stopped turn
 * (matches today's Stop-discards semantics). It is a terminal ALTERNATIVE to
 * `answer`/`error`.
 */
export type StoppedEvent = Record<string, never>;

/** `event: error` payload — transport/API fault only (not in-domain failures). */
export interface ErrorEvent {
  code: string;
  message: string;
  /**
   * Upstream HTTP status for a provider transport fault (e.g. an xAI 401/429),
   * when known. Lets the client tailor its message / suggest switching models.
   */
  status?: number;
}

/** The SSE event names this endpoint emits. */
export type SseEventName =
  | "turn"
  | "scope"
  | "tool_activity"
  | "answer_start"
  | "answer_delta"
  | "answer"
  | "error"
  | "stopped";

/** Maps each event name to its `data` payload type. */
export interface SseEventDataMap {
  turn: TurnEvent;
  scope: ScopeEvent;
  tool_activity: ToolActivityEvent;
  answer_start: AnswerStartEvent;
  answer_delta: AnswerDeltaEvent;
  answer: AnswerEvent;
  error: ErrorEvent;
  stopped: StoppedEvent;
}

/** A fully-typed, discriminated SSE event (name + its matching data). */
export type SseEvent = {
  [K in SseEventName]: { event: K; data: SseEventDataMap[K] };
}[SseEventName];

/**
 * Serialize one SSE event into wire frame format:
 * `event: <name>\ndata: <single-line JSON>\n\n`.
 * Data is emitted as single-line JSON (no embedded newlines) per the directive.
 */
export function formatSseEvent<K extends SseEventName>(
  event: K,
  data: SseEventDataMap[K],
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
