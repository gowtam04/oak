/**
 * Turn store — the in-process registry of durable, server-side chat turns
 * (background-turns/design.md §5.1). This is what makes a turn a first-class
 * SERVER object that runs to completion regardless of who is watching: the SSE
 * connection becomes a droppable/reattachable subscription, not the turn's
 * lifetime.
 *
 * STATE-TIER CONVENTIONS (mirrors `@/data/db` / `@/server/session-store`):
 *   - The live registry is memoized on `globalThis` so Next's dev hot-reload /
 *     route re-evaluation reuses the SAME registry instead of orphaning every
 *     in-flight turn on a recompile.
 *   - Live state is IN-PROCESS ONLY (BT-8): Fly runs exactly one always-on
 *     machine (`auto_stop_machines = "off"`), so there is no Redis pub/sub and
 *     no queue — the module API is merely shaped so a Redis backend could be
 *     added later without changing callers.
 *   - The ONE Redis touch is a fail-soft TERMINAL-SNAPSHOT mirror (design §5.1):
 *     on a terminal transition the finished `{ turnId, status, answer, error,
 *     sessionId, accountId }` is written to `oak:turn:<id>` (30-min TTL) so the
 *     *snapshot* endpoint (not the resume stream) has a recovery path across a
 *     process restart. Failure policy is fail-soft like the session store: log
 *     and continue; the in-process registry stays authoritative.
 *
 * Everything except the Redis mirror + `getTurnSnapshot` is synchronous — Node
 * is single-threaded, so `subscribe()`'s snapshot-plus-register is atomic (the
 * no-gap/no-dup guarantee).
 */

import { randomUUID } from "node:crypto";

import type { OakAnswer } from "@/agent/schemas";
import { logger } from "@/server/logger";
import { deletePrefix, getRedisClient } from "@/server/redis";
import type { SseEvent, SseEventName } from "@/lib/sse/sse-types";

// ---------------------------------------------------------------------------
// Types (design §5.1)
// ---------------------------------------------------------------------------

export type TurnStatus = "running" | "complete" | "error" | "stopped";

/**
 * A buffered event is any SSE event EXCEPT `turn` — the `turn` frame is emitted
 * per-subscriber by the stream helper, never stored in the replay buffer.
 */
export type BufferedEvent = Exclude<SseEvent, { event: "turn" }>;

export interface TurnRecord {
  turnId: string;
  /** Conversation id (the chat `session_id`). */
  sessionId: string;
  /** Signed-in account id, or `null` for a guest turn. */
  accountId: string | null;
  /** Concurrency key: `"acct:<id>"` (signed-in) or `"ip:<clientIp>"` (guest). */
  ownerKey: string;
  status: TurnStatus;
  /**
   * Ordered replay buffer (scope / tool_activity / answer_start / answer_delta /
   * answer / error / stopped) — NOT the `turn` frame. A reattaching subscriber
   * replays this from the start, then tails live.
   */
  events: BufferedEvent[];
  /** Set on a `complete` transition. */
  answer: OakAnswer | null;
  /** Set on an `error` transition. */
  error: { code: string; message: string } | null;
  /** Fired ONLY by {@link stopTurn} (BT-4) — a client disconnect never aborts. */
  abort: AbortController;
  subscribers: Set<(ev: BufferedEvent) => void>;
  startedAt: number;
  endedAt: number | null;
  /**
   * Running total of buffered `answer_delta` text length, tracked so the
   * defensive buffer bound can collapse a runaway delta stream (design §5.1).
   */
  deltaBytes: number;
}

/**
 * The normalized, transport-facing view returned by {@link getTurnSnapshot} —
 * enough for the snapshot endpoint's JSON body + its ownership check, and the
 * exact shape mirrored to Redis. `answer` is present iff `complete`; `error` iff
 * `error`.
 */
export interface TurnSnapshot {
  turnId: string;
  status: TurnStatus;
  answer: OakAnswer | null;
  error: { code: string; message: string } | null;
  sessionId: string;
  accountId: string | null;
}

/** A conflict returned by {@link startTurn} when a concurrency cap is hit. */
export type StartConflict =
  | { conflict: "conversation"; turnId: string }
  | { conflict: "owner" }
  | { conflict: "global" };

// ---------------------------------------------------------------------------
// Caps + retention (design §3 BT-5, §5.1)
// ---------------------------------------------------------------------------

/** At most one running turn per conversation (`session_id`). */
export const MAX_TURNS_PER_CONVERSATION = 1;
/** At most three running turns per owner (account id, or guest client IP). */
export const MAX_TURNS_PER_OWNER = 3;
/** Global in-process safety cap on concurrently running turns. */
export const MAX_GLOBAL_TURNS = 64;
/** How long a terminal turn stays resident (for late snapshot/resume). */
export const TURN_RETENTION_MS = 30 * 60_000; // 30 minutes
/** Defensive replay-buffer bound: collapse the delta prefix past ~2 MB. */
export const MAX_BUFFER_BYTES = 2 * 1024 * 1024;

/** Redis key prefix for the terminal-snapshot mirror. */
const TURN_PREFIX = "oak:turn:";

const TERMINAL_EVENTS: ReadonlySet<SseEventName> = new Set<SseEventName>([
  "answer",
  "error",
  "stopped",
]);

function isTerminalEvent(name: SseEventName): boolean {
  return TERMINAL_EVENTS.has(name);
}

// ---------------------------------------------------------------------------
// globalThis-memoized registry (mirrors src/data/db.ts's __oakDb pattern)
// ---------------------------------------------------------------------------

interface TurnStoreState {
  registry: Map<string, TurnRecord>;
  sweepTimer: ReturnType<typeof setInterval> | null;
}

const globalForTurnStore = globalThis as typeof globalThis & {
  __oakTurnStore?: TurnStoreState;
};

function getState(): TurnStoreState {
  if (!globalForTurnStore.__oakTurnStore) {
    const state: TurnStoreState = { registry: new Map(), sweepTimer: null };
    // Periodic retention sweep in addition to the lazy on-access sweep, so an
    // idle process still drops long-terminal turns. Unref'd so it never keeps
    // the process (or a test run) alive.
    const timer = setInterval(() => sweep(), 60_000);
    if (typeof timer.unref === "function") timer.unref();
    state.sweepTimer = timer;
    globalForTurnStore.__oakTurnStore = state;
  }
  return globalForTurnStore.__oakTurnStore;
}

/** Drop terminal records past their retention window (lazy, on access). */
function sweep(now: number = Date.now()): void {
  const state = globalForTurnStore.__oakTurnStore;
  if (!state) return;
  for (const [id, turn] of state.registry) {
    if (
      turn.status !== "running" &&
      turn.endedAt !== null &&
      now - turn.endedAt > TURN_RETENTION_MS
    ) {
      state.registry.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Registration + lookups
// ---------------------------------------------------------------------------

/**
 * Atomically check the three concurrency caps (BT-5) and, if all pass, register
 * and return a fresh running {@link TurnRecord}. On a per-conversation clash the
 * EXISTING turn's id is returned so the caller can 409 → reattach (never a hard
 * error). Synchronous — the whole check-then-register runs without yielding, so
 * two racing sends can't both slip past the caps.
 */
export function startTurn(meta: {
  sessionId: string;
  accountId: string | null;
  ownerKey: string;
}): TurnRecord | StartConflict {
  const { registry } = getState();
  sweep();

  // 1 per conversation — return the running turn's id so the client reattaches.
  const existing = findRunningBySession(meta.sessionId);
  if (existing) return { conflict: "conversation", turnId: existing.turnId };

  // 3 per owner + a global safety cap.
  let ownerRunning = 0;
  let globalRunning = 0;
  for (const turn of registry.values()) {
    if (turn.status !== "running") continue;
    globalRunning++;
    if (turn.ownerKey === meta.ownerKey) ownerRunning++;
  }
  if (ownerRunning >= MAX_TURNS_PER_OWNER) return { conflict: "owner" };
  if (globalRunning >= MAX_GLOBAL_TURNS) return { conflict: "global" };

  const turn: TurnRecord = {
    turnId: randomUUID(),
    sessionId: meta.sessionId,
    accountId: meta.accountId,
    ownerKey: meta.ownerKey,
    status: "running",
    events: [],
    answer: null,
    error: null,
    abort: new AbortController(),
    subscribers: new Set(),
    startedAt: Date.now(),
    endedAt: null,
    deltaBytes: 0,
  };
  registry.set(turn.turnId, turn);
  return turn;
}

/** Look up a turn by id (running or still-resident terminal), else undefined. */
export function getTurn(turnId: string): TurnRecord | undefined {
  const { registry } = getState();
  sweep();
  return registry.get(turnId);
}

/** The single running turn for a conversation, or undefined. */
export function findRunningBySession(sessionId: string): TurnRecord | undefined {
  for (const turn of getState().registry.values()) {
    if (turn.status === "running" && turn.sessionId === sessionId) return turn;
  }
  return undefined;
}

/**
 * The running turn for a signed-in conversation (account + conversation id), or
 * undefined. Backs the `active_turn` field on `GET /api/conversations/:id`
 * (design §5.4) so a reopened thread knows to reattach after an app restart.
 */
export function findRunningByConversation(
  accountId: string,
  conversationId: string,
): TurnRecord | undefined {
  for (const turn of getState().registry.values()) {
    if (
      turn.status === "running" &&
      turn.accountId === accountId &&
      turn.sessionId === conversationId
    ) {
      return turn;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Publish (fan-out) + subscribe (replay-then-tail)
// ---------------------------------------------------------------------------

/**
 * Append an event to the turn's replay buffer and fan it out to every live
 * subscriber. A terminal event (`answer`/`error`/`stopped`) additionally sets
 * `status`/`answer`/`error`/`endedAt`, clears the subscriber set, and fires the
 * fail-soft Redis snapshot mirror. Terminal-after-terminal is a no-op (a stopped
 * turn whose `runOak` later resolves must not overwrite the `stopped` status).
 */
export function publish(turn: TurnRecord, event: BufferedEvent): void {
  if (turn.status !== "running") return;

  turn.events.push(event);
  if (event.event === "answer_delta") {
    turn.deltaBytes += event.data.text.length;
    enforceBufferBound(turn);
  }

  // Fan out to live subscribers. A throwing listener must never poison the
  // publish (e.g. an already-dead controller) — each is isolated.
  for (const listener of turn.subscribers) {
    try {
      listener(event);
    } catch {
      /* subscriber teardown races the fan-out — ignore */
    }
  }

  if (isTerminalEvent(event.event)) {
    turn.status =
      event.event === "answer"
        ? "complete"
        : event.event === "error"
          ? "error"
          : "stopped";
    if (event.event === "answer") turn.answer = event.data.answer;
    if (event.event === "error") {
      turn.error = { code: event.data.code, message: event.data.message };
    }
    turn.endedAt = Date.now();
    turn.subscribers.clear();
    mirrorTerminalToRedis(turn);
  }
}

/**
 * Register a listener AND snapshot the current buffer in one synchronous step —
 * no `await` between them (design §5.1: the no-gap/no-dup guarantee). The caller
 * writes `replay` first, then lets `listener` tail live events; because Node is
 * single-threaded, no `publish` can interleave between the snapshot and the
 * registration, so every event is delivered exactly once. If the turn is already
 * terminal the buffer ends with the terminal event and the subscriber set was
 * already cleared — the listener simply never fires and the caller closes off the
 * replay.
 */
export function subscribe(
  turn: TurnRecord,
  listener: (ev: BufferedEvent) => void,
): { replay: BufferedEvent[]; unsubscribe: () => void } {
  const replay = [...turn.events];
  turn.subscribers.add(listener);
  return {
    replay,
    unsubscribe: () => {
      turn.subscribers.delete(listener);
    },
  };
}

/**
 * Explicit stop (BT-4): fire the turn's AbortController (the ONLY aborter) and
 * publish the terminal `stopped` event. Nothing is persisted or recorded.
 * A no-op on an already-terminal turn (idempotent — the stop endpoint returns
 * the current status).
 */
export function stopTurn(turn: TurnRecord): void {
  if (turn.status !== "running") return;
  turn.abort.abort();
  publish(turn, { event: "stopped", data: {} });
}

// ---------------------------------------------------------------------------
// Snapshot (registry → Redis fallback)
// ---------------------------------------------------------------------------

function toSnapshot(turn: TurnRecord): TurnSnapshot {
  return {
    turnId: turn.turnId,
    status: turn.status,
    answer: turn.answer,
    error: turn.error,
    sessionId: turn.sessionId,
    accountId: turn.accountId,
  };
}

/**
 * Resolve a turn snapshot for the `GET /api/chat/turns/:id` endpoint: the
 * in-process registry is authoritative and checked first; on a miss (expired
 * window, or the process restarted after the turn finished) the fail-soft Redis
 * terminal mirror is consulted. Returns `null` when neither has it (the client
 * treats a null/404 as "interrupted — offer retry").
 */
export async function getTurnSnapshot(
  turnId: string,
): Promise<TurnSnapshot | null> {
  const turn = getTurn(turnId);
  if (turn) return toSnapshot(turn);

  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(`${TURN_PREFIX}${turnId}`);
    if (raw === null) return null;
    return JSON.parse(raw) as TurnSnapshot;
  } catch (err) {
    logTurnStoreRedisError("getTurnSnapshot", turnId, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Defensive buffer bound (design §5.1): once buffered `answer_delta` text passes
 * `MAX_BUFFER_BYTES`, collapse EVERY buffered `answer_delta` into a single
 * synthetic one at the position of the first delta. Replay correctness is
 * preserved — deltas are pure concatenation — while the per-frame JSON framing
 * overhead of a runaway delta stream is bounded. Normal answers are a few KB and
 * never trip this.
 */
function enforceBufferBound(turn: TurnRecord): void {
  if (turn.deltaBytes <= MAX_BUFFER_BYTES) return;

  let mergedText = "";
  for (const ev of turn.events) {
    if (ev.event === "answer_delta") mergedText += ev.data.text;
  }
  const rebuilt: BufferedEvent[] = [];
  let inserted = false;
  for (const ev of turn.events) {
    if (ev.event === "answer_delta") {
      if (!inserted) {
        rebuilt.push({ event: "answer_delta", data: { text: mergedText } });
        inserted = true;
      }
      continue;
    }
    rebuilt.push(ev);
  }
  turn.events = rebuilt;
  turn.deltaBytes = mergedText.length;
}

/** Fire-and-forget terminal mirror to Redis (fail-soft — log and continue). */
function mirrorTerminalToRedis(turn: TurnRecord): void {
  const client = getRedisClient();
  if (!client) return;
  const payload = JSON.stringify(toSnapshot(turn));
  // Not awaited — publish() is synchronous by contract; the registry remains
  // authoritative if this write is lost.
  void client
    .set(`${TURN_PREFIX}${turn.turnId}`, payload, "PX", TURN_RETENTION_MS)
    .catch((err: unknown) => {
      logTurnStoreRedisError("mirrorTerminal", turn.turnId, err);
    });
}

function logTurnStoreRedisError(
  op: string,
  turnId: string,
  err: unknown,
): void {
  logger.error(
    {
      event: "turn_store_redis_error",
      op,
      turn_id: turnId,
      err: err instanceof Error ? err.message : String(err),
    },
    "oak_turn_store_redis_error",
  );
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Wipe the registry + stop the sweep timer, and (when Redis is configured) clear
 * every `oak:turn:` key. Call from `beforeEach`/`afterEach` to isolate tests.
 *
 * @internal
 */
export async function _resetStoreForTests(): Promise<void> {
  const state = globalForTurnStore.__oakTurnStore;
  if (state) {
    if (state.sweepTimer) clearInterval(state.sweepTimer);
    state.registry.clear();
    globalForTurnStore.__oakTurnStore = undefined;
  }
  const client = getRedisClient();
  if (client) {
    await deletePrefix(client, TURN_PREFIX).catch(() => {});
  }
}
