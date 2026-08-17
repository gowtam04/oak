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

function isAborted(conversationId: string): boolean {
  return getHydrateSignal(conversationId)?.aborted === true;
}

async function failHydrate(
  conversationId: string,
  assistantMessageId: string,
): Promise<void> {
  setHydrateFailed(conversationId, assistantMessageId);
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

  const markFailed = () => failHydrate(conversationId, assistantMessageId);

  try {
    if (isAborted(conversationId)) {
      await markFailed();
      return;
    }

    const { activeModelKey, providerFor, isModelConfigured } = await import(
      "@/agent/providers/factory"
    );
    const modelKey = await activeModelKey();
    if (!isModelConfigured(modelKey)) {
      await markFailed();
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
    const signal = getHydrateSignal(conversationId);

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
      signal,
      // ADR-7: thinking off (single tool; avoid thinking + forced-choice 400).
      effort: "none",
      thinking: false,
    } as Parameters<typeof provider.streamTurn>[0] & {
      effort: "none";
      thinking: false;
    });

    for await (const _event of stream) {
      if (isAborted(conversationId)) {
        await markFailed();
        return;
      }
    }
    const final = await stream.final();

    if (isAborted(conversationId)) {
      await markFailed();
      return;
    }

    const submit = final.toolCalls.find((c) => c.name === "submit_answer");
    if (!submit) {
      await markFailed();
      return;
    }

    const sanitized = sanitizeCitationAnchors(submit.input);
    const stamped = forceVoiceOrigin(sanitized);
    const parsed = oakAnswerSchema.safeParse(stamped);
    if (!parsed.success) {
      await markFailed();
      return;
    }
    const answer: OakAnswer = { ...parsed.data, origin: "voice" };

    if (isAborted(conversationId)) {
      await markFailed();
      return;
    }

    const repo = await import("@/data/repos/conversation-repo");
    await repo.updateAssistantAnswer(
      accountId,
      conversationId,
      assistantMessageId,
      answer,
    );

    if (isAborted(conversationId)) {
      // Chat send won the race after the write started; leave whatever landed
      // and keep failed so Retry stays available if the row is still thin.
      await markFailed();
      return;
    }
    clearHydrate(conversationId);
  } catch (err) {
    if (isAborted(conversationId)) {
      await markFailed();
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
    await markFailed();
  }
}
