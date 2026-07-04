/**
 * Guest session store — dual backend (scaling-plan.md Phase 1 / T2).
 *
 * Holds the running ChatMessage[] for each active guest session keyed by
 * session_id, plus each session's sticky data scope (GS-B / GS-D3). Two
 * backends share one uniform, ASYNC public API:
 *
 *   - **Redis** (`REDIS_URL` set): history is a LIST at
 *     `${SESS_PREFIX}hist:<sessionId>`, scope is a STRING at
 *     `${SESS_PREFIX}scope:<sessionId>`, both with a sliding
 *     {@link SESSION_TTL_MS} TTL refreshed on every read/write. State survives
 *     a process restart / redeploy and is shared across every machine.
 *   - **In-memory** (`REDIS_URL` unset — dev/tests): the original
 *     {@link BoundedStore}-backed behavior (DS-5, D9) — entries are discarded
 *     when the process exits, when a session idles past `SESSION_TTL_MS`, or
 *     when the store exceeds `SESSION_MAX_ENTRIES` (LRU eviction, assessment
 *     C1). This is the fallback for any deploy that hasn't provisioned Redis.
 *
 * Every function dispatches per call via `getRedisClient()` — there is no
 * one-time backend selection, so a test can flip `REDIS_URL` between calls
 * (see `session-store.redis.test.ts`).
 *
 * FAILURE POLICY (fail-soft — this store must never fail a chat turn): every
 * Redis operation is wrapped; on error it is logged (session id only, never
 * message content) and the call degrades exactly like a cache miss —
 * `getHistory` → `[]`, `getSessionScope` → `undefined`, the write/trim/clear
 * calls resolve void having done nothing.
 *
 * The `trim` function removes the oldest turns when the estimated token count
 * approaches the context budget, preserving the most recent context so the
 * agent always has the freshest conversation. `now` stays injectable for the
 * memory backend's deterministic tests; the Redis backend ignores it (TTLs
 * are always server-time).
 */

import type { ChatMessage } from "@/agent/types";
import { isFormat, type Format } from "@/data/formats";
import { BoundedStore } from "@/server/bounded-store";
import { logger } from "@/server/logger";
import { deletePrefix, getRedisClient, SESS_PREFIX } from "@/server/redis";

// ---------------------------------------------------------------------------
// Context-budget constants
// ---------------------------------------------------------------------------

/**
 * Conservative characters-per-token estimate. Claude / GPT-family English
 * text averages ~4 chars/token; we use 4 to over-estimate slightly (trimming
 * a bit earlier is safe).
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Default token budget allocated to the history tail.
 *
 * Sonnet 4.6 has a 200k-token context window. The stable prefix (system
 * prompt + 11 tool definitions + few-shot examples) consumes roughly 8–12k
 * tokens and is prompt-cached. The model's max output is capped at ~8k. This
 * default reserves 100k for the variable history + current message, leaving
 * comfortable headroom for the prefix and the assistant's reply.
 */
export const DEFAULT_HISTORY_TOKEN_BUDGET = 100_000;

// ---------------------------------------------------------------------------
// Bounded-store limits (assessment C1 — unbounded in-memory stores)
// ---------------------------------------------------------------------------

/**
 * Hard cap on resident guest sessions (memory backend only). Guests are keyed
 * by client-supplied `session_id`, so without a cap a client rotating that id
 * would grow the store without bound → OOM on the small deploy machine.
 *
 * Memory ceiling ≈ SESSION_MAX_ENTRIES × DEFAULT_HISTORY_TOKEN_BUDGET (100k) ×
 * CHARS_PER_TOKEN (4) × ~2 bytes/char (JS strings are UTF-16) ≈ ~200 MB worst
 * case at 250 — a defensible fraction of the 512 MB machine. Keep this in mind
 * if DEFAULT_HISTORY_TOKEN_BUDGET changes. The Redis backend has no analogous
 * cap — TTL expiry is the only reaper — since Redis is sized independently.
 */
export const SESSION_MAX_ENTRIES = 250;

/**
 * Idle time-to-live for a session, shared by both backends. A guest whose
 * session sees no activity for this long starts a fresh conversation on their
 * next turn.
 */
export const SESSION_TTL_MS = 2 * 60 * 60_000; // 2 hours

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

function histKey(sessionId: string): string {
  return `${SESS_PREFIX}hist:${sessionId}`;
}

function scopeKey(sessionId: string): string {
  return `${SESS_PREFIX}scope:${sessionId}`;
}

function logRedisError(op: string, sessionId: string | undefined, err: unknown): void {
  logger.error(
    {
      event: "session_store_redis_error",
      op,
      session_id: sessionId,
      err: err instanceof Error ? err.message : String(err),
    },
    "oak_session_store_redis_error",
  );
}

/** Parse one stored history element, skipping (and logging) a corrupt entry. */
function parseHistoryElement(sessionId: string, raw: string): ChatMessage | undefined {
  try {
    return JSON.parse(raw) as ChatMessage;
  } catch (err) {
    logger.error(
      {
        event: "session_store_history_parse_failed",
        session_id: sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      "oak_session_store_history_parse_failed",
    );
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Memory backend — private (BoundedStore), the original implementation
// ---------------------------------------------------------------------------

/**
 * One {@link BoundedStore} per server process (D9), memoized on `globalThis`
 * (the same pattern as the Postgres pool in `@/data/db`) so Next's dev
 * hot-reload / route re-evaluation reuses the SAME store instead of silently
 * wiping every guest conversation on a recompile.
 */
const globalForSessionStore = globalThis as typeof globalThis & {
  __oakSessionStore?: BoundedStore<ChatMessage[]>;
  __oakSessionScopeStore?: BoundedStore<Format>;
};

function getMemStore(): BoundedStore<ChatMessage[]> {
  if (!globalForSessionStore.__oakSessionStore) {
    globalForSessionStore.__oakSessionStore = new BoundedStore<ChatMessage[]>({
      maxEntries: SESSION_MAX_ENTRIES,
      ttlMs: SESSION_TTL_MS,
    });
  }
  return globalForSessionStore.__oakSessionStore;
}

/**
 * Parallel store holding each guest session's sticky data scope (GS-B /
 * GS-D3). Kept SEPARATE from the message store — the resolved scope is not
 * part of the `ChatMessage[]` shape that `trim`/`getHistory` (and their
 * tests) depend on.
 */
function getMemScopeStore(): BoundedStore<Format> {
  if (!globalForSessionStore.__oakSessionScopeStore) {
    globalForSessionStore.__oakSessionScopeStore = new BoundedStore<Format>({
      maxEntries: SESSION_MAX_ENTRIES,
      ttlMs: SESSION_TTL_MS,
    });
  }
  return globalForSessionStore.__oakSessionScopeStore;
}

function memGetHistory(sessionId: string, now: number): ChatMessage[] {
  return getMemStore().get(sessionId, now) ?? [];
}

function memAppendTurn(sessionId: string, message: ChatMessage, now: number): void {
  const store = getMemStore();
  // `get` returns the SAME live array (and refreshes recency); create on miss.
  let history = store.get(sessionId, now);
  if (!history) {
    history = [];
    store.set(sessionId, history, now);
  }
  history.push(message);
}

function memGetSessionScope(sessionId: string, now: number): Format | undefined {
  return getMemScopeStore().get(sessionId, now);
}

function memSetSessionScope(sessionId: string, format: Format, now: number): void {
  getMemScopeStore().set(sessionId, format, now);
}

function memTrim(sessionId: string, budgetTokens: number, now: number): void {
  const history = getMemStore().get(sessionId, now);
  if (!history || history.length === 0) return;

  // trimMessages only ever drops from the front, so the number kept equals the
  // tail of `history`; splice the dropped prefix off the live array in place.
  const dropCount = history.length - trimMessages(history, budgetTokens).length;
  if (dropCount > 0) history.splice(0, dropCount);
}

function memClearSession(sessionId: string): void {
  getMemStore().delete(sessionId);
}

function memActiveSessionCount(): number {
  return getMemStore().size;
}

function memResetStoreForTests(): void {
  getMemStore().clear();
  getMemScopeStore().clear();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the message history for a session. Returns an empty array (not
 * `undefined`) for an unknown, idle-expired, or (Redis backend) errored
 * `sessionId` — the caller treats an empty history as a fresh conversation
 * (DS-5 failure behavior).
 *
 * Treat the returned array as READ-ONLY — do not mutate it directly; use
 * `appendTurn` instead. Its underlying identity is backend-dependent: on the
 * memory backend it may be the LIVE internal array (so an earlier snapshot
 * can pick up later appends, same as before), while on the Redis backend it
 * is a fresh copy decoded from Redis on every call. Callers must never rely
 * on the reference staying live. Reading also refreshes the session's idle
 * timer (keeps an active conversation resident).
 *
 * `now` is injectable for the memory backend's deterministic tests; the Redis
 * backend ignores it (server-time TTLs). Defaults to `Date.now()`.
 */
export async function getHistory(
  sessionId: string,
  now: number = Date.now(),
): Promise<ChatMessage[]> {
  const client = getRedisClient();
  if (!client) return memGetHistory(sessionId, now);
  try {
    const key = histKey(sessionId);
    const results = await client
      .pipeline()
      .lrange(key, 0, -1)
      .pexpire(key, SESSION_TTL_MS)
      .exec();
    const [lrangeErr, rawEntries] = results?.[0] ?? [null, []];
    if (lrangeErr) throw lrangeErr;
    const messages: ChatMessage[] = [];
    for (const entry of (rawEntries as string[]) ?? []) {
      const parsed = parseHistoryElement(sessionId, entry);
      if (parsed !== undefined) messages.push(parsed);
    }
    return messages;
  } catch (err) {
    logRedisError("getHistory", sessionId, err);
    return [];
  }
}

/**
 * Appends one turn to the session history. Does NOT auto-trim; call `trim`
 * before passing history to `runOak` when you want to enforce the context
 * budget.
 *
 * `now` is injectable for the memory backend's deterministic tests; the Redis
 * backend ignores it. Defaults to `Date.now()`.
 */
export async function appendTurn(
  sessionId: string,
  message: ChatMessage,
  now: number = Date.now(),
): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    memAppendTurn(sessionId, message, now);
    return;
  }
  try {
    const key = histKey(sessionId);
    await client
      .pipeline()
      .rpush(key, JSON.stringify(message))
      .pexpire(key, SESSION_TTL_MS)
      .exec();
  } catch (err) {
    logRedisError("appendTurn", sessionId, err);
  }
}

// ---------------------------------------------------------------------------
// Guest scope stickiness (GS-B / GS-D3)
// ---------------------------------------------------------------------------

/**
 * Returns the sticky data scope for a guest session, or `undefined` if the
 * session has no stored scope yet (a brand-new conversation), its scope entry
 * has idled past {@link SESSION_TTL_MS}, the stored value isn't a known
 * `Format`, or (Redis backend) the lookup errored. `undefined` means "no
 * sticky scope" — the route falls back to the toggle seed.
 *
 * `now` is injectable for the memory backend's deterministic tests; the Redis
 * backend ignores it. Defaults to `Date.now()`.
 */
export async function getSessionScope(
  sessionId: string,
  now: number = Date.now(),
): Promise<Format | undefined> {
  const client = getRedisClient();
  if (!client) return memGetSessionScope(sessionId, now);
  try {
    const key = scopeKey(sessionId);
    const results = await client
      .pipeline()
      .get(key)
      .pexpire(key, SESSION_TTL_MS)
      .exec();
    const [getErr, value] = results?.[0] ?? [null, null];
    if (getErr) throw getErr;
    return typeof value === "string" && isFormat(value) ? value : undefined;
  } catch (err) {
    logRedisError("getSessionScope", sessionId, err);
    return undefined;
  }
}

/**
 * Records the resolved data scope for a guest session so subsequent turns stay
 * in it (until an explicit in-message signal switches it, or the entry idles
 * out). Idempotent — writing the same format again just refreshes recency.
 *
 * `now` is injectable for the memory backend's deterministic tests; the Redis
 * backend ignores it. Defaults to `Date.now()`.
 */
export async function setSessionScope(
  sessionId: string,
  format: Format,
  now: number = Date.now(),
): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    memSetSessionScope(sessionId, format, now);
    return;
  }
  try {
    await client.set(scopeKey(sessionId), format, "PX", SESSION_TTL_MS);
  } catch (err) {
    logRedisError("setSessionScope", sessionId, err);
  }
}

// ---------------------------------------------------------------------------
// Context-budget helpers (pure — shared by both backends and the signed-in DB
// path; never touch I/O)
// ---------------------------------------------------------------------------

/**
 * Estimates the token count for an array of messages using the
 * `CHARS_PER_TOKEN` heuristic. Includes the role string in the character
 * count to be consistent. Over-estimates slightly (safe: we trim earlier
 * rather than later).
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    chars += msg.content.length + msg.role.length;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Pure context-budget trim: returns a copy of `messages` with the oldest turns
 * dropped from the front until the estimated token count falls at or below
 * `budgetTokens`. The input is not mutated. Shared by both guest backends
 * (via {@link trim}) and the signed-in DB path (chat-history, BR-H5) so all
 * paths apply identical trimming.
 *
 * - If `budgetTokens` is omitted, `DEFAULT_HISTORY_TOKEN_BUDGET` is used.
 * - Returns `messages` unchanged when empty or already within budget.
 * - When even a single message exceeds the budget, all messages are dropped
 *   (returns `[]`); the next turn starts from a clean slate.
 */
export function trimMessages(
  messages: ChatMessage[],
  budgetTokens: number = DEFAULT_HISTORY_TOKEN_BUDGET,
): ChatMessage[] {
  const result = [...messages];
  while (result.length > 0 && estimateTokens(result) > budgetTokens) {
    result.shift(); // drop the oldest turn
  }
  return result;
}

/**
 * Removes the oldest turns from the session history until the estimated token
 * count falls at or below `budgetTokens`. Individual messages are dropped one
 * at a time from the front of the array; this preserves the most-recent
 * context (the active topic, the last candidate set) and discards the oldest
 * context first — consistent with how long-context LLM conversations are
 * typically pruned.
 *
 * Delegates the budget logic to {@link trimMessages}. On the Redis backend
 * this is a benign read-modify-write: `LTRIM key dropCount -1` uses a
 * POSITIVE start index, so any turn concurrently `RPUSH`ed onto the tail
 * between our `LRANGE` and this `LTRIM` is preserved (it lands past the
 * trimmed prefix either way).
 *
 * - If `budgetTokens` is omitted, `DEFAULT_HISTORY_TOKEN_BUDGET` is used.
 * - No-op when the session does not exist, is empty, or is already within
 *   budget.
 * - When even a single message exceeds the budget (e.g. an extremely long
 *   assistant turn + a tiny budget), all messages are removed; the next user
 *   turn starts from a clean slate.
 */
export async function trim(
  sessionId: string,
  budgetTokens: number = DEFAULT_HISTORY_TOKEN_BUDGET,
  now: number = Date.now(),
): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    memTrim(sessionId, budgetTokens, now);
    return;
  }
  try {
    const key = histKey(sessionId);
    const rawEntries = await client.lrange(key, 0, -1);
    if (rawEntries.length === 0) return;
    const parsed: ChatMessage[] = [];
    for (const entry of rawEntries) {
      const message = parseHistoryElement(sessionId, entry);
      if (message !== undefined) parsed.push(message);
    }
    const dropCount = parsed.length - trimMessages(parsed, budgetTokens).length;
    if (dropCount > 0) {
      await client.pipeline().ltrim(key, dropCount, -1).pexpire(key, SESSION_TTL_MS).exec();
    }
  } catch (err) {
    logRedisError("trim", sessionId, err);
  }
}

// ---------------------------------------------------------------------------
// Housekeeping helpers (used by tests and the route handler)
// ---------------------------------------------------------------------------

/**
 * Removes all history for the given session (the sticky scope, if any,
 * survives — parity across both backends). The session will be treated as
 * new (no entry in the store) until the next `appendTurn`.
 */
export async function clearSession(sessionId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    memClearSession(sessionId);
    return;
  }
  try {
    await client.del(histKey(sessionId));
  } catch (err) {
    logRedisError("clearSession", sessionId, err);
  }
}

/**
 * Returns the number of resident sessions currently held. Diagnostic only —
 * on the memory backend this reflects *resident, non-evicted* sessions (can
 * drop as idle sessions are swept or the LRU cap evicts the
 * least-recently-used session); on the Redis backend it's a SCAN count of
 * history keys (an O(n) diagnostic, not meant for a hot path).
 */
export async function activeSessionCount(): Promise<number> {
  const client = getRedisClient();
  if (!client) return memActiveSessionCount();
  try {
    let count = 0;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        `${histKey("")}*`,
        "COUNT",
        500,
      );
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== "0");
    return count;
  } catch (err) {
    logRedisError("activeSessionCount", undefined, err);
    return 0;
  }
}

/**
 * Wipe ALL session history + scope. Call from `beforeEach`/`afterEach` to
 * isolate tests from each other. Always clears the memory backend (cheap,
 * keeps both worlds clean regardless of which one the running suite targets)
 * and, when Redis is configured, additionally wipes every `SESS_PREFIX` key.
 *
 * @internal
 */
export async function _resetStoreForTests(): Promise<void> {
  memResetStoreForTests();
  const client = getRedisClient();
  if (client) {
    await deletePrefix(client, SESS_PREFIX);
  }
}
