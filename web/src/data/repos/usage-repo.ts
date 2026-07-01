/**
 * src/data/repos/usage-repo.ts — the SOLE writer for the two append-only
 * admin-panel recording tables (`turn_record`, `auth_event`).
 *
 * Design refs:
 *   - docs/features/admin-panel/architecture/design.md
 *       § Data Model (turn_record, auth_event)
 *       § Component Design › "1. Usage recording (write path)"
 *       § Interface Definitions › usage-repo (these exact signatures)
 *       § Technical Decisions AD-3 (store full content), AD-4 (rate_limited row)
 *   - requirements.md ADMIN-US-6, ADMIN-AC-6.1/6.2, ADMIN-BR-6.
 *
 * Boundary rules (CLAUDE.md "repos are the sole Postgres readers/writers"):
 *   - `import "server-only"` — never bundled to the client.
 *   - Reads/writes the memoized `@/data/db` singleton directly (like
 *     accounts-repo.ts / resolve-index.ts), NOT a per-request ctx handle.
 *   - DB columns are snake_case (Drizzle); inputs are the camelCase
 *     Interface-Definitions shapes. Epoch-ms timestamps are `bigint` mode
 *     "number".
 *
 * APPEND-ONLY: both functions are INSERT-only — these rows are written once and
 * never updated or deleted (the panel only reads them). They are always invoked
 * fire-and-forget as `void recordX(...).catch(logOnly)` and are NEVER awaited on
 * the user's chat/auth critical path (ADMIN-BR-3); a write fault therefore
 * propagates to the caller's `.catch` rather than being swallowed here.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/data/db";
import { auth_event, turn_record } from "@/data/schema";
import type { ToolTraceEntry } from "@/server/logger";

// ---------------------------------------------------------------------------
// turn_record — one row per chat turn (guest + signed-in), append-only
// ---------------------------------------------------------------------------

/**
 * Input for {@link recordTurn}. Composed at the chat route from the runtime's
 * `TurnTrace` plus the route's own message/answer/account/mode. `model` /
 * `providerModel` are `string | null` to match the nullable columns: a
 * "rate_limited" row (AD-4) is recorded before the model is resolved, so it has
 * no model, and `answerText` / `answer` are null for it too.
 */
export interface TurnRecordInput {
  id: string; // request_id (turn PK)
  sessionId: string;
  accountId: string | null; // null = guest
  model: string | null; // ModelKey; null for rate_limited (no model resolved)
  providerModel: string | null; // trace.model; null for rate_limited
  mode: "standard" | "champions";
  status:
    | "answered"
    | "clarification_needed"
    | "resolution_failed"
    | "insufficient_data"
    | "rate_limited";
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  toolTrace: ToolTraceEntry[]; // serialized to JSON by the repo
  citationCount: number;
  turnLatencyMs: number;
  imagesCount: number;
  promptText: string;
  answerText: string | null;
  answer: unknown | null; // OakAnswer; the repo JSON.stringifies into answer_json
  createdAt: number; // epoch ms
}

/**
 * Persist one chat turn. INSERT-only. Derives `tool_error_count` from
 * `toolTrace` (the number of entries whose `error` is non-null), serializes the
 * tool trace into `tool_trace`, and serializes `answer` into `answer_json`
 * (null stays null). All numeric token/count fields fall back to 0 if a caller
 * passes a non-finite value, so a recording call can never write NaN.
 */
export async function recordTurn(input: TurnRecordInput): Promise<void> {
  const toolErrorCount = input.toolTrace.filter(
    (entry) => entry.error != null,
  ).length;

  await db.insert(turn_record).values({
    id: input.id,
    session_id: input.sessionId,
    account_id: input.accountId,
    model: input.model,
    provider_model: input.providerModel,
    mode: input.mode,
    status: input.status,
    input_tokens: int(input.inputTokens),
    output_tokens: int(input.outputTokens),
    thinking_tokens: int(input.thinkingTokens),
    tool_trace: JSON.stringify(input.toolTrace),
    tool_error_count: toolErrorCount,
    citation_count: int(input.citationCount),
    turn_latency_ms: int(input.turnLatencyMs),
    images_count: int(input.imagesCount),
    prompt_text: input.promptText,
    answer_text: input.answerText,
    answer_json: input.answer == null ? null : JSON.stringify(input.answer),
    created_at: input.createdAt,
  });
}

// ---------------------------------------------------------------------------
// auth_event — one row per auth event, append-only
// ---------------------------------------------------------------------------

/**
 * Input for {@link recordAuthEvent}. The repo mints the row `id` (UUID); the
 * caller supplies only the event payload. `detail` is JSON.stringified (null /
 * undefined → null).
 */
export interface AuthEventInput {
  type: "otp_requested" | "otp_verified" | "otp_email_failed";
  email: string | null;
  accountId?: string | null;
  createdFlag?: 0 | 1 | null; // signup vs sign-in for otp_verified
  detail?: unknown | null; // JSON.stringified
  createdAt: number; // epoch ms
}

/**
 * Persist one auth event (otp_requested / otp_verified / otp_email_failed).
 * INSERT-only; the repo generates the UUID `id`.
 */
export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  await db.insert(auth_event).values({
    id: randomUUID(),
    type: input.type,
    email: input.email,
    account_id: input.accountId ?? null,
    created_flag: input.createdFlag ?? null,
    detail: input.detail == null ? null : JSON.stringify(input.detail),
    created_at: input.createdAt,
  });
}

/** Coerce a token/count value to a finite integer (non-finite → 0). */
function int(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}
