# Architecture Decision Records (Android)

Each DADR mirrors or deliberately diverges from the iOS ADR it descends from
(`docs/features/iphone-app/architecture/decisions.md`). The fixed decisions below were
made by the orchestrator before this doc pass; they are recorded, not relitigated.

## DADR Index

- **DADR-1** — Native Kotlin/Jetpack Compose client (mirrors ADR-1).
- **DADR-2** — Bearer-token auth, token in Keystore, never cookies; no backend change (mirrors ADR-2, diverges: already shipped).
- **DADR-3** — MVVM + `ViewModel`/`StateFlow`/`UiState` over service interfaces (mirrors ADR-3).
- **DADR-4** — minSdk 26 / compile+target 36; AGP 8.x + JDK 17 toolchain (mirrors ADR-4, adds toolchain constraint).
- **DADR-5** — Minimal deps: platform + four utility libraries; manual DI, no Hilt (mirrors ADR-5, adapted).
- **DADR-6** — SSE via OkHttp POST byte stream + custom empty-line-preserving parser (mirrors ADR-6).
- **DADR-7** — Native Compose markdown block renderer incl. GFM tables, no WebView (mirrors ADR-7, diverges: must render tables).
- **DADR-8** — `suspend` + typed `OakError`; in-domain failures are values, not exceptions (mirrors ADR-8).
- **DADR-9** — Single `:app` module, feature packages, `ServiceContainer` composition root (new; mirrors iOS layout).
- **DADR-10** — kotlinx.serialization with explicit per-field `@SerialName`; tolerant enum decoding (mirrors data-model fidelity rule).
- **DADR-11** — App in `android/`; delivery v1 = emulator-verified APK, no Play signing/listing (mirrors ADR-9 + deployment).
- **DADR-12** — Ported pure team-patch logic in the `wire` package, parity-tested against vectors (new; parity risk).
- **DADR-13** — Chat stream-resilience state machine parity (quick-stop, auto-reconnect, wake lock) (new; parity risk).
- **DADR-14** — App name "Oak"; no trademarked imagery; hot-linked sprites; tolerated-risk fan posture (mirrors ADR-10/ADR-11).

---

## DADR-1: Native Kotlin/Jetpack Compose client, not React Native / web wrapper
- **Mirrors:** ADR-1.
- **Status:** accepted.
- **Context:** The owner wants a genuinely native Android app at parity with web + iOS.
  The web app's pure TS modules can't be reused as code in a native Kotlin app.
- **Decision:** Build a native Kotlin 2.x / Jetpack Compose (Material 3) app that
  re-expresses the wire contracts in Kotlin and talks only to the existing HTTP/SSE API.
- **Alternatives considered:** React Native/Flutter (would share some logic across
  iOS/Android but weakens native feel and adds a large toolchain); a WebView wrapper
  (fails the native-feel bar). Both rejected.
- **Consequences:** A **third** renderer (web + iOS + Android) must stay in fidelity with
  the `OakAnswer` contract; a committed real-response fixture suite (P1) guards drift. No
  code sharing with `web/` or `ios/` — the Kotlin `wire` package is the structural port of
  `ios/OakApp/Models/Wire/`.

## DADR-2: Bearer-token auth in Keystore, never cookies — and no backend change
- **Mirrors:** ADR-2, with a divergence.
- **Status:** accepted.
- **Context:** iOS's ADR-2 was an *additive backend change* (`verify` returns the raw
  token; the resolver accepts `Authorization: Bearer`). That change **already shipped** for
  iOS, so Android inherits it at zero backend cost.
- **Decision:** Every authed request carries `Authorization: Bearer <token>`; the token is
  stored in Keystore-backed `EncryptedSharedPreferences`. The client never uses the cookie
  jar (OkHttp gets no `CookieJar`). A `401` on a previously-signed-in call drops the token,
  returns to guest, and prompts re-sign-in.
- **Divergence from ADR-2:** no `web/` work — this is a pure consumption decision, not a
  backend adaptation. Token lifetime stays the existing 30-day fixed window (no refresh).
- **Consequences:** One secure store to manage; auth state derives from token presence +
  `GET /api/auth/me`. Cross-platform behavior identical to iOS.

## DADR-3: MVVM + `ViewModel` / `StateFlow` / `UiState` over service interfaces
- **Mirrors:** ADR-3 (iOS `@Observable` + Observation).
- **Status:** accepted.
- **Context:** The app spans chat, teams, history, artifacts, account — too much for ad-hoc
  Compose `remember` state; needs testable presentation logic.
- **Decision:** Each screen owns an `androidx.lifecycle.ViewModel` exposing a single
  `StateFlow<UiState>` (an immutable data class) plus intent methods. ViewModels depend on
  **service interfaces** (`ChatService`, `AuthService`, …), never the `Live…` concretes, so
  they unit-test against `Fake…` doubles — the Kotlin analog of iOS's protocol seam.
- **Alternatives considered:** MVI frameworks (Orbit, Mavericks) — extra deps, rejected per
  DADR-5; raw Compose state — untestable at this size.
- **Consequences:** ViewModels are plain JVM-testable classes (no Android framework needed
  for the logic tests); `collectAsStateWithLifecycle` binds state into Compose.

## DADR-4: minSdk 26, compile/target SDK 36; AGP 8.x + JDK 17 toolchain
- **Mirrors:** ADR-4 (min-deployment target), adds a build-toolchain constraint.
- **Status:** accepted.
- **Context:** minSdk 26 (Android 8.0, 2017) gives near-universal device reach while
  allowing modern APIs (`AndroidKeyStore` `AES/GCM`, adaptive icons). The build host has
  JDK 17 at `/opt/homebrew/opt/openjdk@17` (not linked) and SDK platforms 33/35/36.
- **Decision:** minSdk 26, compileSdk/targetSdk 36. Build with **AGP 8.x only** (the JDK-17
  line — AGP 9 requires JDK 21 and is out of scope), Gradle 8.13+, Kotlin 2.x with the
  `compose-compiler` plugin, a `libs.versions.toml` version catalog, and a committed Gradle
  wrapper. `JAVA_HOME` is exported explicitly for every Gradle invocation.
- **Alternatives considered:** minSdk 24/21 (wider reach, older crypto APIs); AGP 9 (needs
  JDK 21 — unavailable). Rejected.
- **Consequences:** Gradle commands always run as
  `JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew …` from `android/`. The Photo Picker
  and `EncryptedSharedPreferences` are available without back-compat shims.

## DADR-5: Minimal dependencies — platform + four utility libraries; manual DI
- **Mirrors:** ADR-5 (zero third-party), adapted for the Android platform reality.
- **Status:** accepted.
- **Context:** iOS could ship with Apple frameworks only. Android's platform lacks native
  equivalents for a POST-SSE stream reader, snake/camel JSON mapping, image loading, and
  Keystore-backed prefs, so a **small, vetted** dependency set is unavoidable.
- **Decision:** Depend on the platform (Compose, Material 3, androidx: activity-compose,
  lifecycle-viewmodel-compose, navigation-compose) plus exactly **four** utility libraries:
  **OkHttp** (POST-SSE byte stream + REST), **kotlinx.serialization** (JSON),
  **Coil** (sprite images), **androidx.security:security-crypto** (Keystore-backed token).
  **No** DI framework — the composition root is a hand-written `ServiceContainer`
  (DADR-9). **No** SSE library, markdown library, or charting library.
- **Divergence from ADR-5:** not zero — "platform + four" — because those four have no
  first-party analog. Everything ADR-5 forbade for a *reason* (a markdown renderer, an SSE
  library, a DI container) is still forbidden.
- **Consequences:** A little more hand-written code (SSE parser, markdown blocks); a tiny,
  auditable supply chain; no DI-graph indirection.

## DADR-6: SSE via OkHttp POST byte stream + custom empty-line-preserving parser
- **Mirrors:** ADR-6.
- **Status:** accepted.
- **Context:** `POST /api/chat` and `POST /api/teams/assistant` are `POST` +
  `text/event-stream`. OkHttp's `EventSource` is `GET`-only; standard line readers
  (`BufferedReader.readLine`, `BufferedSource.readUtf8Line`) **drop the blank lines** SSE
  uses to delimit frames — the single biggest parity risk on Android.
- **Decision:** Open the stream with an OkHttp `Call`, read `response.body.source()` as raw
  bytes, split on the newline byte `0x0A` with a custom `ByteLineSplitter` that **preserves
  empty lines**, feed each line to a pure incremental `SseParser` (chat) or
  `BuilderSseParser` (assistant), and emit a cold `Flow<SseEvent>`. Cancelling the coroutine
  cancels the `Call`.
- **Alternatives considered:** OkHttp-SSE `EventSource` (GET-only), a third-party SSE lib
  (adds a dependency + still POST-hostile). Rejected.
- **Consequences:** Full control over POST + Bearer header + heartbeat (`: keep-alive`)
  handling; the splitter and parsers are pure and unit-tested against recorded `.sse`
  fixtures. **The empty-line-preserving splitter is mandatory** — a naive line reader
  silently concatenates every event's `data:` and breaks the terminal frame's decode.

## DADR-7: Native Compose markdown block renderer incl. GFM tables; no WebView
- **Mirrors:** ADR-7, with a divergence.
- **Status:** accepted.
- **Context:** `answer_markdown`/`reasoning_markdown` are prose that can embed GFM tables.
  iOS could lean on `AttributedString(markdown:)` and render most structured tables from
  typed fields; Android has no native markdown renderer.
- **Decision:** Hand-roll a **streaming-safe block splitter** that segments markdown into
  paragraph / heading / list / code-fence / **table** blocks and renders each as a native
  Compose composable (`Text` with inline `AnnotatedString` spans for bold/italic/code/links,
  and a real Compose table for GFM pipe tables). No WebView, no third-party markdown lib.
- **Divergence from ADR-7:** Android **must** render GFM tables in prose (iOS deferred them);
  the block renderer therefore includes an explicit table block. Structured data
  (`candidates`, `damage_calc`, `subjects`) still renders from typed fields, not markdown.
- **Consequences:** More renderer code and its own unit tests (block splitting is pure);
  no dependency; streaming partial markdown never crashes the splitter.

## DADR-8: `suspend` + typed `OakError`; in-domain failures are values, not exceptions
- **Mirrors:** ADR-8.
- **Status:** accepted.
- **Context:** Mirror the backend's "never throw in-domain" contract in idiomatic Kotlin.
- **Decision:** Networking/services use `suspend` functions that throw a typed `OakError`
  (`Transport`, `Http`, `RateLimited`, `Unauthorized`, `Decoding`, `ImageRejected`) for
  transport/HTTP faults only. **In-domain results** — a non-`answered` `OakAnswer`, an
  entity `not_found`/`unavailable`, team `validation` warnings — are normal returned values
  rendered in the UI. `ArtifactService`/`DexLookupService` never throw (they fold every
  fault to `null`/empty), exactly like iOS.
- **Alternatives considered:** `Result<T>` returns everywhere (less idiomatic with
  `suspend`/`Flow`); sealed `UiState.Error` at the service layer (mixes transport with
  domain). Rejected.
- **Consequences:** ViewModels have one `catch (e: OakError)` mapping to UI state; a clean
  split between transport faults (banners) and product states (rendered).

## DADR-9: Single `:app` module, feature packages, `ServiceContainer` composition root
- **Mirrors:** the iOS file layout + `ServiceContainer` (`Environment+Services.swift`); new
  as an ADR.
- **Status:** accepted.
- **Context:** A hobby-scale app doesn't need Gradle-module boundaries or a DI framework; it
  does need a testable seam for services.
- **Decision:** One `:app` module with feature **packages** under
  `ai.gowtam.oak.{app, networking, wire, services, features.{chat, artifact, auth, account,
  history, teams}, ui}`. The composition root is a hand-written **`ServiceContainer`**
  data class built once (`ServiceContainer.live()`), holding one `TokenStore` + one
  `OakApiClient` shared by every service, plus a `preview()`/fakes variant. It is passed to
  ViewModels via a `ViewModelProvider.Factory` (and exposed to Composables through a
  `CompositionLocal`).
- **Alternatives considered:** Hilt/Dagger/Koin (rejected per DADR-5 — the graph is tiny and
  hand-wiring is clearer); multi-module Gradle (premature at this size).
- **Consequences:** Zero DI-framework build cost; the `ServiceContainer` is the single place
  wiring is assembled and the single thing tests swap for fakes.

## DADR-10: kotlinx.serialization with explicit per-field `@SerialName`; tolerant enums
- **Mirrors:** the iOS data-model fidelity rule (explicit `CodingKeys`, no global
  `.convertFromSnakeCase`).
- **Status:** accepted.
- **Context:** The wire **mixes conventions**: chat/answer/entity payloads are `snake_case`
  (`dex_number`, `answer_markdown`, `display_name`), but the chat image field is `mimeType`
  and the auth/conversation/team envelopes are `camelCase` (`signedIn`, `expiresAt`,
  `updatedAt`, `createdAt`). A global naming strategy would corrupt one side or the other.
- **Decision:** Every `@Serializable` DTO maps its wire keys with explicit **`@SerialName`**
  per renamed field; **never** a global `JsonNamingStrategy`. `Format` and `ScopeSource`
  decode **tolerantly** — an unrecognized string degrades to an `Unknown(raw)` case rather
  than failing the whole parent object (the server can widen scopes independently of an app
  release). `TeamWarning.code` similarly tolerates unknown codes (see the drift note in
  `data-model.md`).
- **Alternatives considered:** `@JsonNamingStrategy.SnakeCase` globally (breaks the camelCase
  envelopes); Moshi/Gson (extra dep, weaker sealed-class support). Rejected.
- **Consequences:** A committed real-response fixture round-trip suite (P1) is the drift
  guard; a widened `Format`/`ScopeSource`/warning code can never break an existing list.

## DADR-11: App in `android/`; delivery v1 = emulator-verified APK, no Play signing
- **Mirrors:** ADR-9 (repo placement) + the iOS deployment posture.
- **Status:** accepted.
- **Context:** v1 targets a verified debug + release APK installable on the local emulator;
  Play Store signing and the store listing are deferred.
- **Decision:** The Gradle project lives under `android/` (sibling to `ios/`/`web/`). v1
  ships an **emulator-verified debug and release APK** (`assembleDebug`/`assembleRelease`),
  installed via `adb`. No Play App Signing, no upload key, no store listing in v1. `debug`
  points at the staging/prod base URL via an `OAK_STAGING` build flag (mirrors iOS's
  `OAK_STAGING` compilation condition); `release` points at prod.
- **Alternatives considered:** Straight to Play internal testing (needs signing + listing —
  deferred). Kept as the natural next ring.
- **Consequences:** No signing infra to manage in v1; the release APK is debuggable-signed
  locally. Play delivery is a later, additive step.

## DADR-12: Ported pure team-patch logic in the `wire` package, parity-tested
- **New** (the iOS build ported these as free functions in `TeamsAssistantWire.swift`).
- **Status:** accepted.
- **Context:** The Teams Assistant proposes a `TeamPatch`; the client **applies it locally**
  to the on-screen draft. The applied result MUST equal what the server legality-gate
  computed from the same patch — otherwise the user's draft and the server's view diverge.
- **Decision:** Port `applyTeamPatch`, `blankTeamMember`, `describeTeamPatch`, and
  `titleizeTeamSlug` **verbatim** from `web/src/agent/teams-assistant/schemas.ts` (and
  `display-names.ts`) into the Kotlin `wire` package as pure functions, and pin them with
  **parity vectors** (input draft + patch → expected members) shared with the web/iOS logic.
  Slot indices refer to the PRE-patch draft; replace/extend-with-blank-padding first, then
  null-remove, then compact and cap at 6.
- **Alternatives considered:** Re-fetch the team from the server after each apply (adds a
  round-trip, breaks the offline-draft feel). Rejected.
- **Consequences:** The apply/undo flow is instant and provably in sync with the server; the
  parity vectors are a hard drift guard.

## DADR-13: Chat stream-resilience state machine parity
- **New** (ports the iOS `ChatViewModel` resilience logic, itself a port of web `page.tsx` /
  `sse-client.ts`).
- **Status:** accepted.
- **Context:** The chat experience depends on subtle stream behaviors: a **2s quick-stop**
  that wipes the just-started turn and restores its text, a **background auto-reconnect**
  (max 1 attempt) that heals the dominant screen-off drop, a **screen-wake hold** during a
  stream, and **guest-thread mirroring** for the sign-in import.
- **Decision:** Port the state machine into `ChatViewModel` exactly: `QUICK_STOP_MS = 2000`,
  `MAX_RETRIES = 1`, a `hiddenDuringTurn` gate armed only by a real backgrounding (Android
  `Lifecycle.Event.ON_STOP`/`ON_START` via `ProcessLifecycleOwner` or the Activity), a
  `FLAG_KEEP_SCREEN_ON` window flag held for the duration of a stream, and mirroring of the
  full `OakAnswer` (not just prose) into the in-memory guest thread. Grok delivers the whole
  answer in a **single** `answer_delta`, so the reducer must not assume many.
- **Alternatives considered:** No auto-reconnect (worse UX on screen-off); unbounded retries
  (double-persist risk). Rejected.
- **Consequences:** The reducer transitions are unit-tested directly (clock-injectable
  quick-stop, scripted event flows); the wake-lock and lifecycle hooks are the only pieces
  that need the Android framework.

## DADR-14: App name "Oak"; no trademarked imagery; tolerated-risk fan posture
- **Mirrors:** ADR-10 + ADR-11 (condensed).
- **Status:** accepted.
- **Context:** Pokémon marks are Nintendo/TPC IP. Oak displays copyrighted images at
  runtime — official artwork and pixel sprites **hot-linked** (via Coil) from the PokeAPI /
  Pokémon Showdown CDNs, never bundled — and references the word "Pokémon" and character
  names nominatively.
- **Decision:** Ship as an unofficial fan reference named **"Oak"** (no trademarked term in
  the name/icon), under the same **tolerated-risk** posture iOS adopted: facts are
  uncopyrightable; names are used nominatively with no logos/brand fonts; a prominent
  **non-affiliation disclaimer** ships in-app; **no "fair use" claim** in any listing copy.
  Telemetry is on-device only (`Log` + logcat/Play Console crash reports) — no third-party
  analytics SDK.
- **Alternatives considered:** Drop the official artwork and keep only pixel sprites (lower
  exposure — kept as the first fallback if a complaint arrives); bundle no images (needless
  UX downgrade). Rejected.
- **Consequences:** Simplest data-safety disclosure; adoption metrics are aspirational. If a
  rights holder complains, pull/replace the hot-linked artwork and lean on the disclaimer.

---

## Unresolved / carried from iOS

- **Session lifetime.** Tokens are a 30-day fixed window; no sliding refresh. Keep for v1.
- **List pagination.** Conversations/teams return full lists; in-memory filter for v1.
- **Push notifications.** Out of scope for v1 (would need FCM + a backend registration
  endpoint).
- **Play delivery.** Signing + store listing deferred (DADR-11); v1 is emulator-verified APKs.
</content>
