# Oak Android — Architecture Overview

Mode: Developer
Budget Tier: hobby
Backend Topology: existing Next.js monolith (Fly.io, unchanged) + native Android client

## Vision

A native **Android** app (Kotlin / Jetpack Compose) that brings Oak to Android at full
feature parity with the web app and the existing iOS client. Oak answers
natural-language Pokémon questions by reasoning on top of data — every answer carries
reasoning, citations, inference/uncertainty flags, and the generation/format it's based
on. The Android app is a **pure client** to Oak's already-deployed backend: it holds no
LLM keys and no DB access, talks only to the existing HTTP/SSE API, and re-expresses the
wire contracts natively in Kotlin. The agent itself is **not** redesigned here — its
internals (`docs/agent-design/`) and the `OakAnswer`/SSE contracts are fixed inputs.

Unlike the iOS build, **no backend changes are required**. The two mobile enablers iOS
needed — `DELETE /api/auth/account` and the `Authorization: Bearer` auth adaptation —
already shipped. Android is a pure consumer of the existing HTTP/SSE surface.

## Requirements Reference

- Business requirements: the iOS `docs/features/iphone-app/requirements/` set (overview,
  chat-experience, accounts-and-access, history-and-teams, artifact-viewer,
  ui-and-experience, platform-and-operational) is the parity spec; all IDs are
  `M-`-prefixed. Android-specific deltas (back-gesture nav, Material 3, Keystore token
  storage, photo-picker/camera permission flow) are keyed `D-`/`A-` under
  `docs/features/android-app/requirements/` when written.
- Agent internals (fixed inputs, not redesigned): `docs/agent-design/`.
- Existing backend this client consumes: `web/` (Next.js monolith). Canonical wire/data
  contracts to mirror in Kotlin:
  - `web/src/lib/sse/sse-types.ts` — chat request body + SSE event types
  - `web/src/lib/sse/teams-assistant-sse-types.ts` — the team-builder assistant stream
  - `web/src/agent/schemas.ts` — the `OakAnswer` output schema + entity artifact shapes
  - `web/src/agent/teams-assistant/schemas.ts` — `BuilderAnswer`/`TeamPatch` + `applyTeamPatch`
  - `web/src/data/teams/team-schema.ts` — team data model + warning codes
  - `web/src/data/formats.ts` — format/mode mapping + Champions regulation string
- **Ground truth for the patterns being mirrored:** the iOS source (`ios/OakApp/`). The
  Kotlin layer is a structural port of the Swift layer, class-for-class.

## Tech Stack

**Android client (new — `android/`, sibling to `ios/` and `web/`):**
- **Language:** Kotlin 2.x (with the `compose-compiler` Gradle plugin), JVM target 17.
- **UI:** Jetpack Compose + Material 3. minSdk **26** (Android 8.0), compileSdk/targetSdk **36**.
- **Architecture:** MVVM — `androidx.lifecycle.ViewModel` + `StateFlow<UiState>` over a
  service layer of **interfaces** (Live implementations + Fakes), mirroring iOS's
  `protocol` + `Live…` + `Fake…` seam.
- **Concurrency:** Kotlin coroutines + `Flow`; ViewModels mutate state on `Dispatchers.Main`;
  the network client is thread-safe (OkHttp) so no explicit actor is needed.
- **Networking:** **OkHttp** for both REST and the POST-SSE byte stream (`Response.body.source()`);
  a custom SSE parser over the raw byte stream.
- **Serialization:** **kotlinx.serialization** (`kotlinx-serialization-json`) with **explicit
  `@SerialName` per field** — the payloads mix `snake_case` and `camelCase`, so there is
  NEVER a global naming strategy.
- **Secure storage:** Android **Keystore**-backed `EncryptedSharedPreferences`
  (`androidx.security:security-crypto`) for the session token; plain AES-over-Keystore is
  the fallback if the Jetpack library is unwanted.
- **Preferences:** `SharedPreferences`/`DataStore` (guest session id, champions default).
- **Images:** Android **Photo Picker** (`ActivityResultContracts.PickVisualMedia`) + a
  camera-capture contract; a pure `ImageEncoder` (Bitmap → validated `ChatImage`).
- **Sprites:** **Coil** (`coil-compose`) for hot-linked sprite/artwork images.
- **Markdown:** a **hand-rolled Compose block renderer** (no WebView, no third-party lib)
  including GFM tables — the Android analog of iOS's `MarkdownBlocks`.
- **Logging:** `android.util.Log` (per-area tags); crash reports via Play Console / logcat.
- **Testing:** JUnit4 + `kotlinx-coroutines-test` + OkHttp `MockWebServer` (+ optional
  Turbine) for JVM unit tests; **Compose UI test** for on-emulator instrumentation.
- **Dependencies:** platform (Compose/Material3/androidx) + exactly four utility libraries
  (OkHttp, kotlinx.serialization, Coil, security-crypto). No other third-party libs — no
  Hilt/Dagger/Koin, no SSE library, no charting/markdown library (DADR-5).

**Backend (existing — `web/`, TypeScript / Next.js):** **unchanged**. Account deletion and
Bearer auth already shipped for iOS; Android reuses them verbatim.

## High-Level System Diagram

```
┌────────────────────── Android phone (Compose, minSdk 26 / Material 3) ────────────────┐
│  Composables ──> ViewModels ──────> Services              ──> Networking               │
│  (Chat,          (ChatViewModel,     (ChatService,            (OakApiClient: OkHttp +   │
│   Teams,          TeamEditorVM,       AuthService,             SseClient + SseParser +  │
│   Account,        TeamsAssistantVM,   HistoryService,          kotlinx.serialization    │
│   Artifact        AuthVM, AccountVM,  TeamService,             DTOs)                     │
│   sheet)          ArtifactVM,         ArtifactService,                                   │
│                   AppState)           DexLookupService,        │                          │
│                                       TeamsAssistantService,   │                          │
│                                       ImageEncoder)            │                          │
│   Keystore (EncryptedSharedPreferences: token)  ·  in-memory guest thread              │
└───────────────────────────────────────────────┼───────────────────────────────────────┘
                                                 │  HTTPS (JSON + SSE)
                                                 │  Authorization: Bearer <token>  (or guest)
                                                 ▼
        ┌──────────────── Existing Oak backend (Next.js monolith, Fly.io) ──────────────┐
        │  /api/auth/*  /api/chat (SSE)  /api/conversations/*  /api/teams/*              │
        │  /api/teams/assistant (SSE)  /api/entity  /api/search  /api/sprites            │
        │  /api/learnset  /api/health  ·  runOak tool-loop · 17 tools · repos · Postgres │
        └────────────────────────────────────────────────────────────────────────────────┘
```

The client never sees repos, the agent loop, or the DB — only the HTTP/SSE seam. All
reasoning, rate-limiting, validation, and persistence stay server-side.

## Repository placement

The Android project lives under **`android/`** at the repo root, sibling to `web/`, `ios/`,
and `docs/` (the layout `web/CLAUDE.md` anticipates). A single Gradle `:app` module with
feature **packages** (not Gradle modules). The Gradle wrapper is committed; there is no
system Gradle. Recorded as DADR-11.

## Document Map

- `data-model.md` — client DTOs (kotlinx.serialization mirrors of the wire contracts),
  the four ported pure team-patch functions, on-device state, field-level TS mapping.
- `api-usage.md` — full inventory of consumed endpoints + both SSE contracts, headers,
  error mapping, rate limits.
- `component-design.md` — packages, classes, ViewModels, services, the navigation graph.
- `implementation-plan.md` — the phased build DAG (P1–P11), gates, instrumentation checkpoints.
- `decisions.md` — DADRs (each cross-referencing the iOS ADR it mirrors or diverges from).
- `deployment.md` — build variants, APK delivery, versioning, cost estimate.
- `conventions.md` — Kotlin code conventions, package layout, test naming, fixtures.
- `testing-strategy.md` — test framework, split, mocking, fixtures.
</content>
</invoke>
