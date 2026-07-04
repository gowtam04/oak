/**
 * ioredis client singleton — shared Redis plumbing for the three per-process
 * in-memory stores being externalized (scaling-plan.md Phase 1): guest
 * session/history + sticky scope (`session-store.ts`), the rate limiter
 * (`rate-limit.ts`), and the OTP throttle (`auth/otp-throttle.ts`).
 *
 * Wiring rules (mirrors `@/data/db`'s globalThis pattern, see its header):
 *   - `REDIS_URL` is read from `process.env` AT CALL TIME, not through the
 *     memoized `@/env` object — the same call-time-read idiom `env.ts` documents
 *     for `ADMIN_EMAILS` (src/env.ts ~L107-119) and `logger.ts` uses for
 *     `LOG_LEVEL`. This lets tests re-stub the value per case (`vi.stubEnv`)
 *     and keeps env.ts's eager parse from ever depending on Redis being present.
 *   - Unset/empty/whitespace `REDIS_URL` ⇒ `getRedisClient()` returns `null` and
 *     every caller falls back to its in-process store (dev/tests need no
 *     Redis). In production this is logged once per process — NOT an error,
 *     since single-machine deploys are still a valid (if non-scaling) config.
 *   - When set, the client is constructed once and memoized on
 *     `globalThis.__oakRedis` (NOT a module-level `let`) so Next's dev
 *     hot-reload / route re-evaluation reuses the SAME connection instead of
 *     leaking a new one per recompile — identical reasoning to `@/data/db`.
 *   - This module deliberately does NOT `import "server-only"`: none of the
 *     three stores it backs import it today, and nothing client-side (`.tsx`)
 *     reaches this module, so the extra guard isn't load-bearing here.
 *   - The connection string (and any embedded password) is NEVER logged —
 *     only the fact that an error occurred.
 */

import Redis from "ioredis";
import { logger } from "@/server/logger";

/** Key prefix for session-store data (history lists + sticky scope strings). */
export const SESS_PREFIX = "oak:sess:";
/** Key prefix for rate-limit counters. */
export const RL_PREFIX = "oak:rl:";
/** Key prefix for OTP-throttle cooldown/counters. */
export const OTP_PREFIX = "oak:otp:";

// --- globalThis memoization (mirrors src/data/db.ts's __oakDb pattern) -----
const globalForRedis = globalThis as typeof globalThis & {
  __oakRedis?: Redis;
  __oakRedisWarned?: boolean;
};

/** Treat an empty/whitespace-only env var as "unset". */
function readRedisUrl(): string | undefined {
  const raw = process.env.REDIS_URL;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function warnOnceInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (globalForRedis.__oakRedisWarned) return;
  globalForRedis.__oakRedisWarned = true;
  logger.warn(
    "REDIS_URL unset — using in-process stores (single-machine only)",
  );
}

function createClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
    enableReadyCheck: true,
  });
  // Never log the URL/password — only that a connection error occurred.
  client.on("error", (err: Error) => {
    logger.error({ err: err.message }, "redis_client_error");
  });
  return client;
}

/**
 * Returns the memoized ioredis client, or `null` if `REDIS_URL` is unset —
 * callers must fall back to their in-process store in that case. Reads
 * `process.env.REDIS_URL` fresh on every call (call-time read, see header),
 * so tests can `vi.stubEnv` it per case as long as they also call
 * {@link _resetClientForTests} first (a memoized client from a prior stub
 * would otherwise be reused).
 */
export function getRedisClient(): Redis | null {
  const url = readRedisUrl();
  if (!url) {
    warnOnceInProduction();
    return null;
  }
  if (!globalForRedis.__oakRedis) {
    globalForRedis.__oakRedis = createClient(url);
  }
  return globalForRedis.__oakRedis;
}

/**
 * Deletes every key under `prefix` via a SCAN + UNLINK loop (never FLUSHDB —
 * this runs against a shared Redis instance). Batches UNLINK calls in groups
 * of up to `COUNT` per SCAN cursor step. Intended for test cleanup; safe to
 * call even if no keys match (no-op).
 */
export async function deletePrefix(client: Redis, prefix: string): Promise<void> {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      "MATCH",
      `${prefix}*`,
      "COUNT",
      500,
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      await client.unlink(...keys);
    }
  } while (cursor !== "0");
}

/**
 * Test-only reset: quits the memoized client (if any) and clears both the
 * client slot and the one-time production-warning flag, so a subsequent
 * `getRedisClient()` call re-evaluates `REDIS_URL` from scratch. Later
 * redis-backend suites (session-store/rate-limit/otp-throttle) call this
 * before `vi.stubEnv("REDIS_URL", ...)` to force a fresh connection.
 *
 * @internal
 */
export async function _resetClientForTests(): Promise<void> {
  const existing = globalForRedis.__oakRedis;
  globalForRedis.__oakRedis = undefined;
  globalForRedis.__oakRedisWarned = undefined;
  if (existing) {
    await existing.quit().catch(() => {});
  }
}
