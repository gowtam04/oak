# Oak iOS — Deployment & Infrastructure

Budget Tier: hobby
Backend Topology: existing Next.js monolith (Fly.io, unchanged) + minimal additive endpoints + native iOS client

The iOS app adds **almost no server infrastructure** — it's a client to the
already-deployed backend. "Deployment" here means App Store distribution + signing + CI,
plus a one-time redeploy of `web/` for the two additive changes.

## Hosting / Runtime
- **iOS app:** distributed via the **App Store** (target is a public release, M-CON-4 /
  requirements). The app runs on users' iPhones; no server runtime for it.
- **Backend:** unchanged — the existing Next.js monolith on **Fly.io** (`oak-gowtam`).
  The two additive changes (account deletion route + Bearer adaptation) ship via a normal
  `cd web && fly deploy`.
- Region/redundancy: inherit the existing backend's setup; no change.

## Database Hosting
- Unchanged — the existing Postgres the backend already uses. No new datastore for the
  client (online-only, no on-device DB; M-OOS-6). The deletion cascade runs against the
  existing DB; add a Drizzle migration only if FK `ON DELETE` actions are introduced
  (otherwise deletes are explicit in repo code — no migration). Re-ingest is **not**
  needed (no `@pkmn` index change).

## Background Jobs / Queues
- None. No async/queue work introduced by the client or the two endpoints.

## Object Storage
- None. Images are sent inline (base64) on the chat turn and never stored (consume-on-turn,
  M-BR-CHAT-3). No avatars/uploads.

## Caching
- None server-side. Client does no durable caching (online-only). `SpriteImage` may use
  URLSession's default URL cache for sprite images (free, in-process) — no added infra.

## Observability
- **iOS:** `OSLog`/`Logger` categories (free, on-device, viewable in Console/Xcode);
  crash reports via **TestFlight + Xcode Organizer** (free). No third-party analytics or
  crash SDK (ADR-10). This is the cheapest rung and meets the hobby tier — adoption
  metrics are aspirational, not instrumented in v1.
- **Backend:** unchanged (existing Fly.io logs).

## Secrets Management
- **iOS:** the only "secret" on device is the user's **session token** in the **Keychain**
  (`kSecAttrAccessibleAfterFirstUnlock`). No API keys ship in the app (the backend holds
  all LLM/DB keys, M-BR-PLAT-1).
- **Build secrets:** Apple signing certs / provisioning profiles managed via Xcode
  automatic signing locally; if CI signs, store the cert + App Store Connect API key in
  the CI provider's secret store.
- **Backend:** unchanged (Fly secrets).

## Environments
- **Backend:** prod (existing) + use it (or a Fly staging app if available) as the
  client's staging target. Hobby tier: prod + a lightweight staging is enough; if no
  staging app exists, point Debug at prod with a guest/dev account for CP1–CP5.
- **iOS:** Debug scheme → staging base URL; Release scheme → prod base URL
  (`BaseURL.swift`). Distribution rings: local → **TestFlight** (internal) → App Store.
  (Requirements say straight-to-App-Store; TestFlight internal is still the natural
  pre-submission smoke ring at no cost.)

## Build & Test Commands
Mirror of the Build Manifest `commands` block (keep identical).
```
# iOS (from ios/)
test:        xcodebuild test -scheme OakApp -destination 'platform=iOS Simulator,name=iPhone 16'
test_one:    xcodebuild test -scheme OakApp -only-testing:OakAppTests/<Suite>/<test> -destination 'platform=iOS Simulator,name=iPhone 16'
typecheck:   xcodebuild build -scheme OakApp -destination 'platform=iOS Simulator,name=iPhone 16'   # build == typecheck in Swift
build:       xcodebuild -scheme OakApp -configuration Release build
archive:     xcodebuild -scheme OakApp -configuration Release archive -archivePath build/OakApp.xcarchive
# backend (from web/) — Phase 2 only
backend_test:      npm test
backend_typecheck: npm run typecheck
```
- **CI (hobby):** GitHub Actions on a macOS runner — build + Swift Testing on the
  simulator for `ios/**` PRs; reuse the existing `web/` CI for the Phase 2 changes.
  Device/archive builds can be manual at this tier (macOS CI minutes are the only real
  cost; keep the matrix to one simulator).

## Cost Estimate (order of magnitude)

| Item | Cost |
|---|---|
| Apple Developer Program (required to ship) | **$99 / year** |
| Backend infra (existing Fly.io) | unchanged — no added cost from the client |
| Analytics / crash SDK | **$0** (Apple-only) |
| CI | **$0–~$10/mo** (free macOS-runner minutes likely suffice at this volume) |
| **Total new spend** | **≈ $99/year + ~$0/mo** |

This matches the **hobby tier**: the only mandatory cost is the Apple Developer Program;
everything else reuses existing infra or Apple-provided free tooling.

## App Store submission prerequisites (from requirements)
- In-app **account deletion** (M-NFR-6) — Phase 2 + Phase 12.
- **Privacy nutrition label** + privacy policy URL (M-NFR-7) — content collected: email
  (auth), conversation text + images sent to backend/model provider; no third-party
  analytics.
- Camera/photo **usage strings** in Info.plist (M-NFR-8).
- Accurate **age rating** (M-NFR-11); native app, not a wrapper (M-NFR-10).
- **Sign in with Apple not required** (email OTP is first-party; M-NFR-9) — document the
  rationale in the review notes.
- **IP/trademark review** before submission (see `decisions.md` Unresolved) — the one
  genuine blocker beyond engineering.
