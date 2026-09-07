# Spend Controls — Technical Design

Mode: PM
Budget Tier: hobby

Server-side admission gate on every paid agent start: **denylist by email** and a
**UTC-day turn counter in Postgres**. Both are operator-writable from the
existing admin Settings screen. Fail-closed: if the check cannot run, the model
is not called. The per-minute limiter is untouched. Clients (web, iOS, Android)
show three distinct refusal banners. Companion to `team-from-box` (disjoint
files; can ship in parallel).

No new infra. Prod Redis has no volume, so counters do **not** live there.

## Requirements Reference

`docs/features/spend-controls/requirements/requirements.md`
(SC-US-1..8, SC-AC-*, SC-BR-1..15)

## Tech Stack

Existing Oak stack only. Additions:

- One Drizzle migration (`0021_spend_controls`)
- One admission module + repo (Postgres)
- Additive admin Settings GET fields + three small write routes
- Client error-code mapping on web / iOS / Android

No new packages.

## Data Model

### `account_denylist` (new table)

Traces to SC-US-1..3, SC-BR-2/3/6/12.

| Column | Type | Notes |
|---|---|---|
| `email` | `text` PK | Normalized (trim + lowercase). Identity, not `account.id` (SC-BR-2). |
| `added_at` | `bigint` | Epoch ms. |
| `added_by` | `text` | Admin email that added it. Audit only. |

Empty at launch (SC-BR-12). No FK to `account` — blocking a not-yet-signed-up
email is allowed and still works after they register.

### `account_cap_exempt` (new table)

Traces to SC-US-9, SC-BR-16. Same shape as `account_denylist`.

| Column | Type | Notes |
|---|---|---|
| `email` | `text` PK | Normalized (trim + lowercase). Identity, not `account.id`. |
| `added_at` | `bigint` | Epoch ms. |
| `added_by` | `text` | Admin email that added it. Audit only. |

Empty at launch. No FK to `account`. Denylist still wins if an email is on
both lists. Guests are never exempt (the list is email-keyed).

### `app_setting` keys (existing table)

Traces to SC-US-4, SC-AC-4.1.

| key | value | default if missing |
|---|---|---|
| `daily_cap_signed` | decimal-integer text, ≥ 1 | `25` |
| `daily_cap_guest` | decimal-integer text, ≥ 1 | `10` |

Same audit columns (`updated_by`, `updated_at`) as `active_model`. Invalid /
missing row → launch default (not fail-closed). **DB throw** on read → fail-closed
(SC-BR-8).

### `spend_daily_usage` (new table)

Traces to SC-BR-4/5/10/11.

| Column | Type | Notes |
|---|---|---|
| `subject_key` | `text` | `acct:<accountId>` or `ip:<clientIp>` |
| `day_utc` | `text` | `YYYY-MM-DD` (UTC calendar day) |
| `admitted_count` | `integer` not null | Number of **admitted** agent starts this day |

PK `(subject_key, day_utc)`. Increment is atomic (see Interface Definitions).
No decrement. Refusals do not insert/increment.

Do **not** grant these tables to `oak_readonly`. Add `account_denylist`,
`account_cap_exempt`, and `spend_daily_usage` to `DENIED_TABLES` in
`src/data/sql-sandbox.ts`.

### `turn_record.status` (existing, text)

Widen the TypeScript union (column is already unconstrained text):

`account_denied` | `daily_limit` | `spend_check_failed`

in addition to today's `rate_limited`. Same recording shape as rate-limit rows
(null model, null answer, prompt stored). Traces to requirements
“Recording / operator visibility.”

## Component Design

### 1. `spend-control` (server admission)

- **Responsibility:** One function, `admitAgentTurn`, that enforces denylist then
  cap-exempt then daily cap then returns a reservation (the increment). Callers
  never duplicate SQL.
- **Location:** `web/src/server/spend-control.ts`
- **Depends on:** `spend-repo`, `isAdmin`, `clientIp` (callers pass the IP).
- **Failure:** any thrown DB error → `{ ok: false, code: "spend_check_failed" }`
  (fail-closed). Admins short-circuit `{ ok: true, skipped: "admin" }` with no
  increment. Cap-exempt signed-in accounts `{ ok: true, skipped: "cap_exempt" }`
  and still increment via `recordAdmit` (no cap).

### 2. `spend-repo` (Postgres)

- **Responsibility:** denylist CRUD, cap-exempt CRUD, cap get/set, atomic
  daily increment (`tryAdmit`) and unbounded increment (`recordAdmit`).
- **Location:** `web/src/data/repos/spend-repo.ts`
- **Depends on:** `@/data/db` via **dynamic import per call** (same pattern as
  `settings-repo.ts` — keep this module out of the static graph of route
  modules that already dynamic-import to avoid build-time `env` throws).
- **Does not** know HTTP or admin gating.

### 3. Chat / Teams Assistant / voice route adapters

- **Responsibility:** call `admitAgentTurn` **after** auth, **before** the
  per-minute limiter? Requirements order is denylist → daily cap → per-minute.
  Implement that order. Record a `turn_record` on denylist/cap/check-failed
  (fire-and-forget, same as today's rate-limit branch). Map the result to HTTP.
- **Locations:**
  - `web/src/app/api/chat/route.ts`
  - `web/src/app/api/teams/assistant/route.ts`
  - `web/src/app/api/voice/token/route.ts` (must run **before** xAI mint)
  - `web/src/app/api/voice/tool/route.ts` (denylist only, no increment)
  - `web/src/app/api/voice/transcript/route.ts` (denylist only, no increment)

### 4. Admin Settings spend surface

- **Responsibility:** operator reads/writes caps and denylist without a deploy.
- **Locations:** extend `GET /api/admin/settings`; new write routes under
  `/api/admin/spend/*`; `SettingsView` + page integrator.
- **Gating:** `requireAdminRequest` first, same as current settings.

### 5. Client banners

- **Responsibility:** distinguish `account_denied` / `daily_limit` /
  `rate_limited`; show the **server `message`**; no Retry on denylist or daily
  cap.
- **Locations:** web `ChatThread` (+ assistant error UI), iOS/Android `OakError`
  + Chat / Teams Assistant / Voice view-models.

## API Design

All JSON errors stay `{ code, message, ...extra }` plus optional headers.
Voice token/tool/transcript today use `{ error, message }` — **send both
`code` and `error`** set to the same slug so existing voice clients and the
chat envelope both work.

### Admission HTTP (chat, Teams Assistant)

| Situation | Status | `code` | Extra | Headers |
|---|---|---|---|---|
| Denylisted | **403** | `account_denied` | — | — |
| At/over daily cap | **429** | `daily_limit` | `reset_at` ISO-8601 UTC midnight | `Retry-After: <seconds>` |
| Check threw | **503** | `spend_check_failed` | — | — |
| Per-minute (unchanged) | 429 | `rate_limited` | — | `Retry-After` |

Chat copy (SC-AC-6.1 / SC-AC-5.2):

- `account_denied`: `This account can't use chat.`
- Teams Assistant: `This account can't use the teams assistant.`
- Voice: `This account can't use voice.`
- `daily_limit`: `Daily limit reached. Try again tomorrow (resets at <reset_at> UTC).`

### `POST /api/voice/token`

Run `admitAgentTurn` **before** calling xAI. Same 403/429/503. On refuse, do
not mint a token (SC-BR-1, voice-cost constraint).

**Voice counting (accepted tradeoff):** increment **once per successful token
mint** (one voice session). Tool + transcript routes check **denylist only**
and do not increment. An open realtime WS can still speak after mint; Oak
cannot meter xAI WS tokens per utterance. Daily voice spend is therefore
bounded by **sessions**, not utterances. Chat and Teams Assistant remain
per-request.

### `GET /api/admin/settings` (additive)

`AdminSettingsResponse` gains:

```ts
spend: {
  signedCap: number;
  guestCap: number;
  denylist: Array<{
    email: string;
    addedAt: number;
    addedBy: string | null;
  }>;
  capExempt: Array<{
    email: string;
    addedAt: number;
    addedBy: string | null;
  }>;
}
```

Existing model fields unchanged. `requireAdminRequest` first.

### `POST /api/admin/spend/caps`

Body: `{ signedCap: number, guestCap: number }` (integers ≥ 1).
400 `invalid_request` otherwise (SC-AC-4.3).
200 → same `spend` object as GET.
Writes `daily_cap_signed` / `daily_cap_guest` with `updated_by = admin email`.

### `POST /api/admin/spend/denylist`

Body: `{ email: string }`. Normalize. 400 if empty/invalid email shape.
409 `admin_exempt` if the email is on `ADMIN_EMAILS` (SC-AC-1.3).
200 `{ ok: true, spend }` (idempotent add).

### `DELETE /api/admin/spend/denylist`

Body or query: `{ email: string }`. 200 even if absent (idempotent remove).

### `POST /api/admin/spend/cap-exempt`

Body: `{ email: string }`. Normalize. 400 if empty/invalid email shape.
Admin emails are allowed (already uncapped; no 409). 200 `{ ok: true, spend }`
(idempotent add).

### `DELETE /api/admin/spend/cap-exempt`

Body or query: `{ email: string }`. 200 even if absent (idempotent remove).

## File Structure

**Create**

- `web/drizzle/0021_spend_controls.sql` — `account_denylist` + `spend_daily_usage` + indexes
- `web/drizzle/0022_account_cap_exempt.sql` — `account_cap_exempt`
- `web/src/data/repos/spend-repo.ts` — denylist + cap-exempt + caps + atomic increment
- `web/src/app/api/admin/spend/cap-exempt/route.ts`
- `web/src/data/repos/spend-repo.oracle.test.ts`
- `web/src/server/spend-control.ts` — `admitAgentTurn`
- `web/src/server/spend-control.test.ts` — admin skip, order, fail-closed (repo mocked)
- `web/src/app/api/admin/spend/caps/route.ts`
- `web/src/app/api/admin/spend/denylist/route.ts`
- `web/src/components/admin/SpendControlsView.tsx` — pure/controlled
- `web/src/components/admin/SpendControlsView.test.tsx`

**Modify**

- `web/src/data/schema.ts` — new tables
- `web/src/data/schema.test.ts` — table names present
- `web/src/data/sql-sandbox.ts` — `DENIED_TABLES`
- `web/src/data/repos/usage-repo.ts` — status union
- `web/src/lib/admin/admin-types.ts` — `AdminSettingsResponse.spend`, spend wire types, `TurnRecordStatus` union
- `web/src/app/api/admin/settings/route.ts` — include `spend` on GET
- `web/src/app/admin/settings/page.tsx` — load/save spend controls
- `web/src/app/api/chat/route.ts` — admit before per-minute; record
- `web/src/app/api/chat/route.test.ts`
- `web/src/app/api/teams/assistant/route.ts` + `route.test.ts`
- `web/src/app/api/voice/token/route.ts` + `route.test.ts`
- `web/src/app/api/voice/tool/route.ts`
- `web/src/app/api/voice/transcript/route.ts`
- `web/src/data/repos/admin-analytics-repo.ts` — count new statuses in errors taxonomy (additive categories)
- `web/src/components/admin/TurnDetail.tsx` — labels for new statuses
- `web/src/components/chat/ChatThread.tsx` — banner copy from server message; hide Retry for denied/cap
- `web/src/lib/sse/sse-client.ts` — only if needed to plumb `reset_at` (code+message already flow)
- `ios/OakApp/Networking/OakError.swift` — parse 403 `account_denied`, 429 `daily_limit` vs `rate_limited`
- `ios/OakApp/Features/Chat/ChatViewModel.swift` — banners, `isRetryable: false`
- `ios/OakApp/Features/Teams/` assistant error mapping (same cases)
- `ios/OakAppTests/` error-mapping tests
- `android/.../OakError.kt` + `ChatViewModel.kt` + assistant/voice banners + unit tests

**Do not modify:** `web/src/server/rate-limit.ts` (SC-BR-7).

## Interface Definitions

```ts
/** UTC calendar day `YYYY-MM-DD`. */
export function utcDay(nowMs?: number): string;

/** Epoch ms of the next UTC midnight after `nowMs`. */
export function nextUtcMidnightMs(nowMs?: number): number;

export type SpendSubject =
  | { kind: "account"; accountId: string; email: string }
  | { kind: "guest"; ip: string };

export type SpendRefuseCode =
  | "account_denied"
  | "daily_limit"
  | "spend_check_failed";

export type AdmitResult =
  | { ok: true; skipped?: "admin" | "cap_exempt" }
  | {
      ok: false;
      code: SpendRefuseCode;
      message: string;      // user-facing, surface-specific
      resetAt?: string;     // ISO, daily_limit only
      retryAfterMs?: number;
    };

export type AgentSurface = "chat" | "teams_assistant" | "voice";

/**
 * Denylist (signed-in) → cap-exempt (signed-in) → daily cap → admit.
 * Admins (`isAdmin(account)`) always `{ ok: true, skipped: "admin" }`.
 * Cap-exempt accounts `{ ok: true, skipped: "cap_exempt" }` and still
 * increment via `recordAdmit`. Guests: cap only, key `ip:<ip>`.
 * `surface` selects the denylist copy.
 */
export function admitAgentTurn(input: {
  subject: SpendSubject | { kind: "account"; accountId: string; email: string };
  isAdmin: boolean;
  surface: AgentSurface;
  nowMs?: number;
}): Promise<AdmitResult>;

/** Denylist-only (voice tool/transcript). No increment. */
export function assertNotDenylisted(email: string): Promise<AdmitResult>;
```

Repo:

```ts
export function getDenylist(): Promise<Array<{ email: string; addedAt: number; addedBy: string | null }>>;
export function addDenylistEmail(email: string, addedBy: string): Promise<void>; // normalized, idempotent
export function removeDenylistEmail(email: string): Promise<void>; // idempotent
export function isDenylisted(email: string): Promise<boolean>;

export function getCapExempt(): Promise<Array<{ email: string; addedAt: number; addedBy: string | null }>>;
export function addCapExemptEmail(email: string, addedBy: string): Promise<void>; // normalized, idempotent
export function removeCapExemptEmail(email: string): Promise<void>; // idempotent
export function isCapExempt(email: string): Promise<boolean>;

export function getCaps(): Promise<{ signedCap: number; guestCap: number }>; // defaults 25/10
export function setCaps(caps: { signedCap: number; guestCap: number }, updatedBy: string): Promise<void>;

/**
 * Atomically increment today's counter if `count < cap`.
 * Returns `{ admitted: true, count }` or `{ admitted: false, count }`.
 */
export function tryAdmit(subjectKey: string, dayUtc: string, cap: number): Promise<{ admitted: boolean; count: number }>;

/** Unbounded increment for cap-exempt admissions (SC-BR-16). */
export function recordAdmit(subjectKey: string, dayUtc: string): Promise<{ count: number }>;
```

`tryAdmit` SQL (Postgres):

```sql
INSERT INTO spend_daily_usage (subject_key, day_utc, admitted_count)
VALUES ($1, $2, 1)
ON CONFLICT (subject_key, day_utc)
DO UPDATE SET admitted_count = spend_daily_usage.admitted_count + 1
WHERE spend_daily_usage.admitted_count < $3
RETURNING admitted_count;
```

Empty `RETURNING` → not admitted (already at cap). Do not increment on that path.

Subject keys: `acct:${accountId}` and `ip:${clientIp}` — **not** the same string
as the per-minute limiter's Redis key prefix, but the same identity values
(SC-BR-5).

Chat route insertion point: after `getCurrentAccount()`, **before**
`checkRateLimit`. Build `subject` from account vs `clientIp(req)`. Pass
`isAdmin: account ? isAdmin(account) : false`.

## Implementation Phases

### Phase 1 — Schema + repo + admission core

- What: migration 0021, schema, sql-sandbox denylist, `spend-repo`,
  `spend-control`, unit/oracle tests.
- Depends on: nothing
- Produces: `admitAgentTurn` usable by routes
- Parallel: none — sequential
- Test focus: normalize email; admin skip; guest vs account keys independent;
  atomic increment at cap−1 / at cap / concurrent (two increments from 24 with
  cap 25 → one admitted); invalid cap writes rejected in repo; missing
  `app_setting` rows → 25/10; thrown DB → `spend_check_failed`; ADMIN_EMAILS
  cannot be inserted.
- Requirement refs: SC-BR-2, SC-BR-4, SC-BR-5, SC-BR-6, SC-BR-8, SC-BR-10,
  SC-BR-11, SC-BR-13, SC-AC-1.3, SC-AC-4.1, SC-AC-4.3, SC-AC-8.1

### Phase 2 — Route admission + recording

- What: chat, teams assistant, voice token/tool/transcript; `usage-repo` status
  union; fire-and-forget `recordTurn` on refuse (status = the `code`).
- Depends on: Phase 1
- Produces: HTTP 403/429/503 with documented bodies; no model/xAI mint on refuse
- Parallel: none — these routes are the shared admission seam (one implementer)
- Test focus: chat route tests — denylisted 403 no runtime import; 25th admitted
  26th 429 with `reset_at`; admin 26th admitted; guest IP 11th 429; rate_limited
  still works when under daily cap; voice token test does not call xAI mint on
  403. Teams assistant same codes.
- Requirement refs: SC-US-5, SC-US-6, SC-US-7, SC-AC-5.1, SC-AC-5.2, SC-AC-5.3,
  SC-AC-5.5, SC-AC-6.1, SC-AC-6.2, SC-AC-6.3, SC-AC-6.4, SC-AC-7.1, SC-AC-7.2,
  SC-AC-7.3, SC-AC-7.4, SC-BR-1, SC-BR-3, SC-BR-7, SC-BR-9, SC-BR-14

### Phase 3 — Admin panel

- What: GET settings includes `spend`; write routes; `SpendControlsView` + page
  wiring; admin-types; TurnDetail labels; errors taxonomy additive counts.
- Depends on: Phase 1 (repo). Can run **after or in parallel with Phase 2**
  (disjoint files from Phase 2).
- Produces: operator can add/remove emails and change caps with no deploy
- Parallel: **with Phase 2** — owns admin files only (see Manifest)
- Test focus: settings GET shape; POST caps validation; denylist add 409 on
  admin email; component tests for SpendControlsView (jsdom, fixtures only).
- Requirement refs: SC-US-1, SC-US-2, SC-US-3, SC-US-4, SC-AC-1.1, SC-AC-1.4,
  SC-AC-2.1, SC-AC-2.2, SC-AC-3.1, SC-AC-3.2, SC-AC-4.2, SC-BR-12

### Phase 4 — Client banners (web + iOS + Android)

- What: map codes to server message; hide Retry for denied/cap; iOS/Android
  `OakError` must **not** collapse `daily_limit` into `rateLimited` (today every
  429 is rateLimited). Parse body `code` on 429/403.
- Depends on: Phase 2 (codes exist)
- Produces: SC-AC-5.4 / SC-AC-6.5 on all three clients
- Parallel: web / iOS / Android are **disjoint** and may run as three slices
- Test focus: web ChatThread testids; iOS OakError.validate tests; Android
  OakError.validate tests; view-model banner copy; `isRetryable == false`.
- Requirement refs: SC-AC-5.4, SC-AC-6.5, SC-BR-14, SC-BR-15

### Integration checkpoints

1. **After Phase 1+2:** `admitAgentTurn` + chat route test proves no model call
   on refuse (API↔data).
2. **After Phase 3:** admin Settings round-trip changes caps/denylist that Phase 2
   routes honor (UI↔API↔admission).
3. **After Phase 4:** web/iOS/Android show distinct copy for the three 429/403
   codes (auth/cross-layer + clients).
4. **Final:** denylist empty at boot; 25/10 defaults; per-minute limiter
   regression green.

## Build Manifest

```yaml
commands:
  test: "cd web && npm test"
  test_one: "cd web && npx vitest run <file>"
  test_components: "cd web && npm run test:components"
  typecheck: "cd web && npm run typecheck"
  lint: "cd web && npm run lint"
  build: "cd web && npm run build"
  ios_test: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'"
  android_test: "cd android && ./gradlew --no-daemon :app:testDebugUnitTest"
phases:
  - id: sc-p1
    name: Schema + repo + admission core
    depends_on: []
    owns:
      - "web/drizzle/0021_spend_controls.sql"
      - "web/src/data/schema.ts"
      - "web/src/data/schema.test.ts"
      - "web/src/data/sql-sandbox.ts"
      - "web/src/data/repos/spend-repo.ts"
      - "web/src/data/repos/spend-repo.oracle.test.ts"
      - "web/src/server/spend-control.ts"
      - "web/src/server/spend-control.test.ts"
    shared: []
    requirement_refs: [SC-BR-2, SC-BR-4, SC-BR-5, SC-BR-6, SC-BR-8, SC-BR-10, SC-BR-11, SC-BR-13, SC-AC-1.3, SC-AC-4.1, SC-AC-4.3, SC-AC-8.1]
    test_focus: "atomic increment, admin skip, fail-closed, cap defaults"
  - id: sc-p2
    name: Route admission + recording
    depends_on: [sc-p1]
    owns:
      - "web/src/app/api/chat/route.ts"
      - "web/src/app/api/chat/route.test.ts"
      - "web/src/app/api/teams/assistant/route.ts"
      - "web/src/app/api/teams/assistant/route.test.ts"
      - "web/src/app/api/voice/token/route.ts"
      - "web/src/app/api/voice/token/route.test.ts"
      - "web/src/app/api/voice/tool/route.ts"
      - "web/src/app/api/voice/transcript/route.ts"
      - "web/src/data/repos/usage-repo.ts"
    shared: []
    requirement_refs: [SC-US-5, SC-US-6, SC-US-7, SC-AC-5.1, SC-AC-5.2, SC-AC-5.3, SC-AC-6.1, SC-AC-6.2, SC-AC-6.3, SC-BR-1, SC-BR-7]
    test_focus: "403/429/503 before model; voice mint skipped; rate_limited unchanged"
  - id: sc-p3
    name: Admin panel
    depends_on: [sc-p1]
    owns:
      - "web/src/lib/admin/admin-types.ts"
      - "web/src/app/api/admin/settings/route.ts"
      - "web/src/app/api/admin/spend/caps/route.ts"
      - "web/src/app/api/admin/spend/denylist/route.ts"
      - "web/src/app/admin/settings/page.tsx"
      - "web/src/components/admin/SpendControlsView.tsx"
      - "web/src/components/admin/SpendControlsView.test.tsx"
      - "web/src/components/admin/TurnDetail.tsx"
      - "web/src/data/repos/admin-analytics-repo.ts"
    shared: []
    requirement_refs: [SC-US-1, SC-US-2, SC-US-3, SC-US-4, SC-AC-2.2, SC-AC-3.1, SC-AC-4.2, SC-BR-12]
    test_focus: "admin GET/POST spend; 409 admin_exempt; empty denylist UI"
  - id: sc-p4
    name: Client banners
    depends_on: [sc-p2]
    owns:
      - "web/src/components/chat/ChatThread.tsx"
      - "ios/OakApp/Networking/OakError.swift"
      - "ios/OakApp/Features/Chat/ChatViewModel.swift"
      - "android/app/src/main/kotlin/ai/gowtam/oak/networking/OakError.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ChatViewModel.kt"
    shared: []
    requirement_refs: [SC-AC-5.4, SC-AC-6.5, SC-BR-14, SC-BR-15]
    test_focus: "three distinct banners; daily_limit not mapped as rateLimited"
integration_checkpoints:
  - { after: [sc-p1, sc-p2], name: API↔admission, verifies: "refuse before model/xAI" }
  - { after: [sc-p3], name: Admin↔admission, verifies: "panel write is next admission" }
  - { after: [sc-p4], name: Clients, verifies: "web/iOS/Android distinct copy" }
```

Phase 4 `owns` lists the primary files; the implementer also updates the
matching unit tests next to those files and any Teams Assistant / Voice
view-models that switch on `OakError.rateLimited` the same way Chat does.
Those extra view-models stay in the **same** Phase 4 worker (not a second
parallel slice) so `OakError` is not dual-owned.

Phase 2 and Phase 3 are parallel after Phase 1. Both add the same three
status literals (`account_denied`, `daily_limit`, `spend_check_failed`) to
**already-separate** unions (`usage-repo` vs `admin-types`); do not extract a
shared module in this feature.

## Technical Decisions

- **SC-AD-1 — Postgres for denylist, caps, and counters.** Prod Redis has no
  volume (ephemeral). Fail-closed (SC-BR-8) plus durable denylist cannot live
  only in Redis. Chat already requires Postgres, so a DB outage fail-closes
  naturally. Alternative (Redis counters) was rejected: Redis blip would block
  chat while Postgres is healthy, and a Redis restart would reset the day.
- **SC-AD-2 — Increment-at-admit, never decrement.** In-flight + completed is
  just `admitted_count`. Matches SC-BR-9/11. Stopped/failed turns still count
  (they already cost).
- **SC-AD-3 — Denylist key is email.** Survives re-signup (SC-BR-2). Counter key
  is `acct:<id>` / `ip:<ip>` (stable for a session, independent pools).
- **SC-AD-4 — 403 vs 429.** Denylist is authorization (403). Daily cap is a
  quota (429 + Retry-After). Per-minute stays 429 `rate_limited`. Three codes
  for three banners (SC-AC-6.5).
- **SC-AD-5 — Voice meters sessions, not utterances.** Token mint is the last
  point before a billable xAI WS. Transcript increment would not stop an
  already-open WS. Documented limitation.
- **SC-AD-6 — Do not change `rate-limit.ts`.** SC-BR-7.
- **SC-AD-7 — Empty denylist at launch.** Operator adds
  `jogyehyeong199@gmail.com` in the panel after deploy (SC-BR-12). No seed SQL.
- **SC-AD-8 — Settings GET is additive.** One fetch for the page. Writes are
  separate URLs so `{ model }` POST stays unchanged.

## Deployment & Infrastructure

Budget Tier: hobby

**Build & Test Commands**

- test: `cd web && npm test`
- test_one: `cd web && npx vitest run <file>`
- typecheck: `cd web && npm run typecheck`
- lint: `cd web && npm run lint`
- build: `cd web && npm run build`
- ios: `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`
- android: `cd android && ./gradlew --no-daemon :app:testDebugUnitTest`

Migration ships with the next `fly deploy` (`release_command = node migrate.mjs`).
No new Fly apps, no Redis changes, no extra monthly cost (**$0** infra).

**Hosting / runtime** — existing single Fly machine.
**Database** — existing Fly Postgres; two small tables.
**Caching** — none for spend state.
**Observability** — existing pino; log `event: spend_refused` with `code` +
`subject_key` (not raw email in guest path).
**Secrets** — none.
**Environments** — prod + local/dev Postgres as today.

## UI Reference

Follow existing admin Settings patterns (`SettingsView` — pure, controlled,
jsdom-tested) and existing chat error banners. Design system:
`docs/design-system/`. iOS/Android banners match current rate-limit chrome
with different copy and `isRetryable: false`.

## Unresolved from Requirements

None blocking. Voice session-vs-utterance metering is SC-AD-5 (accepted).
Guest default **10** is the launch default from discovery.
