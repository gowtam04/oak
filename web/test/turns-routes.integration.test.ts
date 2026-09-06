/**
 * Integration suite for BACKGROUND TURNS (background-turns/design.md §5 / §7) —
 * the refactored `POST /api/chat` turn lifecycle plus the three new
 * `/api/chat/turns/:id/*` endpoints (snapshot, resume stream, stop).
 *
 * Mirrors the existing chat-route integration tests: real migrated+seeded
 * Postgres (Testcontainers) so signed-in persistence runs for real against the
 * `@/data/db` singleton, while `getCurrentAccount`, `runOak`, `createAgentContext`
 * and the usage repo are mocked (no model / network). The turn store, run-turn,
 * and the SSE stream helper are REAL and shared across every handler in-process
 * (one globalThis registry), which is exactly what makes reattach work.
 *
 * Asserts (design §7): POST stream begins with `turn`; a client disconnect no
 * longer cancels — the turn completes and persists (BT-1/BT-7); resume replays
 * then tails mid-flight and replays through the terminal answer after completion;
 * stop publishes `stopped` and persists nothing (BT-4); a duplicate send 409s
 * WITH the running turn id (BT-5); ownership 403s; snapshot 200/404.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OakAnswer } from "@/agent/schemas";
import type { OnProgress } from "@/agent/types";

vi.mock("server-only", () => ({}));

const cu = vi.hoisted(() => ({ getCurrentAccount: vi.fn<() => Promise<unknown>>() }));
vi.mock("@/server/auth/current-user", () => cu);

const { mockRunOak } = vi.hoisted(() => ({ mockRunOak: vi.fn() }));
vi.mock("@/agent/runtime", () => ({ runOak: mockRunOak }));

const { mockCreateCtx } = vi.hoisted(() => ({ mockCreateCtx: vi.fn() }));
vi.mock("@/agent/context", () => ({ createAgentContext: mockCreateCtx }));

const usage = vi.hoisted(() => ({
  recordTurn: vi.fn<(input: unknown) => Promise<void>>(),
  recordAuthEvent: vi.fn<(input: unknown) => Promise<void>>(),
}));
vi.mock("@/data/repos/usage-repo", () => usage);
vi.mock("@/server/spend-control", () => ({
  admitAgentTurn: vi.fn(async () => ({ ok: true })),
  assertNotDenylisted: vi.fn(async () => ({ ok: true })),
}));

import { createPgSchema, installAsSingleton, type PgFixture } from "./support/pg";
import { _resetStoreForTests as resetRateLimit } from "@/server/rate-limit";
import { _resetStoreForTests as resetTurnStore } from "@/server/turn-store";

const ACCT_A = "acct-a";
const ACCT_B = "acct-b";

let fix: PgFixture;
let chatRoute: typeof import("@/app/api/chat/route");
let snapshotRoute: typeof import("@/app/api/chat/turns/[id]/route");
let streamRoute: typeof import("@/app/api/chat/turns/[id]/stream/route");
let stopRoute: typeof import("@/app/api/chat/turns/[id]/stop/route");
let convRepo: typeof import("@/data/repos/conversation-repo");

const ANSWER: OakAnswer = {
  status: "answered",
  answer_markdown: "ok",
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  fix = await createPgSchema({ seed: "tools" });
  await installAsSingleton(fix);
  chatRoute = await import("@/app/api/chat/route");
  snapshotRoute = await import("@/app/api/chat/turns/[id]/route");
  streamRoute = await import("@/app/api/chat/turns/[id]/stream/route");
  stopRoute = await import("@/app/api/chat/turns/[id]/stop/route");
  convRepo = await import("@/data/repos/conversation-repo");
}, 60_000);

afterAll(async () => {
  await fix?.cleanup();
});

beforeEach(async () => {
  await fix.db.execute(
    sql`TRUNCATE TABLE team, conversation, conversation_message RESTART IDENTITY`,
  );
  cu.getCurrentAccount.mockReset();
  mockRunOak.mockReset();
  // Default: resolve an answer immediately (the turn terminates on its own).
  mockRunOak.mockResolvedValue(ANSWER);
  mockCreateCtx.mockReset();
  mockCreateCtx.mockImplementation(async (options: Record<string, unknown>) => ({
    db: {},
    requestId: "test-req",
    mode: options.mode,
    accountId: options.accountId,
    logger: { info() {}, warn() {}, error() {}, child: () => ({}) },
  }));
  usage.recordTurn.mockReset();
  usage.recordTurn.mockResolvedValue(undefined);
  usage.recordAuthEvent.mockReset();
  usage.recordAuthEvent.mockResolvedValue(undefined);
  await resetRateLimit();
  await resetTurnStore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signedIn(id: string): void {
  cu.getCurrentAccount.mockResolvedValue({ id, email: `${id}@x.test`, createdAt: 0, lastUsedScope: null });
}

function guest(): void {
  cu.getCurrentAccount.mockResolvedValue(null);
}

function postChat(body: unknown): Promise<Response> {
  return chatRoute.POST(
    new Request("http://t/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** `{ params }` context arg for the dynamic `[id]` route handlers. */
function idCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

interface Frame {
  event: string;
  data: Record<string, unknown>;
}

/** Fully drain an SSE Response, parsing each `event:`/`data:` frame. */
async function readFrames(res: Response): Promise<Frame[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) buf += decoder.decode(value, { stream: true });
  }
  const frames: Frame[] = [];
  for (const raw of buf.split("\n\n")) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith(":")) continue; // skip heartbeats
    let event = "";
    let dataLine = "";
    for (const line of trimmed.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLine = line.slice("data:".length).trim();
    }
    frames.push({ event, data: JSON.parse(dataLine) as Record<string, unknown> });
  }
  return frames;
}

/**
 * Read only the first `turn` frame off a live POST stream (to capture the turn
 * id) and then DISCONNECT that subscriber — the server keeps generating (BT-7).
 */
async function readTurnIdThenDisconnect(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) buf += decoder.decode(value, { stream: true });
    const idx = buf.indexOf("\n\n");
    if (idx === -1) continue;
    for (const raw of buf.split("\n\n")) {
      if (raw.startsWith("event: turn")) {
        const data = JSON.parse(raw.split("\ndata: ")[1]!) as { turn_id: string };
        await reader.cancel();
        return data.turn_id;
      }
    }
  }
  throw new Error("no turn frame seen");
}

/** Override runOak with a deferred resolution + captured progress callback. */
function deferRunOak(): {
  resolve: (a?: OakAnswer) => void;
  emitActivity: (tool: string, label: string) => void;
  onProgressReady: () => Promise<void>;
} {
  let resolveFn: (a: OakAnswer) => void = () => {};
  let captured: OnProgress | null = null;
  const promise = new Promise<OakAnswer>((r) => {
    resolveFn = r;
  });
  mockRunOak.mockImplementation(
    async (
      _message: string,
      _history: unknown,
      _ctx: unknown,
      onProgress?: OnProgress,
    ) => {
      captured = onProgress ?? null;
      return promise;
    },
  );
  return {
    resolve: (a = ANSWER) => resolveFn(a),
    emitActivity: (tool, label) => captured?.({ tool, label }),
    onProgressReady: () => until(() => captured !== null),
  };
}

async function until(cond: () => boolean, ticks = 200): Promise<void> {
  for (let i = 0; i < ticks && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function untilAsync(
  cond: () => Promise<boolean>,
  ticks = 200,
): Promise<void> {
  for (let i = 0; i < ticks && !(await cond()); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ===========================================================================
// POST /api/chat — the turn frame + durability
// ===========================================================================

describe("POST /api/chat — turn lifecycle", () => {
  it("opens the stream with a `turn` event carrying a turn_id (BT-2)", async () => {
    signedIn(ACCT_A);
    const frames = await readFrames(await postChat({ session_id: "c1", message: "hi" }));
    expect(frames[0]!.event).toBe("turn");
    expect(typeof (frames[0]!.data as { turn_id: unknown }).turn_id).toBe("string");
    // The scope event still follows, then the terminal answer.
    expect(frames.map((f) => f.event)).toContain("scope");
    expect(frames[frames.length - 1]!.event).toBe("answer");
  });

  it("a client disconnect does NOT cancel the turn — it completes and persists (BT-1/BT-7)", async () => {
    signedIn(ACCT_A);
    const d = deferRunOak();
    const res = await postChat({ session_id: "c-disc", message: "hi" });
    // Disconnect this subscriber before the answer is ready.
    await res.body!.cancel();
    await d.onProgressReady();
    d.resolve();
    // The detached turn still runs to completion and persists.
    await untilAsync(async () => (await convRepo.getConversation(ACCT_A, "c-disc")) !== null);
    expect(await convRepo.getConversation(ACCT_A, "c-disc")).not.toBeNull();
  });

  it("a duplicate send for a running conversation 409s with the running turn id (BT-5)", async () => {
    signedIn(ACCT_A);
    const d = deferRunOak();
    const res1 = await postChat({ session_id: "c-dup", message: "hi" });
    const turnId = await readTurnIdThenDisconnect(res1);
    await d.onProgressReady(); // the turn is genuinely running

    const res2 = await postChat({ session_id: "c-dup", message: "again" });
    expect(res2.status).toBe(409);
    const body = (await res2.json()) as { code: string; turn_id: string };
    expect(body.code).toBe("turn_in_progress");
    expect(body.turn_id).toBe(turnId);

    d.resolve(); // let the first turn unwind
  });
});

// ===========================================================================
// GET /api/chat/turns/:id/stream — resume
// ===========================================================================

describe("GET /api/chat/turns/:id/stream — resume", () => {
  it("replays the buffered events then tails live to the terminal answer (mid-flight)", async () => {
    signedIn(ACCT_A);
    const d = deferRunOak();
    const res = await postChat({ session_id: "c-resume", message: "hi" });
    const turnId = await readTurnIdThenDisconnect(res);
    await d.onProgressReady();
    // Buffer a tool_activity BEFORE reattaching, so resume must replay it.
    d.emitActivity("get_move", "resolving…");

    const resumeRes = await streamRoute.GET(
      new Request(`http://t/api/chat/turns/${turnId}/stream`),
      idCtx(turnId),
    );
    expect(resumeRes.status).toBe(200);

    // Now let the turn finish; the resume stream tails the answer, then closes.
    d.resolve();
    const frames = await readFrames(resumeRes);
    expect(frames[0]!.event).toBe("turn"); // per-subscriber first frame
    const names = frames.map((f) => f.event);
    expect(names).toContain("scope"); // replayed
    expect(names).toContain("tool_activity"); // replayed
    expect(frames[frames.length - 1]!.event).toBe("answer"); // tailed
  });

  it("replays through the terminal answer after the turn has already completed", async () => {
    signedIn(ACCT_A);
    const first = await readFrames(await postChat({ session_id: "c-done", message: "hi" }));
    const turnId = (first[0]!.data as { turn_id: string }).turn_id;

    const resumeRes = await streamRoute.GET(
      new Request(`http://t/api/chat/turns/${turnId}/stream`),
      idCtx(turnId),
    );
    const frames = await readFrames(resumeRes);
    expect(frames[0]!.event).toBe("turn");
    expect(frames[frames.length - 1]!.event).toBe("answer");
  });

  it("404s an unknown turn and 403s a foreign account (ownership)", async () => {
    signedIn(ACCT_A);
    const first = await readFrames(await postChat({ session_id: "c-own", message: "hi" }));
    const turnId = (first[0]!.data as { turn_id: string }).turn_id;

    const notFound = await streamRoute.GET(
      new Request("http://t/api/chat/turns/nope/stream"),
      idCtx("nope"),
    );
    expect(notFound.status).toBe(404);

    // A different account cannot resume a signed-in turn.
    signedIn(ACCT_B);
    const forbidden = await streamRoute.GET(
      new Request(`http://t/api/chat/turns/${turnId}/stream`),
      idCtx(turnId),
    );
    expect(forbidden.status).toBe(403);
  });
});

// ===========================================================================
// POST /api/chat/turns/:id/stop — explicit stop (BT-4)
// ===========================================================================

describe("POST /api/chat/turns/:id/stop", () => {
  it("stops a running turn, publishes stopped, and persists nothing", async () => {
    signedIn(ACCT_A);
    const d = deferRunOak();
    const res = await postChat({ session_id: "c-stop", message: "hi" });
    const turnId = await readTurnIdThenDisconnect(res);
    await d.onProgressReady();

    const stopRes = await stopRoute.POST(
      new Request(`http://t/api/chat/turns/${turnId}/stop`, { method: "POST" }),
      idCtx(turnId),
    );
    expect(stopRes.status).toBe(200);
    expect(await stopRes.json()).toEqual({ turn_id: turnId, status: "stopped" });

    // Nothing persisted, nothing recorded (BT-4 — stopped turns are discarded).
    expect(await convRepo.getConversation(ACCT_A, "c-stop")).toBeNull();
    expect(usage.recordTurn).not.toHaveBeenCalled();

    // A late runOak resolution must not resurrect the turn.
    d.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(await convRepo.getConversation(ACCT_A, "c-stop")).toBeNull();
  });

  it("is a 200 no-op returning the current status for an already-complete turn", async () => {
    signedIn(ACCT_A);
    const frames = await readFrames(await postChat({ session_id: "c-stop2", message: "hi" }));
    const turnId = (frames[0]!.data as { turn_id: string }).turn_id;

    const stopRes = await stopRoute.POST(
      new Request(`http://t/api/chat/turns/${turnId}/stop`, { method: "POST" }),
      idCtx(turnId),
    );
    expect(stopRes.status).toBe(200);
    expect(await stopRes.json()).toEqual({ turn_id: turnId, status: "complete" });
  });

  it("403s a foreign account and 404s an unknown turn", async () => {
    signedIn(ACCT_A);
    const d = deferRunOak();
    const res = await postChat({ session_id: "c-stop3", message: "hi" });
    const turnId = await readTurnIdThenDisconnect(res);
    await d.onProgressReady();

    signedIn(ACCT_B);
    const forbidden = await stopRoute.POST(
      new Request(`http://t/api/chat/turns/${turnId}/stop`, { method: "POST" }),
      idCtx(turnId),
    );
    expect(forbidden.status).toBe(403);

    const notFound = await stopRoute.POST(
      new Request("http://t/api/chat/turns/nope/stop", { method: "POST" }),
      idCtx("nope"),
    );
    expect(notFound.status).toBe(404);

    d.resolve();
  });

  it("a guest stops with a matching session_id (query param)", async () => {
    guest();
    const d = deferRunOak();
    const res = await postChat({ session_id: "guest-stop", message: "hi" });
    const turnId = await readTurnIdThenDisconnect(res);
    await d.onProgressReady();

    // Wrong session id → 403.
    const wrong = await stopRoute.POST(
      new Request(`http://t/api/chat/turns/${turnId}/stop?session_id=other`, {
        method: "POST",
      }),
      idCtx(turnId),
    );
    expect(wrong.status).toBe(403);

    // Correct session id → stopped.
    const ok = await stopRoute.POST(
      new Request(`http://t/api/chat/turns/${turnId}/stop?session_id=guest-stop`, {
        method: "POST",
      }),
      idCtx(turnId),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()) as { status: string }).toMatchObject({
      status: "stopped",
    });
  });
});

// ===========================================================================
// GET /api/chat/turns/:id — snapshot
// ===========================================================================

describe("GET /api/chat/turns/:id — snapshot", () => {
  it("200s a completed turn with its answer", async () => {
    signedIn(ACCT_A);
    const frames = await readFrames(await postChat({ session_id: "c-snap", message: "hi" }));
    const turnId = (frames[0]!.data as { turn_id: string }).turn_id;

    const snapRes = await snapshotRoute.GET(
      new Request(`http://t/api/chat/turns/${turnId}`),
      idCtx(turnId),
    );
    expect(snapRes.status).toBe(200);
    const body = (await snapRes.json()) as {
      turn_id: string;
      status: string;
      answer?: OakAnswer;
    };
    expect(body.turn_id).toBe(turnId);
    expect(body.status).toBe("complete");
    expect(body.answer).toEqual(ANSWER);
  });

  it("404s an unknown/expired turn", async () => {
    signedIn(ACCT_A);
    const res = await snapshotRoute.GET(
      new Request("http://t/api/chat/turns/missing"),
      idCtx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("403s a foreign account; a guest needs a matching session_id", async () => {
    // Signed-in turn, foreign account → 403.
    signedIn(ACCT_A);
    const frames = await readFrames(await postChat({ session_id: "c-snap2", message: "hi" }));
    const turnId = (frames[0]!.data as { turn_id: string }).turn_id;
    signedIn(ACCT_B);
    const forbidden = await snapshotRoute.GET(
      new Request(`http://t/api/chat/turns/${turnId}`),
      idCtx(turnId),
    );
    expect(forbidden.status).toBe(403);

    // Guest turn: correct session_id → 200; wrong/absent → 403.
    guest();
    const gFrames = await readFrames(await postChat({ session_id: "guest-snap", message: "hi" }));
    const gTurnId = (gFrames[0]!.data as { turn_id: string }).turn_id;
    const ok = await snapshotRoute.GET(
      new Request(`http://t/api/chat/turns/${gTurnId}?session_id=guest-snap`),
      idCtx(gTurnId),
    );
    expect(ok.status).toBe(200);
    const missingSid = await snapshotRoute.GET(
      new Request(`http://t/api/chat/turns/${gTurnId}`),
      idCtx(gTurnId),
    );
    expect(missingSid.status).toBe(403);
  });
});
