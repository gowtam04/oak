/**
 * src/server/session-store.redis.test.ts — the REDIS backend suite.
 *
 * Every other session-store suite runs with `REDIS_URL` unset (the memory
 * backend); this file explicitly opts into the Redis backend per test via
 * `vi.stubEnv` + `_resetClientForTests`, mirroring `src/server/redis.test.ts`.
 * It proves the Redis data model (list history + string scope, sliding TTLs,
 * corrupt-entry skipping, and clearSession/scope independence) that the
 * memory-backend suite (`session-store.test.ts`) can't exercise.
 */

import { afterEach, beforeEach, describe, expect, it, inject, vi } from "vitest";

import { _resetClientForTests, getRedisClient, SESS_PREFIX } from "@/server/redis";
import {
  SESSION_TTL_MS,
  _resetStoreForTests,
  appendTurn,
  clearSession,
  getHistory,
  getSessionScope,
  setSessionScope,
  trim,
} from "@/server/session-store";
import type { ChatMessage } from "@/agent/types";

function msg(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content };
}

function histKey(sessionId: string): string {
  return `${SESS_PREFIX}hist:${sessionId}`;
}

function scopeKey(sessionId: string): string {
  return `${SESS_PREFIX}scope:${sessionId}`;
}

beforeEach(async () => {
  await _resetClientForTests();
  vi.stubEnv("REDIS_URL", inject("REDIS_CONN_URI"));
  await _resetStoreForTests();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await _resetClientForTests();
});

// ---------------------------------------------------------------------------
// (a) appendTurn → getHistory round-trip
// ---------------------------------------------------------------------------

describe("appendTurn / getHistory (redis)", () => {
  it("round-trips appended turns preserving order and content", async () => {
    const sid = "redis-session-a";
    await appendTurn(sid, msg("user", "Hello"));
    await appendTurn(sid, msg("assistant", "Hi there!"));
    await appendTurn(sid, msg("user", "How are you?"));

    expect(await getHistory(sid)).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "How are you?" },
    ]);
  });

  // (b)
  it("returns [] for an unknown session id", async () => {
    expect(await getHistory("redis-session-does-not-exist")).toEqual([]);
  });

  // (g)
  it("skips a corrupt JSON element and still returns the valid ones", async () => {
    const sid = "redis-session-corrupt";
    const client = getRedisClient()!;
    await appendTurn(sid, msg("user", "before"));
    await client.rpush(histKey(sid), "{not valid json"); // raw corrupt entry
    await appendTurn(sid, msg("assistant", "after"));

    expect(await getHistory(sid)).toEqual([
      { role: "user", content: "before" },
      { role: "assistant", content: "after" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// (c) trim
// ---------------------------------------------------------------------------

describe("trim (redis)", () => {
  it("drops the oldest messages beyond a small budget, keeping the tail", async () => {
    const sid = "redis-session-trim";
    // Each message is built to a known char length so the CHARS_PER_TOKEN=4
    // estimate is predictable: "user"/"assistant" role length + content length.
    for (let i = 0; i < 5; i++) {
      await appendTurn(sid, msg("user", "x".repeat(400)));
      await appendTurn(sid, msg("assistant", "y".repeat(400)));
    }
    expect(await getHistory(sid)).toHaveLength(10);

    // Budget of 200 tokens (~800 chars) forces the oldest turns out; each
    // message here is ~102 tokens ((400+4)/4 or (400+9)/4 rounded up).
    await trim(sid, 200);

    const after = await getHistory(sid);
    expect(after.length).toBeLessThan(10);
    // The most recent turn survives.
    expect(after[after.length - 1]).toEqual({
      role: "assistant",
      content: "y".repeat(400),
    });
  });

  it("is a no-op when already within budget", async () => {
    const sid = "redis-session-trim-noop";
    await appendTurn(sid, msg("user", "short"));
    await appendTurn(sid, msg("assistant", "reply"));

    await trim(sid, 100_000);

    expect(await getHistory(sid)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// (d) scope set/get
// ---------------------------------------------------------------------------

describe("getSessionScope / setSessionScope (redis)", () => {
  it("round-trips a set scope back out of get", async () => {
    const sid = "redis-session-scope";
    await setSessionScope(sid, "gen-7");
    expect(await getSessionScope(sid)).toBe("gen-7");
  });

  it("returns undefined for an unknown session", async () => {
    expect(await getSessionScope("redis-session-no-scope")).toBeUndefined();
  });

  it("returns undefined for an invalid stored value", async () => {
    const sid = "redis-session-bad-scope";
    const client = getRedisClient()!;
    await client.set(scopeKey(sid), "not-a-real-format");

    expect(await getSessionScope(sid)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (e) clearSession removes history but NOT scope
// ---------------------------------------------------------------------------

describe("clearSession (redis)", () => {
  it("removes history but leaves the sticky scope intact", async () => {
    const sid = "redis-session-clear";
    await appendTurn(sid, msg("user", "hi"));
    await setSessionScope(sid, "champions");

    await clearSession(sid);

    expect(await getHistory(sid)).toEqual([]);
    expect(await getSessionScope(sid)).toBe("champions");
  });
});

// ---------------------------------------------------------------------------
// (f) TTL is set on write and refreshed on read
// ---------------------------------------------------------------------------

describe("TTL behavior (redis)", () => {
  it("sets a TTL on append and refreshes it on a later read", async () => {
    const sid = "redis-session-ttl";
    const client = getRedisClient()!;

    await appendTurn(sid, msg("user", "hi"));
    const key = histKey(sid);
    const firstTtl = await client.pttl(key);
    expect(firstTtl).toBeGreaterThan(0);
    expect(firstTtl).toBeLessThanOrEqual(SESSION_TTL_MS);

    // Artificially shrink the TTL, then prove a read bumps it back up.
    await client.pexpire(key, 1_000);
    const shrunkTtl = await client.pttl(key);
    expect(shrunkTtl).toBeLessThanOrEqual(1_000);

    await getHistory(sid);
    const refreshedTtl = await client.pttl(key);
    expect(refreshedTtl).toBeGreaterThan(shrunkTtl);
  });
});

// ---------------------------------------------------------------------------
// (h) _resetStoreForTests wipes oak:sess:* keys
// ---------------------------------------------------------------------------

describe("_resetStoreForTests (redis)", () => {
  it("wipes every oak:sess:* key", async () => {
    const sid = "redis-session-reset";
    await appendTurn(sid, msg("user", "hi"));
    await setSessionScope(sid, "gen-6");

    await _resetStoreForTests();

    expect(await getHistory(sid)).toEqual([]);
    expect(await getSessionScope(sid)).toBeUndefined();
  });
});
