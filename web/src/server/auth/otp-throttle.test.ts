import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _OTP_MAX_ENTRIES,
  _resetForTests,
  checkRequestThrottle,
  checkVerifyThrottle,
} from "@/server/auth/otp-throttle";

// ---------------------------------------------------------------------------
// Constants mirrored from the implementation (BR-A5, BR-A6).
// ---------------------------------------------------------------------------

const COOLDOWN_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const EMAIL_HOURLY_CAP = 5;
const IP_HOURLY_CAP = 20;
const VERIFY_WINDOW_MS = 10 * 60_000;
const IP_VERIFY_CAP = 20;

// Each case starts from a clean in-memory state. REDIS_URL is left unset, so
// these all exercise the MEMORY backend (the async signatures still honor the
// injected `now`). The Redis backend has its own suite in
// otp-throttle.redis.test.ts.
beforeEach(async () => {
  await _resetForTests();
});
afterEach(async () => {
  await _resetForTests();
});

// ---------------------------------------------------------------------------
// Resend cooldown (BR-A5) — exclusive boundary at 59_999 vs 60_000 ms
// ---------------------------------------------------------------------------

describe("checkRequestThrottle — resend cooldown (BR-A5)", () => {
  const email = "cooldown@example.com";
  const ip = "10.0.0.1";

  it("allows the first request for an email", async () => {
    const r = await checkRequestThrottle(email, ip, 0);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it("refuses a second request at 59_999 ms (still inside the cooldown)", async () => {
    expect((await checkRequestThrottle(email, ip, 0)).allowed).toBe(true);
    const r = await checkRequestThrottle(email, ip, COOLDOWN_MS - 1);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(1); // 60_000 - 59_999
  });

  it("allows a second request at exactly 60_000 ms (cooldown elapsed)", async () => {
    expect((await checkRequestThrottle(email, ip, 0)).allowed).toBe(true);
    const r = await checkRequestThrottle(email, ip, COOLDOWN_MS);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it("reports a decaying retryAfterMs across the cooldown window", async () => {
    expect((await checkRequestThrottle(email, ip, 0)).allowed).toBe(true);

    const early = await checkRequestThrottle(email, ip, 10_000);
    const late = await checkRequestThrottle(email, ip, 50_000);
    expect(early.allowed).toBe(false);
    expect(late.allowed).toBe(false);
    expect(early.retryAfterMs).toBe(50_000); // 60_000 - 10_000
    expect(late.retryAfterMs).toBe(10_000); // 60_000 - 50_000
    expect(late.retryAfterMs).toBeLessThan(early.retryAfterMs);
  });

  it("does not consume quota on a cooldown-refused request", async () => {
    // Accept at t=0, refuse at t=30_000. If the refused call had (wrongly)
    // updated the last-request timestamp, the t=60_000 call would still be
    // inside a fresh 60s cooldown and be refused. It must be allowed.
    expect((await checkRequestThrottle(email, ip, 0)).allowed).toBe(true);
    expect((await checkRequestThrottle(email, ip, 30_000)).allowed).toBe(false);
    const r = await checkRequestThrottle(email, ip, COOLDOWN_MS);
    expect(r.allowed).toBe(true);
  });

  it("tracks cooldown independently per email", async () => {
    expect((await checkRequestThrottle("a@example.com", ip, 0)).allowed).toBe(
      true,
    );
    // A different email is not subject to a@'s cooldown.
    expect(
      (await checkRequestThrottle("b@example.com", ip, 1_000)).allowed,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-email hourly cap (BR-A6) — boundary at the 5th vs 6th request
// ---------------------------------------------------------------------------

describe("checkRequestThrottle — per-email hourly cap (BR-A6)", () => {
  const email = "capped@example.com";
  const ip = "10.0.0.2";

  // Space requests exactly one cooldown apart so the cooldown gate always
  // passes and the only binding constraint is the hourly cap.
  function requestAtSlot(slot: number) {
    return checkRequestThrottle(email, ip, slot * COOLDOWN_MS);
  }

  it("allows exactly 5 requests within the hour", async () => {
    for (let i = 0; i < EMAIL_HOURLY_CAP; i++) {
      const r = await requestAtSlot(i);
      expect(r.allowed).toBe(true);
    }
  });

  it("refuses the 6th request inside the same hour window", async () => {
    for (let i = 0; i < EMAIL_HOURLY_CAP; i++) {
      expect((await requestAtSlot(i)).allowed).toBe(true);
    }
    // 6th request: cooldown is satisfied (one slot later), so the refusal is
    // the hourly cap — retryAfterMs is the remainder of the hour, far larger
    // than any cooldown value.
    const sixthAt = EMAIL_HOURLY_CAP * COOLDOWN_MS; // slot 5 → 300_000 ms
    const r = await checkRequestThrottle(email, ip, sixthAt);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(HOUR_MS - sixthAt); // 3_600_000 - 300_000
    expect(r.retryAfterMs).toBeGreaterThan(COOLDOWN_MS);
  });

  it("permits a fresh batch once the hour window rolls over", async () => {
    for (let i = 0; i < EMAIL_HOURLY_CAP; i++) {
      expect((await requestAtSlot(i)).allowed).toBe(true);
    }
    expect(
      (await checkRequestThrottle(email, ip, EMAIL_HOURLY_CAP * COOLDOWN_MS))
        .allowed,
    ).toBe(false);
    // Past the hour boundary → new window, cooldown also long elapsed.
    const r = await checkRequestThrottle(email, ip, HOUR_MS + 1);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-IP hourly cap (BR-A6) — boundary at the 20th vs 21st request
// ---------------------------------------------------------------------------

describe("checkRequestThrottle — per-IP hourly cap (BR-A6)", () => {
  const ip = "203.0.113.7";

  it("allows 20 requests across distinct emails from one IP", async () => {
    for (let i = 0; i < IP_HOURLY_CAP; i++) {
      // Distinct email each time → neither the per-email cooldown nor the
      // per-email cap ever binds; the only shared gate is the per-IP cap.
      const r = await checkRequestThrottle(`user${i}@example.com`, ip, 0);
      expect(r.allowed).toBe(true);
    }
  });

  it("refuses the 21st request from the same IP within the hour", async () => {
    for (let i = 0; i < IP_HOURLY_CAP; i++) {
      expect(
        (await checkRequestThrottle(`user${i}@example.com`, ip, 0)).allowed,
      ).toBe(true);
    }
    const r = await checkRequestThrottle(
      `user${IP_HOURLY_CAP}@example.com`,
      ip,
      0,
    );
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(HOUR_MS); // full hour remaining (windowStart=0)
  });

  it("isolates the per-IP cap between source IPs", async () => {
    for (let i = 0; i < IP_HOURLY_CAP; i++) {
      await checkRequestThrottle(`user${i}@example.com`, "198.51.100.1", 0);
    }
    // The first IP is now exhausted...
    expect(
      (await checkRequestThrottle("late@example.com", "198.51.100.1", 0))
        .allowed,
    ).toBe(false);
    // ...but a different IP is unaffected.
    expect(
      (await checkRequestThrottle("fresh@example.com", "198.51.100.2", 0))
        .allowed,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-IP verify cap (20 / 10 min) — boundary at the 20th vs 21st attempt
// ---------------------------------------------------------------------------

describe("checkVerifyThrottle — per-IP verify cap", () => {
  const ip = "192.0.2.50";

  it("allows the first verify attempt", async () => {
    const r = await checkVerifyThrottle(ip, 0);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it("allows exactly 20 attempts in the 10-minute window", async () => {
    for (let i = 0; i < IP_VERIFY_CAP; i++) {
      expect((await checkVerifyThrottle(ip, i)).allowed).toBe(true);
    }
  });

  it("refuses the 21st attempt within the window", async () => {
    for (let i = 0; i < IP_VERIFY_CAP; i++) {
      expect((await checkVerifyThrottle(ip, 0)).allowed).toBe(true);
    }
    const r = await checkVerifyThrottle(ip, 0);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(VERIFY_WINDOW_MS); // full window remaining
  });

  it("resets after the 10-minute window elapses", async () => {
    for (let i = 0; i < IP_VERIFY_CAP; i++) {
      await checkVerifyThrottle(ip, 0);
    }
    expect((await checkVerifyThrottle(ip, 0)).allowed).toBe(false);
    const r = await checkVerifyThrottle(ip, VERIFY_WINDOW_MS); // boundary → new window
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it("isolates the verify cap between source IPs", async () => {
    for (let i = 0; i < IP_VERIFY_CAP; i++) {
      await checkVerifyThrottle("a-ip", 0);
    }
    expect((await checkVerifyThrottle("a-ip", 0)).allowed).toBe(false);
    expect((await checkVerifyThrottle("b-ip", 0)).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Independence of the request and verify pools, and reset isolation
// ---------------------------------------------------------------------------

describe("pool independence and reset", () => {
  it("verify exhaustion does not block code requests for the same IP", async () => {
    const ip = "172.16.0.9";
    for (let i = 0; i < IP_VERIFY_CAP; i++) {
      await checkVerifyThrottle(ip, 0);
    }
    expect((await checkVerifyThrottle(ip, 0)).allowed).toBe(false);
    // The request throttle keys on a separate counter set.
    expect(
      (await checkRequestThrottle("someone@example.com", ip, 0)).allowed,
    ).toBe(true);
  });

  it("request exhaustion does not block verify attempts for the same IP", async () => {
    const ip = "172.16.0.10";
    for (let i = 0; i < IP_HOURLY_CAP; i++) {
      await checkRequestThrottle(`user${i}@example.com`, ip, 0);
    }
    expect(
      (await checkRequestThrottle("overflow@example.com", ip, 0)).allowed,
    ).toBe(false);
    expect((await checkVerifyThrottle(ip, 0)).allowed).toBe(true);
  });

  it("_resetForTests clears all counters", async () => {
    const email = "reset@example.com";
    const ip = "10.1.1.1";
    expect((await checkRequestThrottle(email, ip, 0)).allowed).toBe(true);
    // Still inside cooldown → would be refused without a reset.
    expect((await checkRequestThrottle(email, ip, 1_000)).allowed).toBe(false);
    await _resetForTests();
    // After reset the email/ip are unknown again → allowed even at the same now.
    expect((await checkRequestThrottle(email, ip, 1_000)).allowed).toBe(true);
  });

  it("defaults now to Date.now() when omitted", async () => {
    const r = await checkRequestThrottle(
      "default-clock@example.com",
      "10.2.2.2",
    );
    expect(r.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bounded stores: LRU cap + idle TTL (assessment C1). The four throttle maps no
// longer grow without bound. The LRU/TTL mechanics are unit-tested in
// bounded-store.test.ts; here we assert the throttle-level consequence.
// ---------------------------------------------------------------------------

describe("bounded stores (C1)", () => {
  it("LRU-evicts an idle email so its throttle state does not persist forever", async () => {
    // Victim requests once at t=0 → now under a 60s resend cooldown.
    expect(
      (await checkRequestThrottle("victim@example.com", "victim-ip", 0))
        .allowed,
    ).toBe(true);

    // Push the request-side stores one over their cap with DISTINCT emails+IPs
    // (distinct so neither the per-email nor the per-IP cap binds), all at t=0 so
    // the victim — inserted first and never re-touched — is least-recently-used.
    for (let i = 0; i < _OTP_MAX_ENTRIES; i++) {
      await checkRequestThrottle(`bulk${i}@example.com`, `bulk-ip-${i}`, 0);
    }

    // The victim's cooldown/counter entries were evicted, so a request still
    // inside the original 60s cooldown is allowed again — proving the store is
    // bounded rather than retaining the victim forever. (Without eviction this
    // would be refused with a positive retryAfterMs.)
    expect(
      (await checkRequestThrottle("victim@example.com", "victim-ip", 1_000))
        .allowed,
    ).toBe(true);
  });

  it("does not throw when far more than the cap of distinct emails/IPs are seen", async () => {
    // Reaching the end without a throw is the assertion (bounded stores never
    // OOM or error on unbounded distinct keys).
    for (let i = 0; i < _OTP_MAX_ENTRIES + 500; i++) {
      await checkRequestThrottle(`e${i}@example.com`, `ip-${i}`, 0);
      await checkVerifyThrottle(`v-ip-${i}`, 0);
    }
    expect(true).toBe(true);
  });
});
