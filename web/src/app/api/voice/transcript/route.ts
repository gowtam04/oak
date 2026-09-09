/**
 * POST /api/voice/transcript — persist ONE completed voice turn (voice-mode plan
 * §5). Unified history: a finished voice turn (user transcript + assistant
 * transcript) is written into the signed-in conversation as a normal
 * user+assistant message pair, EXACTLY the way /api/chat persists a signed-in
 * turn (`appendTurnPair` with a synthesized OakAnswer).
 *
 * Signed-in only (401 gate). Voice speech carries no OakAnswer output contract,
 * so we synthesize the minimal valid `answered` OakAnswer — the assistant text
 * as `answer_markdown`, empty citations/inferences, and a generation basis
 * derived from the turn's format — and validate it against the REAL
 * `oakAnswerSchema` before insert (the stored `answer_json` must always parse).
 *
 * Env gotcha (same as /api/chat): the conversation repo (server-only + db) and
 * auth are DYNAMIC-imported inside the handler so `next build` never evaluates
 * `@/env`. `@/agent/schemas` and `@/data/formats` are pure/client-safe.
 */

import { z } from "zod";

import { readJsonBodyWithLimit } from "@/server/body-limit";
import { checkRateLimit, type RateLimitConfig } from "@/server/rate-limit";
import { FORMATS, type Format } from "@/data/formats";
import { oakAnswerSchema } from "@/agent/schemas";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A transcript pair is a few KB of text; cap generously. */
const MAX_REQUEST_BYTES = 128 * 1024;

/** Bounded per account — one write per completed spoken turn. */
const VOICE_TRANSCRIPT_RATE_LIMIT: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 30,
  windowMs: 60_000,
};

const requestBodySchema = z
  .object({
    session_id: z.string().min(1).max(200),
    format: z.enum(FORMATS as unknown as [Format, ...Format[]]),
    user_text: z.string(),
    assistant_text: z.string(),
  })
  .strict();

function jsonError(
  status: number,
  error: string,
  message: string,
  extraHeaders?: Record<string, string>,
  extraBody?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ code: error, error, message, ...extraBody }),
    {
      status,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    },
  );
}

const SPEND_CHECK_FAILED_MESSAGE =
  "Could not verify usage limits. Please try again.";

function spendRefuseResponse(admit: {
  code: "account_denied" | "daily_limit" | "spend_check_failed";
  message?: string;
  resetAt?: string;
  retryAfterMs?: number;
}): Response {
  const message = admit.message ?? SPEND_CHECK_FAILED_MESSAGE;
  if (admit.code === "daily_limit") {
    const headers: Record<string, string> = {};
    if (typeof admit.retryAfterMs === "number") {
      headers["Retry-After"] = String(Math.ceil(admit.retryAfterMs / 1000));
    }
    return jsonError(
      429,
      admit.code,
      message,
      headers,
      admit.resetAt !== undefined ? { reset_at: admit.resetAt } : undefined,
    );
  }
  if (admit.code === "account_denied") {
    return jsonError(403, admit.code, message);
  }
  return jsonError(503, admit.code, message);
}

export async function POST(req: Request): Promise<Response> {
  // 0) Body under a hard streaming byte cap.
  const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return jsonError(413, "request_too_large", "Request body is too large.");
    }
    return jsonError(400, "invalid_request", "Body must be valid JSON.");
  }
  const parsed = requestBodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError(
      400,
      "invalid_request",
      "Body must be { session_id, format, user_text, assistant_text }.",
    );
  }
  const { session_id, format, user_text, assistant_text } = parsed.data;

  // A turn needs both halves — an empty/whitespace-only transcript is not a
  // completed turn to persist.
  if (user_text.trim().length === 0 || assistant_text.trim().length === 0) {
    return jsonError(
      400,
      "invalid_request",
      "Both user_text and assistant_text must be non-empty.",
    );
  }

  // 1) AUTH — signed-in only (voice history is account-scoped).
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (!account) {
    return jsonError(401, "sign_in_required", "Sign in to use voice mode.");
  }

  // 1b) Denylist only — no increment (voice session was counted at token mint).
  const { assertNotDenylisted } = await import("@/server/spend-control");
  const deny = await assertNotDenylisted(account.email);
  if (!deny.ok) {
    logger.info(
      {
        event: "spend_refused",
        code: deny.code,
        subject_key: `acct:${account.id}`,
        session_id,
      },
      "oak_spend_refused",
    );
    return spendRefuseResponse(deny);
  }

  // 2) RATE LIMIT — one signed-in tier, keyed by account.
  const gate = await checkRateLimit(
    `acct:${account.id}`,
    "",
    VOICE_TRANSCRIPT_RATE_LIMIT,
  );
  if (!gate.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many transcript writes — please wait a moment.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.ceil(
              (gate.reason === "rate_limited" ? gate.retryAfterMs : 0) / 1000,
            ),
          ),
        },
      },
    );
  }

  // 3) SYNTHESIZE + VALIDATE — the stored answer_json must always parse.
  const { synthesizeVoiceAnswer } = await import("@/server/voice/voice-session");
  const candidate = synthesizeVoiceAnswer(assistant_text, format);
  const validated = oakAnswerSchema.safeParse(candidate);
  if (!validated.success) {
    // Server-constructed, so this should be unreachable — guard rather than
    // write an unparseable answer_json.
    logger.error(
      {
        event: "voice_transcript_answer_invalid",
        account_id: account.id,
        session_id,
        err: validated.error.message,
      },
      "oak_voice_transcript_answer_invalid",
    );
    return jsonError(
      500,
      "internal_error",
      "Could not record the voice turn. Please try again.",
    );
  }

  // 4) PERSIST — the same signed-in turn-pair write /api/chat uses.
  const repo = await import("@/data/repos/conversation-repo");
  const assistantTurnId = repo.newTurnId();
  try {
    await repo.appendTurnPair({
      accountId: account.id,
      conversationId: session_id,
      format,
      userTurnId: repo.newTurnId(),
      userMessage: user_text,
      assistantTurnId,
      answer: validated.data,
      now: Date.now(),
    });
  } catch (err) {
    logger.error(
      {
        event: "voice_transcript_persist_failed",
        account_id: account.id,
        session_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_voice_transcript_persist_failed",
    );
    return jsonError(
      500,
      "internal_error",
      "Could not record the voice turn. Please try again.",
    );
  }

  // 5) Hydrate fire-and-forget (VOICE-BR-1) — 200 without waiting.
  try {
    const { setHydrateRunning } = await import("@/server/voice/hydrate-store");
    setHydrateRunning(session_id, assistantTurnId);
    const { runVoiceCompile } = await import("@/server/voice/run-voice-compile");
    void runVoiceCompile({
      accountId: account.id,
      conversationId: session_id,
      assistantMessageId: assistantTurnId,
      sessionId: session_id,
      userText: user_text,
      assistantText: assistant_text,
      format,
    }).catch((err) => {
      logger.error(
        {
          event: "voice_compile_failed",
          account_id: account.id,
          session_id,
          assistant_message_id: assistantTurnId,
          err: err instanceof Error ? err.message : String(err),
        },
        "oak_voice_compile_failed",
      );
    });
  } catch (err) {
    logger.error(
      {
        event: "voice_compile_start_failed",
        account_id: account.id,
        session_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_voice_compile_start_failed",
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
