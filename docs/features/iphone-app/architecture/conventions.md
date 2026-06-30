# Code Conventions

**Developer mode.** Conventions for the Swift/SwiftUI client (and a note on the `web/`
changes). Decisions surfaced during design are recorded here with rationale.

## Language & tooling
- **Swift 6**, strict concurrency enabled (treat data-race warnings as errors). All
  cross-actor types are `Sendable`.
- **SwiftUI**, iOS 18 minimum (ADR-4). No UIKit except the unavoidable `CameraPicker`
  (`UIViewControllerRepresentable`) and any pickers SwiftUI lacks.
- **No third-party packages** (ADR-5). Dependency management is SwiftPM, currently empty.
- **Formatting/lint:** `swift-format` (Apple) with the default style; optionally SwiftLint
  if the team wants it (not required). One statement per line; trailing commas in
  multiline literals.

## Naming
- **Files:** PascalCase matching the primary type (`ChatViewModel.swift`). One primary
  type per file.
- **Types:** PascalCase. **Protocols** name the role (`AuthService`); the concrete impl is
  `Live…` (`LiveAuthService`); test doubles are `Fake…` (`FakeAuthService`).
- **View models:** `…ViewModel`. **Views:** `…View`. **DTOs:** the wire name
  (`OakAnswer`, `ConversationSummary`).
- **Wire ↔ Swift:** wire is `snake_case`; Swift is `camelCase`, mapped with explicit
  `CodingKeys` per type (do **not** set a global `.convertFromSnakeCase` — payloads mix
  conventions, e.g. `dex_number` vs `mimeType`).
- **Async functions:** verb-first (`requestCode`, `importGuestThread`). No `get` prefix on
  simple accessors.

## Module boundaries (layering — strictly downward)
```
Features (Views + ViewModels)  →  Services  →  Networking (+ Models/Wire)  →  Apple frameworks
App/AppState + UI/ are shared leaf layers; Support/ is leaf utilities.
```
- Views never call `OakAPIClient` directly — only through a Service via their ViewModel.
- Only `TokenStore` touches Keychain. Only `Networking` constructs `URLRequest`s.
- `Models/Wire` imports nothing app-specific (pure DTOs) — they're the would-be shared
  package if Android ever happens.
- ViewModels depend on **service protocols**, never concrete `Live…` types — that's what
  makes them unit-testable with `Fake…`.

## Error handling (ADR-8)
- Networking/services are `async throws` with the single typed domain `OakError`
  (`.transport`, `.http`, `.rateLimited`, `.unauthorized`, `.decoding`, `.imageRejected`).
- **In-domain failures are values, not errors:** a non-`answered` `OakAnswer`, an entity
  `not_found`/`unavailable`, and team `validation` warnings are returned normally and
  rendered — never thrown. Mirrors the backend contract.
- ViewModels catch `OakError` and map to a user-facing state: `.transport` → connection
  banner + retry; `.rateLimited` → specific message (+ "sign in raises the limit" for
  guests); `.unauthorized` → drop token, return to guest, prompt re-sign-in; others → a
  generic recoverable banner. **Errors are never swallowed silently** — every catch either
  surfaces UI state or logs via OSLog.
- The `ArtifactService` is the one deliberate exception: it returns `nil` instead of
  throwing (a missing artifact must never break the viewer).

## Concurrency
- View models are `@MainActor @Observable`. UI state mutates on the main actor only.
- Shared mutable infrastructure is an `actor` (`OakAPIClient`, `TokenStore`).
- Network/stream work uses structured concurrency (`async let`, `TaskGroup`, `for await`);
  cancel the chat stream `Task` when the view disappears or the user sends a new turn.
- No completion handlers; no `DispatchQueue` for app logic (only where an Apple API
  requires it).

## Logging (Apple-only)
- `OSLog` `Logger` with a subsystem `ai.gowtam.oak` and per-area categories:
  `network`, `auth`, `chat`, `ui`. Use levels: `.debug` (dev detail), `.info`
  (lifecycle), `.error` (caught `OakError`).
- **Never log** the session token, OTP codes, email beyond what's needed, message
  content, or image bytes. Log error `code`/status and a request label, not payloads.
- No remote sink; crashes go to TestFlight/Xcode Organizer (ADR-10).

## SwiftUI / state
- State pattern: MVVM + Observation (ADR-3). A screen owns one `@Observable` view model;
  `AppState` (session/root) is injected via `@Environment`.
- Services injected via `@Environment` keys (`Environment+Services.swift`) so previews and
  tests substitute `Fake…`.
- Prefer value types and pure view bodies; side effects live in the view model, triggered
  from `.task {}`/`.onAppear`.
- Respect system light/dark and **Dynamic Type** (no fixed font sizes that defeat scaling);
  color is never the sole carrier of meaning (M-AC-UI9.3) — pair with text/icon.

## Networking specifics
- One `URLSession` owned by `OakAPIClient`. Bearer header attached centrally when
  `endpoint.requiresAuth` and a token exists.
- Send raw base64 for images (no `data:` prefix). Enforce image caps client-side
  (`ImageEncoder`) before opening the stream; still handle a backend rejection gracefully.
- Treat all `2xx` with a typed body as success; map non-2xx via the `{code,message}`
  envelope. `Retry-After` is parsed into `OakError.rateLimited`.

## Backend changes (`web/`) — follow existing conventions
- The two additive changes follow the repo's existing patterns (`CLAUDE.md`): Result/
  structured shapes in the data/tool layer, try/catch→error mapping at the HTTP edge; Zod
  as the single source of truth; never rename existing tool/field contracts. The Bearer
  fallback lives in the **one** session-resolution function; the cookie path stays first
  and unchanged.
