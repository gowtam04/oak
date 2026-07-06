/**
 * `POST /api/conversations/import` — the guest→sign-in bulk save
 * (docs/features/chat-history § API Design; HIST-US-12, BR-H10, AC-12.1, AC-12.2).
 *
 * At sign-in the on-screen thread's full-fidelity turns live only on the client,
 * so this is the ONE client-driven write path (HIST-AD-3). It validates every
 * assistant turn's `answer` against `oakAnswerSchema` before storing
 * (malformed → 400 `invalid_turns`), then upserts the conversation and inserts
 * the rows idempotently (ON CONFLICT keyed by the client turn ids).
 *
 *   - empty turns → 200 { id: null } (creates nothing, AC-12.2)
 *   - else        → 200 { id }
 *   - guest       → 401
 */

import { json, jsonError } from "@/app/api/auth/_lib/http";
import { readJsonBodyWithLimit } from "@/server/body-limit";
import { oakAnswerSchema } from "@/agent/schemas";
import { CHAMPIONS_FORMAT, isFormat, NATDEX_FORMAT, type Format } from "@/data/formats";
import type { ChatTurn } from "@/components/types";
import { currentAccount, conversationRepo } from "../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Byte cap for the imported thread (EDGE-01). Imported turns carry full OakAnswer
 * JSON, so this is far larger than the 64 KiB auth default — but still bounded,
 * and enforced by streaming (a chunked body can't slip past it).
 */
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/**
 * Hard cap on the number of turns in a single import (EDGE-01). `validateTurns`
 * iterates + Zod-validates every turn, so an unbounded array is a CPU DoS; a
 * legitimate on-screen thread is nowhere near this.
 */
const MAX_TURNS = 1000;

/**
 * Validate the client-sent turns into a clean ChatTurn[] (dropping any extra
 * fields), or return `null` if any turn is malformed OR the array exceeds
 * MAX_TURNS. Assistant answers are validated against the canonical OakAnswer
 * schema (BR-H3).
 */
function validateTurns(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;
  // Reject an oversized array up front, before iterating/validating (EDGE-01).
  if (raw.length > MAX_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== "string" || t.id.length === 0) return null;

    if (t.role === "user") {
      if (typeof t.content !== "string") return null;
      turns.push({ id: t.id, role: "user", content: t.content });
    } else if (t.role === "assistant") {
      const parsed = oakAnswerSchema.safeParse(t.answer);
      if (!parsed.success) return null;
      turns.push({ id: t.id, role: "assistant", answer: parsed.data });
    } else {
      return null;
    }
  }
  return turns;
}

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount();
  if (account === null) {
    return jsonError(401, "unauthorized", "You must be signed in.");
  }

  // Read under a hard streaming byte cap (EDGE-01) — too_large → 413, malformed
  // → 400. Using the helper directly (not readJsonObject) so an over-cap import
  // gets a distinct 413 rather than being folded into the 400 path.
  const bodyResult = await readJsonBodyWithLimit(req, MAX_IMPORT_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return jsonError(413, "payload_too_large", "Request body is too large.");
    }
    return jsonError(400, "invalid_request", "Request body must be valid JSON.");
  }
  const body =
    typeof bodyResult.value === "object" && bodyResult.value !== null
      ? (bodyResult.value as Record<string, unknown>)
      : null;
  if (
    body === null ||
    typeof body.session_id !== "string" ||
    body.session_id.length === 0
  ) {
    return jsonError(
      400,
      "invalid_request",
      "Request body must be { session_id, champions_mode, turns }.",
    );
  }

  const turns = validateTurns(body.turns);
  if (turns === null) {
    return jsonError(
      400,
      "invalid_turns",
      "One or more turns are malformed.",
    );
  }

  // Empty thread imports nothing (AC-12.2) — no DB row created.
  if (turns.length === 0) {
    return json(200, { id: null });
  }

  // GS-C import-flow: prefer the RESOLVED scope the client sends (a guest thread
  // that switched to gen-7 via an in-message signal must import as gen-7), and
  // fall back to the `champions_mode` toggle seed for back-compat when `format`
  // is absent or not a known format. A toggle-OFF maps to the National Dex
  // default (matching the chat route's legacy-seed handling), not scarlet-violet.
  const format: Format =
    typeof body.format === "string" && isFormat(body.format)
      ? body.format
      : body.champions_mode === true
        ? CHAMPIONS_FORMAT
        : NATDEX_FORMAT;

  const repo = await conversationRepo();
  const id = await repo.importConversation({
    accountId: account.id,
    id: body.session_id,
    format,
    turns,
    now: Date.now(),
  });

  return json(200, { id });
}
