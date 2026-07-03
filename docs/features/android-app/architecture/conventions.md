# Code Conventions (Android)

**Developer mode.** Conventions for the Kotlin / Jetpack Compose client. Decisions
surfaced during design are recorded here with rationale. These mirror the iOS
`conventions.md` seam-for-seam.

## Language & tooling
- **Kotlin 2.x**, JVM target **17**, with the `org.jetbrains.kotlin.plugin.compose`
  (compose-compiler) Gradle plugin. Explicit-API mode is not required, but public service
  interfaces and wire DTOs are documented.
- **Jetpack Compose + Material 3**, minSdk 26 / compile+target 36 (DADR-4). No XML layouts,
  no Fragments — a single `Activity` hosting a Compose `NavHost`.
- **Build:** **AGP 8.x only** (JDK-17 line — do NOT propose AGP 9), Gradle 8.13+, a
  `libs.versions.toml` version catalog, a committed Gradle wrapper. Every Gradle invocation
  exports `JAVA_HOME=/opt/homebrew/opt/openjdk@17` explicitly (the JDK is unlinked on the
  build host).
- **Dependencies (DADR-5):** platform (Compose/Material3/androidx activity-compose,
  lifecycle-viewmodel-compose, navigation-compose) + exactly four utility libs — OkHttp,
  kotlinx.serialization-json, Coil (`coil-compose`), androidx.security:security-crypto. Test
  libs: JUnit4, kotlinx-coroutines-test, OkHttp MockWebServer, Turbine (optional), Compose
  UI test. **No** DI framework, SSE library, markdown library, or charting library.
- **Formatting/lint:** `ktlint` (or `spotless` with ktlint) with the default style;
  Android Lint via `./gradlew :app:lint`. One statement per line; trailing commas in
  multiline literals.

## Naming
- **Files:** PascalCase matching the primary type (`ChatViewModel.kt`). Related small
  composables may share a file (`AnswerCard.kt`), one primary concept per file.
- **Types:** PascalCase. **Service interfaces** name the role (`AuthService`); the concrete
  is `Live…` (`LiveAuthService`); test doubles are `Fake…` (`FakeAuthService`); preview
  stubs are `PreviewStub…`.
- **ViewModels:** `…ViewModel`. **Composables:** PascalCase noun/screen (`ChatScreen`,
  `AnswerCard`). **DTOs:** the wire name (`OakAnswer`, `ConversationSummary`).
- **Packages:** all-lowercase, no underscores (`ai.gowtam.oak.features.chat`).
- **Wire ↔ Kotlin:** wire is `snake_case` OR `camelCase` (mixed — see below); Kotlin
  properties are `camelCase`, mapped with explicit **`@SerialName`** per renamed field.
  **Never** set a global `JsonNamingStrategy`.
- **Suspend functions:** verb-first (`requestCode`, `importGuestThread`). No `get` prefix on
  simple accessors.

## Serialization (the mixed-convention rule — DADR-10)
- One shared `Json` config: `ignoreUnknownKeys = true`, `explicitNulls = false` for
  **decoding**; a separate `Json { explicitNulls = true }` (or a custom `TeamMember`
  serializer) for **encoding a team** so the `.nullable()`-required keys (`species`,
  `ability`, `item`, `nature`, `tera_type`) are emitted as explicit `null` while the
  `.optional()` cosmetics (`nickname`/`gender`/`shiny`) are omitted. See `data-model.md`.
- `Format`, `ScopeSource`, and `TeamWarning.Code` use **tolerant** custom serializers —
  an unrecognized string degrades to an `Unknown(raw)` case, never a decode failure. The
  wire can widen these independently of an app release.
- Every renamed field carries `@SerialName`; identity-named fields (auth/conversation/team
  camelCase envelopes) rely on the property name. A round-trip fixture test (P1) is the
  drift guard.

## Module boundaries (layering — strictly downward)
```
features (Composables + ViewModels)  →  services  →  networking (+ wire)  →  OkHttp / kotlinx / androidx
app/ (AppState, ServiceContainer) and ui/ are shared leaf layers.
```
- Composables never call `OakApiClient` directly — only through a Service via their
  ViewModel.
- Only `TokenStore` touches secure storage. Only `networking` constructs OkHttp `Request`s.
- `wire` imports nothing android-specific (pure DTOs + pure functions) — it's the would-be
  shared module if a KMP client ever happens.
- ViewModels depend on **service interfaces**, never `Live…` concretes — that's what makes
  them unit-testable with `Fake…`.

## Error handling (DADR-8)
- Networking/services are `suspend` and throw the single typed `OakError` (`Transport`,
  `Http`, `RateLimited`, `Unauthorized`, `Decoding`, `ImageRejected`) for transport/HTTP
  faults only.
- **In-domain failures are values, not exceptions:** a non-`answered` `OakAnswer`, an entity
  `not_found`/`unavailable`, and team `validation` warnings are returned normally and
  rendered — never thrown. `ArtifactService`/`DexLookupService` are the deliberate
  non-throwing seams (fold every fault to `null`/empty).
- ViewModels have one `catch (e: OakError)` mapping to UI state: `Transport` → connection
  banner + retry; `RateLimited` → specific message (+ guest "sign in raises the limit");
  `Unauthorized` → drop token, return to guest, prompt re-sign-in; others → recoverable
  banner. **Errors are never swallowed silently** — every catch surfaces UI state or logs.

## Concurrency
- ViewModels expose `StateFlow<UiState>`; state mutates on the main dispatcher (via
  `viewModelScope`, which defaults to `Dispatchers.Main.immediate`). Blocking/IO work runs
  on `Dispatchers.IO` (OkHttp calls are `suspend` wrappers).
- The chat/assistant streams are cold `Flow`s collected in a `viewModelScope` `Job` that is
  cancelled on a new turn or `onCleared`; cancellation cancels the OkHttp `Call`.
- No callbacks for app logic; no `Handler`/`Thread` (only where an Android API requires it).
- Compose reads state via `collectAsStateWithLifecycle()` so collection stops off-screen.

## Logging (on-device only)
- `android.util.Log` with per-area tags: `Oak.Network`, `Oak.Auth`, `Oak.Chat`, `Oak.UI`.
  Levels: `d` (dev detail), `i` (lifecycle), `e` (caught `OakError`).
- **Never log** the session token, OTP codes, message content, image bytes, or full emails.
  Log error `code`/status and a request label, not payloads.
- No remote sink; crashes go to logcat / Play Console (DADR-14).

## Compose / state
- One `@Composable` screen owns one `ViewModel` (obtained via `viewModel(factory = …)` from
  the `ServiceContainer`); `AppState` is provided through a `CompositionLocal`.
- Prefer stateless composables driven by a `UiState` param + intent lambdas; side effects
  live in the ViewModel, triggered from `LaunchedEffect`/lifecycle events.
- Respect system light/dark and **font scale / dynamic type** (use `sp` for text, never fixed
  `dp` font sizes). **Color is never the sole carrier of meaning** — pair with text/icon
  (type badges, status badges, warning severity).
- Support **dynamic color** (Material You) where sensible but keep the Oak brand accent as
  the primary identity in both schemes (`ui/Theme.kt`).

## Permissions & platform
- Camera capture and the Photo Picker use `ActivityResultContracts` (no bare permission
  requests for the modern Photo Picker). A denied camera permission explains how to enable it
  in Settings and keeps the other attach paths working.
- `FLAG_KEEP_SCREEN_ON` is held on the window only for the duration of a chat stream, via a
  single centralized toggle (mirrors iOS's `isIdleTimerDisabled`) so it can never stick on.
</content>
