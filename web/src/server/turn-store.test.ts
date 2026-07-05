/**
 * Turn store unit suite (background-turns/design.md §5.1 / §7) — the in-process
 * registry semantics, on the MEMORY backend (`REDIS_URL` unset). Covers the
 * concurrency caps (BT-5), subscribe replay-then-tail (no gap/dup), terminal
 * fan-out + subscriber clearing, stop semantics (BT-4), the retention sweep, and
 * the defensive buffer-bound collapse. The Redis terminal-snapshot mirror is
 * exercised separately in `turn-store.redis.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { OakAnswer } from "@/agent/schemas";
import type { BufferedEvent, TurnRecord } from "@/server/turn-store";
import {
  MAX_BUFFER_BYTES,
  MAX_GLOBAL_TURNS,
  MAX_TURNS_PER_OWNER,
  TURN_RETENTION_MS,
  _resetStoreForTests,
  findRunningByConversation,
  findRunningBySession,
  getTurn,
  publish,
  startTurn,
  stopTurn,
  subscribe,
} from "@/server/turn-store";

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

/** Start a turn and assert it registered (not a cap conflict). */
function start(meta: {
  sessionId: string;
  accountId: string | null;
  ownerKey: string;
}): TurnRecord {
  const res = startTurn(meta);
  if ("conflict" in res) {
    throw new Error(`expected a TurnRecord, got conflict: ${res.conflict}`);
  }
  return res;
}

const activity: BufferedEvent = {
  event: "tool_activity",
  data: { tool: "get_move", label: "…" },
};

beforeEach(async () => {
  await _resetStoreForTests();
});

afterEach(async () => {
  await _resetStoreForTests();
});

// ---------------------------------------------------------------------------
// Concurrency caps (BT-5)
// ---------------------------------------------------------------------------

describe("startTurn — concurrency caps", () => {
  it("allows one running turn per conversation and returns the existing id on a clash", () => {
    const first = start({ sessionId: "c1", accountId: "a", ownerKey: "acct:a" });
    const clash = startTurn({ sessionId: "c1", accountId: "a", ownerKey: "acct:a" });
    expect(clash).toEqual({ conflict: "conversation", turnId: first.turnId });
  });

  it("allows a new turn on the same conversation once the prior one is terminal", () => {
    const first = start({ sessionId: "c1", accountId: "a", ownerKey: "acct:a" });
    publish(first, { event: "answer", data: { answer: ANSWER } });
    // Terminal turn no longer blocks — a fresh turn registers.
    const second = start({ sessionId: "c1", accountId: "a", ownerKey: "acct:a" });
    expect(second.turnId).not.toBe(first.turnId);
  });

  it("caps running turns per owner (different conversations, same owner)", () => {
    for (let i = 0; i < MAX_TURNS_PER_OWNER; i++) {
      start({ sessionId: `c${i}`, accountId: "a", ownerKey: "acct:a" });
    }
    const overflow = startTurn({
      sessionId: "c-extra",
      accountId: "a",
      ownerKey: "acct:a",
    });
    expect(overflow).toEqual({ conflict: "owner" });
  });

  it("does not count a DIFFERENT owner toward the per-owner cap", () => {
    for (let i = 0; i < MAX_TURNS_PER_OWNER; i++) {
      start({ sessionId: `a${i}`, accountId: "a", ownerKey: "acct:a" });
    }
    // A different owner still gets a fresh turn.
    const other = start({ sessionId: "b0", accountId: "b", ownerKey: "acct:b" });
    expect(other.status).toBe("running");
  });

  it("hits the global cap once MAX_GLOBAL_TURNS are running", () => {
    // Unique owner + conversation per turn so only the GLOBAL cap can fire.
    for (let i = 0; i < MAX_GLOBAL_TURNS; i++) {
      start({ sessionId: `g${i}`, accountId: `g${i}`, ownerKey: `acct:g${i}` });
    }
    const overflow = startTurn({
      sessionId: "g-extra",
      accountId: "g-extra",
      ownerKey: "acct:g-extra",
    });
    expect(overflow).toEqual({ conflict: "global" });
  });
});

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

describe("lookups", () => {
  it("finds a running turn by session and by conversation+account", () => {
    const turn = start({ sessionId: "c1", accountId: "a", ownerKey: "acct:a" });
    expect(findRunningBySession("c1")?.turnId).toBe(turn.turnId);
    expect(findRunningByConversation("a", "c1")?.turnId).toBe(turn.turnId);
    // Wrong account → not found.
    expect(findRunningByConversation("other", "c1")).toBeUndefined();
  });

  it("stops matching once the turn is terminal", () => {
    const turn = start({ sessionId: "c1", accountId: "a", ownerKey: "acct:a" });
    publish(turn, { event: "answer", data: { answer: ANSWER } });
    expect(findRunningBySession("c1")).toBeUndefined();
    expect(findRunningByConversation("a", "c1")).toBeUndefined();
    // getTurn still resolves the (retained) terminal record.
    expect(getTurn(turn.turnId)?.status).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// subscribe — replay-then-tail (no gap / no dup)
// ---------------------------------------------------------------------------

describe("subscribe / publish", () => {
  it("returns a buffer snapshot then tails live events, each exactly once", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    // Buffer two events BEFORE anyone subscribes.
    publish(turn, { event: "scope", data: { format: "champions", source: "default" } });
    publish(turn, activity);

    const received: BufferedEvent[] = [];
    const { replay, unsubscribe } = subscribe(turn, (ev) => received.push(ev));

    // Replay holds exactly the pre-subscribe buffer, in order.
    expect(replay.map((e) => e.event)).toEqual(["scope", "tool_activity"]);
    // The live listener has not fired yet (no gap: nothing double-delivered).
    expect(received).toEqual([]);

    // A later publish tails to the listener only.
    publish(turn, { event: "answer_delta", data: { text: "hi" } });
    expect(received.map((e) => e.event)).toEqual(["answer_delta"]);

    // Union of replay + tail covers every event exactly once.
    const all = [...replay, ...received].map((e) => e.event);
    expect(all).toEqual(["scope", "tool_activity", "answer_delta"]);

    unsubscribe();
    publish(turn, { event: "answer", data: { answer: ANSWER } });
    // After unsubscribe, no further delivery.
    expect(received.map((e) => e.event)).toEqual(["answer_delta"]);
  });

  it("fans a terminal event out then clears subscribers and sets status/answer", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    const received: BufferedEvent[] = [];
    subscribe(turn, (ev) => received.push(ev));

    publish(turn, { event: "answer", data: { answer: ANSWER } });

    expect(received.map((e) => e.event)).toEqual(["answer"]);
    expect(turn.status).toBe("complete");
    expect(turn.answer).toEqual(ANSWER);
    expect(turn.subscribers.size).toBe(0);
    expect(turn.endedAt).not.toBeNull();

    // A post-terminal publish is a no-op (status/answer unchanged).
    publish(turn, { event: "error", data: { code: "x", message: "y" } });
    expect(turn.status).toBe("complete");
    expect(turn.error).toBeNull();
  });

  it("a subscriber that attaches AFTER a terminal event replays it and never tails", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    publish(turn, { event: "answer", data: { answer: ANSWER } });

    const received: BufferedEvent[] = [];
    const { replay } = subscribe(turn, (ev) => received.push(ev));
    expect(replay.map((e) => e.event)).toEqual(["answer"]);
    expect(received).toEqual([]); // subscribers were cleared on terminal
  });

  it("records an error terminal with its code/message", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    publish(turn, { event: "error", data: { code: "agent_error", message: "boom" } });
    expect(turn.status).toBe("error");
    expect(turn.error).toEqual({ code: "agent_error", message: "boom" });
  });
});

// ---------------------------------------------------------------------------
// stop (BT-4)
// ---------------------------------------------------------------------------

describe("stopTurn", () => {
  it("fires the AbortController, publishes stopped, and discards nothing else", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    const received: BufferedEvent[] = [];
    subscribe(turn, (ev) => received.push(ev));

    stopTurn(turn);

    expect(turn.abort.signal.aborted).toBe(true);
    expect(turn.status).toBe("stopped");
    expect(received.map((e) => e.event)).toEqual(["stopped"]);

    // A late runOak resolution publishing an answer must NOT overwrite stopped.
    publish(turn, { event: "answer", data: { answer: ANSWER } });
    expect(turn.status).toBe("stopped");
    expect(turn.answer).toBeNull();
  });

  it("is idempotent on an already-terminal turn", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    publish(turn, { event: "answer", data: { answer: ANSWER } });
    stopTurn(turn); // no-op
    expect(turn.status).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// Retention sweep
// ---------------------------------------------------------------------------

describe("retention sweep", () => {
  it("drops a terminal turn once it is older than the retention window", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    publish(turn, { event: "answer", data: { answer: ANSWER } });
    // Backdate the terminal time past the retention window.
    turn.endedAt = Date.now() - TURN_RETENTION_MS - 1_000;
    // Any access sweeps lazily.
    expect(getTurn(turn.turnId)).toBeUndefined();
  });

  it("keeps a still-running turn regardless of age", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    turn.startedAt = Date.now() - TURN_RETENTION_MS * 10;
    expect(getTurn(turn.turnId)?.status).toBe("running");
  });
});

// ---------------------------------------------------------------------------
// Buffer-bound collapse (defensive)
// ---------------------------------------------------------------------------

describe("buffer bound", () => {
  it("collapses the delta prefix into one synthetic answer_delta past the cap", () => {
    const turn = start({ sessionId: "c1", accountId: null, ownerKey: "ip:x" });
    // Interleave a non-delta event to prove ordering is preserved.
    publish(turn, { event: "answer_start", data: {} });

    const chunk = "x".repeat(800 * 1024); // 0.8 MB each
    const chunks = 3; // 2.4 MB total > 2 MB cap
    for (let i = 0; i < chunks; i++) {
      publish(turn, { event: "answer_delta", data: { text: chunk } });
    }

    const deltas = turn.events.filter((e) => e.event === "answer_delta");
    expect(deltas).toHaveLength(1);
    const merged = deltas[0] as Extract<BufferedEvent, { event: "answer_delta" }>;
    expect(merged.data.text.length).toBe(chunk.length * chunks);
    expect(turn.deltaBytes).toBeGreaterThan(MAX_BUFFER_BYTES);
    // The non-delta event survives, still ahead of the collapsed delta.
    expect(turn.events.map((e) => e.event)).toEqual([
      "answer_start",
      "answer_delta",
    ]);
  });
});
