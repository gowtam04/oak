/**
 * Request/verify throttle for account-creation email-OTP auth
 * (account-creation design.md § Interface Definitions →
 * `src/server/auth/otp-throttle.ts`, AD-5; BR-A5, BR-A6).
 *
 * This guards the *request* side of the OTP flow (abuse-bounding) — distinct
 * from the durable per-code lifecycle (expiry / single-use / 5-attempt lockout)
 * which lives on the `otp_code` row. Three independent gates compose here:
 *
 *  - **Resend cooldown (60s, per email)** — a fresh code may be requested for an
 *    email only once every 60 seconds (BR-A5). Boundary is exclusive: a request
 *    exactly 60_000ms after the previous one is allowed; 59_999ms is refused.
 *  - **Per-email hourly cap (5 / hour)** — at most 5 codes per email per rolling
 *    fixed window (BR-A6, anti email-bombing).
 *  - **Per-IP hourly cap (20 / hour)** — at most 20 code requests per source IP
 *    per fixed window (BR-A6, anti enumeration / distribution across emails).
 *
 * A separate **per-IP verify cap (20 / 10 min)** bounds online brute force of
 * codes across the IP.
 *
 * ## Dual backend (scaling-plan.md Phase 1)
 *
 * State lives in ONE of two backends, chosen per call by {@link getRedisClient}:
 *
 *  - **Memory** (`REDIS_URL` unset → `getRedisClient()` returns `null`): the
 *    original process-local {@link BoundedStore} fixed-window logic below, still
 *    honoring an injected `now` — a restart resets all counters (acceptable for a
 *    single-instance deploy). This is what dev/tests use by default.
 *  - **Redis** (`REDIS_URL` set): each check is ONE atomic Lua script over the
 *    shared instance, so the cooldown→email→ip gate order and the "refused
 *    request consumes no quota" invariant hold across N machines — a non-atomic
 *    GET-then-INCR would let concurrent requests on different machines slip the
 *    caps. The Redis backend ignores the injected `now` and uses server-time
 *    TTLs (a single time source is more correct across machines).
 *
 * **Failure policy — fail CLOSED.** Any Redis error (thrown command, timeout)
 * returns `{ allowed: false, retryAfterMs: COOLDOWN_MS }`. This is DELIBERATE:
 * this is a security control (email-bomb / brute-force / enumeration), so a Redis
 * outage must block sign-ins rather than open those vectors (accepted, per the
 * scaling plan). The email is never logged (matches auth-service's practice of
 * keeping PII out of the pino logs).
 *
 * `now` is injectable for deterministic tests of the memory backend, and
 * `_resetForTests()` wipes all state between cases (both backends).
 */

import Redis from "ioredis";

import { BoundedStore } from "@/server/bounded-store";
import { logger } from "@/server/logger";
import { deletePrefix, getRedisClient, OTP_PREFIX } from "@/server/redis";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum gap between successive code requests for one email (BR-A5). */
const COOLDOWN_MS = 60_000;

/** One-hour fixed window for the request caps. */
const HOUR_MS = 60 * 60_000;

/** Max code requests per email per {@link HOUR_MS} window (BR-A6). */
const EMAIL_HOURLY_CAP = 5;

/** Max code requests per source IP per {@link HOUR_MS} window (BR-A6). */
const IP_HOURLY_CAP = 20;

/** Fixed window for the per-IP verify cap. */
const VERIFY_WINDOW_MS = 10 * 60_000;

/** Max verify attempts per source IP per {@link VERIFY_WINDOW_MS} window. */
const IP_VERIFY_CAP = 20;

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

/**
 * Outcome of a throttle check. When `allowed` is false, `retryAfterMs` is the
 * (positive) wait until the blocking gate clears — surfaced to the client as a
 * `Retry-After`. When allowed, `retryAfterMs` is 0.
 */
export interface ThrottleResult {
  allowed: boolean;
  retryAfterMs: number;
}

// ---------------------------------------------------------------------------
// Memory backend — in-process fixed windows (honors injected `now`)
// ---------------------------------------------------------------------------

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Bounds for the throttle stores (assessment C1). Keys are emails / client IPs;
 * the per-IP stores are reachable via spoofable client IPs, so an unbounded map
 * is an OOM vector. Each entry is tiny (~200 B) so 20 000/store ≈ ~4 MB — the cap
 * is a memory backstop, not a real-traffic constraint. Each TTL is `>=` its
 * store's window so a key is never idle-evicted mid-window (which would reset a
 * counter and leak allowance).
 */
const OTP_MAX_ENTRIES = 20_000;
/** Idle TTL for the request-side stores (>= COOLDOWN_MS and >= HOUR_MS). */
const REQUEST_TTL_MS = 2 * HOUR_MS; // 2 hours
/** Idle TTL for the verify store (>= VERIFY_WINDOW_MS). */
const VERIFY_TTL_MS = 2 * VERIFY_WINDOW_MS; // 20 minutes

/** email → timestamp of its most recent accepted request (cooldown gate). */
const emailLastRequest = new BoundedStore<number>({
  maxEntries: OTP_MAX_ENTRIES,
  ttlMs: REQUEST_TTL_MS,
});
/** email → hourly request counter. */
const emailHourly = new BoundedStore<WindowState>({
  maxEntries: OTP_MAX_ENTRIES,
  ttlMs: REQUEST_TTL_MS,
});
/** ip → hourly request counter. */
const ipHourly = new BoundedStore<WindowState>({
  maxEntries: OTP_MAX_ENTRIES,
  ttlMs: REQUEST_TTL_MS,
});
/** ip → verify-attempt counter. */
const ipVerify = new BoundedStore<WindowState>({
  maxEntries: OTP_MAX_ENTRIES,
  ttlMs: VERIFY_TTL_MS,
});

/**
 * Evaluate a fixed-window cap without mutating state. A missing or expired
 * window is a fresh window (allowed). Within an open window, `count >= cap` is
 * refused with the remaining time until the window resets.
 */
function evalWindow(
  state: WindowState | undefined,
  now: number,
  windowMs: number,
  cap: number,
): ThrottleResult {
  if (state === undefined || now - state.windowStart >= windowMs) {
    return { allowed: true, retryAfterMs: 0 };
  }
  if (state.count >= cap) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, windowMs - (now - state.windowStart)),
    };
  }
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Commit one accepted hit to a fixed-window counter (mirrors
 * `rate-limit.ts`): start a new window or increment the open one. The in-place
 * `state.count += 1` relies on the store returning the SAME value object from
 * `get` (BoundedStore preserves reference identity).
 */
function commitWindow(
  store: BoundedStore<WindowState>,
  key: string,
  now: number,
  windowMs: number,
): void {
  const state = store.get(key, now);
  if (state === undefined || now - state.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now }, now);
  } else {
    state.count += 1;
  }
}

/**
 * Memory-backend request throttle: gates evaluated in order (cooldown → email
 * hourly → ip hourly), first failure short-circuits, no counter mutated unless
 * every gate passes (a refused request never consumes quota).
 */
function checkRequestThrottleMemory(
  email: string,
  ip: string,
  now: number,
): ThrottleResult {
  // 1. Resend cooldown (per email). Exclusive boundary at COOLDOWN_MS.
  const lastAt = emailLastRequest.get(email, now);
  if (lastAt !== undefined) {
    const elapsed = now - lastAt;
    if (elapsed < COOLDOWN_MS) {
      return { allowed: false, retryAfterMs: COOLDOWN_MS - elapsed };
    }
  }

  // 2. Per-email hourly cap.
  const emailCap = evalWindow(
    emailHourly.get(email, now),
    now,
    HOUR_MS,
    EMAIL_HOURLY_CAP,
  );
  if (!emailCap.allowed) {
    return emailCap;
  }

  // 3. Per-IP hourly cap.
  const ipCap = evalWindow(ipHourly.get(ip, now), now, HOUR_MS, IP_HOURLY_CAP);
  if (!ipCap.allowed) {
    return ipCap;
  }

  // All gates clear → record the accepted request across all three counters.
  emailLastRequest.set(email, now, now);
  commitWindow(emailHourly, email, now, HOUR_MS);
  commitWindow(ipHourly, ip, now, HOUR_MS);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Memory-backend verify throttle: per-IP fixed window, consume-on-allow only.
 */
function checkVerifyThrottleMemory(ip: string, now: number): ThrottleResult {
  const cap = evalWindow(
    ipVerify.get(ip, now),
    now,
    VERIFY_WINDOW_MS,
    IP_VERIFY_CAP,
  );
  if (!cap.allowed) {
    return cap;
  }
  commitWindow(ipVerify, ip, now, VERIFY_WINDOW_MS);
  return { allowed: true, retryAfterMs: 0 };
}

// ---------------------------------------------------------------------------
// Redis backend — two atomic Lua scripts (gate order + commit, N-machine safe)
// ---------------------------------------------------------------------------

/**
 * Request throttle. KEYS = [elast, eh, ih]; ARGV = [cooldownMs, hourMs,
 * emailCap, ipCap]. Gates cooldown → email-hourly → ip-hourly, short-circuits on
 * the first failure with that gate's remaining time, and commits all three
 * counters ONLY when every gate passes (a refused request consumes no quota).
 *
 * PTTL returns -2 (no key) / -1 (no expiry) / ms remaining; for the counter
 * keys `t > 0 and t or hourMs` correctly falls the -1/-2/0 edge cases back to a
 * full window as the safe retry-after (a counter at/over cap should always carry
 * a live PEXPIRE, so the fallback is only defensive).
 */
const REQUEST_LUA = `
local cd = redis.call('PTTL', KEYS[1])
if cd > 0 then return {0, cd} end
local ec = tonumber(redis.call('GET', KEYS[2]) or '0')
if ec >= tonumber(ARGV[3]) then
  local t = redis.call('PTTL', KEYS[2])
  return {0, t > 0 and t or tonumber(ARGV[2])}
end
local ic = tonumber(redis.call('GET', KEYS[3]) or '0')
if ic >= tonumber(ARGV[4]) then
  local t = redis.call('PTTL', KEYS[3])
  return {0, t > 0 and t or tonumber(ARGV[2])}
end
redis.call('SET', KEYS[1], '1', 'PX', ARGV[1])
local n2 = redis.call('INCR', KEYS[2])
if n2 == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[2]) end
local n3 = redis.call('INCR', KEYS[3])
if n3 == 1 then redis.call('PEXPIRE', KEYS[3], ARGV[2]) end
return {1, 0}
`;

/**
 * Verify throttle. KEYS = [iv]; ARGV = [windowMs, cap]. Consume-on-allow: refuse
 * with the window's remaining time when the counter is at/over cap, else INCR
 * (setting the window TTL on the first hit) and allow.
 */
const VERIFY_LUA = `
local ic = tonumber(redis.call('GET', KEYS[1]) or '0')
if ic >= tonumber(ARGV[2]) then
  local t = redis.call('PTTL', KEYS[1])
  return {0, t > 0 and t or tonumber(ARGV[1])}
end
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {1, 0}
`;

/** ioredis client with the two OTP-throttle scripts attached via defineCommand. */
interface OtpRedis extends Redis {
  otpRequestThrottle(
    elastKey: string,
    ehKey: string,
    ihKey: string,
    cooldownMs: string,
    hourMs: string,
    emailCap: string,
    ipCap: string,
  ): Promise<[number, number]>;
  otpVerifyThrottle(
    ivKey: string,
    windowMs: string,
    cap: string,
  ): Promise<[number, number]>;
}

// The client is a globalThis-memoized singleton that `_resetClientForTests` can
// recreate; `defineCommand` throws if a command is redefined on the same
// instance, so guard registration per-instance (a WeakSet forgets an old client
// automatically once it's GC'd).
const commandsRegistered = new WeakSet<Redis>();

function withOtpCommands(client: Redis): OtpRedis {
  if (!commandsRegistered.has(client)) {
    client.defineCommand("otpRequestThrottle", {
      numberOfKeys: 3,
      lua: REQUEST_LUA,
    });
    client.defineCommand("otpVerifyThrottle", {
      numberOfKeys: 1,
      lua: VERIFY_LUA,
    });
    commandsRegistered.add(client);
  }
  return client as OtpRedis;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function checkRequestThrottleRedis(
  client: Redis,
  email: string,
  ip: string,
): Promise<ThrottleResult> {
  try {
    const otp = withOtpCommands(client);
    const [allowed, retryAfterMs] = await otp.otpRequestThrottle(
      `${OTP_PREFIX}elast:${email}`,
      `${OTP_PREFIX}eh:${email}`,
      `${OTP_PREFIX}ih:${ip}`,
      String(COOLDOWN_MS),
      String(HOUR_MS),
      String(EMAIL_HOURLY_CAP),
      String(IP_HOURLY_CAP),
    );
    return { allowed: allowed === 1, retryAfterMs };
  } catch (err) {
    // Fail CLOSED — deliberate: this is a security control (email-bomb /
    // enumeration), so a Redis outage must NOT open those vectors. Never log the
    // email (PII stays out of the logs, matching auth-service).
    logger.error(
      { event: "otp_throttle_redis_error", err: errMessage(err) },
      "otp_throttle_redis_error",
    );
    return { allowed: false, retryAfterMs: COOLDOWN_MS };
  }
}

async function checkVerifyThrottleRedis(
  client: Redis,
  ip: string,
): Promise<ThrottleResult> {
  try {
    const otp = withOtpCommands(client);
    const [allowed, retryAfterMs] = await otp.otpVerifyThrottle(
      `${OTP_PREFIX}iv:${ip}`,
      String(VERIFY_WINDOW_MS),
      String(IP_VERIFY_CAP),
    );
    return { allowed: allowed === 1, retryAfterMs };
  } catch (err) {
    // Fail CLOSED — see checkRequestThrottleRedis.
    logger.error(
      { event: "otp_throttle_redis_error", err: errMessage(err) },
      "otp_throttle_redis_error",
    );
    return { allowed: false, retryAfterMs: COOLDOWN_MS };
  }
}

// ---------------------------------------------------------------------------
// Public API (async — dispatches to the memory or Redis backend per call)
// ---------------------------------------------------------------------------

/**
 * Check whether a code request for `email` from `ip` is allowed (BR-A5, BR-A6).
 *
 * Gates are evaluated in order — cooldown, then per-email hourly cap, then
 * per-IP hourly cap — and the first failure short-circuits with its
 * `retryAfterMs`. No counter is mutated unless **every** gate passes, so a
 * refused request never consumes quota. `now` is honored by the memory backend
 * only; the Redis backend uses server-time TTLs.
 */
export async function checkRequestThrottle(
  email: string,
  ip: string,
  now: number = Date.now(),
): Promise<ThrottleResult> {
  const client = getRedisClient();
  if (client === null) {
    return checkRequestThrottleMemory(email, ip, now);
  }
  return checkRequestThrottleRedis(client, email, ip);
}

/**
 * Check whether a verify attempt from `ip` is allowed (per-IP cap, 20 / 10 min).
 *
 * Bounds cross-code online brute force from one source. The counter is consumed
 * only when the attempt is allowed. `now` is honored by the memory backend only.
 */
export async function checkVerifyThrottle(
  ip: string,
  now: number = Date.now(),
): Promise<ThrottleResult> {
  const client = getRedisClient();
  if (client === null) {
    return checkVerifyThrottleMemory(ip, now);
  }
  return checkVerifyThrottleRedis(client, ip);
}

// ---------------------------------------------------------------------------
// Test helper (not part of the public surface — test files only)
// ---------------------------------------------------------------------------

/**
 * Wipe all throttle state on BOTH backends. Call in `beforeEach` / `afterEach`
 * to isolate cases: always clears the in-process stores, and — if a Redis client
 * is configured — deletes every `oak:otp:*` key.
 *
 * @internal
 */
export async function _resetForTests(): Promise<void> {
  emailLastRequest.clear();
  emailHourly.clear();
  ipHourly.clear();
  ipVerify.clear();
  const client = getRedisClient();
  if (client !== null) {
    await deletePrefix(client, OTP_PREFIX);
  }
}

// Exported for tests: the store bounds (assessment C1).
export const _OTP_MAX_ENTRIES = OTP_MAX_ENTRIES;
export const _REQUEST_TTL_MS = REQUEST_TTL_MS;
export const _VERIFY_TTL_MS = VERIFY_TTL_MS;
