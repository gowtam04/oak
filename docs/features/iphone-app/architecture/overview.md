# Oak iOS — Architecture Overview

Mode: Developer
Budget Tier: hobby
Backend Topology: existing Next.js monolith (Fly.io, unchanged) + minimal additive mobile endpoints + native iOS client

## Vision

A native **iPhone** app (Swift / SwiftUI) that brings Oak to the App Store at full
feature parity with the web app. Oak answers natural-language Pokémon questions by
reasoning on top of data — every answer carries reasoning, citations,
inference/uncertainty flags, and the generation/format it's based on. The iPhone app
is a **pure client** to Oak's already-deployed backend: it holds no LLM keys and no
DB access, talks only to the existing HTTP/SSE API, and re-expresses the wire
contracts natively. The agent itself is **not** redesigned here — its internals
(`docs/agent-design/`) and the `OakAnswer`/SSE contracts are fixed inputs.

The API audit (the headline finding of this design pass) came back clean: the entire
backend is already consumable HTTP routes — **zero Next.js Server Actions / RSCs** —
so the client can be built end-to-end against the existing API with only **two small
additive backend changes** (account deletion + a Bearer-token auth adaptation).

## Requirements Reference

- Business requirements: `docs/features/iphone-app/requirements/` (overview,
  chat-experience, accounts-and-access, history-and-teams, artifact-viewer,
  ui-and-experience, platform-and-operational). All requirement IDs are `M-`-prefixed.
- Agent internals (fixed inputs, not redesigned): `docs/agent-design/`.
- Existing backend that this client consumes: `web/` (Next.js monolith). Canonical
  wire/data contracts to mirror in Swift:
  - `web/src/lib/sse/sse-types.ts` — chat request body + SSE event types
  - `web/src/agent/schemas.ts` — the `OakAnswer` output schema
  - `web/src/data/teams/team-schema.ts` — team data model + warning codes
  - `web/src/data/formats.ts` — format/mode mapping + Champions regulation string

## Tech Stack

**iOS client (new — `ios/` or a sibling repo; see Repository placement):**
- **Language:** Swift 6 (strict concurrency enabled)
- **UI:** SwiftUI, minimum deployment target **iOS 18.0**
- **Architecture:** MVVM with the **Observation** framework (`@Observable` view models
  over a service/repository layer)
- **Concurrency:** `async`/`await`; `@MainActor` view models; `actor`s for shared
  mutable state (API client session, token store)
- **Networking:** `URLSession` (async APIs); SSE via `URLSession.bytes(for:)` +
  a custom line parser
- **Secure storage:** Keychain (Security framework) for the session token
- **Preferences:** `UserDefaults` (Champions default, last guest session id, etc.)
- **Images:** PhotosUI `PhotosPicker` (library) + a `UIImagePickerController` wrapper
  for camera capture
- **Markdown:** `AttributedString(markdown:)` (Apple-native; no third-party renderer)
- **Logging:** `OSLog` (`Logger`); crash reports via TestFlight / Xcode Organizer
- **Testing:** Swift Testing (unit/VM/decoding) + a thin XCUITest (critical chat flow)
- **Dependencies:** **none** (Apple frameworks only); SwiftPM is available if a
  genuinely unavoidable need appears later

**Backend (existing — `web/`, TypeScript / Next.js):** unchanged except two additive
changes (see `api-design.md` and `decisions.md`):
1. `DELETE /api/auth/account` — new route, cascade account deletion.
2. **Bearer-token auth adaptation** — `POST /api/auth/verify` also returns the raw
   token in its JSON body; the server-side session resolver accepts
   `Authorization: Bearer <token>` in addition to the `oak_session` cookie. Web
   behavior (cookies) is untouched.

## High-Level System Diagram

```
┌─────────────────────────── iPhone (SwiftUI, iOS 18+) ───────────────────────────┐
│  Views  ──>  @Observable ViewModels  ──>  Services        ──>  Networking         │
│  (Chat,      (ChatVM, HistoryVM,         (ChatService,        (OakAPIClient:      │
│   History,    TeamsVM, TeamEditorVM,      AuthService,         URLSession +        │
│   Teams,      ArtifactVM, AuthVM,         HistoryService,      SSEClient +         │
│   Artifact    AppState/session)           TeamService,         Codable DTOs)       │
│   sheet)                                  ArtifactService)                          │
│                                            │                                        │
│   Keychain (token)  ·  UserDefaults (prefs)  ·  in-memory guest thread             │
└───────────────────────────────────────────┼───────────────────────────────────────┘
                                             │  HTTPS (JSON + SSE)
                                             │  Authorization: Bearer <token>  (or guest)
                                             ▼
        ┌──────────────── Existing Oak backend (Next.js monolith, Fly.io) ──────────┐
        │  /api/auth/*  /api/chat (SSE)  /api/conversations/*  /api/teams/*          │
        │  /api/entity  /api/sprites  /api/health   + NEW: DELETE /api/auth/account  │
        │  runOak tool-loop · 14 tools · repos · Postgres · @pkmn index              │
        └────────────────────────────────────────────────────────────────────────────┘
```

The client never sees repos, the agent loop, or the DB — only the HTTP/SSE seam. All
reasoning, rate-limiting, validation, and persistence stay server-side.

## Repository placement

The web `CLAUDE.md` already anticipates a sibling **`mobile/`** folder. Recommendation:
put the Xcode project under **`ios/`** at the repo root (sibling to `web/` and `docs/`),
so the monorepo holds both clients. The two backend changes live in `web/` as normal.
(If the team prefers a separate repo for the iOS app, nothing in this design depends on
co-location — the client only needs the API base URL. Recorded as ADR-9.)

## Document Map

- `data-model.md` — client DTOs (Codable mirrors of the wire contracts), on-device
  state, and the backend schema touchpoints (deletion cascade, Bearer reuse)
- `api-design.md` — full inventory of consumed endpoints + the two backend changes
- `component-design.md` — component breakdown, file/ownership map, interface definitions
- `implementation-plan.md` — phased build plan, integration checkpoints, Build Manifest
- `decisions.md` — ADRs + unresolved items
- `deployment.md` — App Store/TestFlight, signing, CI, backend redeploy, cost estimate
- `conventions.md` — Swift code conventions (Developer mode)
- `testing-strategy.md` — test framework, split, mocking, fixtures (Developer mode)
