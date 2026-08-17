/**
 * `runTurn` — the detached, server-side agent task for one chat turn
 * (background-turns/design.md §5.2 step 2). Extracted from the chat route's
 * inline `ReadableStream.start()` closure so a turn:
 *   - runs to completion regardless of who is watching (BT-1) — its only aborter
 *     is `turn.abort.signal`, fired ONLY by explicit stop (BT-4), never by a
 *     client disconnect;
 *   - persists BEFORE it publishes the terminal `answer` (order flips vs. the
 *     old signed-in path: with reattach, a client that sees `answer` may
 *     immediately refetch history, so the write must already be committed —
 *     persistence failure still only logs, the answer still publishes);
 *   - is unit-testable WITHOUT a `Request` object (it takes a plain params bag).
 *
 * It emits its events through {@link publish} (fan-out to the turn's
 * subscribers), not by writing to any one controller — the response stream is
 * just one subscriber that may come and go.
 */

import { createAgentContext } from "@/agent/context";
import { modelLabel, type ModelKey } from "@/agent/models";
import { ProviderTransportError } from "@/agent/providers/errors";
import type { ProposedTeam } from "@/agent/schemas";
import type {
  AgentMode,
  BoundTeam,
  ChatMessage,
  ImageAttachment,
  OnAnswerDelta,
  OnAnswerStart,
  OnProgress,
} from "@/agent/types";
import type { Account } from "@/data/repos/accounts-repo";
import { formatForMode, type Format } from "@/data/formats";
import type { ClientPlatform } from "@/lib/client-platform";
import type { ScopeEvent } from "@/lib/sse/sse-types";
import { logger, type TurnTrace } from "@/server/logger";
import { appendTurn, replaceLastPair } from "@/server/session-store";
import { publish, type TurnRecord } from "@/server/turn-store";

export interface RunTurnParams {
  /** The registered, running turn this task drives. */
  turn: TurnRecord;
  /** Per-turn id — the `turn_record` PK + the request/trace id. */
  requestId: string;
  /** Conversation id (chat `session_id`). */
  sessionId: string;
  /** Signed-in account, or `null` for a guest turn. */
  account: Account | null;
  /** Resolved agent mode (drives the format-scoped tools). */
  mode: AgentMode;
  /** Resolved data scope for the `scope` event. */
  format: Format;
  /** How the scope was resolved (for the `scope` event's `source`). */
  scopeSource: ScopeEvent["source"];
  /** The current user message (may be empty when an image is attached). */
  message: string;
  /** Prior turns (trimmed), never including the current message. */
  history: ChatMessage[];
  /** The most recent structured team proposal in this conversation, if any. */
  proposedTeam?: ProposedTeam;
  /** Validated + mime-sniffed images for THIS turn (consume-on-turn). */
  images: ImageAttachment[];
  /** Operator-selected active model (admin Settings selection, `app_setting`). */
  activeModel: ModelKey;
  /**
   * First-party client platform from `X-Oak-Client` (null when absent/invalid).
   * Stored on the admin `turn_record` only — never an LLM-visible tool input.
   */
  client?: ClientPlatform | null;
  /**
   * Retry/edit: on a successful answer, replace the last user+assistant pair
   * instead of appending. Omit for a normal append. Stop/error never write.
   */
  recovery?: "retry" | "edit";
  /**
   * @mentioned teams already resolved by the route (MEN-BR-1). Bound onto
   * `AgentContext.boundTeams` for this turn only.
   */
  boundTeams?: BoundTeam[];
}

/**
 * Drive one turn to completion. Never rejects — every outcome is delivered as a
 * terminal event via {@link publish} (or, for a stopped turn, the `stopped`
 * event `stopTurn` already published). Detach with `void runTurn(...)`.
 */
export async function runTurn(params: RunTurnParams): Promise<void> {
  const {
    turn,
    requestId,
    sessionId,
    account,
    mode,
    format,
    scopeSource,
    message,
    history,
    proposedTeam,
    images,
    activeModel,
    client = null,
    recovery,
    boundTeams,
  } = params;

  // Fire-and-forget recording-fault logger (ADMIN-BR-3) — a `turn_record` write
  // failure is LOGGED and never affects the turn.
  const logRecordFailure = (err: unknown): void => {
    logger.error(
      {
        event: "turn_record_failed",
        request_id: requestId,
        session_id: sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_turn_record_failed",
    );
  };

  // The per-turn trace the runtime assembles in finalize() (admin recording).
  const traceRef: { current: TurnTrace | null } = { current: null };

  try {
    // Emit the resolved scope FIRST, before any tool activity (GS-C) — the
    // client renders the scope chip immediately.
    publish(turn, { event: "scope", data: { format, source: scopeSource } });

    // Dynamic import defers env validation to request time (runtime.ts
    // evaluates env at module load); the same reason the chat route deferred it.
    const { runOak } = await import("@/agent/runtime");

    const ctx = await createAgentContext({
      requestId,
      sessionId,
      mode,
      model: activeModel,
      accountId: account?.id,
      proposedTeam,
      images: images.length > 0 ? images : undefined,
      boundTeams:
        boundTeams && boundTeams.length > 0 ? boundTeams : undefined,
      // The ONLY aborter is explicit stop (BT-4) — a client disconnect never
      // reaches here (design §5.2 step 2). Binding the turn's own signal, NOT
      // any request signal, is the whole feature.
      signal: turn.abort.signal,
    });

    ctx.onTurnComplete = (trace) => {
      traceRef.current = trace;
    };

    const onProgress: OnProgress = (e) => {
      publish(turn, { event: "tool_activity", data: { tool: e.tool, label: e.label } });
    };
    const onAnswerStart: OnAnswerStart = () => {
      publish(turn, { event: "answer_start", data: {} });
    };
    const onAnswerDelta: OnAnswerDelta = (text) => {
      publish(turn, { event: "answer_delta", data: { text } });
    };

    const answer = await runOak(
      message,
      history,
      ctx,
      onProgress,
      onAnswerStart,
      onAnswerDelta,
    );

    // If the turn was stopped mid-flight, `stopTurn` already published `stopped`
    // and flipped the status. Persist nothing, record nothing, publish nothing
    // (BT-4 — a stopped turn is discarded, matching today's Stop semantics).
    if (turn.abort.signal.aborted || turn.status !== "running") {
      return;
    }

    // In-domain success (any status). If `save_team` (T13) persisted a team this
    // turn, stamp the answer authoritatively from the server-owned result.
    if (ctx.savedTeam) {
      answer.saved_team = ctx.savedTeam;
    }

    // What to store as the user turn's text for future turns + the conversation
    // title. An image-only message (empty text) records a marker.
    const userTurnText =
      message.length > 0
        ? message
        : `[image attached${images.length > 1 ? ` ×${images.length}` : ""}]`;

    // PERSIST FIRST, then publish the terminal `answer` (design §5.2 step 2). A
    // persistence failure only logs — the answer event still publishes; the turn
    // is not failed.
    if (account) {
      try {
        const repo = await import("@/data/repos/conversation-repo");
        if (recovery) {
          await repo.replaceLastPair(
            account.id,
            sessionId,
            userTurnText,
            answer,
          );
        } else {
          await repo.appendTurnPair({
            accountId: account.id,
            conversationId: sessionId,
            format: formatForMode(mode),
            userTurnId: repo.newTurnId(),
            userMessage: userTurnText,
            assistantTurnId: repo.newTurnId(),
            answer,
            now: Date.now(),
          });
        }
      } catch (err) {
        logger.error(
          {
            event: "chat_persist_failed",
            request_id: requestId,
            account_id: account.id,
            session_id: sessionId,
            err: err instanceof Error ? err.message : String(err),
          },
          "oak_chat_persist_failed",
        );
      }
    } else {
      // GUEST: in-memory session store (fail-soft in the store itself).
      try {
        if (recovery) {
          await replaceLastPair(
            sessionId,
            userTurnText,
            answer.answer_markdown,
          );
        } else {
          await appendTurn(sessionId, { role: "user", content: userTurnText });
          await appendTurn(sessionId, {
            role: "assistant",
            content: answer.answer_markdown,
          });
        }
      } catch (err) {
        logger.error(
          {
            event: "chat_persist_failed",
            request_id: requestId,
            session_id: sessionId,
            err: err instanceof Error ? err.message : String(err),
          },
          "oak_chat_persist_failed",
        );
      }
    }

    // SCOPE-BR-2: signed-in completed turn upserts the resolved format into
    // the account's scope MRU. Fire-and-forget — never on the critical path;
    // guests have no MRU.
    if (account) {
      const acctId = account.id;
      const logMruFailure = (err: unknown): void => {
        logger.error(
          {
            event: "scope_mru_touch_failed",
            request_id: requestId,
            account_id: acctId,
            session_id: sessionId,
            err: err instanceof Error ? err.message : String(err),
          },
          "oak_scope_mru_touch_failed",
        );
      };
      try {
        const mru = await import("@/data/repos/scope-mru-repo");
        void mru.touch(acctId, format, Date.now()).catch(logMruFailure);
      } catch (err) {
        logMruFailure(err);
      }
    }

    // Non-blocking admin recording (ADMIN-BR-3, AD-2/AD-3): one turn_record per
    // COMPLETED turn, exactly as the route did before — never awaited, a write
    // fault only logs. Fired BEFORE publishing the terminal `answer` (which
    // closes the stream), so the recording is initiated while the turn is still
    // observably in flight — same relative order the route had (answer → record
    // → close), just persist-first now. (Transport-error and stopped turns are
    // not recorded: the `turn_record` status enum has no such value, and errors
    // were never recorded "as today" — see design §5.2.)
    try {
      const { recordTurn } = await import("@/data/repos/usage-repo");
      void recordTurn({
        id: requestId,
        sessionId,
        accountId: account?.id ?? null,
        model: activeModel,
        providerModel: traceRef.current?.model ?? null,
        mode,
        status: answer.status,
        inputTokens: traceRef.current?.input_tokens ?? 0,
        outputTokens: traceRef.current?.output_tokens ?? 0,
        thinkingTokens: traceRef.current?.thinking_tokens ?? 0,
        cachedInputTokens: traceRef.current?.cached_input_tokens ?? 0,
        toolTrace: traceRef.current?.tool_trace ?? [],
        citationCount:
          traceRef.current?.citation_count ?? answer.citations.length,
        turnLatencyMs: traceRef.current?.turn_latency_ms ?? 0,
        imagesCount: images.length,
        client,
        promptText: message,
        answerText: answer.answer_markdown,
        answer,
        createdAt: Date.now(),
      }).catch(logRecordFailure);
    } catch (err) {
      logRecordFailure(err);
    }

    publish(turn, { event: "answer", data: { answer } });
  } catch (err) {
    // A stop surfaces as an AbortError out of the runtime; `stopTurn` already
    // published `stopped` — just exit (persist nothing, record nothing).
    if (turn.abort.signal.aborted || turn.status !== "running") {
      return;
    }

    // Transport/API fault ONLY (runOak never throws for in-domain conditions).
    const detail = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        event: "chat_transport_error",
        request_id: requestId,
        session_id: sessionId,
        model: activeModel,
        err: detail,
      },
      "oak_chat_transport_error",
    );
    if (err instanceof ProviderTransportError) {
      const statusPart = err.status ? ` (HTTP ${err.status})` : "";
      publish(turn, {
        event: "error",
        data: {
          code: "model_provider_error",
          message: `${modelLabel(activeModel)} is unavailable right now${statusPart} — please try again, or check the provider key.`,
          ...(err.status !== undefined ? { status: err.status } : {}),
        },
      });
    } else {
      publish(turn, {
        event: "error",
        data: {
          code: "agent_error",
          message: "The assistant hit a transport error. Please try again.",
        },
      });
    }
  }
}
