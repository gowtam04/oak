/**
 * SSE event protocol for `POST /api/chat` (design.md § API Design).
 *
 * The route emits, in order:
 *   event: tool_activity   data: { tool, label }     (zero or more)
 *   event: answer          data: { answer }          (exactly one, terminal)
 *   event: error           data: { code, message }   (transport faults ONLY)
 *
 * IMPORTANT: every in-domain failure (unresolved entity, clarification, PokeAPI
 * down, index missing, loop-max, invalid-after-retry) is delivered as a NORMAL
 * `answer` event carrying a PokebotAnswer with the appropriate `status`
 * (resolution_failed / clarification_needed / insufficient_data) — NEVER as an
 * `error` event. The `error` event is reserved for model/API transport faults.
 */

import type { PokebotAnswer } from "@/agent/schemas";

/** Request body for `POST /api/chat`. */
export interface ChatRequestBody {
  session_id: string;
  message: string;
}

/** `event: tool_activity` payload — progress shown while the loop runs. */
export interface ToolActivityEvent {
  tool: string;
  label: string;
}

/** `event: answer` payload — the one terminal answer for the turn. */
export interface AnswerEvent {
  answer: PokebotAnswer;
}

/** `event: error` payload — transport/API fault only (not in-domain failures). */
export interface ErrorEvent {
  code: string;
  message: string;
}

/** The three SSE event names this endpoint emits. */
export type SseEventName = "tool_activity" | "answer" | "error";

/** Maps each event name to its `data` payload type. */
export interface SseEventDataMap {
  tool_activity: ToolActivityEvent;
  answer: AnswerEvent;
  error: ErrorEvent;
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
