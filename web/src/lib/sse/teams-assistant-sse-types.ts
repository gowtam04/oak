/**
 * SSE event protocol + request body for `POST /api/teams/assistant` — the
 * team-builder assistant embedded in the /teams editor.
 *
 * A SIBLING of ./sse-types.ts, not an extension: the chat module's event map is
 * deliberately hardcoded to the chat route (its `answer` carries an OakAnswer),
 * so the builder gets its own map with the identical wire format. The route
 * emits, in order:
 *   event: tool_activity   data: { tool, label }   (zero or more)
 *   event: answer_start    data: {}                (zero or more; resets the
 *                                                   client's in-flight buffer)
 *   event: answer_delta    data: { text }          (zero or more; incremental
 *                                                   chunks of answer_markdown)
 *   event: answer          data: { answer }        (exactly one, terminal —
 *                                                   a BuilderAnswer)
 *   event: error           data: { code, message } (transport faults ONLY)
 *
 * No `scope` event: the request's `draft.format` IS the turn's scope — there is
 * nothing for the server to resolve or announce. Every in-domain failure rides
 * a normal `answer` event (the runtime never throws in-domain), exactly like
 * the chat route.
 *
 * CLIENT-SAFE and portable (types + a pure formatter; no server imports).
 */

import type {
  AnswerDeltaEvent,
  AnswerStartEvent,
  ErrorEvent,
  ToolActivityEvent,
} from "@/lib/sse/sse-types";
import type { BuilderAnswer } from "@/agent/teams-assistant/schemas";
import type { Format } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";

/** The live, unsaved on-screen draft, sent with EVERY turn. */
export interface TeamsAssistantDraft {
  /** Current team-name input (may be empty). */
  name: string;
  /** The draft's format — this IS the turn's data scope. */
  format: Format;
  /** The editor's current members, in slot order (0-indexed, ≤ 6). */
  members: TeamMember[];
}

/** Request body for `POST /api/teams/assistant` (signed-in only). */
export interface TeamsAssistantRequestBody {
  /** Per-tab conversation id (client-generated; in-memory history only). */
  session_id: string;
  message: string;
  draft: TeamsAssistantDraft;
}

/** `event: answer` payload — the terminal, authoritative builder answer. */
export interface BuilderAnswerEvent {
  answer: BuilderAnswer;
}

export type TeamsAssistantSseEventName =
  | "tool_activity"
  | "answer_start"
  | "answer_delta"
  | "answer"
  | "error";

export interface TeamsAssistantSseEventDataMap {
  tool_activity: ToolActivityEvent;
  answer_start: AnswerStartEvent;
  answer_delta: AnswerDeltaEvent;
  answer: BuilderAnswerEvent;
  error: ErrorEvent;
}

/** One parsed SSE frame (discriminated on `event`). */
export type TeamsAssistantSseEvent = {
  [K in TeamsAssistantSseEventName]: {
    event: K;
    data: TeamsAssistantSseEventDataMap[K];
  };
}[TeamsAssistantSseEventName];

/**
 * Serialize one SSE frame — byte-identical wire format to the chat route's
 * `formatSseEvent` (`event: <name>\ndata: <single-line JSON>\n\n`).
 */
export function formatTeamsAssistantSseEvent<
  K extends TeamsAssistantSseEventName,
>(event: K, data: TeamsAssistantSseEventDataMap[K]): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
