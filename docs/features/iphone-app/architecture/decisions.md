# Architecture Decision Records

## ADR-1: Native Swift/SwiftUI client, not React Native / web wrapper
- **Status:** accepted
- **Context:** Requirement M-CON-1 (owner prefers native), M-SUCCESS-2 (must feel
  genuinely native), M-NFR-10 (App Store "not a thin wrapper"). The web app's pure TS
  modules can't be reused as code in a native app.
- **Decision:** Build a native Swift 6 / SwiftUI app that re-expresses the wire contracts
  in Swift and talks only to the existing HTTP/SSE API.
- **Alternatives considered:** React Native/Expo (would reuse some TS, ease future
  Android — but the owner explicitly chose native and it weakens the native feel);
  Capacitor/web wrapper (fails M-NFR-10 / rejection risk).
- **Consequences:** Two renderers (web + iOS) must be kept in fidelity with the OakAnswer
  contract; a contract-test fixture suite (Phase 3) guards drift. No code sharing with
  `web/`. Future Android would be a third client.

## ADR-2: Bearer-token auth adaptation (additive) over cookie-jar reuse
- **Status:** accepted
- **Context:** Auth is httpOnly-cookie-only today. A native app can ride URLSession's
  cookie jar with zero backend change, but the session would live outside the Keychain
  (against M-BR-ACCT-5) and depend on implicit cookie behavior.
- **Decision:** Add an additive Bearer path — `verify` also returns the raw token; the
  single session resolver accepts `Authorization: Bearer` as a fallback to the cookie.
  The client stores the token in the Keychain. Cookie path is tried first and is
  unchanged, so web behavior is byte-identical.
- **Alternatives considered:** Cookie-jar reuse (zero backend change, but violates the
  Keychain requirement and is less explicit — kept as the documented fallback if the team
  wants no backend change); full OAuth/JWT redesign (overkill, breaks the existing
  session model).
- **Consequences:** One small, well-contained backend change lights up the whole authed
  surface for mobile. Token lifetime stays the existing 30-day fixed window (no sliding
  refresh) — see Unresolved.

## ADR-3: MVVM + Observation (`@Observable`)
- **Status:** accepted
- **Context:** App spans chat, history, teams, artifacts, account — too much for plain
  `@State`; needs testable view models. Hobby budget + native feel discourage heavy deps.
- **Decision:** MVVM with the Observation framework; `@MainActor @Observable` view models
  over protocol-typed services; `actor`s for shared mutable state.
- **Alternatives considered:** TCA (powerful, very testable, but a heavy third-party
  dependency + learning curve — rejected for a hobby build); plain SwiftUI state
  (untestable at this size).
- **Consequences:** View models are unit-testable against fake services; requires iOS 17+
  (we target iOS 18, ADR-4).

## ADR-4: Minimum deployment target iOS 18
- **Status:** accepted
- **Context:** Resolves requirement open question M-OQ-3. Newer SwiftUI APIs and Swift 6
  concurrency vs device reach.
- **Decision:** Target iOS 18.0 minimum.
- **Alternatives considered:** iOS 17 (slightly wider reach, still has `@Observable`);
  "latest only" (smallest reach). iOS 18 was chosen by the owner as a brand-new app with
  no legacy users.
- **Consequences:** Access to current SwiftUI + Swift Testing; drops pre-iOS-18 devices
  (acceptable for a new app).

## ADR-5: Zero third-party dependencies (Apple frameworks only)
- **Status:** accepted
- **Context:** Hobby budget; M-SUCCESS-2 native feel; small surface area.
- **Decision:** Use only Apple frameworks (URLSession, Security/Keychain, PhotosUI,
  Observation, Swift Testing, OSLog). No SPM third-party packages in v1.
- **Alternatives considered:** A few vetted packages (Keychain wrapper, markdown
  renderer) — deferred; can be added later if a real need appears.
- **Consequences:** A little more hand-written code (Keychain access, SSE parser); no
  supply-chain/version-churn risk; trivial App Store privacy story.

## ADR-6: SSE via URLSession async bytes + custom parser
- **Status:** accepted
- **Context:** The chat endpoint is `POST` + `text/event-stream`; most SSE libraries
  assume `GET`.
- **Decision:** Consume the stream with `URLSession.bytes(for:)` and a pure incremental
  SSE parser emitting `SSEEvent`s.
- **Alternatives considered:** LDSwiftEventSource / EventSource packages (GET-oriented,
  add a dependency — rejected per ADR-5).
- **Consequences:** Full control over POST + Bearer header + heartbeat handling; parser
  is unit-tested against recorded streams.

## ADR-7: Native AttributedString markdown; tables from structured fields
- **Status:** accepted
- **Context:** `answer_markdown`/`reasoning_markdown` are prose; tabular data already
  arrives as structured fields (`candidates`, `damage_calc`, `subjects`) rendered as
  native views (M-AC-1.4).
- **Decision:** Render prose with `AttributedString(markdown:)`; render tables/structured
  data from typed fields as native SwiftUI views.
- **Alternatives considered:** `apple/swift-markdown` for full GFM incl. prose tables —
  deferred; add only if real answers embed tables in prose (tracked in Unresolved).
- **Consequences:** No dependency; a GFM table embedded in prose would render plainly —
  acceptable risk given structured fields carry the real tables.

## ADR-8: async throws + typed `OakError`; in-domain failures are not errors
- **Status:** accepted
- **Context:** Mirror the backend's "never throw in-domain" contract; idiomatic async
  Swift.
- **Decision:** Networking/services use `async throws` with a typed `OakError`. In-domain
  results (non-`answered` OakAnswer, entity not-found/unavailable, team validation
  warnings) are normal successful values rendered in the UI.
- **Alternatives considered:** `Result<T, OakError>` returns (less idiomatic with
  async/await).
- **Consequences:** Clear split between transport/HTTP faults (thrown, surfaced as
  banners) and product states (rendered).

## ADR-9: iOS app lives in `ios/` in the monorepo
- **Status:** accepted (revisitable)
- **Context:** `web/CLAUDE.md` anticipates a sibling mobile folder; the two backend
  changes live in `web/`.
- **Decision:** Put the Xcode project under `ios/`, sibling to `web/` and `docs/`.
- **Alternatives considered:** Separate repo (nothing in the design requires
  co-location — the client only needs the API base URL).
- **Consequences:** One repo to clone; iOS CI scoped to `ios/**`. Easy to split out later.

## ADR-10: App name "Oak"; Apple-only telemetry
- **Status:** accepted
- **Context:** Resolves M-OQ-4 (name) and M-OQ-2 (analytics). Pokémon marks are Nintendo
  IP; hobby budget.
- **Decision:** App Store name **"Oak"** (no trademarked term in the name; positioned as
  an unofficial Pokémon assistant in the description). Telemetry is Apple-only — OSLog +
  TestFlight/Xcode Organizer crash reports; no third-party SDK.
- **Alternatives considered:** "Pokébot" (contains a Nintendo mark — rejection/takedown
  risk); free crash SDK (adds a dependency + privacy disclosure — deferred).
- **Consequences:** Simplest privacy nutrition label; broader IP review still required
  before submission (see Unresolved). No remote analytics → adoption metrics are
  aspirational only (consistent with requirements).

---

## Unresolved from Requirements

Resolved here: M-OQ-1 (API audit — done; backend is fully consumable + two additive
changes), M-OQ-2 (telemetry — Apple-only, ADR-10), M-OQ-3 (min iOS — 18, ADR-4), M-OQ-4
(name — "Oak", ADR-10).

Still open / to confirm:
- **IP / trademark review (blocking for submission).** Using Pokémon sprites (from
  `@pkmn`/PokeAPI), type names, and the word "Pokémon" in store metadata carries
  Nintendo-IP risk independent of the app name. Needs a human call before App Store
  submission. (From requirements M-OQ-4.) *Proposed:* position clearly as unofficial/fan
  reference, review sprite-asset licensing — **confirm with owner/legal.**
- **Session lifetime / sliding refresh.** Tokens are a 30-day fixed window; there's no
  refresh. If "stay signed in indefinitely" is desired, that's a backend change. *Proposed:*
  keep the 30-day window for v1 — **confirm with dev team.**
- **List pagination.** Conversations/teams return full lists (no API pagination). Fine at
  hobby scale; revisit if a user accumulates hundreds. *Proposed:* in-memory filter for
  v1, add API pagination later — **confirm with dev team.**
- **Push notifications (explicitly v1 out-of-scope, M-OOS-1)** but a known future goal —
  would need APNs + a backend push-registration endpoint (the "additive mobile endpoint"
  bucket). Not designed here.
- **Code-level proposals marked elsewhere as "confirm with dev team"** are the ADR
  choices above; all have a concrete recommendation the team can accept or override before
  `dev-team` picks this up.
