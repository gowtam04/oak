# Oak for Android — Platform & Operational

> Backend relationship, online/offline behavior, non-functional
> requirements, Play Store compliance, security/privacy, constraints,
> out-of-scope, open questions. IDs scoped `D-`. Append; never renumber.

## Index — iPhone requirements applicability

| iPhone ID | Status | Note |
|---|---|---|
| M-BR-PLAT-1..2 | Same | One backend/data store/account namespace shared with web/iPhone; no LLM keys/DB access on the client; reuse the API first. |
| M-BR-PLAT-3 (new endpoints minimal) | **Resolved** | The iPhone audit already covered this; both needed changes (Bearer auth, account deletion) shipped and are reused as-is. **Android needs zero new backend endpoints** — D-PLAT-1. |
| M-NFR-1..5 | Same | No offline answering/cache; token-by-token streaming; smooth UI; in-domain failures render as normal answers; fast launch with session restore. |
| M-NFR-6..9, 11 | Modified | Same intent, Play Store terms instead of App Store — D-PLAT-2 (in-app deletion, Data safety section, permission rationale, no Google Sign-In requirement, IARC content rating). |
| M-NFR-10 | Same | Genuinely native everywhere — same minimum-functionality bar as Apple's. |
| M-NFR-12, 14, 15 | Same | HTTPS everywhere; per-account isolation end-to-end; on-device data minimization. |
| M-NFR-13 (secure storage) | Modified | Keystore-backed, not Keychain — `accounts-and-access.md` D-BR-ACCT-5. |
| M-CON-1..2 | **Replaced** | Kotlin + Compose (D-CON-1); phone-first, no tablet layout in v1 (D-CON-2). |
| M-CON-3..5 | Same | Reuse the backend, don't fork data/accounts; no hard deadline, sequenced scope; free with tiered limits, no IAP. |
| M-OOS-1,2,4,5,6,8,9 | Same | Push notifications, widget/Shortcuts-equivalents, Wear-equivalent companion, IAP, offline mode, sharing beyond Showdown export, new agent capabilities — all deferred, same as iPhone. |
| M-OOS-3, 7 | **Replaced**/Same | "No Android app" is moot (this is it); tablet half → D-CON-2. Social-login exclusion carries forward unchanged. |
| M-OQ-1, 2..4 | **Resolved**/Open | API audit already answered by iPhone (D-PLAT-1); analytics, min OS version, branding remain open with Android's own answers — §Open questions. |

## Backend relationship

- **D-PLAT-1** — **No new backend work.** Both additive changes a mobile
  client needed (Bearer auth alongside the `oak_session` cookie; `DELETE
  /api/auth/account`) already shipped for iPhone and are reused as-is.
  Android talks to the same surface: `POST /api/chat` (SSE), `/api/auth/*`,
  `/api/conversations/*`, `/api/teams/*` (incl. Teams Assistant),
  `/api/entity`, `/api/search`, `/api/sprites`, `/api/learnset`. Any
  genuinely new need follows the same additive/minimal, web-safe rule; none
  is anticipated.

## Online / offline behavior

- **D-NFR-1** — Same as M-NFR-1: online-only, no offline answering/cache.
  No-connection state shows a clear message + retry; a mid-stream drop is a
  recoverable error, never an ambiguous half-rendered answer.

## Performance & reliability

- **D-NFR-2..5** — Same as M-NFR-2..5: responsive streaming with no
  whole-answer buffering; smooth scroll/sheet/list interactions; in-domain
  failures render as normal answers, never a crash; fast launch with
  session restore (no re-OTP per launch).
- **D-NFR-5b** — **Streaming reliability aids**, matching iPhone parity: a
  wake-lock (or equivalent) for the duration of an active stream, and at
  most one automatic reconnect on a brief background interruption, without
  duplicating a turn.

## Play Store compliance

- **D-PLAT-2** — Android's counterparts to the iPhone app's App Store
  requirements: **in-app account deletion** (`accounts-and-access.md`
  D-ACCT-2) satisfying Play's Data safety/account-deletion policy; an
  accurate Play Console **Data safety** section + reachable privacy policy;
  clear runtime permission rationale on use only (`chat-experience.md`
  D-CH-2); **no Google Sign-In requirement** (email OTP is first-party, same
  rationale as no-SIWA); genuinely native rendering (not a wrapper); and an
  accurate **IARC** content rating.
- **D-PLAT-3** — **Target API level** — targets a current Android API level
  per Play's target-API policy at time of any eventual submission (deferred
  — see §Out of scope).

## Security & privacy

- **D-NFR-6, 8, 9** — Same as M-NFR-12, 14, 15: HTTPS everywhere;
  per-account isolation end-to-end; no more on-device personal data than
  needed (session token only, no durable local history/teams copy in v1).
- **D-NFR-7** — **Secure credential storage** — Keystore-backed, removed on
  sign-out/deletion (`accounts-and-access.md` D-BR-ACCT-5).

## Constraints and preferences

> Inputs for the architect — not decisions made here.

- **D-CON-1** — **Kotlin + Jetpack Compose**, minimal dependencies (OkHttp
  for POST-SSE, kotlinx.serialization, Coil), MVVM (`ViewModel` +
  `StateFlow`), service interfaces with fakes — Android's equivalent of
  iPhone's Swift/SwiftUI + protocol/Live pattern. `minSdk` 26,
  `compileSdk`/`targetSdk` 36. As with M-CON-1: the web app's TypeScript
  modules aren't reused as code — the app re-expresses `OakAnswer`, the SSE
  wire format, and the team data model natively, treating
  `web/src/agent/schemas.ts`, `web/src/lib/sse/sse-types.ts`,
  `web/src/data/teams/team-schema.ts`, and `web/src/data/formats.ts` as the
  authoritative contracts to mirror.
- **D-CON-2** — **Phone-first, v1** — no tablet-optimized layout (runs in
  phone-compatible layout on a tablet by default); no other form factor
  targeted.
- **D-CON-3..5** — Same as M-CON-3..5: reuse the existing backend; no hard
  deadline, sequenced toward a shippable build; free with tiered limits, no
  IAP/paid tier.
- **D-CON-6** — **Delivery v1 = emulator-verified APK** — debug/release APK
  verified via unit tests, instrumentation tests, and a manual/scripted live
  smoke run, installable via `adb`. **Play Store submission (listing,
  signing-key management, Console review) is explicitly deferred**,
  analogous to how iPhone sequenced App-Store readiness as a later step, not
  a v1 gate.

## Out of scope (v1)

Admin panel (web-only); push notifications (D-OOS deferred, mirrors
M-OOS-1); tablet-optimized layout (D-CON-2); offline mode (mirrors M-OOS-6);
Play Store listing/submission/signing-key management (D-CON-6); home-screen
widgets/Shortcuts-equivalents (mirrors M-OOS-2); Wear OS companion (mirrors
M-OOS-4); IAP/subscriptions/paid tiers (mirrors M-OOS-5); Sign in with
Google/social logins — email OTP only (mirrors M-OOS-7); sharing/exporting
beyond the specified Showdown export, artifacts stay ephemeral (mirrors
M-OOS-8); new agent capabilities/artifact types/model selection UI (mirrors
M-OOS-9).

## Open questions

- **D-OQ-1** — **Analytics/crash reporting** in v1? If yes, must be
  reflected in the Data safety disclosure (D-PLAT-2). Default: minimal/none
  unless the owner opts in (mirrors M-OQ-2's default).
- **D-OQ-2** — **Minimum Android version / phone size range** — `minSdk` 26
  is a working assumption from the build plan's verified environment; final
  confirmation and the size-range floor (`ui-and-experience.md` D-BR-UI-3)
  are the architect's call, same status as M-OQ-3 for iOS.
- **D-OQ-3** — **Branding/store identity** — same open question as iPhone
  (M-OQ-4): "Oak" vs. "Pokébot," and IP/trademark considerations, need
  settling before any eventual submission.
- **D-OQ-4** — **Play Console signing identity** — unlike iPhone's
  Xcode-authenticated signing, Play release signing needs its own
  keystore/App Signing setup — out of scope for v1 (see Out of scope) but
  flagged now so it isn't a surprise later.
