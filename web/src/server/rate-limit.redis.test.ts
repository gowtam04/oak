/**
 * rate-limit.redis.test.ts — the REDIS-backend suite for the rate limiter.
 *
 * Runs against the shared Testcontainers Redis instance published as
 * REDIS_CONN_URI (test/support/redis-global-setup.ts). Opts in per suite via
 * `vi.stubEnv("REDIS_URL", ...)` + `_resetClientForTests` (the pattern from
 * src/server/redis.test.ts) so each check dispatches to the atomic Lua backend.
 *
 * Focus: the Lua window semantics (cap parity, window expiry, key independence),
 * that the synchronous input-length gate never creates a key, the reset wipe,
 * and the fail-OPEN behavior on a Redis outage. Exact window arithmetic under an
 * injected `now` stays the memory suite's job (the Redis backend uses server-time
 * TTLs), so timing assertions here use real sleeps + tolerances.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

import {
  _resetClientForTests,
  getRedisClient,
  RL_PREFIX,
} from "@/server/redis";
import {
  _resetStoreForTests,
  checkRateLimit,
  type RateLimitConfig,
} from "@/server/rate-limit";

// A deliberately short window so a real sleep can cross the boundary cheaply.
const SHORT_CONFIG: RateLimitConfig = {
  maxInputLength: 50,
  maxRequestsPerWindow: 3,
  windowMs: 200,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  await _resetClientForTests();
  vi.stubEnv("REDIS_URL", inject("REDIS_CONN_URI"));
  await _resetStoreForTests();
});

afterEach(async () => {
  await _resetStoreForTests();
  vi.unstubAllEnvs();
  await _resetClientForTests();
});

// ---------------------------------------------------------------------------
// (a) cap parity — exactly `max` allowed per window, then refused
// ---------------------------------------------------------------------------

describe("checkRateLimit (redis) — window cap", () => {
  it("admits exactly maxRequestsPerWindow then refuses with a bounded retryAfterMs", async () => {
    const key = "ip:cap";
    for (let i = 0; i < SHORT_CONFIG.maxRequestsPerWindow; i++) {
      const r = await checkRateLimit(key, "x", SHORT_CONFIG);
      expect(r.allowed).toBe(true);
    }
    const refused = await checkRateLimit(key, "x", SHORT_CONFIG);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed && refused.reason === "rate_limited") {
      expect(refused.retryAfterMs).toBeGreaterThan(0);
      expect(refused.retryAfterMs).toBeLessThanOrEqual(SHORT_CONFIG.windowMs);
    } else {
      throw new Error(`expected rate_limited, got ${JSON.stringify(refused)}`);
    }
  });

  // (b) window expiry — the same key is allowed again after the window elapses.
  it("allows the same key again after the window expires", async () => {
    const key = "ip:expire";
    for (let i = 0; i < SHORT_CONFIG.maxRequestsPerWindow; i++) {
      expect((await checkRateLimit(key, "x", SHORT_CONFIG)).allowed).toBe(true);
    }
    expect((await checkRateLimit(key, "x", SHORT_CONFIG)).allowed).toBe(false);

    // Sleep past the 200ms window so the Redis key TTLs out → fresh window.
    await sleep(250);
    expect((await checkRateLimit(key, "x", SHORT_CONFIG)).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) the synchronous input-length gate never touches Redis
// ---------------------------------------------------------------------------

describe("checkRateLimit (redis) — input-length gate precedes Redis I/O", () => {
  it("rejects an oversized message without creating a redis key", async () => {
    const key = "ip:toolong";
    const oversized = "x".repeat(SHORT_CONFIG.maxInputLength + 1);
    const r = await checkRateLimit(key, oversized, SHORT_CONFIG);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("input_too_long");

    // No counter key was created (the gate returned before any INCR).
    const client = getRedisClient()!;
    expect(await client.get(`${RL_PREFIX}${key}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (d) distinct keys are counted independently
// ---------------------------------------------------------------------------

describe("checkRateLimit (redis) — key independence", () => {
  it("exhausting one key leaves a different key fully available", async () => {
    const a = "ip:d1";
    const b = "ip:d2";
    for (let i = 0; i < SHORT_CONFIG.maxRequestsPerWindow; i++) {
      expect((await checkRateLimit(a, "x", SHORT_CONFIG)).allowed).toBe(true);
    }
    expect((await checkRateLimit(a, "x", SHORT_CONFIG)).allowed).toBe(false);
    // The other key is a separate counter — still fresh.
    expect((await checkRateLimit(b, "x", SHORT_CONFIG)).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (e) _resetStoreForTests wipes every oak:rl:* key
// ---------------------------------------------------------------------------

describe("_resetStoreForTests (redis)", () => {
  it("deletes all oak:rl:* keys", async () => {
    const client = getRedisClient()!;
    await checkRateLimit("ip:wipe1", "x", SHORT_CONFIG);
    await checkRateLimit("ip:wipe2", "x", SHORT_CONFIG);

    const before = await client.keys(`${RL_PREFIX}*`);
    expect(before.length).toBeGreaterThan(0);

    await _resetStoreForTests();

    const after = await client.keys(`${RL_PREFIX}*`);
    expect(after).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (f) fail OPEN — a Redis outage must not block chat
// ---------------------------------------------------------------------------

describe("checkRateLimit (redis) — fail open on outage", () => {
  it("allows the request when Redis is unreachable", async () => {
    // Point the client at a closed port so the Lua command errors out (the
    // client's commandTimeout/maxRetriesPerRequest bound this to ~1s). A soft
    // abuse limiter must fail OPEN — the request is allowed despite the outage.
    await _resetClientForTests();
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:9/");

    const r = await checkRateLimit("ip:outage", "x", SHORT_CONFIG);
    expect(r.allowed).toBe(true);

    // Drop the unreachable client now so the afterEach reset (which SCANs to
    // wipe keys) doesn't itself hit the dead connection — `_resetStoreForTests`
    // deliberately does not swallow a deletePrefix error.
    vi.unstubAllEnvs();
    await _resetClientForTests();
  });
});
