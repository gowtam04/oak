# Implementation Plan (Android)

Build-order phases for the native Android client. **No backend work** (account deletion +
Bearer auth already shipped). Phases mirror the iOS P-set adapted to Kotlin; each is
completable by one focused agent in one sitting.

**Standard gate (every phase), run from `android/`:**
```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest
```
(+ `:app:lint` on UI phases.) Source paths below are under
`android/app/src/main/kotlin/ai/gowtam/oak/`; unit tests under
`android/app/src/test/kotlin/ai/gowtam/oak/`; instrumentation under
`android/app/src/androidTest/kotlin/ai/gowtam/oak/`; fixtures under
`android/app/src/test/resources/fixtures/`.

---

## Prerequisite — P0 Scaffold (Stage B, already completed)
The `android/` Gradle project exists: committed wrapper, `libs.versions.toml`, single `:app`
module with the feature packages, Compose + Material 3 + the four utility deps,
`OakApplication`/`MainActivity`/`RootScaffold` shell (3-tab `NavigationBar`), `BaseUrl`
(`OAK_STAGING`), debug/release variants, `ai.gowtam.oak` applicationId, minSdk 26 /
compile+target 36. Gate: `:app:assembleDebug` passes locally. **P1 depends on P0.**

---

## P1 — Wire models + fixtures + ported patch logic
- **Objective:** all `wire/` `@Serializable` DTOs + the four ported pure functions, with a
  committed real-response fixture round-trip suite. The typed contract every layer uses.
- **In-scope files:** `wire/Format.kt`, `wire/ChatWire.kt`, `wire/OakAnswer.kt`,
  `wire/JsonScalar.kt`, `wire/Team.kt`, `wire/TeamsAssistantWire.kt` (incl. `applyTeamPatch`/
  `blankTeamMember`/`describeTeamPatch`/`titleizeTeamSlug`), `wire/Conversation.kt`,
  `wire/EntityArtifact.kt`, `wire/DexLookup.kt`, `wire/AuthDtos.kt`; the shared `Json`
  config; `test/.../wire/*DecodeTest.kt`, `test/.../wire/ApplyTeamPatchParityTest.kt`;
  `test/resources/fixtures/**` (copied from `ios/OakAppTests/Fixtures/`).
- **Depends on:** P0.
- **Acceptance checks:**
  1. Every committed fixture decodes with no data loss; an `OakAnswer` with all optional
     fields present decodes fully; all four statuses decode.
  2. `TeamMember` round-trips: decode tolerates absent/null; encode emits explicit `null` for
     the five `.nullable()`-required keys and omits the three `.optional()` cosmetics.
  3. `Format`/`ScopeSource`/`TeamWarning.Code` decode an unknown string to `Unknown(raw)`
     without failing the parent object; `item_missing` decodes (the iOS-missing code).
  4. `JsonScalar` keeps integers as integers and bools as bools (no `1`/`0` coercion).
  5. `applyTeamPatch`/`blankTeamMember`/`describeTeamPatch`/`titleizeTeamSlug` pass the shared
     parity vectors (replace/extend-with-blank-pad, null-remove, compact, cap-6; curly-quote/
     em-dash/middot formatting).

## P2 — Networking core (REST + errors + token)
- **Objective:** `OakApiClient` (OkHttp, Bearer injection, JSON, error mapping), `Endpoint`,
  `OakError` + HTTP mapping, `TokenStore` (Keystore-backed `EncryptedSharedPreferences`),
  `BaseUrl`.
- **In-scope files:** `networking/OakApiClient.kt`, `networking/Endpoint.kt`,
  `networking/OakError.kt`, `networking/TokenStore.kt`, `networking/BaseUrl.kt` (if not final
  from P0); `test/.../networking/OakErrorMappingTest.kt`,
  `test/.../networking/OakApiClientTest.kt` (MockWebServer),
  `androidTest/.../networking/TokenStoreTest.kt`.
- **Depends on:** P1.
- **Acceptance checks:**
  1. 2xx decodes to the typed DTO; 401→`Unauthorized`; 429→`RateLimited` with `Retry-After`
     parsed (numeric and HTTP-date); other non-2xx→`Http(status,code,message)` from the
     envelope (all via MockWebServer).
  2. Bearer header is attached iff `requiresAuth` and a token exists; a non-HTTPS base URL
     fails fast as `Transport("insecure_scheme")`.
  3. `TokenStore` set→get→clear round-trips through `EncryptedSharedPreferences`; cleared on
     signout; the token is never in any log line.
  4. A transport failure maps to `Transport(underlying)` with a non-sensitive label.

## P3 — SSE (byte stream + splitter + parsers)
- **Objective:** the empty-line-preserving byte splitter, the two pure incremental parsers,
  and the `SseClient` stream loop over OkHttp.
- **In-scope files:** `networking/ByteLineSplitter.kt`, `networking/SseParser.kt`
  (+ `SseLineParser` interface), `networking/BuilderSseParser.kt`, `networking/SseClient.kt`;
  `test/.../networking/ByteLineSplitterTest.kt`, `test/.../networking/SseParserTest.kt`,
  `test/.../networking/BuilderSseParserTest.kt`, `test/.../networking/SseClientTest.kt`
  (MockWebServer streaming a recorded `.sse`).
- **Depends on:** P1, P2.
- **Acceptance checks:**
  1. `ByteLineSplitter` emits an empty string for a blank line and splits UTF-8-safely on
     `0x0A`; a trailing unterminated line flushes on `finish()`.
  2. `SseParser` reconstructs the exact `SseEvent` sequence from `chat_answered_full.sse`,
     the **single-delta Grok** stream, and `chat_scope_gen7.sse`; ignores `: keep-alive`
     heartbeats and unknown fields.
  3. An unknown event name is a no-op (forward-compat); `BuilderSseParser` ignores a stray
     `scope` frame; a recognized event with bad `data:` JSON throws `Decoding`.
  4. `SseClient.stream` yields events from a MockWebServer stream; a pre-stream non-2xx throws
     the mapped `OakError` before any event; cancelling the collector cancels the `Call`.

## P4 — Services layer (interfaces + Live + fakes + ImageEncoder)
- **Objective:** every service interface with its `Live…` impl over `OakApiClient`/`SseClient`,
  the `ServiceContainer` composition root, `Fake…`/`PreviewStub…` doubles, and the pure
  `ImageEncoder`.
- **In-scope files:** `services/AuthService.kt`, `services/ChatService.kt`,
  `services/HistoryService.kt`, `services/TeamService.kt`, `services/ArtifactService.kt`,
  `services/DexLookupService.kt`, `services/TeamsAssistantService.kt`, `services/ImageEncoder.kt`;
  `app/ServiceContainer.kt`, `app/AppState.kt`; `test/.../services/*Test.kt`,
  `test/.../services/ImageEncoderTest.kt`, `test/.../support/Fakes.kt`.
- **Depends on:** P2, P3 (and P1).
- **Acceptance checks:**
  1. Each `Live…` service maps its route(s) to the right `Endpoint` + DTO; `HistoryService.list`
     returns `[]` for guests; `ArtifactService`/`DexLookupService` never throw (fold to
     `null`/empty) even on a MockWebServer 500.
  2. `ChatService.send` encodes images via `ImageEncoder` **before** opening the stream and
     surfaces `ImageRejected` when caps fail; `TeamsAssistantService.send` sends `draft` every
     turn and yields `BuilderSseEvent`s.
  3. `ImageEncoder` enforces ≤4 / per-image ≤3.75 MiB / total ≤10 MiB / 1568px downscale with
     typed rejection; output is raw base64 (no `data:` prefix); PNG chosen for alpha-that-fits
     else JPEG via the quality-then-shrink loop; an image-only (empty text) turn is valid.
  4. `ServiceContainer.live()` builds one shared `TokenStore` + `OakApiClient`; `Fake…` doubles
     satisfy every interface for downstream VM tests.

## P5 — Theme + shared UI (tokens, badges, sprites, markdown blocks)
- **Objective:** the Material 3 theme (Oak tokens, light/dark, dynamic type), the shared
  atoms, and the streaming-safe markdown block renderer incl. GFM tables.
- **In-scope files:** `ui/Theme.kt`, `ui/TypeBadge.kt`, `ui/SpriteImage.kt` (Coil),
  `ui/MarkdownBlocks.kt`, `ui/ConnectionState.kt`; `test/.../ui/MarkdownBlocksTest.kt`
  (pure block-split logic), `androidTest/.../ui/TypeBadgeTest.kt` (color-not-sole-signal).
- **Depends on:** P1.
- **Acceptance checks:**
  1. `MarkdownBlocks` splits prose into paragraph/heading/list/code/**table** blocks; a GFM
     pipe table renders as a Compose table; partial/streaming markdown never crashes the split.
  2. Inline spans (bold/italic/code/link) render via `AnnotatedString`.
  3. `TypeBadge` shows a text label alongside the type color (never color-only); `SpriteImage`
     shows a placeholder while loading and a graceful failure state.
  4. Theme renders in light and dark and respects the system font scale without clipping.

## P6 — Chat feature (reducer + resilience + composer + AnswerCard) → CP-A
- **Objective:** the chat thread end-to-end for guests: the `ChatViewModel` SSE reducer + the
  full stream-resilience state machine (DADR-13), the composer, the streaming status, and the
  field-by-field `AnswerCard` tree.
- **In-scope files:** `features/chat/ChatViewModel.kt`, `features/chat/ChatScreen.kt`,
  `features/chat/Composer.kt`, `features/chat/StreamingStatus.kt`,
  `features/chat/answercard/*.kt` (StatusBadge, ScopeTag, CaveatStrip, Subjects,
  ClarifyQuestion, CandidatesTable, DamageCalc, TeamBlocks, Suggestions, Reasoning, Citations,
  Inferences, AnswerCard); `MainActivity` wake-lock + lifecycle wiring;
  `test/.../chat/ChatViewModelReducerTest.kt`, `.../ChatViewModelResilienceTest.kt`;
  `androidTest/.../chat/AnswerCardRenderTest.kt`.
- **Depends on:** P4, P5, P3, P1.
- **Acceptance checks:**
  1. Reducer over fixture streams: `answer_delta` appends; `answer_start` clears the buffer
     (keeps tool history); terminal `answer` commits the authoritative `OakAnswer`; a
     non-`answered` status renders as a normal answer (not an error); `error` → banner.
  2. `scope` adoption sets `resolvedScope` and clears a pending `scopeSeed`; `displayFormat =
     scopeSeed ?? resolvedScope ?? Champions`; the single-delta Grok stream renders fully.
  3. Quick-stop (< 2000ms, virtual clock) wipes the thread + rotates the session + restores the
     message; a later stop keeps the answerless turn.
  4. Screen-off auto-reconnect: a `transport` drop while `hiddenDuringTurn` retries once and
     shows "Reconnecting…"; an in-band `error` is never auto-retried; the wake-lock is released
     on every terminal/stop/cancel path.
  5. AnswerCard renders each present field in the exact order (status→scope→caveat→answer→
     subjects→question→candidates→damage→teams→suggestions→reasoning→citations→inferences) and
     omits absent ones, in light/dark at large font scale.

## P7 — Artifact viewer
- **Objective:** the modal bottom-sheet viewer with a back stack, the five entity kinds, and
  tappable entities in the AnswerCard that push artifacts.
- **In-scope files:** `features/artifact/ArtifactViewModel.kt`, `features/artifact/ArtifactSheet.kt`,
  `features/artifact/EntityDetail.kt`, `features/artifact/ComparisonView.kt`; tappable hooks in
  `features/chat/answercard/*`; `test/.../artifact/ArtifactViewModelTest.kt`;
  `androidTest/.../artifact/EntityDetailRenderTest.kt`.
- **Depends on:** P4, P5, P6.
- **Acceptance checks:**
  1. Back stack: `push`/`back`/`dismiss` shows exactly one artifact at a time; system-back /
     predictive-back pops the sheet before the nav stack.
  2. All five entity kinds render (pokemon incl. matchups + grouped movepool; move; ability;
     item; type); tapping a nested entity pushes the next artifact.
  3. A `not_found`/`unavailable`/transport fetch returns `null` gracefully (honest "couldn't
     load" state) without breaking the sheet; a team artifact uses the inline `proposed_team`
     (no fetch).
  4. "Ask about this in chat" prefills the composer (does not auto-send).

## P8 — Auth + Account
- **Objective:** the email-OTP sign-in flow, session transitions, and the account screen incl.
  in-app account deletion.
- **In-scope files:** `features/auth/AuthViewModel.kt`, `features/auth/AuthScreen.kt`,
  `features/account/AccountViewModel.kt`, `features/account/AccountScreen.kt`; auth transitions
  in `app/AppState.kt`; `test/.../auth/AuthViewModelTest.kt`, `test/.../account/AccountViewModelTest.kt`.
- **Depends on:** P4, P5.
- **Acceptance checks:**
  1. Request code → verify (6-digit boxes, paste support — codes arrive by EMAIL, no SMS autofill) stores the token and lands signed-in;
     relaunch stays signed in; sign-out clears the token → guest.
  2. Invalid/expired code and rate-limit surface specific messages; resend respects the 60s
     cooldown.
  3. A 401 on an authed call drops the token, returns to guest, and prompts re-sign-in.
  4. Account deletion (confirm flow) calls `DELETE /api/auth/account`, clears the token, and
     returns to guest; a 401 during deletion still clears locally.

## P9 — History (folded into Chat)
- **Objective:** the signed-in conversation list (search/format-filter/pin/rename/delete),
  resume into the chat thread, and the guest→sign-in import handoff.
- **In-scope files:** `features/history/HistoryViewModel.kt`, `features/history/HistoryList.kt`;
  resume wiring into `features/chat/ChatViewModel.kt` (`loadResumed`) and the Chat top bar;
  import handoff in `app/AppState.kt`; `test/.../history/HistoryViewModelTest.kt`.
- **Depends on:** P8, P6.
- **Acceptance checks:**
  1. A signed-in user sees conversations (incl. web-created ones); search/format-filter/pin/
     rename/delete work against a fake service; guests see the sign-in prompt.
  2. Resume sets `session_id = conversation.id`, seeds `resolvedScope = conversation.format`,
     and re-renders earlier turns through the AnswerCard; a follow-up continues the thread.
  3. A guest who signs in mid-thread triggers `importGuestThread(sessionId, guestThreadScope,
     turns)`; the returned id becomes the active conversation; failure keeps the on-screen thread.

## P10 — Teams + Teams Assistant → CP-B
- **Objective:** the full team library + editor (entity pickers, learnset-scoped moves, EV/IV
  grids, Mega item auto-force, Showdown import/export, warn-but-allow save) and the docked
  Teams Assistant (proposed-changes card, Apply-to-draft / Undo via the ported patch logic).
- **In-scope files:** `features/teams/TeamsListViewModel.kt`, `features/teams/TeamsList.kt`,
  `features/teams/TeamEditorViewModel.kt`, `features/teams/TeamEditor.kt`,
  `features/teams/EntityPickerField.kt`, `features/teams/ShowdownImport.kt`,
  `features/teams/TeamsAssistantViewModel.kt`, `features/teams/TeamsAssistantSheet.kt`;
  the "Apply" hook in `features/chat/answercard/TeamBlocks.kt`;
  `test/.../teams/TeamEditorViewModelTest.kt`, `.../TeamsAssistantViewModelTest.kt`,
  `.../TeamsListViewModelTest.kt`.
- **Depends on:** P8, P4, P5, P7.
- **Acceptance checks:**
  1. Build/save/reopen a 6-mon team; warnings render but never block save (warn-but-allow);
     Showdown export round-trips through import; import `notes` surface unresolved parts.
  2. Entity pickers: species/item typeahead scoped to the team format; the move picker offers
     ONLY the member's learnset; the ability picker offers only the sprite ref's abilities.
  3. Mega auto-force: filling a Mega species forces its `required_item` stone into the held-item
     field (forward-only, idempotent, never clears).
  4. Teams Assistant: `send` streams with the live draft; `apply(turn)` runs `applyTeamPatch` on
     the draft (DB untouched) and shows Undo only on the last-applied turn; `undo()` restores the
     pre-apply snapshot; `describeTeamPatch` renders the proposed-changes card.
  5. "Apply" on a chat `proposed_team` creates a saved team.

## P11 — Polish + release build → CP-C
- **Objective:** the accessibility/motion/dark-theme polish pass, the connection-state surface,
  brand assets, and a verified release APK.
- **In-scope files:** `ui/ConnectionState.kt` finalization, `ui/Theme.kt` motion/reduce-motion
  gating, adaptive icon + brand assets under `app/src/main/res/`, TalkBack semantics across
  screens, `AndroidManifest.xml` permissions/usage; a `proguard-rules.pro` if minifying release.
- **Depends on:** P1–P10.
- **Acceptance checks:**
  1. `:app:assembleDebug` and `:app:assembleRelease` both produce installable APKs.
  2. Airplane-mode shows a clean connection-state surface (no crash); every in-domain error
     renders (never crashes).
  3. TalkBack reaches key controls; layouts hold at the largest font scale; reduce-motion
     (animator duration scale 0) disables the entrance animations.
  4. Light and dark themes are consistent; color is never the sole signal (badges/status).

---

## Integration checkpoints

- **CP-A — Chat full-fidelity (after P6):** boot the API 35 AVD headless, install the debug
  APK, run `:app:connectedDebugAndroidTest`, and drive a **live guest chat turn** against
  `https://oak-gowtam.fly.dev` (one turn, under the 20/60s guest limit) — verify the `scope`
  event, tool ticker, streamed answer, and an AnswerCard with subjects+candidates+citations+
  inferences renders every field. Scripted `adb` screenshots are the evidence.
- **CP-B — Signed-in data round-trip (after P10):** create a team, save it, reopen it, ask a
  team question in chat, and confirm the conversation persists + resumes on a fresh launch;
  run a Teams Assistant apply/undo and confirm the draft matches `applyTeamPatch`. Instrumentation
  + a live signed-in drive.
- **CP-C — Release E2E (after P11):** full `:app:connectedDebugAndroidTest` on the AVD +
  `:app:assembleRelease` + a manual parity/accessibility/offline pass with screenshots
  (empty chat, streaming, answer card, artifact sheet, auth, teams editor, assistant, dark mode).

---

## Build Manifest

```yaml
commands:
  gate: "JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest"   # from android/
  lint: "JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:lint"
  assemble_debug: "JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:assembleDebug"
  assemble_release: "JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:assembleRelease"
  connected: "JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:connectedDebugAndroidTest"   # AVD booted
phases:
  - id: p1
    name: Wire models + fixtures + patch logic
    depends_on: [p0]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/wire/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/wire/**",
            "android/app/src/test/resources/fixtures/**"]
    shared: []
    test_focus: "decode every fixture + every OakAnswer status; TeamMember encode nulls; tolerant enums; applyTeamPatch vectors"
    flags: []
  - id: p2
    name: Networking core
    depends_on: [p1]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/networking/OakApiClient.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/Endpoint.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/OakError.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/TokenStore.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/BaseUrl.kt",
            "android/app/src/test/kotlin/ai/gowtam/oak/networking/**",
            "android/app/src/androidTest/kotlin/ai/gowtam/oak/networking/**"]
    shared: []
    test_focus: "error mapping (401/429+Retry-After/4xx/5xx/transport); Bearer injection; Keystore token CRUD"
    flags: []
  - id: p3
    name: SSE splitter + parsers + client
    depends_on: [p1, p2]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/networking/ByteLineSplitter.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/SseParser.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/BuilderSseParser.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/networking/SseClient.kt"]
    shared: ["android/app/src/test/kotlin/ai/gowtam/oak/networking/**"]
    test_focus: "empty-line-preserving split; exact event sequence; single-delta Grok; heartbeats; unknown-event no-op"
    flags: []
  - id: p4
    name: Services + ImageEncoder + ServiceContainer
    depends_on: [p2, p3]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/services/**",
            "android/app/src/main/kotlin/ai/gowtam/oak/app/ServiceContainer.kt",
            "android/app/src/main/kotlin/ai/gowtam/oak/app/AppState.kt",
            "android/app/src/test/kotlin/ai/gowtam/oak/services/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/support/**"]
    shared: []
    test_focus: "route→DTO mapping; artifact/dex never throw; ImageEncoder caps + base64; container wiring"
    flags: []
  - id: p5
    name: Theme + shared UI
    depends_on: [p1]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/ui/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/ui/**",
            "android/app/src/androidTest/kotlin/ai/gowtam/oak/ui/**"]
    shared: []
    test_focus: "markdown block split incl. GFM tables; type badge not color-only; sprite placeholder/failure; light/dark + font scale"
    flags: [ui]
  - id: p6
    name: Chat feature (reducer + resilience + AnswerCard)
    depends_on: [p4, p5, p3]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/features/chat/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/chat/**",
            "android/app/src/androidTest/kotlin/ai/gowtam/oak/chat/**"]
    shared: ["android/app/src/main/kotlin/ai/gowtam/oak/app/MainActivity.kt"]
    test_focus: "reducer (delta/start/answer/error/scope); quick-stop; screen-off auto-reconnect; AnswerCard order"
    flags: [ui]
  - id: p7
    name: Artifact viewer
    depends_on: [p4, p5, p6]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/features/artifact/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/artifact/**",
            "android/app/src/androidTest/kotlin/ai/gowtam/oak/artifact/**"]
    shared: ["android/app/src/main/kotlin/ai/gowtam/oak/features/chat/answercard/**"]
    test_focus: "back-stack; one-at-a-time; five entity kinds; nil-graceful fetch; inline team artifact"
    flags: [ui]
  - id: p8
    name: Auth + Account
    depends_on: [p4, p5]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/features/auth/**",
            "android/app/src/main/kotlin/ai/gowtam/oak/features/account/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/auth/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/account/**"]
    shared: ["android/app/src/main/kotlin/ai/gowtam/oak/app/AppState.kt"]
    test_focus: "OTP happy/invalid/expired/cooldown/rate-limit; signout clears; 401→guest; delete→guest+token cleared"
    flags: [ui]
  - id: p9
    name: History (folded into Chat)
    depends_on: [p8, p6]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/features/history/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/history/**"]
    shared: ["android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ChatViewModel.kt",
              "android/app/src/main/kotlin/ai/gowtam/oak/app/AppState.kt"]
    test_focus: "list/search/filter/mutations; resume sets session_id + scope; guest import on sign-in"
    flags: [ui]
  - id: p10
    name: Teams + Teams Assistant
    depends_on: [p8, p4, p5, p7]
    owns: ["android/app/src/main/kotlin/ai/gowtam/oak/features/teams/**",
            "android/app/src/test/kotlin/ai/gowtam/oak/teams/**"]
    shared: ["android/app/src/main/kotlin/ai/gowtam/oak/features/chat/answercard/TeamBlocks.kt"]
    test_focus: "CRUD; warn-but-allow; Showdown round-trip; learnset-scoped moves; Mega auto-force; apply/undo patch parity"
    flags: [ui]
  - id: p11
    name: Polish + release build
    depends_on: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10]
    owns: ["android/app/src/main/res/**", "android/app/src/main/AndroidManifest.xml",
            "android/app/proguard-rules.pro"]
    shared: ["android/app/src/main/kotlin/ai/gowtam/oak/ui/**"]
    test_focus: "assembleDebug+assembleRelease; offline surface; TalkBack; reduce-motion; light/dark"
    flags: [ui]
integration_checkpoints:
  - after: [p6]
    name: chat-full-fidelity
    verifies: "AVD instrumentation + live guest chat: scope event, tool ticker, streamed answer, all AnswerCard fields"
  - after: [p10]
    name: signed-in-roundtrip
    verifies: "team create+save+reopen+team question; conversation persists/resumes; assistant apply/undo == applyTeamPatch"
  - after: [p11]
    name: release-e2e
    verifies: "connectedDebugAndroidTest + assembleRelease + manual parity/a11y/offline screenshots"
```

**Parallelization summary:** P1 unlocks after the P0 scaffold. P2 needs P1; P3 needs P2; P4
needs P2+P3. **P5 (theme + shared UI) needs only P1**, so it runs in parallel with P2–P4.
After P4+P5, **P6 (chat)** is the spine and gates CP-A. P7/P8 are independent tracks once
P6/P4 land; P9 needs P8+P6; P10 (the widest feature) needs P8+P7 and gates CP-B. P11 converges
everything and gates CP-C. The AnswerCard field subviews (inside P6) are the widest intra-phase
parallel fan-out.
</content>
