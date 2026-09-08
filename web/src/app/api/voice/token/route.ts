/**
 * POST /api/voice/token — mint a short-lived xAI realtime token + the session
 * bootstrap the browser feeds into `session.update` (voice-mode plan §5).
 *
 * Signed-in only (voice is account-scoped: unified history). A guest gets a
 * clean 401 before anything else. Flow: parse+validate body → auth (401) →
 * spend admission (before xAI mint) → per-account rate limit (strict — token
 * mints are cheap to abuse) → load the conversation's prior history for the
 * injected digest → mint the ephemeral token from xAI → respond with the token
 * + bootstrap. An xAI mint failure is a clean 502, never a 500.
 *
 * Env gotcha (same as /api/chat): the env-touching modules (auth, the
 * conversation repo, the voice-session module that reads `@/env`) are
 * DYNAMIC-imported inside the handler so `next build` never evaluates `@/env`.
 */

import { z } from "zod";

import { readJsonBodyWithLimit } from "@/server/body-limit";
import { checkRateLimit, type RateLimitConfig } from "@/server/rate-limit";
import { FORMATS, type Format } from "@/data/formats";
import type { ChatMessage } from "@/agent/types";
import { logger } from "@/server/logger";
import type { VoiceTokenResponseBody } from "@/lib/voice/voice-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A token + a small format string is well under a KiB; cap generously. */
const MAX_REQUEST_BYTES = 16 * 1024;

/**
 * Strict per-account cap: minting a token is a lightweight but repeatable
 * operation (each opens a billable realtime session), so 5/min bounds abuse
 * while leaving ample headroom for reconnects. Defined here (not in
 * rate-limit.ts) since it is voice-specific.
 */
const VOICE_TOKEN_RATE_LIMIT: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 5,
  windowMs: 60_000,
};

const requestBodySchema = z
  .object({
    session_id: z.string().min(1).max(200),
    format: z.enum(FORMATS as unknown as [Format, ...Format[]]),
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

/** Structured token-route log. Never include the minted token / xAI value. */
function logVoiceToken(
  event:
    | "voice_token_accepted"
    | "voice_token_unauthorized"
    | "voice_token_invalid_request"
    | "voice_token_rate_limited"
    | "voice_token_mint_failed",
  fields: Record<string, unknown>,
  level: "info" | "error" = "info",
): void {
  logger[level]({ event, ...fields }, `oak_${event}`);
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
    logVoiceToken("voice_token_invalid_request", {
      reason: bodyResult.reason,
    });
    if (bodyResult.reason === "too_large") {
      return jsonError(413, "request_too_large", "Request body is too large.");
    }
    return jsonError(400, "invalid_request", "Body must be valid JSON.");
  }
  const parsed = requestBodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    logVoiceToken("voice_token_invalid_request", { reason: "schema" });
    return jsonError(
      400,
      "invalid_request",
      "Body must be { session_id: string, format: Format }.",
    );
  }
  const { session_id, format } = parsed.data;

  // 1) AUTH — signed-in only, before any state is touched.
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (!account) {
    logVoiceToken("voice_token_unauthorized", { session_id });
    return jsonError(
      401,
      "sign_in_required",
      "Sign in to use voice mode.",
    );
  }

  // 1b) Spend admission BEFORE rate limit and BEFORE xAI mint (SC-BR-1).
  const [{ admitAgentTurn }, { isAdmin }] = await Promise.all([
    import("@/server/spend-control"),
    import("@/server/auth/admin"),
  ]);
  const admit = await admitAgentTurn({
    subject: {
      kind: "account",
      accountId: account.id,
      email: account.email,
    },
    isAdmin: isAdmin(account),
    surface: "voice",
  });
  if (!admit.ok) {
    logger.info(
      {
        event: "spend_refused",
        code: admit.code,
        subject_key: `acct:${account.id}`,
        session_id,
      },
      "oak_spend_refused",
    );
    return spendRefuseResponse(admit);
  }

  // 2) RATE LIMIT — one signed-in tier, keyed by account.
  const gate = await checkRateLimit(
    `acct:${account.id}`,
    "",
    VOICE_TOKEN_RATE_LIMIT,
  );
  if (!gate.allowed) {
    // input_too_long is impossible here (empty message); only rate_limited fires.
    logVoiceToken("voice_token_rate_limited", {
      account_id: account.id,
      session_id,
    });
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many voice sessions started — please wait a moment.",
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

  // 3) HISTORY — load the conversation's prior turns for the injected digest.
  //    The turn's scope comes from the client (body.format), not the stored
  //    format. A DB blip here degrades to an empty history, never a 500
  //    (guest-first stance mirrored from /api/chat's history load).
  let history: ChatMessage[] = [];
  try {
    const repo = await import("@/data/repos/conversation-repo");
    const stored = await repo.getMessages(account.id, session_id);
    history = stored.map((m) => ({ role: m.role, content: m.textContent }));
  } catch (err) {
    logger.warn(
      {
        event: "voice_history_load_failed",
        account_id: account.id,
        session_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_voice_history_load_failed",
    );
  }

  // 4) MINT + BOOTSTRAP — the voice-session module reads `@/env`, so it is
  //    dynamic-imported here. A mint failure is a clean 502.
  const { mintEphemeralToken, buildSessionBootstrap } = await import(
    "@/server/voice/voice-session"
  );

  let minted: { value: string; expires_at: number };
  try {
    minted = await mintEphemeralToken();
  } catch (err) {
    logVoiceToken(
      "voice_token_mint_failed",
      {
        account_id: account.id,
        session_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "error",
    );
    return jsonError(
      502,
      "voice_upstream_error",
      "Could not start a voice session right now — please try again.",
    );
  }

  const session = buildSessionBootstrap({ format, history });
  const responseBody: VoiceTokenResponseBody = {
    token: minted.value,
    expires_at: minted.expires_at,
    session,
  };

  logVoiceToken("voice_token_accepted", {
    account_id: account.id,
    session_id,
    format,
  });

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
