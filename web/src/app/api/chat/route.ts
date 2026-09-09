/**
 * `POST /api/chat` — the SSE chat endpoint (design.md § API Design, § Component
 * Design "Web API"; agent-design/integration.md § Invocation Signature, § Error
 * Surface, § Guardrails Outside the Agent). Phase 6 / API assembly seam.
 *
 * Responsibilities (orchestration, NOT agent internals):
 *   1. Parse + validate the request body ({ session_id, message }).
 *   2. Apply orchestration guardrails BEFORE streaming: spend admission
 *      (denylist / daily cap), then the input-length cap and the per-session
 *      rate limit (integration.md § Guardrails). These reject with a plain JSON
 *      HTTP error (403 / 413 / 429 / 503) — they are not in-domain answer
 *      conditions, and rejecting before the stream opens lets the client see a
 *      real HTTP status.
 *   3. Resolve the prior in-session history from the session store (trimming it
 *      to the context budget first), then drive `runOak` with hooks that
 *      stream `tool_activity` events as tools fire and `answer_start`/
 *      `answer_delta` events as the answer_markdown prose is generated.
 *   4. Emit EXACTLY ONE terminal `answer` event carrying the validated
 *      OakAnswer. Every in-domain failure (resolution_failed /
 *      clarification_needed / insufficient_data) rides this normal `answer`
 *      event — `runOak` never throws for those. ONLY a transport/API fault
 *      (an exception out of `runOak` / context assembly) emits an `error`
 *      event (integration.md § Error Surface, last two rows).
 *   5. On success, record the user + assistant turn pair in the session store so
 *      multi-turn refinement works (US-10). On a transport fault we append
 *      nothing, leaving the session clean for a retry.
 *
 * Streaming contract (RISK DIRECTIVE — SSE route): `runtime = "nodejs"` and
 * `dynamic = "force-dynamic"`; the `Response(stream)` is returned SYNCHRONOUSLY
 * (we never await the agent loop before returning) and events are emitted from
 * an async task inside `start()`; SSE headers are text/event-stream +
 * Cache-Control: no-cache, no-transform + X-Accel-Buffering: no; each frame is
 * `event: <name>\ndata: <single-line JSON>\n\n` via `formatSseEvent`.
 */

import { randomUUID } from "node:crypto";

import { proposedTeamSchema, type ProposedTeam } from "@/agent/schemas";
import { modelLabel } from "@/agent/models";
import type {
  AgentMode,
  BoundTeam,
  ChatMessage,
  ImageAttachment,
} from "@/agent/types";
import type { Account } from "@/data/repos/accounts-repo";
import {
  CHAMPIONS_FORMAT,
  isFormat,
  type Format,
} from "@/data/formats";
import { logger } from "@/server/logger";
import {
  checkRateLimit,
  GUEST_CONFIG,
  SIGNED_IN_CONFIG,
} from "@/server/rate-limit";
import { validateImages } from "@/server/image-upload";
import { readJsonBodyWithLimit } from "@/server/body-limit";
import { clientIp } from "@/server/client-ip";
import {
  getHistory,
  setSessionScope,
  trim,
  trimMessages,
} from "@/server/session-store";
import { runTurn } from "@/server/run-turn";
import { startTurn } from "@/server/turn-store";
import { streamTurnResponse } from "@/server/turn-stream";
import {
  CLIENT_PLATFORM_HEADER,
  parseClientPlatform,
} from "@/lib/client-platform";
import type { ChatRequestBody, ScopeEvent } from "@/lib/sse/sse-types";

// Node runtime (node-postgres + the Anthropic SDK need it) and never cached /
// statically optimized — this is a live streaming handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DoS guard: the hard byte cap enforced by `readJsonBodyWithLimit` — it streams
 * the body and aborts the moment the running byte total exceeds this, so a
 * chunked (no-Content-Length) payload can't slip past into an uncapped buffer.
 * The real per-image/total caps run in `validateImages` on the DECODED bytes;
 * this just stops an absurd payload from being read into memory. Generous
 * headroom over the 10 MiB decoded image total (base64 inflates ~33%, plus JSON
 * + text).
 */
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

/** Composer @mentions: max 6 unique team UUIDs per turn (ADR-5). */
const MAX_MENTIONED_TEAM_IDS = 6;

// ---------------------------------------------------------------------------
// Small JSON-error helper for the pre-stream rejection paths
// ---------------------------------------------------------------------------

function jsonError(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>,
  extraBody?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ code, message, ...extraBody }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
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

// The guest rate-limit identity (`ip:<clientIp(req)>`) is derived by the shared
// `@/server/client-ip` helper — Fly-Client-IP first, then the trusted-proxy XFF
// hop — so a forged `X-Forwarded-For` can no longer defeat the cap (finding S1).

// ---------------------------------------------------------------------------
// Body validation
// ---------------------------------------------------------------------------

function parseRecovery(value: unknown): "retry" | "edit" | undefined {
  return value === "retry" || value === "edit" ? value : undefined;
}

/** First-occurrence unique string ids, capped at {@link MAX_MENTIONED_TEAM_IDS}. */
function parseMentionedTeamIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
    if (ids.length >= MAX_MENTIONED_TEAM_IDS) break;
  }
  return ids;
}

function lastPairIsUserAssistant(
  messages: readonly { role: string }[],
): boolean {
  if (messages.length < 2) return false;
  return (
    messages[messages.length - 2]!.role === "user" &&
    messages[messages.length - 1]!.role === "assistant"
  );
}

function parseBody(
  value: unknown,
  hasImages: boolean,
): ChatRequestBody | null {
  if (typeof value !== "object" || value === null) return null;
  const {
    session_id,
    message,
    champions_mode,
    scope_seed,
    recovery,
    mentioned_team_ids,
  } = value as Record<string, unknown>;
  if (typeof session_id !== "string" || session_id.length === 0) return null;
  // The message must be a string, but may be EMPTY when one or more images are
  // attached (an image-only "what is this?" upload). Text-only turns still
  // require non-empty text.
  if (typeof message !== "string") return null;
  if (message.length === 0 && !hasImages) return null;
  // `scope_seed` and `champions_mode` are parsed so old clients don't 400, then
  // ignored — every turn is Champions (CF-CHAT-AC-1.1, ADR-3). A malformed
  // `scope_seed` is silently dropped (defensive additive field), never a 400.
  // The answering model is NOT taken from the body — it is operator-controlled
  // via the admin Settings selection (resolved server-side below). Any `model`
  // field a client happens to send is ignored. `mentioned_team_ids` are the
  // @mention UUIDs bound this turn; a legacy `active_team_id` is ignored.
  return {
    session_id,
    message,
    champions_mode:
      champions_mode === true ? true : champions_mode === false ? false : undefined,
    scope_seed:
      typeof scope_seed === "string" && isFormat(scope_seed)
        ? scope_seed
        : undefined,
    recovery: parseRecovery(recovery),
    mentioned_team_ids: parseMentionedTeamIds(mentioned_team_ids),
  };
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();
  // First-party client platform for admin turn_record (web | ios | android).
  // Missing/invalid → null; never invent a default.
  const client = parseClientPlatform(req.headers.get(CLIENT_PLATFORM_HEADER));

  // 0+1. Read + parse the body under a HARD streaming byte cap (EDGE-01). This
  //    replaces the old Content-Length-only guard, which a chunked-encoding
  //    request (no Content-Length header) slipped past before `req.json()`
  //    buffered it uncapped. `readJsonBodyWithLimit` keeps the cheap declared-
  //    length fast reject but also counts the ACTUAL bytes as it streams, so an
  //    oversized payload is never read into memory. An image-bearing request can
  //    be several MB of base64 (the precise per-image/total decoded caps still
  //    run in `validateImages` below); too_large → 413, malformed → 400, both
  //    before any streaming.
  const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return jsonError(413, "payload_too_large", "Request body is too large.");
    }
    return jsonError(
      400,
      "invalid_request",
      "Request body must be valid JSON.",
    );
  }
  const raw: unknown = bodyResult.value;

  // 1a. Validate + canonicalize any attached images (count + size caps, magic-
  //     byte MIME sniff) before opening the stream — a bad attachment is a real
  //     HTTP status, not a mid-stream error. Returns the sniffed, re-encoded
  //     attachments bound onto the agent context below.
  const imageResult = validateImages(
    (raw as { images?: unknown } | null)?.images,
  );
  if (!imageResult.ok) {
    return jsonError(imageResult.status, imageResult.code, imageResult.message);
  }
  const images: ImageAttachment[] = imageResult.images;

  const body = parseBody(raw, images.length > 0);
  if (body === null) {
    return jsonError(
      400,
      "invalid_request",
      "Request body must be { session_id: string, message: string } — message may be empty only when an image is attached.",
    );
  }

  const { session_id, message } = body;

  // Fire-and-forget recording-fault logger (ADMIN-BR-3): a `turn_record` write
  // failure is LOGGED and never affects the chat path. Shared by the rate-limit
  // rejection branch and the post-answer recording below.
  const logRecordFailure = (err: unknown): void => {
    logger.error(
      {
        event: "turn_record_failed",
        request_id: requestId,
        session_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_turn_record_failed",
    );
  };

  // Server-controlled query scope — never an LLM-visible tool field. Every new
  // turn is Champions (CF-DATA-BR-1, CF-DATA-BR-7, ADR-3): `scope_seed`,
  // `champions_mode`, in-message signals, sticky conversation format, and
  // `account.last_used_scope` do not pick another game.

  // 2. Orchestration guardrails — spend admission (denylist / daily cap) THEN
  //    the input-length cap + TIERED per-minute rate limit (integration.md
  //    § Guardrails; spend-controls SC-BR-7). Resolve the account from
  //    the session cookie BEFORE the gate, then key + configure by auth tier:
  //      signed in → `acct:<id>` + SIGNED_IN_CONFIG (60/60s).
  //      guest     → `ip:<clientIp>` + GUEST_CONFIG (20/60s).
  //    The two pools never share a key, so guest sessions can't pool into the
  //    account allowance (AC-7.3). The conversation `session_id` is intentionally
  //    NOT the rate-limit key — identity ≠ conversation (AD-2), so the on-screen
  //    thread survives sign-in unchanged (BR-A10). Synchronous gate; the only
  //    await before it is the cookie resolution.
  // Resolve identity defensively: a session-resolution fault (e.g. a DB blip
  // reading the cookie's session) must NOT 500 the chat — it degrades to the
  // guest tier (BR-A11: guests are first-class, never an error path).
  let account: Account | null = null;
  try {
    // Dynamic import defers the auth chain's env evaluation (current-user →
    // sessions → @/env) to request time, not build time — the same reason the
    // runOak import below is deferred. A static import would trip
    // `next build` (env's AUTH_SECRET prod guard throws at page-data collection).
    const { getCurrentAccount } = await import("@/server/auth/current-user");
    account = await getCurrentAccount();
  } catch (err) {
    logger.warn(
      {
        event: "chat_account_resolve_failed",
        request_id: requestId,
        session_id,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_chat_account_resolve_failed",
    );
  }

  const ip = clientIp(req);
  const rateLimitKey = account ? `acct:${account.id}` : `ip:${ip}`;
  const rateLimitConfig = account ? SIGNED_IN_CONFIG : GUEST_CONFIG;

  // Rejected-turn recording (rate_limited + spend refusals). Same shape as
  // today's rate_limited branch: null model/answer, prompt stored. Await the
  // module import only; never await the INSERT (ADMIN-BR-3). input_too_long is
  // deliberately NOT recorded. Mode is always Champions (the gate runs before
  // history load; other-game seeds are ignored).
  const recordRejectedTurn = async (
    status:
      | "rate_limited"
      | "account_denied"
      | "daily_limit"
      | "spend_check_failed",
  ): Promise<void> => {
    try {
      const { recordTurn } = await import("@/data/repos/usage-repo");
      void recordTurn({
        id: requestId,
        sessionId: session_id,
        accountId: account?.id ?? null,
        model: null,
        providerModel: null,
        mode: "champions",
        status,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        toolTrace: [],
        citationCount: 0,
        turnLatencyMs: 0,
        imagesCount: images.length,
        client,
        promptText: message,
        answerText: null,
        answer: null,
        createdAt: Date.now(),
      }).catch(logRecordFailure);
    } catch (err) {
      logRecordFailure(err);
    }
  };

  // Spend admission (denylist → daily cap) BEFORE the per-minute limiter.
  const [{ admitAgentTurn }, { isAdmin }] = await Promise.all([
    import("@/server/spend-control"),
    import("@/server/auth/admin"),
  ]);
  const admit = await admitAgentTurn({
    subject: account
      ? { kind: "account", accountId: account.id, email: account.email }
      : { kind: "guest", ip },
    isAdmin: account ? isAdmin(account) : false,
    surface: "chat",
  });
  if (!admit.ok) {
    logger.info(
      {
        event: "spend_refused",
        code: admit.code,
        subject_key: rateLimitKey,
        request_id: requestId,
        session_id,
      },
      "oak_spend_refused",
    );
    await recordRejectedTurn(admit.code);
    return spendRefuseResponse(admit);
  }

  const gate = await checkRateLimit(rateLimitKey, message, rateLimitConfig);
  if (!gate.allowed) {
    if (gate.reason === "input_too_long") {
      return jsonError(
        413,
        "input_too_long",
        `Message exceeds the ${gate.maxLength}-character limit (got ${gate.actualLength}).`,
      );
    }
    await recordRejectedTurn("rate_limited");
    return jsonError(
      429,
      "rate_limited",
      "Too many requests. Please wait a moment and try again.",
      { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) },
    );
  }

  // 3. Resolve the prior history (trim to the context budget first). The current
  //    message is passed to runOak SEPARATELY — it must NOT be in `history`,
  //    which holds only prior turns (integration.md § Input Contract). We commit
  //    the user+assistant pair only on a successful answer (below), so a
  //    transport fault leaves the conversation clean for a retry.
  //
  //    SIGNED IN: the durable DB is the source of truth (chat-history HIST-AD-4).
  //    Load the conversation + its turns, derive the model history from the
  //    stored text, and trim it. Stored conversation format is NOT used to pick
  //    data (CF-CHAT-AC-3.2) — every new turn is Champions. A DB blip here
  //    degrades gracefully to an empty history (never a 500), consistent with
  //    the guest-first stance for account resolution.
  //    GUEST: the in-memory session store, exactly as before.
  let history: ChatMessage[];
  // The most recent team the agent proposed in this conversation (structured),
  // bound onto ctx so the agent can act on "save it" / "this team" reliably —
  // history forwards only the markdown, dropping the structured proposal.
  let proposedTeam: ProposedTeam | undefined;
  // Historical conversation format (signed-in resume). Not used to pick data;
  // compared only so an other-game thread can be stamped Champions (CF-CHAT-AC-3.3).
  let stickyFormat: Format | undefined;
  let existingConversation = false;
  // Last stored pair is user+assistant — required before a recovery turn
  // starts (ADR-4). Checked against the untrimmed source (DB or session
  // store), not the context-budget trim.
  let replaceableLastPair = false;
  if (account) {
    try {
      const repo = await import("@/data/repos/conversation-repo");
      const conv = await repo.getConversation(account.id, session_id);
      if (conv) {
        existingConversation = true;
        stickyFormat = conv.format as Format; // historical; not used to pick data
        const stored = await repo.getMessages(account.id, session_id);
        replaceableLastPair = lastPairIsUserAssistant(stored);
        history = trimMessages(
          stored.map((m) => ({ role: m.role, content: m.textContent })),
        );
        // Walk back to the latest assistant turn carrying a valid proposed_team.
        for (let i = stored.length - 1; i >= 0 && !proposedTeam; i--) {
          const m = stored[i];
          if (m.role !== "assistant" || !m.answerJson) continue;
          try {
            const parsed = JSON.parse(m.answerJson) as {
              proposed_team?: unknown;
            };
            const candidate = proposedTeamSchema.safeParse(parsed.proposed_team);
            if (candidate.success) proposedTeam = candidate.data;
          } catch {
            /* malformed stored answer — skip */
          }
        }
      } else {
        history = []; // new conversation; always Champions below
      }
    } catch (err) {
      logger.warn(
        {
          event: "chat_history_load_failed",
          request_id: requestId,
          account_id: account.id,
          session_id,
          err: err instanceof Error ? err.message : String(err),
        },
        "oak_chat_history_load_failed",
      );
      history = [];
    }
  } else {
    await trim(session_id);
    history = [...(await getHistory(session_id))];
    replaceableLastPair = lastPairIsUserAssistant(history);
    // Guest sticky session format is not used to pick data (CF-CHAT-AC-3.3).
  }

  // 3a′. Mentions (MEN-BR-1..4, AUTH-BR-4) + recovery (ADR-4) — reject BEFORE
  //     any Champions-stamp persist (conversation format / session scope) and
  //     BEFORE startTurn. History is loaded; a dead mention or
  //     nothing-to-replace must not write scope.
  const mentionIds = body.mentioned_team_ids ?? [];
  let boundTeams: BoundTeam[] = [];
  if (mentionIds.length > 0) {
    if (!account) {
      return new Response(
        JSON.stringify({ error: "unbound_mention", id: mentionIds[0] }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { resolveBoundTeams } = await import("@/server/chat/bound-teams");
    const resolved = await resolveBoundTeams(account.id, mentionIds);
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ error: "unbound_mention", id: resolved.id }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    // Living Champions teams only (CF-CHAT-AC-3.4). Archived / other-format
    // uses the same unbound_mention code as missing/unowned.
    const archived = resolved.teams.find((t) => t.format !== CHAMPIONS_FORMAT);
    if (archived) {
      return new Response(
        JSON.stringify({ error: "unbound_mention", id: archived.id }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    boundTeams = resolved.teams;
  }
  if (body.recovery !== undefined && !replaceableLastPair) {
    return new Response(JSON.stringify({ error: "nothing_to_replace" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3b. Every new turn is Champions (CF-DATA-BR-1, CF-DATA-BR-7, ADR-3).
  //     `scope_seed`, `champions_mode`, detect-scope, sticky conversation
  //     format, and `account.last_used_scope` are not used to pick data.
  const format: Format = CHAMPIONS_FORMAT;
  const mode: AgentMode = "champions";
  const scopeSource: ScopeEvent["source"] = "default";

  // Treat an existing other-game thread as Champions from this message on
  // (CF-CHAT-AC-3.3). Do not write last_used_scope / other-game MRU
  // (CF-DATA-BR-21). Guest session sticky is overwritten to Champions so it
  // cannot reopen another game. Fire-and-forget — never on the critical path.
  if (account) {
    const acctId = account.id;
    if (existingConversation && stickyFormat !== CHAMPIONS_FORMAT) {
      const logScopePersistFailure = (err: unknown): void => {
        logger.error(
          {
            event: "conversation_format_update_failed",
            request_id: requestId,
            account_id: acctId,
            session_id,
            err: err instanceof Error ? err.message : String(err),
          },
          "oak_conversation_format_update_failed",
        );
      };
      try {
        const repo = await import("@/data/repos/conversation-repo");
        void repo
          .updateConversationFormat(acctId, session_id, CHAMPIONS_FORMAT)
          .catch(logScopePersistFailure);
      } catch (err) {
        logScopePersistFailure(err);
      }
    }
  } else {
    const logScopePersistFailure = (err: unknown): void => {
      logger.error(
        {
          event: "session_scope_persist_failed",
          request_id: requestId,
          session_id,
          err: err instanceof Error ? err.message : String(err),
        },
        "oak_session_scope_persist_failed",
      );
    };
    void setSessionScope(session_id, CHAMPIONS_FORMAT).catch(
      logScopePersistFailure,
    );
  }

  // 3c. Resolve the operator-selected active model (the admin Settings selection,
  //     persisted in `app_setting` and read per turn) and fail fast if its
  //     provider isn't configured on this server (its API key is absent) — a clean
  //     503 BEFORE the stream opens, so the client sees a real HTTP status rather
  //     than a mid-stream error. Resolution is fail-soft to the default (Grok),
  //     which is always configured (XAI_API_KEY is required at boot), so it only
  //     fires on a deployment misconfig (e.g. a Claude selection with no
  //     ANTHROPIC_API_KEY).
  //     Dynamic import defers the factory's env/SDK/db evaluation to request time
  //     (the same reason the runtime import below is deferred).
  const { activeModelKey, isModelConfigured } = await import(
    "@/agent/providers/factory"
  );
  const activeModel = await activeModelKey();
  if (!isModelConfigured(activeModel)) {
    return jsonError(
      503,
      "model_unavailable",
      `The configured model (${modelLabel(activeModel)}) has no provider key on this server. Pick a configured model in Admin → Settings or add the provider's API key.`,
    );
  }

  // 4. Register the turn (background-turns/design.md §5.2 step 1). The three
  //    concurrency caps (BT-5) are checked atomically; a clash is a pre-stream
  //    JSON error, never an opened stream:
  //      - per-conversation (1 running turn per session_id) → 409
  //        `turn_in_progress` WITH the running turn's id, so the client reattaches
  //        instead of double-generating;
  //      - per-owner (3 running turns per account id / guest IP) → 429
  //        `too_many_turns`;
  //      - global in-process safety cap → 503 `server_busy`.
  //    The owner key is the SAME identity the rate limiter uses (`acct:<id>` /
  //    `ip:<clientIp>`), so the two spend controls stay aligned.
  //    Voice hydrate is NOT a turn-store lock (VOICE-BR-5): abort it first so
  //    a real send never 409s from an in-flight compile.
  const { abortVoiceCompile } = await import("@/server/voice/hydrate-store");
  abortVoiceCompile(session_id);
  const started = startTurn({
    sessionId: session_id,
    accountId: account?.id ?? null,
    ownerKey: rateLimitKey,
  });
  if ("conflict" in started) {
    if (started.conflict === "conversation") {
      // Include the existing turn's id so the client reattaches (§4 / BT-5).
      return new Response(
        JSON.stringify({
          code: "turn_in_progress",
          message:
            "A response is already generating for this conversation. Reattach to it.",
          turn_id: started.turnId,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    if (started.conflict === "owner") {
      return jsonError(
        429,
        "too_many_turns",
        "You have too many responses generating at once. Wait for one to finish, then try again.",
      );
    }
    return jsonError(
      503,
      "server_busy",
      "The server is at capacity. Please try again in a moment.",
    );
  }
  const turn = started;

  // 5. Build the subscriber response FIRST — its ReadableStream.start() runs
  //    synchronously, emitting the `turn` frame and registering with the turn's
  //    fan-out — THEN detach the turn task (design §5.2 step 3: "the task starts
  //    after subscription", so the buffer replay is trivially empty). The task is
  //    NEVER awaited: it runs to completion even if this subscriber disconnects
  //    (BT-1). The response stream's cancel() only unsubscribes; it never touches
  //    the turn (BT-7).
  const response = streamTurnResponse(turn);
  void runTurn({
    turn,
    requestId,
    sessionId: session_id,
    account,
    mode,
    format,
    scopeSource,
    message,
    history,
    proposedTeam,
    images,
    activeModel,
    client,
    recovery: body.recovery,
    boundTeams,
  });
  return response;
}
