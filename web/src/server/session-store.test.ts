/**
 * Unit tests for src/server/session-store.ts (DS-5, D9) — MEMORY BACKEND.
 *
 * `REDIS_URL` is left unset throughout this file (the default for every suite
 * except the opt-in `session-store.redis.test.ts`), so every seam call below
 * exercises the in-process BoundedStore path. The public API is async
 * (uniform across backends), so every seam call is awaited even though the
 * memory backend itself does no I/O.
 *
 * Covers: getHistory, appendTurn, estimateTokens, trim, clearSession,
 * activeSessionCount, getSessionScope/setSessionScope. No external I/O — pure
 * in-memory Map.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORY_TOKEN_BUDGET,
  SESSION_MAX_ENTRIES,
  SESSION_TTL_MS,
  _resetStoreForTests,
  activeSessionCount,
  appendTurn,
  clearSession,
  estimateTokens,
  getHistory,
  getSessionScope,
  setSessionScope,
  trim,
  trimMessages,
} from "@/server/session-store";
import type { ChatMessage } from "@/agent/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_A = "test-session-alpha";
const SESSION_B = "test-session-beta";

function msg(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content };
}

// ---------------------------------------------------------------------------
// Fixtures — clean up only the sessions this file creates so tests are
// independent without coupling to implementation internals.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await clearSession(SESSION_A);
  await clearSession(SESSION_B);
});

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

describe("getHistory", () => {
  it("returns an empty array for an unknown session id", async () => {
    expect(await getHistory("does-not-exist-" + Math.random())).toEqual([]);
  });

  it("returns [] for a session that was created then cleared", async () => {
    await appendTurn(SESSION_A, msg("user", "hi"));
    await clearSession(SESSION_A);
    expect(await getHistory(SESSION_A)).toEqual([]);
  });

  it("returns the accumulated turns in insertion order", async () => {
    await appendTurn(SESSION_A, msg("user", "Hello"));
    await appendTurn(SESSION_A, msg("assistant", "Hi there!"));
    expect(await getHistory(SESSION_A)).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]);
  });

  it("reflects subsequent appends without needing to call getHistory again", async () => {
    await appendTurn(SESSION_A, msg("user", "ping"));
    const snapshot = await getHistory(SESSION_A);
    await appendTurn(SESSION_A, msg("assistant", "pong"));
    // The memory backend's internals are unchanged (still the live internal
    // array) — new turns pushed onto it remain visible on an earlier read.
    expect(snapshot).toHaveLength(2);
    expect(snapshot[1]).toEqual({ role: "assistant", content: "pong" });
  });
});

// ---------------------------------------------------------------------------
// appendTurn
// ---------------------------------------------------------------------------

describe("appendTurn", () => {
  it("creates the session entry on the first call", async () => {
    expect(await getHistory(SESSION_A)).toEqual([]);
    await appendTurn(SESSION_A, msg("user", "first turn"));
    expect(await getHistory(SESSION_A)).toHaveLength(1);
  });

  it("preserves insertion order across many turns", async () => {
    const turns: ChatMessage[] = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("assistant", "d"),
    ];
    for (const t of turns) await appendTurn(SESSION_A, t);
    expect(await getHistory(SESSION_A)).toEqual(turns);
  });

  it("sessions are fully isolated from each other", async () => {
    await appendTurn(SESSION_A, msg("user", "from A"));
    await appendTurn(SESSION_B, msg("user", "from B"));

    expect(await getHistory(SESSION_A)).toHaveLength(1);
    expect(await getHistory(SESSION_B)).toHaveLength(1);
    expect((await getHistory(SESSION_A))[0].content).toBe("from A");
    expect((await getHistory(SESSION_B))[0].content).toBe("from B");
  });

  it("appending to one session does not affect another", async () => {
    await appendTurn(SESSION_A, msg("user", "turn 1"));
    await appendTurn(SESSION_B, msg("user", "turn 1"));
    await appendTurn(SESSION_A, msg("assistant", "turn 2"));

    expect(await getHistory(SESSION_A)).toHaveLength(2);
    expect(await getHistory(SESSION_B)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// estimateTokens (pure, sync — unchanged)
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("returns 0 for an empty array", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("returns a positive value for non-empty messages", () => {
    expect(estimateTokens([msg("user", "hello")])).toBeGreaterThan(0);
  });

  it("larger content produces a higher estimate", () => {
    const short = [msg("user", "x")];
    const long = [msg("user", "x".repeat(400))];
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });

  it("sums across all messages, not just the first", () => {
    const single = [msg("user", "hello world")];
    const doubled = [
      msg("user", "hello world"),
      msg("assistant", "hello world"),
    ];
    expect(estimateTokens(doubled)).toBeGreaterThan(estimateTokens(single));
  });

  it("includes the role string in the character count", () => {
    // "user" (4 chars) vs "assistant" (9 chars) with identical content.
    const userMsg = [msg("user", "test")]; // 4 + 4 = 8 chars
    const assistantMsg = [msg("assistant", "test")]; // 4 + 9 = 13 chars
    expect(estimateTokens(assistantMsg)).toBeGreaterThanOrEqual(
      estimateTokens(userMsg),
    );
  });

  it("matches the manual calculation: ceil((content + role) / 4)", () => {
    // "user" = 4 chars, "Hi" = 2 chars → 6 total → ceil(6/4) = 2 tokens
    expect(estimateTokens([msg("user", "Hi")])).toBe(2);
    // "assistant" = 9 chars, "pong" = 4 chars → 13 → ceil(13/4) = 4 tokens
    expect(estimateTokens([msg("assistant", "pong")])).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// trim
// ---------------------------------------------------------------------------

describe("trim", () => {
  it("is a no-op for a non-existent session (does not reject)", async () => {
    await expect(
      trim("no-such-session-" + Math.random(), 100),
    ).resolves.toBeUndefined();
  });

  it("is a no-op for an empty session", async () => {
    // clearSession has deleted SESSION_A; append nothing; trim should not reject.
    await expect(trim(SESSION_A, 10)).resolves.toBeUndefined();
  });

  it("is a no-op when history is already within budget", async () => {
    await appendTurn(SESSION_A, msg("user", "short"));
    await appendTurn(SESSION_A, msg("assistant", "reply"));
    const lengthBefore = (await getHistory(SESSION_A)).length;

    await trim(SESSION_A, DEFAULT_HISTORY_TOKEN_BUDGET);

    expect(await getHistory(SESSION_A)).toHaveLength(lengthBefore);
  });

  it("removes oldest turns until estimateTokens is within budget", async () => {
    // 10 large messages (5 user + 5 assistant), each ~400 chars ≈ 100+ tokens.
    for (let i = 0; i < 5; i++) {
      await appendTurn(SESSION_A, msg("user", "x".repeat(400)));
      await appendTurn(SESSION_A, msg("assistant", "y".repeat(400)));
    }
    expect(await getHistory(SESSION_A)).toHaveLength(10);

    // Budget = 200 tokens → forces removal; each message is ~100+ tokens.
    await trim(SESSION_A, 200);

    const after = await getHistory(SESSION_A);
    expect(estimateTokens(after)).toBeLessThanOrEqual(200);
    // At least some messages were removed.
    expect(after.length).toBeLessThan(10);
  });

  it("removes from the front (oldest), preserving the most recent turns", async () => {
    await appendTurn(SESSION_A, msg("user", "first"));
    await appendTurn(SESSION_A, msg("assistant", "second"));
    await appendTurn(SESSION_A, msg("user", "third"));
    await appendTurn(SESSION_A, msg("assistant", "fourth"));

    // Budget of 5 tokens:
    // "fourth" + "assistant" = 6 + 9 = 15 chars → ceil(15/4) = 4 tokens ≤ 5 → survives.
    // Earlier messages will be evicted to get the total ≤ 5.
    await trim(SESSION_A, 5);

    const contents = (await getHistory(SESSION_A)).map((m) => m.content);
    expect(contents).toContain("fourth"); // most recent survives
    expect(contents).not.toContain("first"); // oldest is gone
  });

  it("removes all messages if even a single message exceeds the budget", async () => {
    // One very large message that alone exceeds the budget.
    await appendTurn(SESSION_A, msg("user", "x".repeat(1000))); // ~251 tokens
    await trim(SESSION_A, 10); // budget far below a single message

    expect(await getHistory(SESSION_A)).toEqual([]);
    // estimateTokens of [] is 0 ≤ 10.
    expect(estimateTokens(await getHistory(SESSION_A))).toBeLessThanOrEqual(10);
  });

  it("uses DEFAULT_HISTORY_TOKEN_BUDGET when called without a budget argument", async () => {
    await appendTurn(SESSION_A, msg("user", "a small message"));
    await appendTurn(SESSION_A, msg("assistant", "a small reply"));
    await expect(trim(SESSION_A)).resolves.toBeUndefined();
    // Short messages are well within the default budget — nothing trimmed.
    expect(await getHistory(SESSION_A)).toHaveLength(2);
  });

  it("does not affect other sessions when trimming one session", async () => {
    for (let i = 0; i < 5; i++) {
      await appendTurn(SESSION_A, msg("user", "x".repeat(400)));
      await appendTurn(SESSION_A, msg("assistant", "y".repeat(400)));
    }
    await appendTurn(SESSION_B, msg("user", "untouched"));

    await trim(SESSION_A, 200);

    expect(await getHistory(SESSION_B)).toHaveLength(1);
    expect((await getHistory(SESSION_B))[0].content).toBe("untouched");
  });
});

// ---------------------------------------------------------------------------
// trimMessages (pure — shared by both guest backends and the signed-in DB
// path; trim() delegates to it)
// ---------------------------------------------------------------------------

describe("trimMessages", () => {
  it("returns an empty array unchanged", () => {
    expect(trimMessages([])).toEqual([]);
  });

  it("returns all messages when already within budget", () => {
    const messages = [msg("user", "short"), msg("assistant", "reply")];
    expect(trimMessages(messages, DEFAULT_HISTORY_TOKEN_BUDGET)).toEqual(
      messages,
    );
  });

  it("does NOT mutate the input array", () => {
    const messages = [
      msg("user", "x".repeat(400)),
      msg("assistant", "y".repeat(400)),
    ];
    const copy = [...messages];
    trimMessages(messages, 5); // would drop everything
    expect(messages).toEqual(copy); // input untouched
  });

  it("drops oldest first until within budget, preserving the most recent", () => {
    const messages = [
      msg("user", "first"),
      msg("assistant", "second"),
      msg("user", "third"),
      msg("assistant", "fourth"),
    ];
    const kept = trimMessages(messages, 5);
    const contents = kept.map((m) => m.content);
    expect(contents).toContain("fourth");
    expect(contents).not.toContain("first");
    expect(estimateTokens(kept)).toBeLessThanOrEqual(5);
  });

  it("returns [] when a single message exceeds the budget", () => {
    expect(trimMessages([msg("user", "x".repeat(1000))], 10)).toEqual([]);
  });

  it("uses DEFAULT_HISTORY_TOKEN_BUDGET when no budget is given", () => {
    const messages = [msg("user", "a small message")];
    expect(trimMessages(messages)).toEqual(messages);
  });

  it("matches what trim() applies to the live store (parity)", async () => {
    const built: ChatMessage[] = [];
    for (let i = 0; i < 5; i++) {
      const u = msg("user", "x".repeat(400));
      const a = msg("assistant", "y".repeat(400));
      built.push(u, a);
      await appendTurn(SESSION_A, u);
      await appendTurn(SESSION_A, a);
    }
    const expected = trimMessages(built, 200);
    await trim(SESSION_A, 200);
    expect(await getHistory(SESSION_A)).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// clearSession
// ---------------------------------------------------------------------------

describe("clearSession", () => {
  it("removes all history for the cleared session", async () => {
    await appendTurn(SESSION_A, msg("user", "to be removed"));
    await appendTurn(SESSION_A, msg("assistant", "also removed"));
    await clearSession(SESSION_A);
    expect(await getHistory(SESSION_A)).toEqual([]);
  });

  it("does not reject when clearing a session that does not exist", async () => {
    await expect(
      clearSession("nonexistent-session-xyz"),
    ).resolves.toBeUndefined();
  });

  it("does not affect other sessions", async () => {
    await appendTurn(SESSION_A, msg("user", "stay A"));
    await appendTurn(SESSION_B, msg("user", "stay B"));
    await clearSession(SESSION_A);

    expect(await getHistory(SESSION_A)).toEqual([]);
    expect(await getHistory(SESSION_B)).toHaveLength(1);
    expect((await getHistory(SESSION_B))[0].content).toBe("stay B");
  });

  it("allows new turns to be appended after clearing", async () => {
    await appendTurn(SESSION_A, msg("user", "old turn"));
    await clearSession(SESSION_A);
    await appendTurn(SESSION_A, msg("user", "fresh start"));

    expect(await getHistory(SESSION_A)).toEqual([
      { role: "user", content: "fresh start" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// activeSessionCount
// ---------------------------------------------------------------------------

describe("activeSessionCount", () => {
  it("increases when a new session is created via appendTurn", async () => {
    const before = await activeSessionCount();
    await appendTurn(SESSION_A, msg("user", "hello"));
    expect(await activeSessionCount()).toBe(before + 1);
  });

  it("decreases when a session is cleared", async () => {
    await appendTurn(SESSION_A, msg("user", "hello"));
    const after = await activeSessionCount();
    await clearSession(SESSION_A);
    expect(await activeSessionCount()).toBe(after - 1);
  });

  it("is not changed by trim (trim doesn't delete the session entry)", async () => {
    await appendTurn(SESSION_A, msg("user", "x".repeat(1000)));
    const before = await activeSessionCount();
    await trim(SESSION_A, 10); // trims all messages but keeps the session key
    // The store entry still exists (empty array), so count is unchanged.
    expect(await activeSessionCount()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Bounded store: LRU cap + idle TTL (assessment C1). These operate on the
// GLOBAL store, so fully reset it around each case (unlike the per-id cleanup
// the other suites use) to get a known baseline.
// ---------------------------------------------------------------------------

describe("bounded store (C1)", () => {
  beforeEach(async () => {
    await _resetStoreForTests();
  });
  afterEach(async () => {
    await _resetStoreForTests();
  });

  it("caps resident sessions at SESSION_MAX_ENTRIES and evicts the least-recently-used", async () => {
    const overflow = 50;
    // Increasing `now` keeps LRU order deterministic; all within one TTL so the
    // cap (not the TTL) is the evictor.
    for (let i = 0; i < SESSION_MAX_ENTRIES + overflow; i++) {
      await appendTurn(`s${i}`, msg("user", `turn ${i}`), i + 1);
    }

    expect(await activeSessionCount()).toBe(SESSION_MAX_ENTRIES);
    // The oldest (never re-touched) sessions were evicted...
    expect(await getHistory("s0", SESSION_MAX_ENTRIES + overflow + 1)).toEqual([]);
    expect(
      await getHistory(`s${overflow - 1}`, SESSION_MAX_ENTRIES + overflow + 1),
    ).toEqual([]);
    // ...and the most recent survive.
    const newest = `s${SESSION_MAX_ENTRIES + overflow - 1}`;
    expect(
      await getHistory(newest, SESSION_MAX_ENTRIES + overflow + 1),
    ).toHaveLength(1);
  });

  it("expires a session after SESSION_TTL_MS of inactivity", async () => {
    await appendTurn(SESSION_A, msg("user", "hi"), 0);
    // Exactly TTL elapsed → expired (>= semantics).
    expect(await getHistory(SESSION_A, SESSION_TTL_MS)).toEqual([]);
    expect(await activeSessionCount()).toBe(0);
  });

  it("keeps a session just under the idle TTL", async () => {
    await appendTurn(SESSION_A, msg("user", "hi"), 0);
    expect(await getHistory(SESSION_A, SESSION_TTL_MS - 1)).toHaveLength(1);
  });

  it("a read refreshes the idle timer (active conversation stays resident)", async () => {
    await appendTurn(SESSION_A, msg("user", "hi"), 0);
    // Read just before expiry refreshes lastAccess...
    expect(await getHistory(SESSION_A, SESSION_TTL_MS - 1)).toHaveLength(1);
    // ...so a read one tick later (well within a fresh TTL window) still hits.
    expect(await getHistory(SESSION_A, SESSION_TTL_MS)).toHaveLength(1);
  });

  it("an actively-touched session survives cap eviction while an idle one is evicted", async () => {
    const HOT = "hot-session";
    await appendTurn(HOT, msg("user", "keep me"), 0);
    // Fill exactly to the cap with fresh sessions, touching HOT right before each
    // new session so it never becomes the least-recently-used.
    for (let i = 1; i <= SESSION_MAX_ENTRIES; i++) {
      await getHistory(HOT, i * 2 - 1); // refresh HOT
      await appendTurn(`s${i}`, msg("user", `turn ${i}`), i * 2); // new session → 1 over cap
    }

    // HOT survived; the oldest never-re-touched session (s1) was evicted.
    expect(await getHistory(HOT, SESSION_MAX_ENTRIES * 2 + 1)).toHaveLength(1);
    expect(await getHistory("s1", SESSION_MAX_ENTRIES * 2 + 1)).toEqual([]);
    expect(await activeSessionCount()).toBe(SESSION_MAX_ENTRIES);
  });

  it("preserves the live history array reference across reordering (memory backend)", async () => {
    await appendTurn(SESSION_A, msg("user", "one"), 1);
    const live = await getHistory(SESSION_A, 2); // capture the live array
    await appendTurn(SESSION_B, msg("user", "other"), 3); // touch another session (reorders)
    await appendTurn(SESSION_A, msg("assistant", "two"), 4); // get reorders A, then pushes

    // Same underlying array reference; the new turn is visible on the captured one.
    expect(await getHistory(SESSION_A, 5)).toBe(live);
    expect(live).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Guest scope stickiness (GS-B / GS-D3). Uses the GLOBAL scope store, so fully
// reset it around each case to get a known baseline (like the bounded-store
// suite above).
// ---------------------------------------------------------------------------

describe("getSessionScope / setSessionScope", () => {
  beforeEach(async () => {
    await _resetStoreForTests();
  });
  afterEach(async () => {
    await _resetStoreForTests();
  });

  it("returns undefined for a session with no stored scope", async () => {
    expect(await getSessionScope(SESSION_A)).toBeUndefined();
  });

  it("round-trips a set scope back out of get", async () => {
    await setSessionScope(SESSION_A, "gen-7");
    expect(await getSessionScope(SESSION_A)).toBe("gen-7");
  });

  it("overwrites (switches) the sticky scope on a later set", async () => {
    await setSessionScope(SESSION_A, "gen-7");
    await setSessionScope(SESSION_A, "scarlet-violet");
    expect(await getSessionScope(SESSION_A)).toBe("scarlet-violet");
  });

  it("keeps each session's scope isolated from the others", async () => {
    await setSessionScope(SESSION_A, "gen-7");
    await setSessionScope(SESSION_B, "champions");

    expect(await getSessionScope(SESSION_A)).toBe("gen-7");
    expect(await getSessionScope(SESSION_B)).toBe("champions");
  });

  it("expires a stored scope after SESSION_TTL_MS of inactivity", async () => {
    await setSessionScope(SESSION_A, "gen-8", 0);
    // Exactly TTL elapsed → expired (>= semantics), same as the history store.
    expect(await getSessionScope(SESSION_A, SESSION_TTL_MS)).toBeUndefined();
  });

  it("keeps a stored scope just under the idle TTL", async () => {
    await setSessionScope(SESSION_A, "gen-8", 0);
    expect(await getSessionScope(SESSION_A, SESSION_TTL_MS - 1)).toBe("gen-8");
  });

  it("_resetStoreForTests clears stored scopes", async () => {
    await setSessionScope(SESSION_A, "gen-6");
    await _resetStoreForTests();
    expect(await getSessionScope(SESSION_A)).toBeUndefined();
  });

  it("is stored separately from message history (clearing history keeps scope)", async () => {
    await setSessionScope(SESSION_A, "gen-5");
    await appendTurn(SESSION_A, msg("user", "hi"));
    await clearSession(SESSION_A);

    // clearSession wipes the message history only; the sticky scope survives.
    expect(await getHistory(SESSION_A)).toEqual([]);
    expect(await getSessionScope(SESSION_A)).toBe("gen-5");
  });
});
