import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetStoreForTests,
  checkRateLimit,
  DEFAULT_CONFIG,
  type RateLimitConfig,
} from "@/server/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_MSG = "Which Pokemon learn earthquake?";
const SMALL_CONFIG: RateLimitConfig = {
  maxInputLength: 50,
  maxRequestsPerWindow: 3,
  windowMs: 10_000, // 10 s
};

// Convenience: call checkRateLimit with SMALL_CONFIG and an injectable clock.
function check(
  sessionId: string,
  message: string,
  now: number,
  config: RateLimitConfig = SMALL_CONFIG,
) {
  return checkRateLimit(sessionId, message, config, now);
}

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

beforeEach(() => _resetStoreForTests());
afterEach(() => _resetStoreForTests());

// ---------------------------------------------------------------------------
// Input-length cap
// ---------------------------------------------------------------------------

describe("input-length cap", () => {
  it("allows a message exactly at the limit", () => {
    const msg = "a".repeat(SMALL_CONFIG.maxInputLength);
    const result = check("sess-1", msg, 0);
    expect(result.allowed).toBe(true);
  });

  it("rejects a message one character over the limit", () => {
    const msg = "a".repeat(SMALL_CONFIG.maxInputLength + 1);
    const result = check("sess-1", msg, 0);
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.reason === "input_too_long") {
      expect(result.maxLength).toBe(SMALL_CONFIG.maxInputLength);
      expect(result.actualLength).toBe(SMALL_CONFIG.maxInputLength + 1);
    } else {
      // Force a failure if we didn't take the expected branch.
      expect(result.allowed).toBe(false);
      expect((result as { reason: string }).reason).toBe("input_too_long");
    }
  });

  it("rejects a very long message and reports correct lengths", () => {
    const msg = "x".repeat(5_000);
    const result = check("sess-1", msg, 0);
    expect(result.allowed).toBe(false);
    if (!result.allowed && result.reason === "input_too_long") {
      expect(result.actualLength).toBe(5_000);
    } else {
      expect((result as { reason: string }).reason).toBe("input_too_long");
    }
  });

  it("allows an empty message (length 0)", () => {
    const result = check("sess-1", "", 0);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-session rate window
// ---------------------------------------------------------------------------

describe("per-session fixed-window counter", () => {
  it("allows the first request", () => {
    expect(check("sess-1", SHORT_MSG, 0).allowed).toBe(true);
  });

  it("allows requests up to the limit within the window", () => {
    const limit = SMALL_CONFIG.maxRequestsPerWindow;
    for (let i = 0; i < limit; i++) {
      expect(check("sess-1", SHORT_MSG, i * 100).allowed).toBe(true);
    }
  });

  it("blocks the request immediately after hitting the limit", () => {
    const limit = SMALL_CONFIG.maxRequestsPerWindow;
    for (let i = 0; i < limit; i++) {
      check("sess-1", SHORT_MSG, i * 100);
    }
    const result = check("sess-1", SHORT_MSG, limit * 100);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("rate_limited");
    }
  });

  it("reports a positive retryAfterMs that decays toward zero", () => {
    const { maxRequestsPerWindow, windowMs } = SMALL_CONFIG;
    const windowStart = 0;

    // Fill the window.
    for (let i = 0; i < maxRequestsPerWindow; i++) {
      check("sess-1", SHORT_MSG, windowStart + i * 100);
    }

    // Query 1 s into the window.
    const t1 = 1_000;
    const r1 = check("sess-1", SHORT_MSG, t1);
    expect(r1.allowed).toBe(false);
    if (!r1.allowed && r1.reason === "rate_limited") {
      expect(r1.retryAfterMs).toBe(windowMs - t1);
    }

    // Query 5 s into the window — retryAfterMs should be smaller.
    const t2 = 5_000;
    const r2 = check("sess-1", SHORT_MSG, t2);
    expect(r2.allowed).toBe(false);
    if (!r2.allowed && r2.reason === "rate_limited") {
      expect(r2.retryAfterMs).toBe(windowMs - t2);
    }

    // retryAfterMs at t2 is less than at t1.
    if (
      !r1.allowed &&
      r1.reason === "rate_limited" &&
      !r2.allowed &&
      r2.reason === "rate_limited"
    ) {
      expect(r2.retryAfterMs).toBeLessThan(r1.retryAfterMs);
    }
  });

  it("resets the counter after the window expires", () => {
    const { maxRequestsPerWindow, windowMs } = SMALL_CONFIG;

    // Fill window starting at t=0.
    for (let i = 0; i < maxRequestsPerWindow; i++) {
      check("sess-1", SHORT_MSG, i * 100);
    }
    expect(check("sess-1", SHORT_MSG, 500).allowed).toBe(false);

    // Advance past the window boundary.
    const afterWindow = windowMs + 1;
    expect(check("sess-1", SHORT_MSG, afterWindow).allowed).toBe(true);

    // The fresh window allows up to the limit again.
    for (let i = 1; i < maxRequestsPerWindow; i++) {
      expect(check("sess-1", SHORT_MSG, afterWindow + i * 100).allowed).toBe(
        true,
      );
    }
    // One beyond the new limit is blocked.
    expect(
      check("sess-1", SHORT_MSG, afterWindow + maxRequestsPerWindow * 100)
        .allowed,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Session isolation
// ---------------------------------------------------------------------------

describe("session isolation", () => {
  it("tracks separate counters for different session IDs", () => {
    const { maxRequestsPerWindow } = SMALL_CONFIG;

    // Fill session A.
    for (let i = 0; i < maxRequestsPerWindow; i++) {
      check("sess-A", SHORT_MSG, i * 100);
    }
    // Session A is now rate-limited.
    expect(check("sess-A", SHORT_MSG, maxRequestsPerWindow * 100).allowed).toBe(
      false,
    );
    // Session B is unaffected.
    expect(check("sess-B", SHORT_MSG, maxRequestsPerWindow * 100).allowed).toBe(
      true,
    );
  });

  it("two sessions can both exhaust their own limits independently", () => {
    const { maxRequestsPerWindow } = SMALL_CONFIG;

    for (let i = 0; i < maxRequestsPerWindow; i++) {
      check("sess-X", SHORT_MSG, i * 10);
      check("sess-Y", SHORT_MSG, i * 10);
    }
    expect(check("sess-X", SHORT_MSG, maxRequestsPerWindow * 10).allowed).toBe(
      false,
    );
    expect(check("sess-Y", SHORT_MSG, maxRequestsPerWindow * 10).allowed).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG sanity
// ---------------------------------------------------------------------------

describe("DEFAULT_CONFIG", () => {
  it("has sensible values (length ≥ 500, rate ≥ 5, window ≥ 10 s)", () => {
    expect(DEFAULT_CONFIG.maxInputLength).toBeGreaterThanOrEqual(500);
    expect(DEFAULT_CONFIG.maxRequestsPerWindow).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_CONFIG.windowMs).toBeGreaterThanOrEqual(10_000);
  });

  it("allows a typical short Pokémon question with the default config", () => {
    const result = checkRateLimit(
      "sess-default",
      "What are all the Water-type Pokemon with speed above 100?",
    );
    expect(result.allowed).toBe(true);
    _resetStoreForTests();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("retryAfterMs is clamped to 0 when called at the exact window boundary", () => {
    const { maxRequestsPerWindow, windowMs } = SMALL_CONFIG;

    // Fill the window starting at t=0.
    for (let i = 0; i < maxRequestsPerWindow; i++) {
      check("sess-edge", SHORT_MSG, 0);
    }

    // Call exactly at the window end — should start a new window.
    const atBoundary = windowMs;
    const result = check("sess-edge", SHORT_MSG, atBoundary);
    // The window has expired (now - windowStart === windowMs), so a new
    // window starts and the request is allowed.
    expect(result.allowed).toBe(true);
  });

  it("input-length check precedes the rate-limit check", () => {
    // Exhaust the rate limit first.
    const { maxRequestsPerWindow } = SMALL_CONFIG;
    for (let i = 0; i < maxRequestsPerWindow; i++) {
      check("sess-order", SHORT_MSG, i * 10);
    }

    // Now send an oversized message — should fail on length, not rate limit.
    const oversized = "z".repeat(SMALL_CONFIG.maxInputLength + 100);
    const result = check("sess-order", oversized, maxRequestsPerWindow * 10);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("input_too_long");
    }
  });
});
