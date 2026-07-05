# Background Turns — durable server-side chat turns with live resume

**Status:** approved for implementation (2026-07-05).
**Scope decided with the user:** Phases 1+2 together (durable turns **and** live
resume), guests **and** signed-in, up to **3 concurrent running turns per
account/IP** (max **1 per conversation**), **no push notifications** in v1.

## 1. Problem

Today a chat turn's lifetime is tied to the live SSE connection:

- `POST /api/chat` forwards `req.signal` into the agent context
  (`web/src/app/api/chat/route.ts` — the `signal: req.signal` bind), and
  `runtime.ts` checks it every loop iteration. A client disconnect aborts the
  in-flight LLM stream.
- Persistence is **connection-gated**: the route returns before
  `appendTurnPair`/`appendTurn`/`recordTurn` when `req.signal.aborted`.
- There is no turn id, no in-progress state, no resume protocol. Both mobile
  apps "heal" a backgrounding drop with a single **full re-POST** of the turn
  (regenerating the answer, re-spending tokens, with a documented
  double-persist race — see `sse-client.ts` `MAX_RETRIES`).

Net effect: phone screen sleeps, user switches chats/apps/tabs → the response
dies and nothing is recoverable.

## 2. Goal

Make the agent turn a first-class **server-side object** that runs to
completion regardless of who is watching. The SSE connection becomes a
**subscription** you can drop and reattach. Reopening a thread mid-generation
shows the stream continuing token-by-token; reopening after completion shows
the finished, persisted answer. Identical behavior on web, iOS, and Android.

## 3. Requirements

- **BT-1** A started turn runs to completion (or in-domain failure) even if
  every client disconnects. Persistence (`appendTurnPair` signed-in /
  `appendTurn` guest / `recordTurn` admin) fires unconditionally on completion.
- **BT-2** Every turn has a server-minted `turn_id` (UUID), delivered to the
  client as the **first SSE event** of the POST stream.
- **BT-3** A client can fetch a turn snapshot (`status` + terminal answer if
  done) and can reattach to a running turn's live stream (full replay of
  buffered events, then live tail).
- **BT-4** Stopping generation is an **explicit** API call, no longer implied
  by disconnect. A stopped turn is discarded (not persisted) — matching
  today's Stop semantics.
- **BT-5** Concurrency caps: 1 running turn per conversation (`session_id`);
  3 per owner (account id, or client IP for guests); a global in-process
  safety cap (64). Exceeding per-conversation returns the existing turn's id
  so the client reattaches instead of erroring.
- **BT-6** Guests get all of the above, scoped by `session_id` ownership.
- **BT-7** All three clients: navigating away / backgrounding **unsubscribes**
  (never cancels generation); returning to the thread or foregrounding
  reattaches or renders the finished answer. The whole-turn re-POST retry
  machinery is replaced by reattach (idempotent by construction).
- **BT-8 (non-goals v1):** no push notifications; turns do not survive a
  server process restart/deploy (single always-on Fly machine; see §8); no
  cross-device live sync guarantees beyond what the snapshot endpoint gives.

## 4. Wire contract (additive)

New SSE event names (additive — existing parsers on all three platforms drop
unknown event names; verify per client):

```
event: turn      data: { "turn_id": "<uuid>" }   (exactly one, FIRST frame of
                                                  both the POST stream and the
                                                  resume stream)
event: stopped   data: {}                        (terminal alternative to
                                                  answer/error when the turn
                                                  was explicitly stopped)
```

Full per-turn event order (POST stream and resume stream are identical except
resume replays the buffer first):

```
turn → scope → tool_activity* → answer_start/answer_delta* → answer | error | stopped
```

### New endpoints

All three are `runtime = "nodejs"`, `dynamic = "force-dynamic"`, dynamic-import
their server deps (same env-throw avoidance as `/api/chat`).

**`GET /api/chat/turns/:id`** — JSON snapshot.
- 200: `{ turn_id, status: "running" | "complete" | "error" | "stopped",
  answer?: OakAnswer, error?: { code, message } }` (`answer` present iff
  `complete`; `error` present iff `error`).
- 404: unknown/expired turn (client treats as "interrupted — offer retry").
- 403: ownership mismatch.

**`GET /api/chat/turns/:id/stream?session_id=<sid>`** — SSE resume.
- Replays the full buffered event list from the start (clients rebuild the
  in-flight UI from scratch on reattach — no offset protocol in v1), then
  tails live until a terminal event. Same SSE headers + 15s keep-alive
  heartbeat as the POST stream. If the turn is already terminal, the replay
  ends with the terminal event and the stream closes — so "reattach after
  completion" and "reattach mid-flight" are one client code path.
- 404 / 403 as above (pre-stream JSON errors).

**`POST /api/chat/turns/:id/stop`** — explicit stop.
- Aborts the turn's own `AbortController`; turn transitions to `stopped`;
  subscribers receive `event: stopped` and the streams close. Nothing is
  persisted. 200 `{ turn_id, status: "stopped" }`; stopping an already
  terminal turn is a 200 no-op returning the current status. 404/403 as above.

### Ownership

A turn records `{ accountId: string | null, sessionId: string }` at start.
- Signed-in turn (`accountId` set): caller must resolve (cookie or Bearer) to
  the same account. `session_id` param is ignored.
- Guest turn: caller must supply `?session_id=` (or body field for stop)
  equal to the turn's `sessionId`. Unguessable UUIDv4 session ids are the
  existing guest security model (same as today's session store).

### Modified endpoints

- **`POST /api/chat`**: response stream now begins with the `turn` event. If a
  turn is already running for this `session_id`, respond **409**
  `{ code: "turn_in_progress", message, turn_id }` (client reattaches). If the
  owner has ≥3 running turns: **429** `{ code: "too_many_turns", message }`.
  Global cap hit: **503** `{ code: "server_busy", message }`.
- **`GET /api/conversations/:id`** (signed-in): response gains optional
  `active_turn: { turn_id: string } | null` — a live registry lookup by
  conversation id + account, so a reopened thread knows to reattach even after
  an app restart. (Guests track the pending turn id client-side; guest threads
  are already device-local and session-scoped.)

## 5. Server design

### 5.1 Turn store — `web/src/server/turn-store.ts`

A new state module following the repo's state-tier conventions (module API,
`globalThis` memoization like `db.ts` so it survives Next hot-reload). **Live
state is in-process only** — Fly runs exactly one always-on machine
(`auto_stop_machines = "off"`), so no Redis pub/sub is needed; the module API
is shaped so a Redis backend could be added later without changing callers.

```ts
type TurnStatus = "running" | "complete" | "error" | "stopped";

interface TurnRecord {
  turnId: string;
  sessionId: string;          // conversation id
  accountId: string | null;   // null ⇒ guest
  ownerKey: string;           // "acct:<id>" | "ip:<clientIp>" — concurrency key
  status: TurnStatus;
  events: BufferedEvent[];    // ordered SseEvent list (scope/tool_activity/
                              // answer_start/answer_delta/answer/error/stopped;
                              // NOT the `turn` frame — emitted per-subscriber)
  answer: OakAnswer | null;   // set on complete
  error: { code: string; message: string } | null; // set on error
  abort: AbortController;     // fired ONLY by stop (BT-4)
  subscribers: Set<(ev: SseEvent) => void>;
  startedAt: number;
  endedAt: number | null;
}
```

Module API (all synchronous except the Redis mirror):

- `startTurn(meta) → TurnRecord | { conflict: "conversation", turnId } |
  { conflict: "owner" } | { conflict: "global" }` — atomically checks the three
  caps and registers the record.
- `publish(turn, event)` — appends to `events`, fans out to subscribers.
  Terminal events (`answer`/`error`/`stopped`) set status/answer/error/endedAt,
  then clear subscribers.
- `subscribe(turn, listener) → { replay: SseEvent[], unsubscribe() }` — snapshot
  of the buffer plus listener registration **in one synchronous step** (no
  `await` between — this is the no-gap/no-dup guarantee; Node is
  single-threaded so this is sufficient).
- `getTurn(turnId)`, `findRunningBySession(sessionId)`,
  `findRunningByConversation(accountId, conversationId)`.
- `stopTurn(turn)` — fires `abort`, publishes `stopped`.
- Retention: terminal records kept **30 minutes** in-process (lazy sweep on
  access + periodic interval), then dropped.
- **Terminal snapshot mirror to Redis (fail-soft, SHOULD):** on terminal
  transition, write `{ turnId, status, answer, error, sessionId, accountId }`
  to Redis (`turn:<id>`, 30-min TTL) via the existing `getRedisClient()`
  pattern; `getTurnSnapshot(turnId)` (async) checks the registry first, then
  Redis. This gives the snapshot endpoint (not the resume stream) a recovery
  path across a process restart. Failure policy: fail-soft like the session
  store (log and continue; registry remains authoritative).
- Buffer bound: cap `events` at ~2 MB serialized (answer_delta text length
  tracked); on overflow, collapse the delta prefix into one synthetic
  `answer_delta` (replay correctness preserved — deltas are pure
  concatenation). This is a defensive bound; normal answers are a few KB.

### 5.2 Route refactor — `POST /api/chat`

Everything through step 3c (body/images/rate-limit/history/scope/model
resolution) is unchanged. Then:

1. `startTurn(...)` with the caps (409/429/503 pre-stream JSON errors per §4).
2. The detached async task that currently lives inside `ReadableStream.start()`
   moves to a `runTurn(turn, …)` function (new module
   `web/src/server/run-turn.ts`, or a clearly-delimited section of route.ts —
   implementer's choice, but it must be unit-testable without a Request). It:
   - binds `ctx.signal = turn.abort.signal` (**not** `req.signal` — the only
     remaining aborter is explicit stop);
   - publishes `scope`, `tool_activity`, `answer_start`, `answer_delta` events
     via `publish()` instead of writing to a controller;
   - on `runOak` resolve: **persist first, then publish the terminal `answer`
     event.** (Order flips vs. today's signed-in path: with reattach, a client
     that sees `answer` may immediately refetch history, so the write must
     already be committed. `appendTurnPair` failure still only logs — the
     answer event is still published; do not fail the turn.)
   - on `AbortError` with `turn.abort.signal.aborted`: the turn was stopped —
     `publish(stopped)` already happened in `stopTurn`; just exit (persist
     nothing).
   - on transport fault: `publish(error, …)` with the same
     `ProviderTransportError` mapping as today.
   - `recordTurn` (admin, fire-and-forget) runs for `complete` and `error`
     turns as today; stopped turns are not recorded (they never were).
3. The POST response's `ReadableStream` becomes a **subscriber**: emit
   `turn {turn_id}`, then `subscribe()` → write replay (trivially empty — the
   task starts after subscription) + tail. `cancel()` now ONLY unsubscribes
   and stops the per-subscriber heartbeat — it must NOT touch the turn.
4. Guest sticky-scope and conversation-format persistence stay where they are
   (pre-turn, fire-and-forget — unchanged).

The subscriber-side plumbing (SSE headers, `enqueue` guard, heartbeat,
replay-then-tail, close-on-terminal) is shared between the POST stream and the
resume endpoint — one helper, two call sites.

### 5.3 New route handlers

`web/src/app/api/chat/turns/[id]/route.ts` (GET snapshot),
`…/[id]/stream/route.ts` (GET resume), `…/[id]/stop/route.ts` (POST stop).
Each resolves the caller identity via `getCurrentAccount()` (dynamic import,
degrade-to-guest on fault, same as chat route) and applies §4 ownership.
No rate limiting on these (cheap, ownership-gated); the POST caps are the
spend control.

### 5.4 `GET /api/conversations/:id` — `active_turn`

Additive field from `findRunningByConversation(account.id, id)`. Touches
`web/src/app/api/conversations/[id]/route.ts` only (plus its client-safe wire
type if one exists for this response).

## 6. Client designs

Shared shape for all three clients:

- On send: capture `turn_id` from the `turn` event; record it as the
  conversation's **pending turn** (web: React state keyed by session id;
  iOS: `AppState` map `conversationId → turnId`; Android: `AppState`/VM map).
- Navigating away / screen sleep / app background: close the socket
  (unsubscribe). **Never** treat this as stop; **remove** the current
  cancel-generation-on-navigate behavior.
- Returning to a thread (or app foreground with a thread open): if a pending
  turn exists → `GET /api/chat/turns/:id/stream` and rebuild the in-flight UI
  from the replay (reset streaming buffer/activities on the `turn` frame, then
  apply events exactly like a live stream — same handler). Terminal event in
  the replay resolves the turn like a live one. On **404** → clear pending
  state; if the thread's last message has no answer, show the existing
  "interrupted — Retry" affordance (re-send). Signed-in thread open: prefer
  the `active_turn` field from `GET /api/conversations/:id` when local state
  is missing (app relaunch).
- Stop button: `POST /api/chat/turns/:id/stop`, then tear down the local
  stream. (Keep the local teardown even if the call fails.)
- Delete the whole-turn auto-re-POST retry machinery (`MAX_RETRIES`,
  `hiddenDuringTurn`, retained-body auto-resend). Reattach replaces it. The
  **manual** Retry affordance for genuinely failed/interrupted turns stays.
- The 409 `turn_in_progress` response to a send: reattach to the returned
  `turn_id` instead of surfacing an error.

### 6.1 Web — `web/src/lib/sse/sse-client.ts` + hosting components

- `parseFrame`/`readSseStream` gain the `turn` and `stopped` events (typed in
  `sse-types.ts`).
- `useSseClient` gains: `turnId` in state; a `resume(turnId, sessionId?)`
  entry point that runs the same `runRequest` consume loop against the resume
  endpoint (GET, no body); `visibilitychange`-hidden no longer arms a re-send
  — instead, on visible, if the turn is unresolved, fire `resume`. Also call
  `resume` when a mid-stream read error occurs while a `turnId` is known
  (connection blip → reattach, bounded retries with small backoff, e.g. 2).
- `stop()` action calling the stop endpoint (wire it to whatever Stop
  affordance exists; if none exists on web today, add state support and leave
  UI minimal).
- The hosting chat component: keep pending turn id per session; on remount of
  a signed-in conversation use `active_turn` from the conversation fetch.

### 6.2 iOS — `ios/OakApp/`

- SSE layer: parse `turn`/`stopped` (verify unknown-event tolerance for old
  builds); add `resumeStream(turnId:sessionId:)` on the chat service hitting
  the resume endpoint; add `stop(turnId:)`.
- `ChatViewModel`: `cancelStreaming()` splits into `detach()` (close socket,
  keep pending-turn state; used by `.onDisappear` and backgrounding) and
  `stop()` (calls the stop endpoint; used by the Stop button and by "send a
  new message replaces the running turn" — decision: sending a new message in
  the SAME conversation while one is running should call stop first, matching
  today's UX).
- Pending-turn registry on `AppState`: `conversationId → turnId`, so
  `ChatThreadScreen.prepare()` and scene-foreground can reattach. On thread
  open, also honor `active_turn` from `GET /api/conversations/:id`.
- Replace `handleRecoverableFailure`/`maxRetries` re-send with reattach.
- SHOULD: `beginBackgroundTask` around an active stream for ~30s of grace so
  short turns finish streaming without a reattach cycle.
- Keep `isIdleTimerDisabled` while streaming (nice-to-have, now non-critical).

### 6.3 Android — `android/app/`

- **Fix the latent timeout bug first:** the OkHttp client is `OkHttpClient()`
  with a default 10s read timeout while the server heartbeat is 15s. The
  streaming client must set `readTimeout` = 0 (or ≥ 65s) and `callTimeout` = 0
  (`OakApiClient.kt`).
- SSE layer: parse `turn`/`stopped`; add resume + stop calls
  (`ChatService`/`OakApiClient`).
- `ChatViewModel` (the shared, app-wide VM): same `detach()` vs `stop()`
  split. `ChatScreen.onDispose` and `loadResumed`-of-another-conversation call
  `detach()` — the server keeps generating. Pending-turn map
  (`sessionId → turnId`) lives in `AppState` (survives navigation). On
  entering a thread with a pending turn (or `active_turn` from the history
  GET): reattach and rebuild the in-flight UI from the replay. On foreground
  (`onEnterForeground`) with an unresolved visible turn: reattach.
- Replace `handleRecoverableFailure`/`MAX_RETRIES` re-send with reattach.
- This yields the "send in chat A, work in chat B" flow without a multi-VM
  refactor: chat A's turn keeps running server-side; its thread shows the
  in-flight state again (via reattach) whenever reopened.
- Keep `FLAG_KEEP_SCREEN_ON` while a stream is attached (optional now).

## 7. Testing

- **turn-store unit tests** (node project): caps (per-conversation 409 path,
  per-owner, global), subscribe replay-then-tail ordering (no gap/dup),
  terminal fan-out + subscriber clearing, retention sweep, buffer-bound
  collapse, stop semantics, Redis terminal-snapshot mirror (fail-soft — use
  the existing Redis test harness patterns).
- **Route integration tests**: POST stream begins with `turn`; disconnect
  (abort the response read) → turn still completes and persists (assert via
  conversation repo / session store); resume stream mid-flight replays then
  tails; resume after completion replays through terminal `answer`; stop →
  `stopped` event, nothing persisted; 409-with-turn_id on duplicate send;
  ownership 403s; snapshot 200/404. Follow the existing chat-route test
  patterns (Testcontainers PG, mocked provider).
- **sse-types / parseFrame tests**: new events round-trip; unknown events
  still ignored.
- **Web jsdom tests**: hook resume path, 409 reattach, stop.
- **iOS**: unit tests for the new service calls + VM detach/reattach state
  (existing `OakAppTests` patterns).
- **Android**: JVM unit tests for parser events, VM detach/reattach, timeout
  config.
- Full gates per phase: `npm run typecheck && npm run lint && npm test`
  (web), `xcodebuild test` (iOS), `:app:compileDebugKotlin` +
  `:app:testDebugUnitTest` + `:app:lint` (Android).

## 8. Known limitations (accepted)

- A deploy/restart kills running turns (in-process registry). Clients see the
  socket drop, reattach → snapshot 404 (or Redis terminal snapshot if the turn
  finished pre-restart) → "interrupted — Retry". Surviving deploys needs a job
  queue; out of scope.
- Detached turns spend tokens with nobody watching — bounded by
  `MAX_ITERATIONS` and the 3-per-owner cap.
- A guest who loses local state (app relaunch/page reload) loses the pending
  turn pointer — consistent with guest threads being device-local today.
- If the server dies mid-turn the user message is not persisted (unchanged
  from today: the pair is written only on completion).

## 9. Implementation plan

One worktree (`agent/background-turns`), phases strictly ordered server →
clients (clients build against the frozen §4 contract):

- **P1 — server**: sse-types additions, turn-store module, run-turn extraction,
  chat-route refactor, three new endpoints, `active_turn` on conversation GET,
  all server tests. Gate: typecheck + lint + full `npm test`.
- **P2 — web client**, **P3 — iOS**, **P4 — Android**: independent, run in
  parallel after P1 verifies. Each gates on its platform's commands (§7).
- **P5 — docs**: README/CLAUDE.md deltas (state tier, SSE contract, endpoints).
- Merge `agent/background-turns` → `develop` after all gates pass.
