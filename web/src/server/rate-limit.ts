/**
 * Keyed rate limiter and input-length cap (design.md § Component Design,
 * integration.md § Guardrails Outside the Agent, Phase 6; account-creation
 * design.md § API Design "POST /api/chat (modified)", Phase 5 — tiered limits).
 *
 * Two independent checks are composed here:
 *  1. Input-length cap  — reject messages that exceed maxInputLength characters.
 *  2. Per-key fixed-window counter — reject requests that exceed
 *     maxRequestsPerWindow within the current windowMs window.
 *
 * Callers choose the key namespace: the chat route keys signed-in users by
 * `acct:<id>` and guests by `ip:<addr>` so the two tiers count independently
 * (BR-A8 — guest sessions cannot pool into the account allowance).
 *
 * ## Dual backend (scaling-plan.md Phase 1)
 *
 * The per-key window counter lives in ONE of two backends, chosen per call by
 * {@link getRedisClient}:
 *
 *  - **Memory** (`REDIS_URL` unset → `getRedisClient()` returns `null`): the
 *    original process-local {@link BoundedStore} fixed-window logic, still
 *    honoring an injected `now`. A restart resets all counters (fine for a
 *    single-instance deploy); entries are evicted lazily as windows reset.
 *  - **Redis** (`REDIS_URL` set): one atomic `INCR` + conditional `PEXPIRE` +
 *    `PTTL` Lua script over the shared instance, so the window count is correct
 *    across N machines. The Redis backend ignores the injected `now` (it relies
 *    on the key's server-side TTL).
 *
 * The **input-length gate is synchronous and runs BEFORE any backend dispatch**
 * — an oversized message never costs a Redis round-trip or creates a key.
 *
 * **Failure policy — fail OPEN.** Any Redis error returns `{ allowed: true }`.
 * This is DELIBERATE: a soft abuse limiter must not take down all chat on a
 * Redis blip, and the synchronous input-length gate still enforces regardless.
 * (Contrast the OTP throttle, a security control, which fails CLOSED.)
 */

import Redis from "ioredis";

import { BoundedStore } from "@/server/bounded-store";
import { logger } from "@/server/logger";
import { deletePrefix, getRedisClient, RL_PREFIX } from "@/server/redis";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum number of characters allowed in the user message. */
  maxInputLength: number;
  /** Maximum number of requests allowed from one session per window. */
  maxRequestsPerWindow: number;
  /** Length of the fixed time window in milliseconds. */
  windowMs: number;
}

/**
 * Default limits (conservative but generous for a single user).
 *  - 2 000-character messages cover any realistic Pokémon question and block
 *    accidental/adversarial prompt-injection spam.
 *  - 20 requests / 60 s bounds runaway loops or UI bugs that hammer the API.
 */
export const DEFAULT_CONFIG: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 20,
  windowMs: 60_000,
};

/**
 * Tiered chat configs (account-creation design.md § API Design, § Interface
 * Definitions; BR-A8 / AUTH-US-7 / AC-7.1).  Both keep the 2 000-char input cap
 * (unchanged from DEFAULT_CONFIG — BR-A11).  The request allowances differ:
 *  - GUEST_CONFIG     — 20 / 60 s (today's guest value; AC-1.3).
 *  - SIGNED_IN_CONFIG — 60 / 60 s (the more generous signed-in tier; AC-7.1).
 *
 * The chat route picks one of these (and the matching key namespace) per request
 * from the resolved auth state; the two pools never share a key, so guests can't
 * exceed the account tier by spawning sessions (AC-7.3).
 */
export const GUEST_CONFIG: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 20,
  windowMs: 60_000,
};

export const SIGNED_IN_CONFIG: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 60,
  windowMs: 60_000,
};

/**
 * The /teams embedded builder assistant (signed-in only, keyed `acct:<id>` —
 * there is no guest tier for this route). The request cap is tighter than
 * SIGNED_IN_CONFIG (builder turns are tool-heavy), and the input cap covers
 * only the typed message — the draft rides in a separate body field and is
 * bounded by its own Zod shape (≤ 6 strict members), not this limit.
 */
export const TEAMS_ASSISTANT_CONFIG: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 30,
  windowMs: 60_000,
};

/**
 * The public, UNAUTHENTICATED read routes — `/api/entity`, `/api/search`,
 * `/api/sprites`, `/api/learnset` (EDGE-02). These are GETs that each do DB I/O
 * on the shared pool with no auth gate, so an anonymous client could hammer them
 * to exhaust connections. Keyed `pub:<clientIp>`; all four routes share ONE
 * bucket per IP (intended — a single IP's total read pressure is what we bound).
 *
 * 120 / 60 s is deliberately generous: opening one team artifact fires several
 * of these per click (sprites + per-species learnset lookups), so a real user
 * browsing quickly stays well under it while a scripted flood is still capped.
 * The input-length cap is irrelevant for a GET (there is no message body) — it
 * is kept at 2 000 only for shape consistency; callers pass `message: ""`.
 */
export const PUBLIC_READ_CONFIG: RateLimitConfig = {
  maxInputLength: 2_000,
  maxRequestsPerWindow: 120,
  windowMs: 60_000,
};

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

/**
 * Discriminated union returned by checkRateLimit.  The caller maps the
 * `allowed: false` branches to the appropriate HTTP response / error event
 * (integration.md § Guardrails).
 */
export type RateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "input_too_long";
      maxLength: number;
      actualLength: number;
    }
  | {
      allowed: false;
      reason: "rate_limited";
      /** Milliseconds until the current window expires. */
      retryAfterMs: number;
    };

// ---------------------------------------------------------------------------
// In-process window state
// ---------------------------------------------------------------------------

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Bounds for the window store (assessment C1 — unbounded in-memory stores).
 * Keys are client-supplied (`ip:<addr>` / `acct:<id>`), so without a cap a
 * client minting fresh keys would grow the store without bound → OOM.
 *
 * `RL_TTL_MS` MUST be `>=` the longest configured window (`windowMs`, 60_000)
 * so a key is never idle-evicted mid-window (which would reset its counter and
 * leak allowance). Each entry is tiny (~200 B), so 20 000 entries ≈ ~4 MB — the
 * cap is a memory backstop under abuse, not a real-traffic constraint.
 */
export const RL_MAX_ENTRIES = 20_000;
export const RL_TTL_MS = 10 * 60_000; // 10 minutes (>= the 60_000ms window)

/**
 * Module-level store.  Use _resetStoreForTests() to clear between test cases.
 * A {@link BoundedStore} (LRU cap + idle TTL) rather than a bare Map so keys for
 * clients that never return are evicted instead of accumulating forever.
 */
const store = new BoundedStore<WindowState>({
  maxEntries: RL_MAX_ENTRIES,
  ttlMs: RL_TTL_MS,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the request keyed by `key` carrying `message` should be
 * allowed through.
 *
 * Checks are applied in order: input-length first (cheap synchronous string
 * check, evaluated before any backend I/O), then the rate-window counter (memory
 * or Redis backend per {@link getRedisClient}).
 *
 * @param key        The rate-limit bucket key.  The chat route passes an
 *                   auth-derived namespace (`acct:<id>` for signed-in users,
 *                   `ip:<addr>` for guests) so the tiers count independently.
 * @param message    The raw user message string from the POST body.
 * @param config     Optional overrides; defaults to DEFAULT_CONFIG.
 * @param now        Injectable clock (epoch ms). Honored by the memory backend
 *                   only; the Redis backend relies on server-side key TTLs.
 */
export async function checkRateLimit(
  key: string,
  message: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  // ------------------------------------------------------------------
  // 1. Input-length cap — synchronous, BEFORE any backend dispatch so an
  //    oversized message never costs a Redis round-trip or creates a key.
  // ------------------------------------------------------------------
  if (message.length > config.maxInputLength) {
    return {
      allowed: false,
      reason: "input_too_long",
      maxLength: config.maxInputLength,
      actualLength: message.length,
    };
  }

  // ------------------------------------------------------------------
  // 2. Per-key fixed-window counter — memory or Redis backend.
  // ------------------------------------------------------------------
  const client = getRedisClient();
  if (client === null) {
    return checkWindowMemory(key, config, now);
  }
  return checkWindowRedis(client, key, config);
}

/**
 * Memory-backend fixed-window counter (honors the injected `now`). A missing or
 * expired window starts fresh; an open window rejects at `count >= max` (so
 * exactly `max` requests are admitted per window) and otherwise increments.
 */
function checkWindowMemory(
  key: string,
  config: RateLimitConfig,
  now: number,
): RateLimitResult {
  const state = store.get(key, now);

  // No prior state, or the window has expired → fresh window.
  if (state === undefined || now - state.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now }, now);
    return { allowed: true };
  }

  // Window still open but limit already hit.
  if (state.count >= config.maxRequestsPerWindow) {
    const retryAfterMs = config.windowMs - (now - state.windowStart);
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  // Within window and under the cap — increment and allow.
  state.count += 1;
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Redis backend — one atomic INCR + conditional PEXPIRE + PTTL Lua script
// ---------------------------------------------------------------------------

/**
 * Window counter. KEYS = [rlKey]; ARGV = [windowMs]. INCR the counter, set the
 * window TTL on the FIRST hit only (so the window never slides), and report the
 * new count plus the remaining TTL.
 *
 * Parity with the memory backend: the memory store rejects pre-increment at
 * `count >= max` while this INCRs first and admits while `c <= max` — the SAME
 * number of requests (`max`) is admitted per window. Unlike memory, a rejected
 * request still INCRs the counter past `max`; that is harmless because PEXPIRE
 * fires only on `c == 1`, so an over-cap INCR never extends the window.
 */
const WINDOW_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {c, ttl}
`;

/** ioredis client with the rate-limit window script attached via defineCommand. */
interface RlRedis extends Redis {
  rlWindow(rlKey: string, windowMs: string): Promise<[number, number]>;
}

// The client is a globalThis-memoized singleton that `_resetClientForTests` can
// recreate; `defineCommand` throws if a command is redefined on the same
// instance, so guard registration per-instance (a WeakSet forgets an old client
// automatically once it's GC'd) — same idiom as the OTP throttle.
const commandsRegistered = new WeakSet<Redis>();

function withRlCommand(client: Redis): RlRedis {
  if (!commandsRegistered.has(client)) {
    client.defineCommand("rlWindow", { numberOfKeys: 1, lua: WINDOW_LUA });
    commandsRegistered.add(client);
  }
  return client as RlRedis;
}

async function checkWindowRedis(
  client: Redis,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  try {
    const rl = withRlCommand(client);
    const [count, ttl] = await rl.rlWindow(
      `${RL_PREFIX}${key}`,
      String(config.windowMs),
    );
    if (count <= config.maxRequestsPerWindow) {
      return { allowed: true };
    }
    // PTTL is -1/-2 only in a narrow race (key expired between INCR and PTTL);
    // fall back to the full window as the safe retry-after.
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: ttl > 0 ? ttl : config.windowMs,
    };
  } catch (err) {
    // Fail OPEN — deliberate: a soft abuse limiter must not take down all chat
    // on a Redis blip. The synchronous input-length gate above still enforces.
    // Never log the key or message content — only that an error occurred.
    logger.error(
      { event: "rate_limit_redis_error", err: err instanceof Error ? err.message : String(err) },
      "oak_rate_limit_redis_error",
    );
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// Test helper (not part of the public surface — test files only)
// ---------------------------------------------------------------------------

/**
 * Wipe all per-session window state on BOTH backends. Call in `beforeEach` /
 * `afterEach` to isolate cases: always clears the in-process store, and — when
 * Redis is configured — additionally deletes every `oak:rl:*` key.
 *
 * @internal
 */
export async function _resetStoreForTests(): Promise<void> {
  store.clear();
  const client = getRedisClient();
  if (client) {
    await deletePrefix(client, RL_PREFIX);
  }
}
