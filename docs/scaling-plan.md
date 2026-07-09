# Oak — Scaling Plan for 10,000 Concurrent Users

**Status: Phase 1 implemented 2026-07-04.** Phases 2–5 below are still analysis
only. Written 2026-07-04 from a live inspection of the Fly deployment (`fly
status` / `fly machine list` on both apps) plus the deployment-relevant
source. If you are picking this up in a later session, re-verify the "Current
deployment" section first — machine sizes and `fly.toml` may have changed
since.

**Phase 1 (this session):** the guest session store, chat rate limiter, and
OTP throttle are now dual-backend (`web/src/server/redis.ts` + the three store
modules) — in-process `BoundedStore` fallback when `REDIS_URL` is unset
(unchanged single-machine behavior, used in dev/tests), Redis when it's set.
Provider: a self-run Fly Redis machine (`oak-gowtam-redis`, `iad`,
shared-cpu-1x/256MB, no volume, no public IP — private 6PN networking only;
see `web/deploy/redis/`). Per-module failure policy for a reachable-then-down
Redis: rate limiter **fail-open** (an outage must not block chat), session
store **fail-soft** (`getHistory` degrades to `[]`, writes log-and-continue),
OTP throttle **fail-CLOSED** (a security control — an outage blocks sign-ins,
by design). See `README.md` (Redis runbook) and `CLAUDE.md` (state-tier
architecture note) for details.

---

## 1. Current deployment (as inspected 2026-07-04)

| Component | Reality |
|---|---|
| App | Fly app `oak-gowtam`, region `iad`, **one** machine `shared-cpu-1x` / **512MB** RAM + 512MB swap |
| Scaling | `auto_stop_machines = "off"`, `auto_start_machines = false`, `min_machines_running = 1` — fixed single machine, no autoscaling (`web/fly.toml`) |
| Concurrency | `type = "connections"`, `soft_limit = 20`, **`hard_limit = 25`** (`web/fly.toml:35-38`) |
| Database | Fly app `oak-gowtam-db`, **unmanaged** postgres-flex 17.2, **one** machine `shared-cpu-1x` / 512MB, single volume, **no replica, no pooler** |
| DB pool | `pg.Pool` `max: 10`, 5s connect timeout, 15s statement/query timeouts (`web/src/data/db.ts:74-83`) |
| Runtime | Next.js standalone, one Node process per machine (`web/Dockerfile`) |
| Migrations | Fly `release_command = "node migrate.mjs"` — fine at any scale |
| Health check | `GET /api/health` (no DB) every 30s — fine |

### Where state lives today (this is the crux)

All of the following are **per-process, in-memory** (`BoundedStore` = LRU cap +
idle TTL, memoized on `globalThis`):

1. **Guest chat history + sticky scope** — `web/src/server/session-store.ts`.
   `SESSION_MAX_ENTRIES = 250`, `SESSION_TTL_MS = 2h`. Sized against the 512MB
   machine (~200MB worst case at 250 × 100k-token histories).
2. **Chat rate limiter** — `web/src/server/rate-limit.ts`. Fixed 60s window,
   guest 20/min keyed `ip:<addr>`, signed-in 60/min keyed `acct:<id>`,
   `RL_MAX_ENTRIES = 20_000`.
3. **OTP throttle** — `web/src/server/auth/otp-throttle.ts` (per-email cooldown,
   per-email and per-IP hourly windows). This one is a **security control**.
4. (Voice sessions and misc. stores follow the same pattern.)

Already durable / stateless (no change needed): auth sessions (SHA-256 token
hash in `auth_session` table — `web/src/server/auth/sessions.ts`), signed-in
chat history (`conversation` tables), teams, `turn_record` analytics.

### Traffic model to design against

10k **concurrent users ≠** 10k concurrent requests. In a chat UX most users at
any instant are reading or typing. Assume **5–15% have a turn in flight →
~500–1,500 concurrent SSE streams**, each living 10–60s (the agent loop runs up
to 10 model iterations per turn — `MAX_ITERATIONS` in
`web/src/agent/runtime.ts` — streaming throughout). On top: page loads,
history/team fetches, and the unauthenticated public read routes
(`/api/entity`, `/api/search`, `/api/sprites`, `/api/learnset`).

---

## 2. What stops us today (ranked)

### B1 — `hard_limit = 25` connections, one machine *(fatal at ~25 users)*
Each chat turn IS one long-lived SSE connection, and concurrency is counted by
connection. User #26's request queues/bounces at the Fly edge. Caps us at ~25
simultaneous turns ≈ 0.25% of target.

### B2 — In-process state blocks horizontal scaling *(the architectural blocker)*
Fly's proxy round-robins across machines. With 2+ machines:
- a guest's turn 2 lands on a machine that never saw turn 1 → instant amnesia
  (guest history is per-process);
- every rate limit silently becomes N× (N machines, N independent counters);
- the OTP throttle multiplies the same way (security regression);
- every deploy/restart wipes all guest conversations (the `fly.toml` health-check
  comment acknowledges this).

**Nothing else in this plan works until B2 is fixed.** Machines must become
stateless.

### B3 — Guest store can't hold the population even on one machine
250-slot LRU vs. 10,000 guests → continuous thrash; even users who get a
connection lose their history within minutes.

### B4 — App machine size
`shared-cpu-1x` is a fractional shared core. Streaming SSE, assembling
10k+-token prompts, parsing up-to-16MB image bodies
(`MAX_REQUEST_BYTES`, `web/src/app/api/chat/route.ts:97`), and per-stream 15s
heartbeat timers is real CPU/memory work. This VM handles single-digit
concurrent turns comfortably, not hundreds.

### B5 — Postgres: single tiny unmanaged node, no pooler, no replica
- One 512MB machine; Fly explicitly does not support unmanaged PG — we are the
  DBA during our own launch spike.
- App pool `max: 10` × M machines = 10M direct connections against a small
  server (postgres-flex on 512MB has a low `max_connections`); no PgBouncer.
- Every tool call in every agent iteration is a live DB read today.
- No HA: one volume failure = total outage + restore-from-backup.

### B6 — LLM provider throughput is the TRUE ceiling
~1,500 concurrent turns × up to 10 Grok calls each × 10–20k input tokens per
call (prompt-cached, but still metered) = thousands of requests/min, hundreds
of millions of tokens/hour. No default xAI tier allows this. And there is **no
admission control anywhere**: nothing queues, sheds, or degrades when the
provider 429s — every affected turn just fails with `model_provider_error`
(`route.ts` transport-fault branch). Cost at this volume is a first-order
design input.

### B7 — Slow burns (won't page you day 1, will bite in month 1)
- `turn_record` stores **full prompt + answer text for every turn, guest
  included, indefinite retention** (`web/src/data/repos/usage-repo.ts`,
  admin-panel feature) — fast-growing table on the hottest DB.
- Single region `iad` → 300ms+ RTT for non-US users on a streaming UX.
- `RL_MAX_ENTRIES = 20_000` ≈ the target user count — real traffic starts
  LRU-evicting *live* rate windows (window resets = allowance leaks).

---

## 3. Target design (phased; order matters)

### Phase 1 — Externalize state → stateless app tier *(highest leverage, do first)* — ✅ IMPLEMENTED 2026-07-04
Added Redis (a self-run Fly machine, `oak-gowtam-redis`, in `iad`) and moved:
- **Guest session history + sticky scope**: keyed by `session_id`, keep the 2h
  TTL (Redis `EXPIRE` replaces `BoundedStore` TTL; the LRU cap becomes
  unnecessary — Redis maxmemory-policy is the backstop). The store already sits
  behind a clean module API (`getHistory`/`appendTurn`/`trim`/
  `getSessionScope`/`setSessionScope`) — swap internals, keep the API. Note
  `getHistory`'s "returned array is live" contract dies here; callers already
  copy (`route.ts` does `[...getHistory(...)]`), but `trim`'s in-place splice
  needs a read-modify-write instead.
- **Rate limiter**: atomic `INCR` + `EXPIRE` fixed window — identical semantics
  to today's `checkRateLimit`, same key namespaces (`acct:`/`ip:`/`pub:`).
  Keep it synchronous-ish (one round-trip) at the top of the handler.
- **OTP throttle**: same treatment.

Result: any machine can serve any request; deploys stop wiping guest
conversations; rate limits stay correct at any machine count. B2, B3, and the
B7 rate-limit eviction all die here.

### Phase 2 — Scale the app tier
- VM: `performance-2x` (2 dedicated vCPUs / 4GB) per machine.
- Count: 4–8 machines, `min_machines_running = 2`, `auto_start_machines = true`
  (keep `auto_stop` off or "suspend" for the floor machines).
- Concurrency: keep `type = "connections"` (correct for SSE); raise to roughly
  `soft_limit = 300 / hard_limit = 400` per machine. Node holds thousands of
  mostly-idle SSE connections; active-stream CPU is what sizes this — validate
  with the Phase 5 load test.
- Capacity math: 6 machines × ~300 streams ≈ 1,800 concurrent turns with
  rolling-deploy headroom → covers the 500–1,500 estimate.
- Multi-region later if the audience warrants (`fly.toml` `primary_region` +
  regional machine counts; Postgres stays primary-in-iad with read strategy
  from Phase 3).

### Phase 3 — Data tier (two moves, in this order)
**3a. Cache the dex reads (Oak-specific gold).** The index is **immutable
between ingests** (ingest DELETEs + rebuilds tables — `web/src/ingest/run.ts`).
Put a read-through in-process LRU in front of the repos, keyed by an
ingest-version stamp (add a tiny `index_meta(version)` table the ingest bumps;
cache entries carry the version so a re-ingest invalidates naturally). The bulk
of tool-loop DB traffic becomes memory hits; PG load drops ~an order of
magnitude. Cheaper and more effective than scaling PG to re-serve identical
`get_pokemon` reads. (Per-machine LRU is enough — no Redis needed for this;
the data is small and identical across machines.)

**3b. Right-size Postgres.** Move to managed HA (Fly Managed Postgres, or
Neon/Supabase): ~4GB primary + replica. Put **PgBouncer in transaction mode**
in front so `machines × pool.max` stops being a connection-count time bomb
(with the bouncer, keep app `max: 10`; without it, budget
`machines × max < max_connections` explicitly). Partition `turn_record` by
month and pick a retention/archival policy NOW while the table is small
(e.g. detach-and-dump partitions > 6 months to object storage).

### Phase 4 — Admission control + the provider ceiling *(longest lead time — start the contract conversation first)*
- **Negotiate xAI enterprise limits** with concrete numbers: target concurrent
  streams, RPM, TPM. This is the item that actually decides whether prime time
  works; everything else is under our control.
- **Global turn-concurrency gate**: a Redis semaphore capping in-flight agent
  turns platform-wide (set from the negotiated provider limits). When
  saturated, return an honest "at capacity, retry in Ns" (or hold the SSE open
  and emit a queued/position event — the channel supports it) instead of
  melting the provider connection.
- **Automatic provider failover**: the three-provider seam already exists
  (`src/agent/providers/factory.ts`) but switching is a manual admin-panel
  **Settings** selection today (2026-07 — previously an `ACTIVE_MODEL` secret
  change, now retired). Add automatic per-turn fallback on sustained 429/5xx
  from the primary.
- **Cost controls**: per-account and per-IP **daily token budgets** (the
  per-minute rate limiter bounds abuse, not spend). `turn_record` already
  captures per-turn token counts — budget enforcement can read/aggregate the
  same numbers via Redis counters.

### Phase 5 — Prove it before launch
- Metrics: stream concurrency, Fly proxy queue depth, `pg.Pool` wait time,
  provider latency + 429 rate, dex-cache hit rate, Redis latency. Fly metrics +
  a Prometheus/Grafana Cloud sink is enough.
- **k6 (or similar) SSE load test** simulating the real turn shape
  (connect → receive events for ~30s → disconnect; mix in public-read GETs),
  ramped to 2–3k concurrent streams against a staging deploy **with a mocked
  provider** (so the test exercises our infra, not xAI's). Tune Phase 2
  numbers from the results.

---

## 4. What already scales fine (do NOT rework)

- SSE route returns the `Response(stream)` synchronously; the agent loop runs
  in a detached task; heartbeat keeps quiet turns alive; client-abort teardown
  is handled (`route.ts`).
- Recording (`recordTurn`), scope persistence, and signed-in history writes are
  fire-and-forget / post-answer — off the SSE critical path by design.
- The DB pool has real connect/statement/query timeouts (`db.ts`).
- Body reads are byte-capped **streaming** (`readJsonBodyWithLimit`), not
  buffered-then-checked; image caps run pre-stream.
- Guest identity for rate limiting uses `Fly-Client-IP` (not spoofable XFF)
  via `web/src/server/client-ip.ts`.
- Voice mode's WebSocket goes browser→xAI directly (server only mints tokens
  and relays tool calls) — no per-conversation socket load on our tier.
- Auth sessions, signed-in conversations, teams: already DB-backed and
  account-scoped.

The bottlenecks are almost entirely **deployment topology and where state
lives** — the cheap kind of problem. Phases 1–2 are days of work; Phase 4's
provider contract is the long-lead item to start immediately.

---

## 5. Suggested implementation order (for a future session)

1. ✅ Phase 1 (Redis state) — DONE 2026-07-04. Touched: `session-store.ts`,
   `rate-limit.ts`, `otp-throttle.ts`, `env.ts` (`REDIS_URL`), tests (Redis
   Testcontainers, per-module `*.redis.test.ts` suites).
2. Phase 3a (dex read cache) — also small, independent of Phase 1, big PG win.
3. Phase 2 (`fly.toml` + machine scale-out) — config-only once Phase 1 lands.
4. Phase 3b (managed PG + PgBouncer + `turn_record` partitioning).
5. Phase 4 (admission control, failover, budgets) — needs the xAI contract
   numbers, which should be requested at the start.
6. Phase 5 (metrics + load test) — gates the actual launch.

Per-repo convention: do the work in a worktree off `develop`
(`git worktree add ../oak-<task> -b agent/<task> develop`), verify with
`typecheck`/`lint`/`test`, merge back.
