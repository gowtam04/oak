/**
 * otp-throttle.redis.test.ts — the REDIS-backend suite for the OTP throttle.
 *
 * Runs against the shared Testcontainers Redis instance published as
 * REDIS_CONN_URI (test/support/redis-global-setup.ts). Opts in per suite via
 * `vi.stubEnv("REDIS_URL", ...)` + `_resetClientForTests` (the pattern from
 * src/server/redis.test.ts) so every check dispatches to the atomic Lua backend
 * rather than the in-process memory store.
 *
 * Focus: the Lua atomicity / gate order / commit + "refused consumes no quota"
 * invariants that the memory suite (otp-throttle.test.ts) can't prove. Window
 * arithmetic (exact boundary ms, `now` time-travel) stays the memory suite's job
 * — the Redis backend uses server-time TTLs, so assertions here are on
 * tolerances, not exact millisecond values.
 */

import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

import {
  _resetClientForTests,
  getRedisClient,
  OTP_PREFIX,
} from "@/server/redis";
import {
  _resetForTests,
  checkRequestThrottle,
  checkVerifyThrottle,
} from "@/server/auth/otp-throttle";

// Mirrored from the implementation.
const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const VERIFY_WINDOW_MS = 10 * 60_000;

beforeEach(async () => {
  await _resetClientForTests();
  vi.stubEnv("REDIS_URL", inject("REDIS_CONN_URI"));
  // Wipe any oak:otp:* keys left by a prior test (client now points at the
  // container).
  await _resetForTests();
});

afterEach(async () => {
  await _resetForTests();
  vi.unstubAllEnvs();
  await _resetClientForTests();
});

// ---------------------------------------------------------------------------
// (a) cooldown — an immediate repeat for the same email is refused
// ---------------------------------------------------------------------------

describe("checkRequestThrottle (redis) — cooldown", () => {
  it("refuses an immediate second request for the same email", async () => {
    const email = "cooldown@example.com";
    const ip = "10.0.0.1";

    const first = await checkRequestThrottle(email, ip);
    expect(first.allowed).toBe(true);
    expect(first.retryAfterMs).toBe(0);

    const second = await checkRequestThrottle(email, ip);
    expect(second.allowed).toBe(false);
    // retryAfter ≈ the remaining 60s cooldown (PTTL of the elast marker).
    expect(second.retryAfterMs).toBeGreaterThan(55_000);
    expect(second.retryAfterMs).toBeLessThanOrEqual(COOLDOWN_MS);
  });

  // (b) cooldown is per-email, not per-IP.
  it("allows a different email from the same IP (cooldown is per-email)", async () => {
    const ip = "10.0.0.2";
    expect((await checkRequestThrottle("a@example.com", ip)).allowed).toBe(true);
    expect((await checkRequestThrottle("b@example.com", ip)).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) per-IP hourly cap — 20 distinct emails allowed, 21st refused
// ---------------------------------------------------------------------------

describe("checkRequestThrottle (redis) — per-IP hourly cap", () => {
  it("allows 20 distinct emails from one IP and refuses the 21st", async () => {
    const ip = "203.0.113.10";
    // Distinct emails bypass both the per-email cooldown and the per-email cap,
    // so the only binding gate is the per-IP hourly cap.
    for (let i = 0; i < 20; i++) {
      const r = await checkRequestThrottle(`u${i}@example.com`, ip);
      expect(r.allowed).toBe(true);
    }
    const r = await checkRequestThrottle("u20@example.com", ip);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(HOUR_MS);
  });
});

// ---------------------------------------------------------------------------
// (d) a refused request consumes no quota — hourly counters do not increment
// ---------------------------------------------------------------------------

describe("checkRequestThrottle (redis) — refused consumes no quota", () => {
  it("does not increment the email/ip hourly counters on a cooldown refusal", async () => {
    const email = "noquota@example.com";
    const ip = "10.0.0.5";
    const client = getRedisClient()!;
    const ehKey = `${OTP_PREFIX}eh:${email}`;
    const ihKey = `${OTP_PREFIX}ih:${ip}`;

    // One accepted request → both hourly counters at 1.
    expect((await checkRequestThrottle(email, ip)).allowed).toBe(true);
    expect(await client.get(ehKey)).toBe("1");
    expect(await client.get(ihKey)).toBe("1");

    // Immediate repeat is cooldown-refused (short-circuits before any INCR).
    expect((await checkRequestThrottle(email, ip)).allowed).toBe(false);

    // The refused request left BOTH counters untouched.
    expect(await client.get(ehKey)).toBe("1");
    expect(await client.get(ihKey)).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// (e) verify throttle — 20 per IP allowed, 21st refused; another IP allowed
// ---------------------------------------------------------------------------

describe("checkVerifyThrottle (redis) — per-IP verify cap", () => {
  it("allows 20 attempts per IP, refuses the 21st, isolates other IPs", async () => {
    const ip = "192.0.2.7";
    for (let i = 0; i < 20; i++) {
      expect((await checkVerifyThrottle(ip)).allowed).toBe(true);
    }
    const r = await checkVerifyThrottle(ip);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(VERIFY_WINDOW_MS);

    // A different IP is unaffected by the exhausted one.
    expect((await checkVerifyThrottle("192.0.2.8")).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (f) per-email hourly cap gate in isolation — bypass cooldown by deleting the
// elast marker between calls so the eh gate is what refuses the 6th request
// ---------------------------------------------------------------------------

describe("checkRequestThrottle (redis) — per-email hourly cap gate", () => {
  it("allows 5 per email then refuses the 6th on the email-hour gate", async () => {
    const email = "hourly@example.com";
    const ip = "10.0.0.9";
    const client = getRedisClient()!;
    const elastKey = `${OTP_PREFIX}elast:${email}`;

    for (let i = 0; i < 5; i++) {
      expect((await checkRequestThrottle(email, ip)).allowed).toBe(true);
      // Legitimately drop the cooldown marker so the next call is gated ONLY by
      // the email-hour counter (exercises the eh gate directly).
      await client.del(elastKey);
    }

    // Counter is now at the cap; elast deleted again below so cooldown can't be
    // the refusing gate.
    await client.del(elastKey);
    const r = await checkRequestThrottle(email, ip);
    expect(r.allowed).toBe(false);
    // The refusal is the email-hour gate (retry ≈ remaining hour), NOT the 60s
    // cooldown — so it exceeds COOLDOWN_MS.
    expect(r.retryAfterMs).toBeGreaterThan(COOLDOWN_MS);
    expect(r.retryAfterMs).toBeLessThanOrEqual(HOUR_MS);
    // Exactly 5 committed; the refused 6th consumed no quota.
    expect(await client.get(`${OTP_PREFIX}eh:${email}`)).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// (g) _resetForTests wipes every oak:otp:* key
// ---------------------------------------------------------------------------

describe("_resetForTests (redis)", () => {
  it("deletes all oak:otp:* keys", async () => {
    const client = getRedisClient()!;
    await checkRequestThrottle("wipe@example.com", "10.0.0.11");
    await checkVerifyThrottle("10.0.0.12");

    const before = await client.keys(`${OTP_PREFIX}*`);
    expect(before.length).toBeGreaterThan(0);

    await _resetForTests();

    const after = await client.keys(`${OTP_PREFIX}*`);
    expect(after).toEqual([]);
  });
});
