/**
 * POST /api/teams/assistant — the team-builder assistant embedded in /teams
 * (SSE), modeled on /api/chat's structure with three deliberate differences:
 *
 *   1. SIGNED-IN ONLY (teams are account-scoped): a guest gets a clean 401
 *      before anything else touches state — mirroring /api/teams' ordering,
 *      not /api/chat's (which resolves the account only for rate-limit
 *      tiering). One rate-limit tier, keyed `acct:<id>`.
 *   2. The LIVE DRAFT rides in the body every turn and is folded into the
 *      CURRENT user message as a JSON preamble — it is not AgentContext state
 *      and it is not stored in history (history keeps only the typed
 *      messages; the model is told the latest message carries the live
 *      draft). `draft.format` IS the turn's scope — no scope resolution, no
 *      `scope` event.
 *   3. The loop runs with the builder hooks (scoped read-only tools,
 *      BuilderAnswer contract, patch-legality gate) instead of the OakAnswer
 *      defaults. Answers land in the on-screen draft via the client's Apply —
 *      this route writes NOTHING to the teams tables.
 *
 * History is in-memory only (the guest session store, under a
 * `teams-assistant:` key prefix so builder panels and main-chat guests can
 * never collide) — durable builder-chat history is out of scope for v1, as is
 * turn_record usage recording (no finalizeAnswer hook; flagged in the plan).
 *
 * Same env gotcha as /api/chat: the runtime/db/auth modules are dynamically
 * imported INSIDE the handler so `next build` never evaluates `@/env`.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { logger } from "@/server/logger";
import {
  checkRateLimit,
  TEAMS_ASSISTANT_CONFIG,
} from "@/server/rate-limit";
import { appendTurn, getHistory, trim } from "@/server/session-store";
import { readJsonBodyWithLimit } from "@/server/body-limit";
import {
  formatTeamsAssistantSseEvent,
  type TeamsAssistantSseEventDataMap,
  type TeamsAssistantSseEventName,
} from "@/lib/sse/teams-assistant-sse-types";
import { FORMATS, modeForFormat, type Format } from "@/data/formats";
import { teamMembersSchema } from "@/data/teams/team-schema";
import { ProviderTransportError } from "@/agent/providers/errors";
import { modelLabel } from "@/agent/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous body cap — a message + a ≤6-member draft is a few KB. */
const MAX_REQUEST_BYTES = 256 * 1024;

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering (nginx etc.) so events flush immediately.
  "X-Accel-Buffering": "no",
};

function jsonError(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// ---------------------------------------------------------------------------
// Body validation (Zod — strict, like the team schema itself)
// ---------------------------------------------------------------------------

const requestBodySchema = z
  .object({
    session_id: z.string().min(1).max(200),
    message: z.string(),
    draft: z
      .object({
        name: z.string().max(120),
        format: z.enum(FORMATS as unknown as [Format, ...Format[]]),
        members: teamMembersSchema,
      })
      .strict(),
  })
  .strict();

type TeamsAssistantBody = z.infer<typeof requestBodySchema>;

/**
 * The builder history lives in the shared in-memory session store under its
 * own key namespace, so a builder panel and a main-chat guest session can
 * never share a thread even if a client reused the same raw id.
 */
function storeKey(sessionId: string): string {
  return `teams-assistant:${sessionId}`;
}

/**
 * Fold the live draft into the current user message as a JSON preamble. Only
 * the CURRENT turn carries it (history keeps the typed messages alone) — the
 * prompt tells the model the latest message's block is the live editor state
 * and to trust it over earlier turns.
 */
function composeMessage(body: TeamsAssistantBody): string {
  const draftJson = JSON.stringify(
    {
      name: body.draft.name,
      format: body.draft.format,
      members: body.draft.members,
    },
    null,
    2,
  );
  return (
    `[CURRENT TEAM DRAFT — live editor state, server-attached]\n` +
    "```json\n" +
    draftJson +
    "\n```\n\n" +
    `[USER MESSAGE]\n${body.message}`
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();

  // Read + parse the body under a HARD streaming byte cap (EDGE-01) — this
  // replaces the old Content-Length-only guard, which a chunked-encoding request
  // (no Content-Length header) slipped past before `req.json()` buffered it
  // uncapped. too_large → 413, malformed → 400.
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
      "Body must be { session_id, message, draft: { name, format, members } }.",
    );
  }
  const body = parsed.data;
  const { session_id } = body;

  // 1) AUTH — signed-in only, before any state is touched (mirrors /api/teams).
  //    Dynamic import: a static one would trip @/env at build time.
  const { getCurrentAccount } = await import("@/server/auth/current-user");
  const account = await getCurrentAccount();
  if (!account) {
    return jsonError(
      401,
      "unauthorized",
      "Sign in to use the team-builder assistant.",
    );
  }

  // 2) RATE LIMIT — one signed-in tier, keyed by account (no guest branch).
  const gate = await checkRateLimit(
    `acct:${account.id}`,
    body.message,
    TEAMS_ASSISTANT_CONFIG,
  );
  if (!gate.allowed) {
    if (gate.reason === "input_too_long") {
      return jsonError(
        413,
        "input_too_long",
        `Message exceeds the ${TEAMS_ASSISTANT_CONFIG.maxInputLength}-character limit.`,
      );
    }
    return jsonError(
      429,
      "rate_limited",
      "Too many requests — please wait a moment and try again.",
      { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) },
    );
  }

  // 3) MODEL — operator-controlled via the admin Settings selection (never
  //    per-request, never LLM-visible); fail fast with a clean 503 if its key is
  //    absent (same contract as /api/chat).
  const { activeModelKey, isModelConfigured } = await import(
    "@/agent/providers/factory"
  );
  const activeModel = await activeModelKey();
  if (!isModelConfigured(activeModel)) {
    return jsonError(
      503,
      "model_not_configured",
      `${modelLabel(activeModel)} is not configured on this server. Pick a configured model in Admin → Settings or add the provider's API key.`,
    );
  }

  // 4) HISTORY — in-memory, namespaced, trimmed to the context budget. The
  //    current message is passed to the loop separately (never in history).
  const historyKey = storeKey(session_id);
  await trim(historyKey);
  const history = [...(await getHistory(historyKey))];

  const mode = modeForFormat(body.draft.format);
  const composedMessage = composeMessage(body);

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = (): void => {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Single guarded write path (see /api/chat): once the client
      // disconnects, enqueue throws — catch, mark closed, stop.
      const enqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          stopHeartbeat();
        }
      };

      const send = <K extends TeamsAssistantSseEventName>(
        event: K,
        data: TeamsAssistantSseEventDataMap[K],
      ): void => {
        enqueue(formatTeamsAssistantSseEvent(event, data));
      };

      const close = (): void => {
        if (closed) return;
        closed = true;
        stopHeartbeat();
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect — nothing to do.
        }
      };

      // Keep-alive heartbeat — builder turns can reason silently for a while
      // (comment frames are ignored by the client's frame parser).
      heartbeat = setInterval(() => {
        enqueue(": keep-alive\n\n");
      }, 15_000);

      // Detached async task — drives the loop and streams events.
      void (async () => {
        try {
          const [{ runWithProvider }, { providerFor }, { createAgentContext }, hooksModule] =
            await Promise.all([
              import("@/agent/runtime"),
              import("@/agent/providers/factory"),
              import("@/agent/context"),
              import("@/agent/teams-assistant/runtime-hooks"),
            ]);

          const ctx = await createAgentContext({
            requestId,
            sessionId: session_id,
            mode,
            model: activeModel,
            accountId: account.id,
            signal: req.signal,
          });

          const answer = await runWithProvider(
            providerFor(activeModel),
            composedMessage,
            history,
            ctx,
            (activity) => send("tool_activity", activity),
            () => send("answer_start", {}),
            (text) => send("answer_delta", { text }),
            hooksModule.buildBuilderHooks(body.draft.members),
          );

          if (req.signal.aborted) {
            return;
          }

          // Commit the turn to in-memory history ONLY on success (a transport
          // fault leaves the session clean for a retry). Store the TYPED
          // message, not the draft preamble — the next turn attaches its own
          // live draft.
          await appendTurn(historyKey, { role: "user", content: body.message });
          await appendTurn(historyKey, {
            role: "assistant",
            content: answer.answer_markdown,
          });

          send("answer", { answer });
        } catch (err) {
          // A client abort (user closed the panel / pressed Stop) is not a
          // transport fault — close quietly.
          if (req.signal.aborted) {
            return;
          }
          const detail = err instanceof Error ? err.message : String(err);
          logger.error(
            {
              event: "teams_assistant_transport_error",
              request_id: requestId,
              session_id,
              model: activeModel,
              err: detail,
            },
            "oak_teams_assistant_transport_error",
          );
          if (err instanceof ProviderTransportError) {
            const statusPart = err.status ? ` (HTTP ${err.status})` : "";
            send("error", {
              code: "model_provider_error",
              message: `${modelLabel(activeModel)} is unavailable right now${statusPart} — please try again, or check the provider key.`,
              ...(err.status !== undefined ? { status: err.status } : {}),
            });
          } else {
            send("error", {
              code: "agent_error",
              message: "The assistant hit a transport error. Please try again.",
            });
          }
        } finally {
          close();
        }
      })();
    },
    cancel() {
      // Client went away — make the detached task's send()/close() no-ops; the
      // loop independently sees req.signal abort and bails between iterations.
      closed = true;
      stopHeartbeat();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
