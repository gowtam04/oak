/**
 * Turn store — REDIS terminal-snapshot mirror suite
 * (background-turns/design.md §5.1, fail-soft SHOULD). Every other turn-store
 * suite runs with `REDIS_URL` unset (memory backend, no mirror); this file opts
 * into the Redis backend per test via `vi.stubEnv` + `_resetClientForTests`,
 * mirroring `src/server/session-store.redis.test.ts`.
 *
 * Proves: (a) a terminal transition writes the snapshot to `oak:turn:<id>`, and
 * (b) `getTurnSnapshot` falls back to that mirror after the in-process registry
 * has dropped the turn (the process-restart recovery path for the snapshot
 * endpoint — NOT the resume stream).
 */

import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";
import { _resetClientForTests, getRedisClient } from "@/server/redis";
import {
  _resetStoreForTests,
  getTurnSnapshot,
  publish,
  startTurn,
  type TurnRecord,
  type TurnSnapshot,
} from "@/server/turn-store";

const TURN_KEY = (id: string): string => `oak:turn:${id}`;

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "done",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

function start(sessionId: string, accountId: string | null): TurnRecord {
  const res = startTurn({
    sessionId,
    accountId,
    ownerKey: accountId ? `acct:${accountId}` : "ip:x",
  });
  if ("conflict" in res) throw new Error(`unexpected conflict: ${res.conflict}`);
  return res;
}

/** Spin until `cond()` holds (the mirror write is fire-and-forget). */
async function until(cond: () => Promise<boolean>, ticks = 100): Promise<void> {
  for (let i = 0; i < ticks && !(await cond()); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

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

describe("terminal snapshot mirror", () => {
  it("writes the terminal snapshot to Redis on a complete transition", async () => {
    const turn = start("c1", "acct-1");
    publish(turn, { event: "answer", data: { answer: ANSWER } });

    const client = getRedisClient()!;
    await until(async () => (await client.get(TURN_KEY(turn.turnId))) !== null);

    const raw = await client.get(TURN_KEY(turn.turnId));
    expect(raw).not.toBeNull();
    const snap = JSON.parse(raw!) as TurnSnapshot;
    expect(snap).toMatchObject({
      turnId: turn.turnId,
      status: "complete",
      sessionId: "c1",
      accountId: "acct-1",
    });
    expect(snap.answer).toEqual(ANSWER);
  });

  it("getTurnSnapshot falls back to the Redis mirror when the registry has dropped the turn", async () => {
    // Simulate a turn that finished before a restart: only the Redis mirror
    // survives; the in-process registry has no record of it.
    const client = getRedisClient()!;
    const orphan: TurnSnapshot = {
      turnId: "orphan-1",
      status: "complete",
      answer: ANSWER,
      error: null,
      sessionId: "c9",
      accountId: null,
    };
    await client.set(TURN_KEY("orphan-1"), JSON.stringify(orphan), "PX", 60_000);

    const snap = await getTurnSnapshot("orphan-1");
    expect(snap).toEqual(orphan);
  });

  it("prefers the live registry over the Redis mirror", async () => {
    const turn = start("c1", null);
    // Running turn is in the registry but not (yet) mirrored.
    const snap = await getTurnSnapshot(turn.turnId);
    expect(snap?.status).toBe("running");
  });

  it("returns null for a turn absent from both registry and Redis", async () => {
    expect(await getTurnSnapshot("nope")).toBeNull();
  });
});
