/**
 * Voice hydrate compile (ADR-7). One submit_answer-only provider turn;
 * thinking off. Success overwrites the same assistant row via
 * `updateAssistantAnswer`. Failure / abort leaves the thin spoken card and
 * marks hydrate failed. Not a second user/assistant pair.
 */

import "server-only";

import { oakAnswerSchema, type OakAnswer } from "@/agent/schemas";
import { sanitizeCitationAnchors } from "@/agent/sanitize-citation-anchors";
import {
  buildVoiceCompileSegments,
  buildVoiceCompileUserMessage,
} from "@/agent/prompts/voice-compile";
import { submitAnswerTool } from "@/agent/tools/submit-answer";
import type { Format } from "@/data/formats";
import { logger } from "@/server/logger";
import {
  getHydrateSignal,
  isCurrentHydrateSignal,
  setHydrateFailed,
  clearHydrate,
} from "@/server/voice/hydrate-store";
import { getVoiceTrace } from "@/server/voice/tool-trace-store";

export type RunVoiceCompileArgs = {
  accountId: string;
  conversationId: string;
  assistantMessageId: string;
  sessionId: string;
  userText: string;
  assistantText: string;
  format: Format;
};

function forceVoiceOrigin(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
    return { origin: "voice" };
  }
  return { ...(answer as Record<string, unknown>), origin: "voice" };
}

/**
 * Own this conversation's hydrate only if `mine` is still the store's
 * current generation. A Retry swap aborts `mine` and installs a new
 * controller — the replaced compile must not write or mark failed.
 */
function stillCurrent(
  conversationId: string,
  mine: AbortSignal | undefined,
): boolean {
  if (!mine) return getHydrateSignal(conversationId) === undefined;
  return isCurrentHydrateSignal(conversationId, mine);
}

/**
 * Compile a thin spoken voice card into a real OakAnswer on the same row.
 * Never invents a second message pair. Caller fire-and-forgets this.
 */
export async function runVoiceCompile(args: RunVoiceCompileArgs): Promise<void> {
  const {
    accountId,
    conversationId,
    assistantMessageId,
    sessionId,
    userText,
    assistantText,
    format,
  } = args;

  // Capture THIS compile's generation before any await (VOICE-BR-5).
  const mine = getHydrateSignal(conversationId);

  const failIfCurrent = (): void => {
    if (stillCurrent(conversationId, mine)) {
      setHydrateFailed(conversationId, assistantMessageId);
    }
  };

  const stopIfSupersededOrAborted = (): boolean => {
    if (mine?.aborted || !stillCurrent(conversationId, mine)) {
      failIfCurrent();
      return true;
    }
    return false;
  };

  try {
    if (stopIfSupersededOrAborted()) return;

    const { activeModelKey, providerFor, isModelConfigured } = await import(
      "@/agent/providers/factory"
    );
    const modelKey = await activeModelKey();
    if (!isModelConfigured(modelKey)) {
      failIfCurrent();
      return;
    }
    const provider = providerFor(modelKey);

    const trace = getVoiceTrace(sessionId);
    const system = buildVoiceCompileSegments(format);
    const userMessage = buildVoiceCompileUserMessage({
      userText,
      assistantText,
      trace,
    });
    const transcript = provider.createTranscript([], userMessage);

    const stream = provider.streamTurn({
      system,
      tools: [
        {
          name: submitAnswerTool.name,
          description: submitAnswerTool.description,
          parameters: submitAnswerTool.inputSchema,
        },
      ],
      transcript,
      signal: mine,
      // ADR-7: thinking off (single tool; avoid thinking + forced-choice 400).
      effort: "none",
    });

    for await (const _event of stream) {
      if (stopIfSupersededOrAborted()) return;
    }
    const final = await stream.final();

    if (stopIfSupersededOrAborted()) return;

    const submit = final.toolCalls.find((c) => c.name === "submit_answer");
    if (!submit) {
      failIfCurrent();
      return;
    }

    const sanitized = sanitizeCitationAnchors(submit.input);
    const stamped = forceVoiceOrigin(sanitized);
    const parsed = oakAnswerSchema.safeParse(stamped);
    if (!parsed.success) {
      failIfCurrent();
      return;
    }
    const answer: OakAnswer = { ...parsed.data, origin: "voice" };

    if (stopIfSupersededOrAborted()) return;

    const repo = await import("@/data/repos/conversation-repo");
    await repo.updateAssistantAnswer(
      accountId,
      conversationId,
      assistantMessageId,
      answer,
    );

    // Committed. Clear if we still own this generation — even if a late
    // abortVoiceCompile marked failed after the write (do not re-fail).
    if (stillCurrent(conversationId, mine)) {
      clearHydrate(conversationId);
    }
  } catch (err) {
    if (mine?.aborted || !stillCurrent(conversationId, mine)) {
      failIfCurrent();
      return;
    }
    logger.error(
      {
        event: "voice_compile_failed",
        account_id: accountId,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_voice_compile_failed",
    );
    failIfCurrent();
  }
}
