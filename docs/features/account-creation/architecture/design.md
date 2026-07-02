# Account Creation (Email + OTP Auth) — Technical Design

## Overview

Mode: PM
Budget Tier: hobby

This design adds **passwordless email-OTP accounts** to Oak while keeping an
**anonymous guest mode**. A single unified flow (enter email → 6-digit code →
verify) both creates accounts and logs users in. Auth is layered as a **separate,
cookie-based concern** that is orthogonal to the existing conversation
`session_id` and to the agent itself — so the agent, tools, and SSE contract are
untouched, and the guest→user conversation carries over for free (the client
keeps its `session_id` and `turns[]` across sign-in).

The auth layer is **hand-rolled** (no auth library), consistent with Oak's
existing hand-rolled rate-limiter, session store, and SSE client. Three new
Postgres tables (`account`, `auth_session`, `otp_code`) hold identity; an opaque
session token lives in an httpOnly cookie (its SHA-256 hash stored server-side);
OTP codes are HMAC-hashed at rest. Transactional email goes through **Resend** in
production and a **console transport** in dev/test (no key required, never sends
real mail). The chat route gains **tiered rate limits** (per-account for signed-in
users, per-IP for guests).

Key approach summary:
- **Identity ≠ conversation.** Auth identity is a cookie/account; the conversation
  history and rate-limit key stay the client `session_id` for guests, account id
  for users. Different axes → thread preservation is automatic.
- **Non-enumerating unified flow.** `request-code` responds identically whether or
  not the email is registered; create-vs-login is decided only after verify.
- **Durable code lifecycle, in-memory request throttle.** The `otp_code` row holds
  expiry / single-use / attempt-lockout / resend-cooldown durably; per-IP and
  per-email *request* caps live in-process (mirrors the existing rate-limiter,
  fine for a single-instance hobby deploy).

## Requirements Reference

- Business requirements: `docs/features/account-creation/requirements/requirements.md`
- Refines backlog item **B-1** (`docs/backlog.md`); supersedes the "single user /
  no auth" stance in `docs/requirements/requirements.md` (§Non-Functional, §Out of
  Scope) for the auth dimension.
- No `agent-design/` pass is needed — this feature does not touch agent internals
  (BR-A11).

## Tech Stack

Existing stack unchanged: TypeScript (strict, ESM, `@/`→`src/`), Next.js 15 App
Router, Drizzle ORM + node-postgres, Zod, pino, Vitest (node + jsdom projects).

Additions:
- **Resend** for transactional email — wired via a tiny `fetch`-based client (no
  new npm dependency; matches the codebase's lean-deps posture). A `console`
  transport is used when `RESEND_API_KEY` is absent.
- **Node built-in `crypto`** only (`randomBytes`, `randomInt`, `createHmac`,
  `timingSafeEqual`) for token/code generation and hashing — no new crypto deps.
- New env vars: `AUTH_SECRET`, `RESEND_API_KEY` (optional), `EMAIL_FROM`.

No other new libraries.

## Data Model

Three new tables in `src/data/schema.ts`. They are **not** format-scoped (auth is
global, unlike the Pokédex index tables). Columns are snake_case; epoch-ms
timestamps are `bigint` with `mode: "number"` (consistent with the existing
`fetched_at` / `last_success_at` convention — int4 overflows).

### `account` — one row per registered user

| column       | type            | notes                                              |
|--------------|-----------------|----------------------------------------------------|
| `id`         | text PK         | UUID (`crypto.randomUUID()`)                        |
| `email`      | text NOT NULL   | normalized (trim + lowercase); **UNIQUE**          |
| `created_at` | bigint NOT NULL | epoch ms                                           |

Constraints/indexes: unique index on `email` (enforces BR-A1 "exactly one account
per email" and powers login lookup).

### `auth_session` — one row per active device session

| column        | type            | notes                                             |
|---------------|-----------------|---------------------------------------------------|
| `id`          | text PK         | UUID                                              |
| `token_hash`  | text NOT NULL   | SHA-256 hex of the opaque cookie token; **UNIQUE**|
| `account_id`  | text NOT NULL   | → `account.id`                                    |
| `created_at`  | bigint NOT NULL | epoch ms                                          |
| `expires_at`  | bigint NOT NULL | epoch ms (created_at + 30 days)                   |

Indexes: unique on `token_hash` (resolve-on-request), index on `account_id`
(enumerate/revoke a user's sessions later), index on `expires_at` (lazy cleanup
sweep). The raw token is **never stored** — only its hash (BR-A2, PII/security).

### `otp_code` — at most one active code per email (upsert by email)

| column        | type            | notes                                                     |
|---------------|-----------------|-----------------------------------------------------------|
| `email`       | text PK         | normalized; PK enforces "latest code supersedes" (BR-A5)  |
| `code_hash`   | text NOT NULL   | `HMAC-SHA256(AUTH_SECRET, email + ":" + code)` hex        |
| `created_at`  | bigint NOT NULL | epoch ms (drives the resend cooldown)                     |
| `expires_at`  | bigint NOT NULL | epoch ms (created_at + 10 min, BR-A3)                     |
| `attempts`    | integer NOT NULL| wrong-attempt counter; lockout at 5 (BR-A4)               |
| `consumed_at` | bigint NULL     | set on successful verify → single-use (BR-A3)            |

`email` as PK means issuing a new code is an **upsert** that overwrites the prior
row (resets `attempts`/`consumed_at`), so only the most recent code is ever valid
(BR-A5). The plaintext code is never stored/logged; HMAC with a server secret
prevents precomputation of the 10⁶ possible codes from a DB leak.

### Relationships (ERD sketch)

```
account 1 ──── * auth_session     (account_id → account.id)
account 0..1 ─ … otp_code         (linked by email, not FK — a code can exist
                                    before the account does, on first signup)
```

`otp_code` deliberately has **no FK** to `account` — codes are issued by email
before an account exists (first-time signup), so the link is by normalized email.

## Component Design

Auth DB access lives in a repo (the codebase's "repos are the sole Postgres
readers" rule); orchestration, crypto, sessions, throttling, and email live under
`src/server/auth/`. Like `resolve-index.ts`, the auth repo reads the `@/data/db`
**singleton** directly (it is `server-only`, used only by the Next server, never by
the `tsx` ingest/eval/migrate scripts).

- **`accounts-repo` (`src/data/repos/accounts-repo.ts`)** — async Postgres
  reads/writes for all three tables. Sole DB reader for auth. Imports the `db`
  singleton (mirrors `resolve-index.ts`). No business logic.
- **`otp` (`src/server/auth/otp.ts`)** — pure helpers: `generateCode()` (6-digit
  via `crypto.randomInt`), `hashCode(email, code)` (HMAC), constant-time compare.
- **`sessions` (`src/server/auth/sessions.ts`)** — opaque token generation,
  SHA-256 hashing, session create/resolve/revoke, and the cookie name + set/clear
  helpers (via `next/headers` `cookies()`).
- **`otp-throttle` (`src/server/auth/otp-throttle.ts`)** — in-memory per-email +
  per-IP request throttle (resend cooldown + hourly caps + verify-attempt-per-IP).
  Mirrors `rate-limit.ts` (Map, fixed window, resets on restart — acceptable for
  hobby single-instance).
- **`auth-service` (`src/server/auth/auth-service.ts`)** — orchestration. Owns the
  non-enumerating `requestCode` and the `verifyCode` (which decides create-vs-login,
  consumes the code, and issues a session). Returns discriminated-union results
  (never throws in-domain; mirrors `RateLimitResult` / `Result`).
- **`current-user` (`src/server/auth/current-user.ts`)** — `getCurrentAccount()`:
  reads the cookie via `next/headers`, resolves the session → `Account | null`.
  Used by the chat route and auth routes.
- **`email/transport` (`src/server/auth/email/`)** — `EmailTransport` interface +
  `getEmailTransport()` factory (console when no `RESEND_API_KEY`, else Resend) +
  the two implementations.
- **`rate-limit` (`src/server/rate-limit.ts`, modified)** — generalized to take an
  arbitrary key + a chosen config so the chat route can key by account or IP with
  tiered configs.
- **Auth API routes (`src/app/api/auth/*`)** — thin HTTP adapters over
  `auth-service` / `sessions`.
- **Frontend (`src/components/auth/*`, `src/lib/auth-client.ts`)** — the two-step
  dialog, the header menu, and the fetch helpers.

## API Design

All auth routes are `runtime = "nodejs"`, return plain JSON (mirroring the chat
route's `jsonError` helper), and never reveal account existence on the request
path (BR-A1). The session cookie is `oak_session`: httpOnly, `SameSite=Lax`,
`Secure` in production, `Path=/`, `Max-Age` 30 days.

### `POST /api/auth/request-code`
- Body: `{ email: string }`.
- 400 `invalid_email` if syntactically invalid.
- Throttle (`otp-throttle`): per-email cooldown (60s) + per-email hourly cap (5) +
  per-IP hourly cap (20). On exceed → **429** `rate_limited` + `Retry-After`.
- Else: issue/upsert the code, send via `EmailTransport`. On email send failure →
  **502** `email_failed` (user can retry; not enumeration).
- **Always 200 `{ ok: true }`** otherwise — identical whether or not the email is
  registered (BR-A1, AC-2.2). Client advances to the code step.

### `POST /api/auth/verify`
- Body: `{ email: string, code: string }`.
- Per-IP verify throttle (20 / 10 min) bounds cross-code online brute force → 429.
- Load `otp_code` by email. Branches (all 400 with a distinct `error`):
  - missing / expired / consumed → `invalid_or_expired` (AC-2.6).
  - `attempts >= 5` → `too_many_attempts` (BR-A4; must request a new code).
  - HMAC mismatch → increment `attempts`, `invalid_code` (+ `attempts_remaining`)
    (AC-2.5).
- On match: mark `consumed_at`; **find-or-create** account by email (`created`
  flag); issue a session; `Set-Cookie`. → **200** `{ ok: true, email, created }`
  (AC-2.3, AC-2.4).

### `POST /api/auth/signout`
- Reads the cookie, revokes the session row, clears the cookie. **200** `{ ok: true }`
  (idempotent — no/!valid cookie still 200). (AUTH-US-5, AC-5.1.)

### `GET /api/auth/me`
- Resolves the cookie → **200** `{ signedIn: true, email }` or `{ signedIn: false }`.
  Lets the client render auth state on mount (the page is a client component).

### `POST /api/chat` (modified)
- Before the rate-limit gate, resolve the account from the cookie
  (`getCurrentAccount()`).
- Rate-limit key + config:
  - signed in → key `acct:<id>`, **SIGNED_IN_CONFIG** (60 / 60s).
  - guest → key `ip:<clientIp>`, **GUEST_CONFIG** (20 / 60s, today's value).
- The conversation `session_id` (body) and the in-memory conversation store are
  **unchanged** for both guests and users — so the on-screen thread persists across
  sign-in (BR-A10, AUTH-US-6). Agent context, tools, Champions mode: untouched
  (BR-A11). Input-length cap unchanged (2000).

`clientIp` (shared helper `src/server/client-ip.ts`) is derived from a source the
client cannot forge: `Fly-Client-IP` (the Fly edge's authoritative, unspoofable
client address) first, then the **trusted-proxy** `X-Forwarded-For` hop — the
rightmost hop the proxy appended, under the documented single-reverse-proxy
assumption (`TRUSTED_PROXY_HOPS = 1`) — then `X-Real-IP`, else `"unknown"`. The
leftmost XFF hop is client-supplied and deliberately ignored (assessment finding
S1: trusting it let a forged `X-Forwarded-For` defeat the rate limit). This value
keys abuse-bounding throttles only — never authorization.

## File Structure

```
src/
├── data/
│   ├── schema.ts                         — MODIFY: add account, auth_session, otp_code tables
│   └── repos/
│       └── accounts-repo.ts              — NEW: sole Postgres reader/writer for the 3 auth tables
│                                            (imports the @/data/db singleton, like resolve-index.ts)
├── server/
│   ├── rate-limit.ts                     — MODIFY: generalize key+config; export GUEST_CONFIG / SIGNED_IN_CONFIG
│   └── auth/
│       ├── otp.ts                        — NEW: generateCode(), hashCode(), timingSafeEqualHex()
│       ├── sessions.ts                   — NEW: token gen/hash, create/resolve/revoke, cookie helpers
│       ├── otp-throttle.ts               — NEW: in-memory per-email + per-IP request/verify throttle
│       ├── auth-service.ts               — NEW: requestCode(), verifyCode() orchestration (non-enumerating)
│       ├── current-user.ts               — NEW: getCurrentAccount() from the request cookie
│       └── email/
│           ├── transport.ts              — NEW: EmailTransport interface + getEmailTransport() factory
│           ├── resend-transport.ts       — NEW: fetch-based Resend client
│           └── console-transport.ts      — NEW: dev/test transport (logs code; records for test capture)
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── request-code/route.ts     — NEW: POST issue+email code (always-200 non-enumerating)
│   │   │   ├── verify/route.ts           — NEW: POST verify → create-or-login → set cookie
│   │   │   ├── signout/route.ts          — NEW: POST revoke + clear cookie
│   │   │   └── me/route.ts               — NEW: GET current auth state
│   │   └── chat/route.ts                 — MODIFY: resolve account, tiered rate-limit key/config
│   └── page.tsx                          — MODIFY: fetch auth state, render AuthMenu, preserve thread on sign-in
├── components/
│   └── auth/
│       ├── AuthDialog.tsx                — NEW: two-step email→code dialog (states, resend timer, errors)
│       └── AuthMenu.tsx                  — NEW: header control — "Sign in" (guest) / email + Sign out (user)
├── lib/
│   └── auth-client.ts                    — NEW: requestCode/verifyCode/signOut/fetchMe fetch helpers
└── env.ts                                — MODIFY: add AUTH_SECRET, RESEND_API_KEY?, EMAIL_FROM

drizzle/
└── 0001_*.sql                            — NEW: generated migration for the 3 auth tables

Tests (co-located, following existing infixes):
  src/data/repos/accounts-repo.test.ts            (oracle vs Testcontainers schema)
  src/server/auth/otp.test.ts                      (pure unit)
  src/server/auth/sessions.test.ts                 (oracle; installAsSingleton)
  src/server/auth/otp-throttle.test.ts             (unit, injectable clock)
  src/server/auth/auth-service.test.ts             (integration; installAsSingleton + capturing transport)
  src/server/auth/email/transport.test.ts          (factory selection; resend mock-fetch; console capture)
  src/app/api/auth/auth-routes.integration.test.ts (full HTTP flow)
  src/components/auth/AuthDialog.test.tsx           (jsdom, mocked fetch)
  src/components/auth/AuthMenu.test.tsx             (jsdom, mocked fetch)
```

## Interface Definitions

Biased to high detail at the seams (an agent team may build this and can't ask
back). All in-domain results are discriminated unions — never throw except on
genuine transport faults (DB down, email HTTP error inside the Resend transport).

### `src/data/repos/accounts-repo.ts`
```ts
export interface Account { id: string; email: string; createdAt: number; }
export interface AuthSession {
  id: string; tokenHash: string; accountId: string;
  createdAt: number; expiresAt: number;
}
export interface OtpCode {
  email: string; codeHash: string;
  createdAt: number; expiresAt: number; attempts: number; consumedAt: number | null;
}

export function findAccountByEmail(email: string): Promise<Account | null>;
export function createAccount(email: string, id: string, createdAt: number): Promise<Account>;

// Upsert by email PK — overwrites code_hash/created_at/expires_at, resets attempts=0, consumed_at=null.
export function upsertOtpCode(row: {
  email: string; codeHash: string; createdAt: number; expiresAt: number;
}): Promise<void>;
export function getOtpCode(email: string): Promise<OtpCode | null>;
export function incrementOtpAttempts(email: string): Promise<number>; // returns new attempts count
export function consumeOtpCode(email: string, consumedAt: number): Promise<void>;

export function insertSession(row: AuthSession): Promise<void>;
export function findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
export function deleteSessionByTokenHash(tokenHash: string): Promise<void>;
export function deleteExpiredSessions(now: number): Promise<number>; // lazy housekeeping
```
All emails are assumed already normalized by the caller (`auth-service`); the repo
does no validation.

### `src/server/auth/otp.ts`
```ts
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateCode(): string;                 // 6-digit, crypto.randomInt(0, 1_000_000) zero-padded
export function hashCode(email: string, code: string): string;  // HMAC-SHA256(AUTH_SECRET, `${email}:${code}`) hex
export function timingSafeEqualHex(a: string, b: string): boolean; // length-checked crypto.timingSafeEqual
```

### `src/server/auth/sessions.ts`
```ts
export const SESSION_COOKIE = "oak_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

// Creates an auth_session row; returns the RAW token (only place it exists in plaintext).
export function issueSession(accountId: string): Promise<{ token: string; expiresAt: number }>;
export function resolveSessionToken(token: string | undefined): Promise<Account | null>; // null if absent/expired/unknown
export function revokeSessionToken(token: string | undefined): Promise<void>;            // idempotent
export function hashToken(token: string): string;                                        // sha256 hex

// Cookie helpers (next/headers cookies()):
export function setSessionCookie(token: string, expiresAt: number): Promise<void>;
export function clearSessionCookie(): Promise<void>;
export function readSessionCookie(): Promise<string | undefined>;
```
`resolveSessionToken` treats an expired row as absent (and may best-effort delete
it). No sliding expiry in v1 (fixed 30-day window from issue).

### `src/server/auth/otp-throttle.ts`
```ts
export interface ThrottleResult { allowed: boolean; retryAfterMs: number; }
// Cooldown (60s) + per-email hourly cap (5). now injectable for tests.
export function checkRequestThrottle(email: string, ip: string, now?: number): ThrottleResult;
// Per-IP verify cap (20 / 10min).
export function checkVerifyThrottle(ip: string, now?: number): ThrottleResult;
export function _resetForTests(): void;
```

### `src/server/auth/auth-service.ts`
```ts
export type RequestCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email" }
  | { ok: false; reason: "throttled"; retryAfterMs: number }
  | { ok: false; reason: "email_failed" };

export type VerifyResult =
  | { ok: true; account: Account; token: string; expiresAt: number; created: boolean }
  | { ok: false; reason: "invalid_or_expired" }
  | { ok: false; reason: "too_many_attempts" }
  | { ok: false; reason: "invalid_code"; attemptsRemaining: number }
  | { ok: false; reason: "throttled"; retryAfterMs: number };

export function requestCode(email: string, ip: string): Promise<RequestCodeResult>;
export function verifyCode(email: string, code: string, ip: string): Promise<VerifyResult>;
```
`requestCode` normalizes email, throttles, upserts a fresh code, and emails it —
returning `{ ok: true }` for both new and existing emails (the route never maps a
branch to "account exists"). `verifyCode` enforces lockout/expiry/single-use, then
find-or-creates the account and issues a session.

### `src/server/auth/current-user.ts`
```ts
export function getCurrentAccount(): Promise<Account | null>; // reads cookie via next/headers → resolveSessionToken
```

### `src/server/auth/email/transport.ts`
```ts
export interface EmailTransport { sendOtpEmail(to: string, code: string): Promise<void>; }
export function getEmailTransport(): EmailTransport; // RESEND_API_KEY set → Resend, else console
```
`sendOtpEmail` throws on a real delivery failure; `auth-service` catches it and
maps to `email_failed`. The console transport also records the last code in an
in-memory ring exported for tests.

### `src/server/rate-limit.ts` (modified)
```ts
export const GUEST_CONFIG: RateLimitConfig;      // { maxInputLength: 2000, maxRequestsPerWindow: 20, windowMs: 60_000 }
export const SIGNED_IN_CONFIG: RateLimitConfig;  // { maxInputLength: 2000, maxRequestsPerWindow: 60, windowMs: 60_000 }
// Signature unchanged: checkRateLimit(key, message, config?, now?). The route passes
// the auth-derived key ("acct:<id>" | "ip:<addr>") and the matching config.
```

### `src/lib/auth-client.ts`
```ts
export function requestCode(email: string): Promise<{ ok: boolean; status: number; error?: string; retryAfterMs?: number }>;
export function verifyCode(email: string, code: string):
  Promise<{ ok: boolean; status: number; created?: boolean; error?: string; attemptsRemaining?: number }>;
export function signOut(): Promise<void>;
export function fetchMe(): Promise<{ signedIn: boolean; email?: string }>;
```

## Implementation Phases

Granular, build-order. Per-phase tests gate before the next phase. "Parallel"
notes call out independent work within/across phases.

### Phase 1 — Auth schema & migration
- **Build:** add `account`, `auth_session`, `otp_code` to `src/data/schema.ts`;
  `npm run db:generate` → new `drizzle/0001_*.sql`.
- **Depends on:** nothing.
- **Produces:** the three tables + their Drizzle bindings; migration applies via
  `npm run db:migrate`.
- **Parallel:** with Phase 2.
- **Test focus:** migration applies cleanly to a fresh Testcontainers DB; table
  shapes, unique constraints (email, token_hash), PK on `otp_code.email`.
- **Requirement refs:** BR-A2, BR-A3, BR-A5, BR-A9.

### Phase 2 — Email transport
- **Build:** `email/transport.ts` (interface + factory), `console-transport.ts`,
  `resend-transport.ts`; env additions (`AUTH_SECRET`, `RESEND_API_KEY?`,
  `EMAIL_FROM`) in `env.ts`.
- **Depends on:** nothing.
- **Produces:** `getEmailTransport()` and `EmailTransport`.
- **Parallel:** with Phase 1.
- **Test focus:** factory returns console when no key, Resend when key set; Resend
  builds the correct HTTP request (mock `fetch`); console records the code for test
  capture; env defaults parse.
- **Requirement refs:** non-functional (email delivery dependency), AC-2.1.

### Phase 3 — Auth core (crypto, repo, sessions, throttle, service)
- **Build:** `otp.ts`, `accounts-repo.ts`, `sessions.ts`, `otp-throttle.ts`,
  `auth-service.ts`, `current-user.ts`.
- **Depends on:** Phase 1 (tables), Phase 2 (transport).
- **Produces:** `requestCode` / `verifyCode` / `getCurrentAccount` / session
  helpers.
- **Parallel:** `otp.ts` and `otp-throttle.ts` are independent of the repo and can
  be built alongside `accounts-repo.ts`; `auth-service.ts` integrates last.
- **Test focus (oracle/integration vs Testcontainers, `installAsSingleton`):**
  happy-path issue→verify→account-created; existing-email→login (no dup);
  supersession (new code invalidates old); expiry; single-use; 5-attempt lockout;
  resend cooldown; per-email/per-IP caps; non-enumerating (`requestCode` identical
  for known/unknown email); session create/resolve/revoke; expired session reads
  as null.
- **Requirement refs:** AUTH-US-2, AUTH-US-3, AUTH-US-4, AUTH-US-5,
  AC-2.2–2.7, AC-3.1–3.3, AC-4.1–4.3, BR-A1–A7.

### Phase 4 — Auth API routes
- **Build:** `request-code`, `verify`, `signout`, `me` route handlers.
- **Depends on:** Phase 3.
- **Produces:** the public `/api/auth/*` surface + the session cookie lifecycle.
- **Parallel:** the four handlers are independent of each other.
- **Test focus (integration):** full flow request→(capture code)→verify→cookie
  set→`me` signedIn→signout→`me` signedOut; 400 invalid email / invalid code; 429
  throttled with `Retry-After`; 502 email_failed; non-enumerating status parity.
- **Requirement refs:** AUTH-US-2, AUTH-US-5, AC-2.1, AC-2.5, AC-2.6, AC-5.1,
  AC-5.2, BR-A1, BR-A6.

### Phase 5 — Tiered chat rate limiting
- **Build:** modify `rate-limit.ts` (export `GUEST_CONFIG` / `SIGNED_IN_CONFIG`;
  key-based); modify `chat/route.ts` (resolve account, choose key/config, derive
  client IP).
- **Depends on:** Phase 3 (`getCurrentAccount`).
- **Produces:** auth-aware chat throttling.
- **Parallel:** with Phase 4 (both consume Phase 3).
- **Test focus:** signed-in request keyed per-account at the higher cap; guest keyed
  per-IP at the lower cap; guests can't exceed the account tier via new sessions;
  `session_id`/conversation store and SSE contract unchanged; input-length cap
  intact.
- **Requirement refs:** AUTH-US-1, AUTH-US-7, AC-1.1, AC-1.3, AC-7.1–7.3, BR-A8,
  BR-A11.

### Phase 6 — Frontend auth UI
- **Build:** `auth-client.ts`, `AuthDialog.tsx`, `AuthMenu.tsx`; wire `page.tsx`
  (call `fetchMe` on mount, render `AuthMenu` in the header, open `AuthDialog`, and
  **do not reset `session_id`/`turns` on successful sign-in**).
- **Depends on:** Phase 4.
- **Produces:** the end-user auth experience.
- **Parallel:** `AuthDialog` and `AuthMenu` can be built in parallel against
  `auth-client`.
- **Test focus (jsdom, mocked fetch — no db/repos imports):** two-step dialog
  (email→code), error + resend-cooldown states, change-email back; `AuthMenu`
  renders guest vs signed-in; sign-in callback preserves existing thread.
- **Requirement refs:** AUTH-US-1, AUTH-US-6, AC-1.2, AC-6.1, AC-6.2, UI/UX Vision.

### Phase 7 — Integration & edge cases
- **Build:** end-to-end checks across the guest→user seam; lazy expired-session
  cleanup hook (`deleteExpiredSessions` called opportunistically on resolve);
  reconcile docs (mark B-1, update `docs/requirements/requirements.md` auth notes).
- **Depends on:** all prior.
- **Test focus (fullstack):** guest chats → signs in mid-thread → thread preserved
  → higher limit applies → signs out → back to guest limit. Cookie attributes
  (httpOnly/SameSite/Secure-in-prod). No code/token in logs.
- **Requirement refs:** AUTH-US-6, AUTH-US-7, BR-A8, BR-A10, security NFRs.

### Integration checkpoints
- **After Phase 4 — `auth-backend-e2e`:** request→verify→me→signout against a real
  Testcontainers DB with the console transport; verifies the cookie lifecycle and
  non-enumerating parity end-to-end before any UI exists.
- **After Phase 6 — `guest-to-user-e2e`:** the full browser-level flow — guest
  conversation preserved across sign-in and the tiered limit taking effect.

## Build Manifest

```yaml
commands:
  test: "npm test"               # vitest run (node + jsdom); node project NEEDS Docker (Testcontainers)
  test_one: "npx vitest run"     # append a file path or -t <name>
  typecheck: "npm run typecheck" # tsc --noEmit
  build: "npm run build"         # next build
phases:
  - id: p1
    name: Auth schema & migration
    depends_on: []
    owns: ["drizzle/0001_*.sql"]
    shared: ["src/data/schema.ts"]
    requirement_refs: [BR-A2, BR-A3, BR-A5, BR-A9]
    test_focus: "migration applies; table shapes; unique(email,token_hash); otp_code PK=email"
  - id: p2
    name: Email transport
    depends_on: []
    owns: ["src/server/auth/email/**"]
    shared: ["src/env.ts"]
    requirement_refs: [AC-2.1]
    test_focus: "factory selection; resend request via mock fetch; console capture; env defaults"
  - id: p3
    name: Auth core
    depends_on: [p1, p2]
    owns:
      - "src/data/repos/accounts-repo.ts"
      - "src/server/auth/otp.ts"
      - "src/server/auth/sessions.ts"
      - "src/server/auth/otp-throttle.ts"
      - "src/server/auth/auth-service.ts"
      - "src/server/auth/current-user.ts"
    shared: []
    requirement_refs: [AUTH-US-2, AUTH-US-3, AUTH-US-4, AUTH-US-5, BR-A1, BR-A2, BR-A3, BR-A4, BR-A5, BR-A6, BR-A7]
    test_focus: "issue/verify; create-vs-login; supersession; expiry; single-use; lockout; cooldown; non-enumerating; session lifecycle"
  - id: p4
    name: Auth API routes
    depends_on: [p3]
    owns: ["src/app/api/auth/**"]
    shared: []
    requirement_refs: [AUTH-US-2, AUTH-US-5, AC-2.1, AC-2.5, AC-2.6, AC-5.1, AC-5.2, BR-A1, BR-A6]
    test_focus: "full HTTP flow; cookie lifecycle; 400/429/502; non-enumerating parity"
  - id: p5
    name: Tiered chat rate limiting
    depends_on: [p3]
    owns: []
    shared: ["src/server/rate-limit.ts", "src/app/api/chat/route.ts"]
    requirement_refs: [AUTH-US-1, AUTH-US-7, AC-1.1, AC-1.3, AC-7.1, AC-7.2, AC-7.3, BR-A8, BR-A11]
    test_focus: "per-account vs per-IP keys + tiers; session_id/SSE unchanged; input cap intact"
  - id: p6
    name: Frontend auth UI
    depends_on: [p4]
    owns: ["src/components/auth/**", "src/lib/auth-client.ts"]
    shared: ["src/app/page.tsx"]
    requirement_refs: [AUTH-US-1, AUTH-US-6, AC-1.2, AC-6.1, AC-6.2]
    flags: [ui]
    test_focus: "two-step dialog states; guest vs signed-in menu; thread preserved on sign-in"
  - id: p7
    name: Integration & edge cases
    depends_on: [p1, p2, p3, p4, p5, p6]
    owns: ["src/app/api/auth/auth-routes.integration.test.ts"]
    shared: ["src/app/page.tsx", "docs/requirements/requirements.md", "docs/backlog.md"]
    requirement_refs: [AUTH-US-6, AUTH-US-7, BR-A8, BR-A10]
    test_focus: "guest→signin→thread preserved→tiered limit→signout; cookie attrs; no secrets in logs"
integration_checkpoints:
  - after: [p4]
    name: auth-backend-e2e
    verifies: "request→verify→me→signout against a real DB + console transport; cookie lifecycle; non-enumerating parity"
  - after: [p6]
    name: guest-to-user-e2e
    verifies: "guest conversation preserved across sign-in; tiered rate limit takes effect"
```

> `page.tsx` and `schema.ts` appear in `shared` (touched by >1 phase). Sequence
> those edits — they're the only parallel-build collision points.

## Technical Decisions

- **AD-1 — Hand-rolled auth, no library.** *Alternatives:* Better Auth (Drizzle
  adapter + email-OTP plugin), Auth.js/NextAuth. *Chosen:* hand-rolled. *Why:* the
  feature surface is small and fully specified (email-OTP only, guest mode, tiered
  limits, non-enumerating), and the codebase already hand-rolls its rate-limiter,
  session store, and SSE client. A library would want to own the schema/session
  model and fight the custom `@/data/db` singleton, `server-only` boundary, and
  Testcontainers harness. *Tradeoff:* we own the security-sensitive code (mitigated
  by standard primitives: HMAC codes, hashed opaque tokens, lockout, throttle).

- **AD-2 — Identity is a cookie/account; conversation key stays `session_id`.**
  *Alternative:* re-key the conversation store/rate-limiter to the account and
  migrate the guest session on sign-in. *Chosen:* keep auth orthogonal. *Why:* the
  conversation `session_id` is already client-owned and stable; not touching it
  makes thread preservation across sign-in (BR-A10) automatic and keeps the agent/
  SSE path unchanged (BR-A11). *Tradeoff:* signed-in conversation history isn't
  account-scoped — but that's B-3 (out of scope), and the account model is ready
  for it (BR-A9).

- **AD-3 — Opaque session token in an httpOnly cookie, SHA-256-hashed at rest.**
  *Alternative:* stateless signed JWT. *Chosen:* DB-backed opaque sessions. *Why:*
  enables true sign-out / revocation and multi-device sessions (AUTH-US-5,
  AC-4.3); a JWT can't be cleanly revoked before expiry. 256-bit random token →
  SHA-256 storage needs no secret and is safe against brute force. *Tradeoff:* one
  DB read per authenticated request (negligible at this scale; same pool already
  open).

- **AD-4 — HMAC-hashed OTP codes with a server secret.** *Alternative:* plain
  SHA-256, or bcrypt. *Chosen:* HMAC-SHA256(`AUTH_SECRET`, …). *Why:* a 6-digit
  code has only 10⁶ values — plain SHA-256 in a DB leak is trivially reversible; an
  HMAC secret defeats precomputation. bcrypt is overkill given the 10-min expiry +
  5-attempt lockout + request throttle already bound brute force. *Tradeoff:*
  `AUTH_SECRET` becomes a required production secret (dev default provided).

- **AD-5 — Durable code lifecycle (Postgres), in-memory request throttle.**
  *Alternative:* a fully DB-backed request-audit table. *Chosen:* the `otp_code`
  row (durable) handles expiry/single-use/lockout/cooldown; an in-memory Map
  (mirroring `rate-limit.ts`) handles per-email/per-IP request caps. *Why:*
  attempt/expiry state *must* survive across requests (it does — in the row);
  request caps are abuse-bounding and tolerate a restart reset on a single-instance
  hobby deploy. *Tradeoff:* throttle counters reset on restart and aren't shared
  across instances — acceptable per the existing rate-limiter's documented stance;
  revisit if Oak ever runs multi-instance.

- **AD-6 — Resend in prod, console transport in dev/test, behind one interface.**
  *Why:* no key needed for local dev or CI (the node test project must not send
  real mail); Resend's free tier and `onboarding@resend.dev` test sender fit a
  hobby budget with zero setup. *Tradeoff:* real delivery later needs a verified
  domain (tracked in Unresolved).

## Deployment & Infrastructure

Budget tier: **hobby** (~$0/mo target).

Build & test commands (source of truth; mirrored in the Build Manifest):
- `test`: `npm test` (Vitest node + jsdom; **node project needs a Docker daemon**
  for Testcontainers Postgres)
- `test_one`: `npx vitest run <path>` (or `-t "<name>"`)
- `typecheck`: `npm run typecheck`
- `build`: `npm run build`
- `lint`: `npm run lint`

- **Hosting / runtime:** unchanged — the existing Next.js app (Docker dev /
  single small host). Auth adds only outbound HTTPS to Resend. *Fits:* no new
  runtime.
- **Database hosting:** unchanged — the existing Postgres (`docker-compose.dev`
  `db` service / a managed free tier in prod). One new migration; apply with
  `npm run db:migrate` (or `docker:migrate`) — **migrations are not auto-applied**.
  *Fits:* reuses the running DB.
- **Background jobs:** none. Expired-session cleanup is lazy (on resolve) plus an
  opportunistic `deleteExpiredSessions` — no cron/worker. *Fits:* avoids infra.
- **Object storage / caching:** none.
- **Observability:** existing pino stdout. Log auth events (code requested,
  verified, signed out, throttled, email_failed) with `request_id` — **never** log
  raw codes or tokens. *Fits:* free.
- **Secrets:** env vars. `AUTH_SECRET` (required in prod; dev default provided),
  `RESEND_API_KEY` (optional — absent ⇒ console transport), `EMAIL_FROM` (default
  `Oak <onboarding@resend.dev>`). Add to `.env.local` / the compose `env_file`
  alongside `ANTHROPIC_API_KEY`. *Fits:* no secrets manager at this tier.
- **Environments:** just-prod + local dev, as today.

**Rough monthly cost: ~$0** — Resend free tier (≈3k emails/mo, 100/day) covers
hobby OTP volume; everything else runs on infrastructure already in place.

## Unresolved from Requirements

Resolved here (defaults pinned for the requirements' "exact limit values" open
question):
- OTP: 6-digit, 10-min expiry, single-use, 5-attempt lockout.
- Resend cooldown 60s; OTP requests ≤5/email/hr and ≤20/IP/hr; verify ≤20/IP/10min.
- Session TTL 30 days, fixed window, per-device.
- Chat limits: guest 20/60s (unchanged), signed-in 60/60s; input cap 2000 (unchanged).
- Session mechanism: DB-backed opaque cookie (AD-3). Guest identification: client
  IP (AD-2/§API). Auth approach: hand-rolled (AD-1).

Still needs the user's input (non-blocking for the build):
- **Email sender identity** — production `EMAIL_FROM` + a verified Resend domain
  (the `onboarding@resend.dev` default only delivers to the account owner). Needed
  before real multi-user delivery, not before building.
- **Account deletion / GDPR** — out of scope now; revisit before a genuinely public
  launch (requirements Open Questions).
- **Preserved-thread fate once chat history (B-3) lands** — whether to auto-save the
  preserved guest conversation to the new account. Deferred to B-3.
- **Multi-instance** — if Oak ever scales past one process, the in-memory
  throttle (AD-5) and conversation store need a shared backend.
