# API Usage (Android)

The Android client consumes the **existing** Oak HTTP/SSE API with **no backend changes**
(account deletion + Bearer auth already shipped for iOS). This file is the contract the
`networking` layer builds against. The TypeScript route handlers in `web/src/app/api/` are
authoritative; shapes are in `data-model.md`.

**Base URL:** the Fly.io origin, selected per build variant (`OAK_STAGING` flag → staging;
release → prod — see `deployment.md`). All requests are HTTPS (enforced client-side; a
non-HTTPS URL fails fast as `OakError.Transport("insecure_scheme")`). Auth is carried as
**`Authorization: Bearer <token>`** on signed-in calls; absence of the header = guest.
OkHttp is configured with **no `CookieJar`** — Android never uses cookies (DADR-2).

Standard headers on every request: `Accept: application/json` (overridden to
`text/event-stream` on the two SSE endpoints); `Content-Type: application/json` on any
body; `Authorization: Bearer <token>` when the endpoint `requiresAuth` and a token exists.

## Endpoint inventory (the client contract — 25 method+path pairs over 20 route files)

### Auth (`ai.gowtam.oak.services.AuthService`)
| Method | Path | Body | Returns | Auth |
|---|---|---|---|---|
| POST | `/api/auth/request-code` | `{ email }` | `{ ok:true }` (or `{ code, message }`; 200 except 429/502) | none |
| POST | `/api/auth/verify` | `{ email, code }` | `{ ok, email, created, token, expiresAt }` — **token** → Keystore | none |
| GET | `/api/auth/me` | — | `{ signedIn:true, email }` or `{ signedIn:false }` (200) | optional |
| POST | `/api/auth/signout` | — | `{ ok:true }` (idempotent; best-effort revoke, then always clear token) | optional |
| DELETE | `/api/auth/account` | — | `{ ok:true }` (200); cascade-deletes all account data; then clear token (401 ⇒ already orphaned, still clear) | required |

Auth error codes: `invalid_email`, `rate_limited` (429, `Retry-After`), `email_failed`
(502); verify: `invalid_code` (`attemptsRemaining`), `invalid_or_expired`,
`too_many_attempts`. OTP: 6-digit, 10-min expiry, 5 wrong attempts/code, resend cooldown
60s, 5/email/hr, 20/IP/hr; verify 20/IP/10min.

### Chat (SSE) (`ChatService` → `SseClient.stream`)
`POST /api/chat` — request body + SSE events per `data-model.md`. `requiresAuth = true`
means "attach the token when signed in" (raises the rate limit + identity); **guests chat
fine** with no header.
- Pre-stream errors (JSON, before the stream opens): `invalid_request` (400),
  `invalid_image` (400), `too_many_images` (400), `image_too_large` (413),
  `payload_too_large` (413, Content-Length > **16 MiB**), `input_too_long` (413,
  > 2000 chars), `rate_limited` (429, `Retry-After`), `model_unavailable` (503).
- Stream order: `scope` (once, first) → `tool_activity`* → `answer_start`*/`answer_delta`*
  → exactly one terminal `answer` (or `error` on transport fault). Heartbeat `: keep-alive`
  every 15s (ignored by the parser).

### Conversations (`HistoryService`; signed-in — guests get `[]` or 401)
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/conversations` | `?q=&format=` | `{ conversations: ConversationSummary[] }` (guest → `[]`, 200) |
| GET | `/api/conversations/{id}` | — | `ConversationDetail` (401 guest / 404 not-owned) |
| PATCH | `/api/conversations/{id}` | `{ title? }` and/or `{ pinned? }` (≥1) | `{ ok:true }` |
| DELETE | `/api/conversations/{id}` | — | `{ ok:true }` |
| POST | `/api/conversations/import` | `{ session_id, format, turns[] }` | `{ id: string\|null }` |

`import` is the guest→account save; the client sends **`format`** (the resolved scope of the
guest thread), not the legacy `champions_mode`. Empty thread → `id: null`. Idempotent on
turn ids. Caps: ≤ 4 MiB / ≤ 1000 turns.

### Teams (`TeamService`; signed-in — 401 for guests)
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/teams` | `?format=` | `{ teams: TeamSummary[] }` (list is a **projection**, not full teams) |
| POST | `/api/teams` | `{ format, name?, members? }` | `{ team, validation }` |
| GET | `/api/teams/{id}` | — | `{ team, validation }` |
| PUT | `/api/teams/{id}` | `{ name?, members? }` (≥1) | `{ team, validation }` |
| DELETE | `/api/teams/{id}` | — | `{ ok:true }` |
| POST | `/api/teams/import` | `{ format, paste }` | `{ team, validation, notes }` |
| GET | `/api/teams/{id}/export` | — | `{ paste }` (Showdown text) |
| POST | `/api/teams/{id}/duplicate` | — | `{ team, validation }` |

`validation` is a **flat `TeamWarning[]`** (warn-but-allow — warnings render, never block a
save). `import` never fails wholesale; unresolved parts return as `notes: ImportNote[]`.

### Teams Assistant (SSE) (`TeamsAssistantService` → `SseClient.streamBuilder`)
`POST /api/teams/assistant` — **signed-in only** (a guest's missing Bearer → 401 →
`OakError.Unauthorized` thrown before any event). Body `{ session_id, message, draft }`
where `draft` (`{ name, format, members }`) rides **every** turn and `draft.format` is the
turn's scope. Events: `tool_activity`* → `answer_start`*/`answer_delta`* → exactly one
terminal `answer` (a `BuilderAnswer`). **No `scope` event.** `error` = transport only.

### Public reads (`DexLookupService` / `ArtifactService`; no auth)
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/entity` | `kind` (pokemon\|move\|ability\|item\|type) `& q & format` | `{ status:"ok", … }` \| `{ status:"not_found", suggestions }` \| `{ status:"unavailable" }` (all 200); bad params 400 |
| GET | `/api/search` | `kind & q & format` (blank `q` = alphabetical browse) | `{ matches: SearchMatch[] }` |
| GET | `/api/sprites` | `format & names` (comma-sep slugs, **≤ 24** — server slices) | `{ refs: { slug: DexSpriteRef } }` |
| GET | `/api/learnset` | `pokemon & format` | `{ moves: LearnsetMove[] }` |
| GET | `/api/health` | — | `{ status:"ok" }` |

These four data routes never throw for an in-domain miss — an unreadable index degrades to
an empty list/map on a 200. `DexLookupService` folds every transport/decode fault to the
same empty result; `ArtifactService.entity` folds everything (incl. transport) to `null`.

> **Not consumed by the client:** the 13 `/api/admin/*` routes (operator dashboard, gated by
> `ADMIN_EMAILS`) are web-only and out of scope for Android.

## Rate limits (respect `Retry-After` on 429; source: `web/src/server/rate-limit.ts`)

| Tier | Limit | Key |
|---|---|---|
| Chat, guest | **20 / 60s** | `ip:<clientIp>` |
| Chat, signed-in | **60 / 60s** | `acct:<id>` |
| Teams assistant (signed-in) | **30 / 60s** | `acct:<id>` |
| Public reads (entity/search/sprites/learnset) | **120 / 60s** | shared `pub:<clientIp>` bucket |

Input length is capped at **2000 chars** across all tiers. A `429` carries `Retry-After`
(delta-seconds); the client parses it into `OakError.RateLimited(retryAfterSeconds)`. For a
rate-limited **guest**, the chat banner appends "Sign in to raise the limit."

## Image caps (client enforces before send; server re-checks — `ImageEncoder`)

| Cap | Value |
|---|---|
| Max images / message | **4** |
| Per-image decoded bytes | **3,932,160** (~3.75 MiB) |
| Total decoded bytes | **10,485,760** (10 MiB) |
| Longest-edge downscale | **1568 px** |
| Content-Length pre-check (whole request) | **16 MiB** (chat route) |

Accepted types (server magic-byte sniff, canonical): **JPEG / PNG / GIF / WebP** — **no
HEIC**. Send **raw base64** (no `data:` prefix). The client `ImageEncoder` downscales to
1568px and re-encodes JPEG (quality-step-then-shrink loop) or PNG (alpha + fits), so
per-image/total rejections are rare; when they fire, the composer shows the specific reason.

## Error mapping (`OakError.validate` — networking → typed error)

| Response | `OakError` | UI |
|---|---|---|
| Transport failure / no connection | `Transport(underlying)` | "No connection" banner + retry |
| `429` (+ optional `Retry-After`) | `RateLimited(retryAfter)` | specific wait message (+ guest sign-in hint) |
| `401` on an authed call | `Unauthorized` | drop token → guest → prompt re-sign-in |
| other non-2xx with `{ code, message }` | `Http(status, code, message)` | recoverable banner (uses `message`) |
| 2xx body fails to decode | `Decoding(typeName)` | logged; should be impossible (P1 fixture guard) |
| client image cap violated pre-send | `ImageRejected(reason)` | specific reason in the composer |

**In-domain failures are NOT errors:** an `OakAnswer` with `status != answered`, an entity
`not_found`/`unavailable`, and team `validation` warnings are normal successful results
rendered in the UI (mirrors the backend's "never throw in-domain" stance).

The SSE error contract mirrors iOS: a **pre-stream** HTTP failure is read off the stream,
mapped via `OakError.validate`, and thrown before any event is yielded; a **mid-stream**
transport drop surfaces as a thrown `OakError.Transport`; an in-band **`error` event** is
emitted as `SseEvent.Error(...)` then the stream finishes normally (and is **never**
auto-retried — it's a real model/agent fault, not a connection drop).

## Auth & authorization (client side)

- **Guest:** no `Authorization` header. Chat works; conversations list returns `[]`; team +
  teams-assistant endpoints return 401 (the app gates these behind a sign-in prompt, not an
  error surface).
- **Signed-in:** `Authorization: Bearer <token>` on every request. A `401` on a
  previously-signed-in call means the session expired/was revoked → drop token, return to
  guest, surface a re-sign-in prompt.
- **Token lifetime:** 30-day fixed window (no sliding refresh). On expiry the user
  re-requests a code.

## Pagination / filtering / sorting

Conversations & teams return full lists (no API pagination); filtering is server-side via
`?q=`/`?format=`. The client may additionally filter/sort in-memory for responsiveness. If
list sizes grow enough to need pagination, that's a future backend change.
</content>
