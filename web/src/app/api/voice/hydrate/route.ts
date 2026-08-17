/**
 * GET/POST /api/voice/hydrate — retry / status for a voice-origin card
 * (VOICE-US-3, VOICE-BR-5/6). Signed-in only. Retry re-runs compile on the
 * SAME assistant row. 409 `turn_in_progress` only if a real chat turn is
 * running — another hydrate is replaced, not 409'd.
 */

import { z } from "zod";

import { oakAnswerSchema, type OakAnswer } from "@/agent/schemas";
import { isFormat, type Format } from "@/data/formats";
import { readJsonBodyWithLimit } from "@/server/body-limit";
import { checkRateLimit, type RateLimitConfig } from "@/server/rate-limit";
import { logger } from "@/server/logger";
import {
  getHydrate,
  setHydrateRunning,
} from "@/server/voice/hydrate-store";
import { findRunningBySession } from "@/server/turn-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 16 * 1024;

const HYDRATE_RATE_LIMIT: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 20,
  windowMs: 60_000,
};

const postBodySchema = z
  .object({
    conversation_id: z.string().min(1).max(200),
    assistant_message_id: z.string().min(1).max(200),
  })
  .strict();

function jsonError(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isVoiceOrigin(answer: OakAnswer): boolean {
  if (answer.origin === "voice") return true;
  return answer.reasoning_markdown.includes("spoken in voice mode");
}

function isThinVoiceCard(answer: OakAnswer): boolean {
  return (
    answer.citations.length === 0 &&
    answer.inferences.length === 0 &&
    (answer.subjects?.length ?? 0) === 0 &&
    answer.candidates === undefined &&
    answer.damage_calc === undefined &&
    answer.proposed_team === undefined
  );
}

/** Voice-origin thin card, or the same row already marked failed/running. */
function isRetryableVoiceCard(
  answer: OakAnswer,
  conversationId: string,
  assistantMessageId: string,
): boolean {
  if (!isVoiceOrigin(answer)) return false;
  const hydrate = getHydrate(conversationId);
  if (
    hydrate?.assistant_message_id === assistantMessageId &&
    (hydrate.status === "failed" || hydrate.status === "running")
  ) {
    return true;
  }
  return isThinVoiceCard(answer);
}

async function loadOwnedVoiceCard(
  accountId: string,
  conversationId: string,
  assistantMessageId: string,
): Promise<
  | {
      answer: OakAnswer;
      userText: string;
      assistantText: string;
      format: Format;
    }
  | null
> {
  const repo = await import("@/data/repos/conversation-repo");
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation || !isFormat(conversation.format)) return null;

  const messages = await repo.getMessages(accountId, conversationId);
  const asstIdx = messages.findIndex(
    (m) => m.id === assistantMessageId && m.role === "assistant",
  );
  if (asstIdx < 0) return null;
  const asst = messages[asstIdx]!;
  if (!asst.answerJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(asst.answerJson);
  } catch {
    return null;
  }
  const answer = oakAnswerSchema.safeParse(parsed);
  if (!answer.success) return null;

  const prev = asstIdx > 0 ? messages[asstIdx - 1] : undefined;
  const userText =
    prev?.role === "user" ? prev.textContent : "";

  return {
    answer: answer.data,
    userText,
    assistantText: asst.textContent,
    format: conversation.format,
  };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id") ?? "";
  const assistantMessageId = url.searchParams.get("assistant_message_id") ?? "";

  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (!account) {
    return jsonError(401, "sign_in_required", "Sign in to use voice mode.");
  }

  if (!conversationId || !assistantMessageId) {
    return jsonError(400, "invalid_request", "conversation_id and assistant_message_id are required.");
  }

  const loaded = await loadOwnedVoiceCard(
    account.id,
    conversationId,
    assistantMessageId,
  );
  if (!loaded || !isVoiceOrigin(loaded.answer)) {
    return jsonError(404, "not_found", "Voice card not found.");
  }

  const hydrate = getHydrate(conversationId);
  if (
    !hydrate ||
    hydrate.assistant_message_id !== assistantMessageId
  ) {
    return jsonError(404, "not_found", "Voice card not found.");
  }

  return jsonOk({ status: hydrate.status });
}

export async function POST(req: Request): Promise<Response> {
  const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return jsonError(413, "request_too_large", "Request body is too large.");
    }
    return jsonError(400, "invalid_request", "Body must be valid JSON.");
  }
  const parsed = postBodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonError(
      400,
      "invalid_request",
      "Body must be { conversation_id, assistant_message_id }.",
    );
  }
  const { conversation_id, assistant_message_id } = parsed.data;

  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (!account) {
    return jsonError(401, "sign_in_required", "Sign in to use voice mode.");
  }

  const gate = await checkRateLimit(
    `acct:${account.id}`,
    "",
    HYDRATE_RATE_LIMIT,
  );
  if (!gate.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many hydrate retries — please wait a moment.",
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

  // 409 only for a REAL chat turn — another hydrate is replaced (VOICE-BR-5).
  const running = findRunningBySession(conversation_id);
  if (running) {
    return new Response(
      JSON.stringify({
        code: "turn_in_progress",
        message:
          "A response is already generating for this conversation. Reattach to it.",
        turn_id: running.turnId,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const loaded = await loadOwnedVoiceCard(
    account.id,
    conversation_id,
    assistant_message_id,
  );
  if (
    !loaded ||
    !isRetryableVoiceCard(loaded.answer, conversation_id, assistant_message_id)
  ) {
    return jsonError(404, "not_found", "Voice card not found.");
  }

  setHydrateRunning(conversation_id, assistant_message_id);

  try {
    const { runVoiceCompile } = await import("@/server/voice/run-voice-compile");
    void runVoiceCompile({
      accountId: account.id,
      conversationId: conversation_id,
      assistantMessageId: assistant_message_id,
      sessionId: conversation_id,
      userText: loaded.userText,
      assistantText: loaded.assistantText,
      format: loaded.format,
    }).catch((err) => {
      logger.error(
        {
          event: "voice_hydrate_compile_failed",
          account_id: account.id,
          conversation_id,
          assistant_message_id,
          err: err instanceof Error ? err.message : String(err),
        },
        "oak_voice_hydrate_compile_failed",
      );
    });
  } catch (err) {
    logger.error(
      {
        event: "voice_hydrate_compile_start_failed",
        account_id: account.id,
        conversation_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_voice_hydrate_compile_start_failed",
    );
  }

  return jsonOk({ status: "running" });
}
