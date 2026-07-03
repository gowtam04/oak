# 10 · iOS app (Swift client)

[← back to index](fable-review.md) · **Date:** 2026-07-02 · **Commit:** 17adece · **Auditor:** Claude Fable 5

**Scope:** all Swift sources under `ios/OakApp/**` (Networking, Services, Features, Models/Wire, Support, UI), `ios/project.yml`, `Info.plist`, `OakAppTests` (generated `ios/build/**` and the xcodeproj skipped).

**Area health:** The client is **well-built** — HTTPS enforced in both ATS and a defensive scheme check (no `http://` literals, no ATS exceptions), no plaintext token storage, no unsafe force-unwraps in production code, byte-level unicode-safe SSE parsing tested against recorded fixtures, clean stream cancellation, and a logging policy that never emits payloads/tokens. The two Medium findings are a purpose-built 401 handler that's never actually wired to any call site, and a Keychain accessibility attribute one notch weaker than session credentials warrant. A contract-drift note (iOS predates the six-scope feature) and a CI-wiring note round it out.

**Findings in this area:** 4 (Medium 2 · Low 1 · Info 1)

## Findings

### IOS-01 · Medium · `AppState.handleUnauthorized` is fully wired and tested but never called from any real call site

- **Dimension:** correctness
- **Location:** `ios/OakApp/App/AppState.swift:79-87` · related: `ChatViewModel.swift:335-336`, `HistoryListViewModel.swift:174`, `HistoryDetailViewModel.swift:100`, `TeamsListViewModel.swift:216`, `TeamEditorViewModel.swift:249`
- **What's wrong:** `handleUnauthorized(using:)` clears the Keychain token and flips the app to guest on a 401 — complete, documented, unit-tested — but its only caller is the test file. Every view model catches `OakError.unauthorized` and maps it to a "session expired" string without calling it.
- **How it fails:** When a Bearer token is invalidated server-side (expiry/rotation, or account deleted from another device) while the app still believes it's signed in, every authed surface shows the session-expired banner on every action, but `authState` is never reset to `.guest` and the stale token is never cleared. The user is stuck re-hitting 401 with no automatic recovery — only a manual Sign Out escapes.
- **Why it matters:** A purpose-built, tested safety mechanism defeated across all three feature areas by the same root cause. Bounded (no data loss; manual re-auth recovers) and only reachable on actual server-side invalidation.
- **Recommendation:** Have each `.unauthorized` catch branch call `appState.handleUnauthorized(using: auth)` before setting its local error message.
- **Confidence:** high

### IOS-02 · Medium · Session Bearer token stored with an accessibility attribute that survives backup-restore to a new device

- **Dimension:** security
- **Location:** `ios/OakApp/Networking/TokenStore.swift:89` · related: `:98`
- **What's wrong:** The token is written with `kSecAttrAccessibleAfterFirstUnlock` (not the `…ThisDeviceOnly` variant). Such items are included in an encrypted local/iCloud backup and can be restored onto a different device, unlike `ThisDeviceOnly` items. No `kSecAttrSynchronizable`/entitlements, so iCloud Keychain sync isn't in play — the exposure is specifically encrypted-backup-and-restore-to-new-device.
- **How it fails:** An attacker with an encrypted backup (e.g. a stolen unlocked Mac with existing Finder backups + the backup password) restores it onto another iPhone, and the victim's live session token grants full API access as that user until otherwise revoked — no re-auth.
- **Why it matters:** Session credentials are exactly what Apple's guidance recommends pinning to `ThisDeviceOnly`. Doesn't affect the common in-app flow (sign-out/deletion clear it correctly) — a narrower backup-specific surface.
- **Recommendation:** Switch both the add/update attributes to `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` so the token is excluded from any backup.
- **Confidence:** medium

### IOS-03 · Low · iOS silently drops the backend's `scope` SSE event and only speaks the deprecated `champions_mode` boolean

- **Dimension:** architecture (contract drift)
- **Location:** `ios/OakApp/Networking/SSEParser.swift:96-97` · related: `ChatWire.swift:20-36`, `web/src/lib/sse/sse-types.ts`
- **What's wrong:** The backend now emits a `scope` event first every turn and prefers `scope_seed` (with `champions_mode` deprecated and ranked below sticky scope). iOS models only the old two-scope contract (`championsMode: Bool?`), and the parser's default branch silently no-ops unknown events.
- **How it fails:** A user who set a mainline-generation scope on the web (giving the conversation a sticky scope), then continues it from iOS: the iOS toggle sends the deprecated boolean, which ranks *below* the sticky scope, so flipping it silently has no effect — and iOS never shows which scope was used.
- **Why it matters:** Feature-completeness/contract-drift, not a crash — iOS was built to an earlier two-scope contract and never picked up generation-scope.
- **Recommendation:** When iOS adopts generation-scope, add `scope_seed` + a scope chip to `ChatRequest`, add a `.scope` case to the parser, and surface the resolved scope.
- **Confidence:** high

### IOS-04 · Info · The documented iOS CI gate isn't wired into GitHub Actions

- **Dimension:** maintainability
- **Location:** `ios/ci/ios.yml:1-6`
- **What's wrong:** `ios/ci/ios.yml` is a complete workflow, but its own header says GitHub only auto-runs workflows under `.github/workflows/` — which doesn't exist in the repo. So the gate doesn't run. This is the iOS half of the no-CI gap in [area 12](fable-review-12-testing.md#test-01).
- **Recommendation:** Add `.github/workflows/ios.yml` running this on PRs touching `ios/**`.
- **Confidence:** high

## Also worth knowing

Reviewed and clean: transport security (ATS + defensive scheme check, no `http://`, no ATS exceptions), no `UserDefaults`/plaintext token storage, no `try!`/`as!`/unsafe force-unwraps in production code, SSE partial-frame/CRLF/unicode handling tested against recorded `.sse` fixtures, clean stream cancellation (`onDisappear` + `continuation.onTermination`), consistent protocol-based DI. The account-deletion flow this client triggers depends on the server-side gap in [AUTH-01](fable-review-02-authn-authz.md#auth-01).
