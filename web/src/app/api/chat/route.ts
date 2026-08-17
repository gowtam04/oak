/**
 * `POST /api/chat` — the SSE chat endpoint (design.md § API Design, § Component
 * Design "Web API"; agent-design/integration.md § Invocation Signature, § Error
 * Surface, § Guardrails Outside the Agent). Phase 6 / API assembly seam.
 *
 * Responsibilities (orchestration, NOT agent internals):
 *   1. Parse + validate the request body ({ session_id, message }).
 *   2. Apply the two orchestration guardrails BEFORE streaming: the input-length
 *      cap and the per-session rate limit (integration.md § Guardrails). These
 *      reject with a plain JSON HTTP error (413 / 429) — they are not in-domain
 *      answer conditions, and rejecting before the stream opens lets the client
 *      see a real HTTP status.
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
  modeForFormat,
  NATDEX_FORMAT,
  type Format,
} from "@/data/formats";
import { detectScopeSignal } from "@/lib/scope/detect-scope";
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
  getSessionScope,
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
): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
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
  // Tri-state: `champions_mode` is a DEPRECATED legacy seed (old clients always
  // send a concrete boolean); keep true/false distinct from omitted so the
  // seed-precedence chain below can tell "no legacy seed" from "seeded standard".
  // `scope_seed` is the new explicit chip pick — a malformed/unknown value is
  // silently dropped (defensive additive field), never a 400.
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

  // Server-controlled query scope — never an LLM-visible tool field. The turn's
  // ACTUAL scope is RESOLVED below from a six-tier precedence chain:
  //   (explicit in-message signal) > (scope_seed chip pick) >
  //   (conversation's sticky scope) > (legacy champions_mode seed) >
  //   (signed-in account last_used_scope) > (National Dex default).
  // Explicit chip pick — ranks above sticky (fresh user intent).
  const explicitSeed: Format | undefined = body.scope_seed;
  // DEPRECATED champions_mode — old iOS builds always send a concrete boolean.
  // Ranks BELOW sticky (preserves BR-H6 resume semantics). A toggle-OFF now maps
  // to National Dex (the new default), not scarlet-violet — a legacy client that
  // never opted into Champions lands in the broad whole-dex scope.
  const legacySeed: Format | undefined =
    body.champions_mode === undefined
      ? undefined
      : body.champions_mode
        ? CHAMPIONS_FORMAT
        : NATDEX_FORMAT;

  // 2. Orchestration guardrails — input-length cap + TIERED rate limit
  //    (integration.md § Guardrails; account-creation design.md § API Design
  //    "POST /api/chat (modified)", BR-A8 / AUTH-US-7). Resolve the account from
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

  const rateLimitKey = account
    ? `acct:${account.id}`
    : `ip:${clientIp(req)}`;
  const rateLimitConfig = account ? SIGNED_IN_CONFIG : GUEST_CONFIG;

  const gate = await checkRateLimit(rateLimitKey, message, rateLimitConfig);
  if (!gate.allowed) {
    if (gate.reason === "input_too_long") {
      return jsonError(
        413,
        "input_too_long",
        `Message exceeds the ${gate.maxLength}-character limit (got ${gate.actualLength}).`,
      );
    }
    // rate_limited — record the rejected turn as a `turn_record` (design.md AD-4:
    // "rate_limited" is a recorded-status superset, so the errors/heavy-user views
    // have a single source). The model is unresolved on this pre-stream branch, so
    // model/providerModel are null and there is no answer. Fire-and-forget: the
    // recordTurn promise is NEVER awaited (only the cheap, cached module import is)
    // and a write fault only logs. input_too_long is a separate rejection and is
    // deliberately NOT recorded (it never reached the model path).
    try {
      const { recordTurn } = await import("@/data/repos/usage-repo");
      void recordTurn({
        id: requestId,
        sessionId: session_id,
        accountId: account?.id ?? null,
        model: null,
        providerModel: null,
        // The rate-limit gate runs BEFORE scope resolution (it must stay cheap,
        // pre-history, before the sticky scope is even loaded), so record the
        // best seed-derived mode available at this point: explicit chip pick >
        // legacy champions_mode > the National Dex default.
        mode: modeForFormat(explicitSeed ?? legacySeed ?? NATDEX_FORMAT),
        status: "rate_limited",
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
  //    stored text, trim it, and override `mode` from the stored format (BR-H6).
  //    A DB blip here degrades gracefully to an empty history (never a 500),
  //    consistent with the guest-first stance for account resolution.
  //    GUEST: the in-memory session store, exactly as before.
  let history: ChatMessage[];
  // The most recent team the agent proposed in this conversation (structured),
  // bound onto ctx so the agent can act on "save it" / "this team" reliably —
  // history forwards only the markdown, dropping the structured proposal.
  let proposedTeam: ProposedTeam | undefined;
  // The turn's STICKY scope (GS-D3): a resumed signed-in conversation's stored
  // format, or a guest session's remembered scope. `undefined` for a brand-new
  // conversation (the seed then wins). `existingConversation` marks the signed-in
  // resume path so a resolved switch below can be persisted (and compared against
  // the CURRENT stored format, which `stickyFormat` holds).
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
        stickyFormat = conv.format as Format; // BR-H6′ — sticky, switchable below
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
        history = []; // new conversation; scope resolves from the seed below
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
    stickyFormat = await getSessionScope(session_id); // guest sticky scope (GS-D3)
  }

  // 3a′. Mentions (MEN-BR-1..4, AUTH-BR-4) + recovery (ADR-4) — reject BEFORE
  //     any sticky-scope persist (conversation format / last_used_scope /
  //     session scope) and BEFORE startTurn. History is loaded; a dead mention
  //     or nothing-to-replace must not write scope.
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
    boundTeams = resolved.teams;
  }
  if (body.recovery !== undefined && !replaceableLastPair) {
    return new Response(JSON.stringify({ error: "nothing_to_replace" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3b. Resolve THIS turn's data scope (generation-scope GS-B / §3.4 step 3).
  //     Six-tier precedence: an explicit, high-precision in-message signal wins
  //     over an explicit scope_seed chip pick, which wins over the
  //     conversation's sticky scope, which wins over the legacy champions_mode
  //     seed, which wins over the signed-in account's last-used preference
  //     (new-chat default), which falls back to the National Dex hard default.
  //     The lexicon is DETERMINISTIC — no LLM pre-pass. `mode` then flows
  //     downstream exactly as before (ctx / formatForMode(mode) at persist /
  //     turn_record). Every generation (including Gens 1–4) is now a first-class
  //     scope, and a whole-dex phrase ("national dex", "all Pokémon") resolves
  //     to National Dex; the detector only ever returns a real format now (the
  //     old `unsupported` honest-decline arm is GONE — oak-v2 §3 / National Dex).
  const preferredFormat: Format | undefined =
    account?.lastUsedScope ?? undefined;
  const detection = detectScopeSignal(message);
  const messageFormat: Format | undefined = detection?.format;
  const format: Format =
    messageFormat ??
    explicitSeed ??
    stickyFormat ??
    legacySeed ??
    preferredFormat ??
    NATDEX_FORMAT;
  const mode: AgentMode = modeForFormat(format);

  // Observability for tuning the lexicon later (§3.4 step 3): one structured
  // line whenever a signal fired, recording what it moved the scope from → to.
  if (detection) {
    logger.info(
      {
        event: "scope_signal",
        request_id: requestId,
        session_id,
        matched: detection.matched,
        from:
          explicitSeed ??
          stickyFormat ??
          legacySeed ??
          preferredFormat ??
          NATDEX_FORMAT,
        to: format,
      },
      "oak_scope_signal",
    );
  }

  // Persist a scope SWITCH (fire-and-forget, same non-blocking discipline as
  // recording — never on the user's critical path). Signed-in + an existing
  // conversation whose stored format actually moved → UPDATE it (appendTurnPair
  // stamps format only on CREATE, so a mid-conversation switch needs this
  // explicit write). Signed-in every turn → also refresh account.last_used_scope
  // when it differs (drives the next new chat's default). Guest → refresh the
  // session's sticky scope every turn (cheap + idempotent).
  if (account) {
    const acctId = account.id;
    if (existingConversation && format !== stickyFormat) {
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
          .updateConversationFormat(acctId, session_id, format)
          .catch(logScopePersistFailure);
      } catch (err) {
        logScopePersistFailure(err);
      }
    }
    // Remember this turn's resolved scope as the account default for future
    // new chats. Only write when it moved (cheap skip on the common sticky path).
    if (format !== account.lastUsedScope) {
      const logPrefPersistFailure = (err: unknown): void => {
        logger.error(
          {
            event: "account_last_used_scope_update_failed",
            request_id: requestId,
            account_id: acctId,
            session_id,
            err: err instanceof Error ? err.message : String(err),
          },
          "oak_account_last_used_scope_update_failed",
        );
      };
      try {
        const accounts = await import("@/data/repos/accounts-repo");
        void accounts
          .updateLastUsedScope(acctId, format)
          .catch(logPrefPersistFailure);
      } catch (err) {
        logPrefPersistFailure(err);
      }
    }
  } else {
    // Guest → refresh the session's sticky scope every turn (cheap +
    // idempotent). Fire-and-forget, same non-blocking discipline as the
    // signed-in branch above — never on the user's critical path; a Redis
    // write fault only logs (session-store's own fail-soft policy already
    // covers the memory-backend case, where this never rejects).
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
    void setSessionScope(session_id, format).catch(logScopePersistFailure);
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

  // How the scope was resolved — surfaced on the `scope` event (GS-C). Any
  // in-message signal is message-sourced, so `detection` present ⇒ "message".
  // Preference is only reported when it actually decided the format (no higher
  // tier matched).
  const scopeSource: ScopeEvent["source"] = detection
    ? "message"
    : explicitSeed
      ? "seed"
      : stickyFormat
        ? "conversation"
        : legacySeed
          ? "seed"
          : preferredFormat
            ? "preference"
            : "default";

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
