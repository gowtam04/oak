/**
 * src/server/redis.test.ts — the redis-backed foundation suite.
 *
 * Runs against the shared Testcontainers Redis instance published by
 * test/support/redis-global-setup.ts as REDIS_CONN_URI. By default no test in
 * the repo talks to Redis (REDIS_URL is left unset), so this suite explicitly
 * opts in per test via `vi.stubEnv` + `_resetClientForTests` — the pattern
 * later redis-backend suites (session-store/rate-limit/otp-throttle) reuse.
 */

import { afterEach, describe, expect, it, inject, vi } from "vitest";

import {
  _resetClientForTests,
  deletePrefix,
  getRedisClient,
} from "@/server/redis";

// `REDIS_CONN_URI`'s ProvidedContext augmentation lives in
// test/support/redis-global-setup.ts (a support module, not this test file —
// see that file's header for why).

afterEach(async () => {
  vi.unstubAllEnvs();
  await _resetClientForTests();
});

describe("getRedisClient", () => {
  it("returns null when REDIS_URL is unset", () => {
    expect(getRedisClient()).toBeNull();
  });

  it("connects to the real Redis container when REDIS_URL is set", async () => {
    await _resetClientForTests();
    vi.stubEnv("REDIS_URL", inject("REDIS_CONN_URI"));

    const client = getRedisClient();
    expect(client).not.toBeNull();
    const pong = await client!.ping();
    expect(pong).toBe("PONG");
  });
});

describe("deletePrefix", () => {
  it("deletes only the keys under the given prefix", async () => {
    await _resetClientForTests();
    vi.stubEnv("REDIS_URL", inject("REDIS_CONN_URI"));

    const client = getRedisClient()!;
    await client.set("oak:test:a", "1");
    await client.set("oak:test:b", "2");
    await client.set("other:c", "3");

    try {
      await deletePrefix(client, "oak:test:");

      expect(await client.get("oak:test:a")).toBeNull();
      expect(await client.get("oak:test:b")).toBeNull();
      expect(await client.get("other:c")).toBe("3");
    } finally {
      await client.del("other:c");
    }
  });
});
