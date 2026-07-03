# Testing Strategy (Android)

**Developer mode.** How the Android client is tested. The `web/` backend is unchanged
(no Phase-2-style backend work), so nothing is restated for it. Mirrors the iOS
`testing-strategy.md` seam-for-seam.

## Frameworks
- **JVM unit tests** (`src/test/`): **JUnit4** + **kotlinx-coroutines-test**
  (`runTest`, `TestDispatcher`, virtual time for the 2s quick-stop window) +
  **OkHttp `MockWebServer`** for networking + optionally **Turbine** for `Flow` assertions.
  These run on the JVM — **no emulator, no Docker**.
- **Compose instrumentation** (`src/androidTest/`): **Compose UI Test**
  (`createAndroidComposeRule`, `onNodeWithText`, semantics) on the API 35 AVD — for
  render-if-present AnswerCard guards, OTP entry, the team editor, and a live guest-chat
  smoke against the prod backend.

Run commands (from `android/`, JDK 17 exported):
```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:testDebugUnitTest          # JVM unit
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:compileDebugKotlin         # typecheck-equivalent
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:connectedDebugAndroidTest  # instrumentation (AVD booted)
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew :app:lint                       # Android Lint
```
A single test: `./gradlew :app:testDebugUnitTest --tests "ai.gowtam.oak.networking.SseParserTest"`.

## Unit vs instrumentation split
- **Unit (the bulk):**
  - **DTO decode/round-trip** (P1) — decode every committed real-response fixture for every
    endpoint and every `OakAnswer` status; round-trip encode/decode the request bodies,
    `TeamMember` (the explicit-null encode nuance), and `JsonScalar`. This is the
    contract-drift guard against `web/`. Includes the tolerant `Format`/`ScopeSource`/
    `TeamWarning.Code` unknown-value cases.
  - **`ByteLineSplitter` + `SseParser` + `BuilderSseParser`** (P3) — reconstruct the exact
    event sequence from recorded byte streams: **multi-frame splitting with preserved blank
    lines**, heartbeat comments, the **single-delta Grok** case, terminal `answer`/`error`,
    unknown-event forward-compat, and the `BuilderSseParser` ignoring a stray `scope` frame.
  - **`OakError` mapping** (P2) — 429 + `Retry-After` (numeric and HTTP-date), 401, 4xx/5xx
    `{code,message}` envelopes, transport, pre-stream vs mid-stream.
  - **ViewModels** (per feature phase) — every VM against `Fake…` services: the chat reducer
    (delta append / `answer_start` reset / terminal `answer` finalize / `error` banner /
    scope adoption), the **quick-stop vs late-stop** decision (clock-injected virtual time),
    the **screen-off auto-reconnect** gate (hidden→drop→retry-once, foreground vs deferred),
    auth (invalid/expired/cooldown/rate-limit/expiry→guest), history
    (list/search/filter/mutations/resume/import), teams (CRUD / warn-but-allow / Showdown
    round-trip / apply-proposed / Mega auto-force / picker learnset scoping), teams-assistant
    (apply/undo patch parity), artifact back-stack, account deletion.
  - **`applyTeamPatch` parity vectors** (P1) — the ported pure functions run the SAME
    input→output vectors the web/iOS logic passes (DADR-12). Also `blankTeamMember`,
    `describeTeamPatch` (curly-quote/em-dash/middot formatting), `titleizeTeamSlug`.
  - **`ImageEncoder`** (P4) — cap logic (≤4 / per-image ≤3.75 MiB / total ≤10 MiB / 1568px
    downscale) → typed rejection; raw-base64 output (no `data:` prefix); PNG-with-alpha vs
    JPEG selection; the quality-then-dimension fit loop; image-only (empty text) turn valid.
  - **`TokenStore`** (P2) — Keystore CRUD round-trips + cleared on signout/deletion (a Robolectric
    or instrumented test, since `EncryptedSharedPreferences` needs Android APIs).
- **Instrumentation (emulator, API 35 AVD):**
  - Compose render tests: AnswerCard render-if-present guards over fixture `OakAnswer`s (each
    field present/absent; color-not-sole-signal), OTP entry, the team editor grids.
  - CP-A / CP-B / CP-C (below): headless AVD boot + scripted `adb` screenshot drives.
  - **Live guest-chat smoke** against `https://oak-gowtam.fly.dev` (one or two turns, well
    under the guest 20/60s limit) — verifies the scope event, tool ticker, streamed answer,
    and an artifact tap end-to-end against the real backend.

## Mocking policy
- **Real:** the SSE parsers + `ByteLineSplitter`, `OakError` mapping, all DTO decoding (real
  fixtures, never hand-written stubs), the ported pure functions, `ImageEncoder`, and the
  structured ViewModel logic.
- **Faked:** service **interfaces** are faked for ViewModel unit tests (`Fake…` returns
  canned DTOs / scripted `Flow`s / thrown `OakError`s). The network is faked at the service
  seam for unit logic; where a real HTTP round-trip matters, **`MockWebServer`** serves
  recorded fixture bodies so `OakApiClient`/`SseClient` are exercised for real without a live
  backend.
- **Live only** in the CP-A/B/C smoke drives (prod backend, gated so they don't run in the
  fast unit job).
- Fixtures are **copied from `ios/OakAppTests/Fixtures/`** (they are captures of the real
  backend) and committed — they are the source of truth for "what the wire looks like."

## Coverage target
Bias coverage to the high-risk seams: DTO decoding, SSE parsing/splitting/reducing, error
mapping, the ported patch functions, and the ViewModel logic (esp. the chat state machine).
Aim ~80% on `networking/`, `services/`, `wire/`, and the ViewModel files. Pure composables
are exempt from a line target (covered by Compose render tests where it matters);
camera/photo-picker wrappers are exempt.

## Fixture conventions
- Live under `android/app/src/test/resources/fixtures/` as `.json` (REST responses, one per
  endpoint × status) and `.sse` (raw recorded chat/assistant streams). Copy the iOS corpus
  where formats match: `chat_answered_full.sse`, `chat_single_delta_grok.sse`,
  `chat_heartbeat.sse`, `chat_scope_gen7.sse`, `chat_error.sse`,
  `oakanswer_{answered_full,clarification,resolution_failed,insufficient_data}.json`,
  `entity_{pokemon,move,ability,item,type,not_found,unavailable}.json`,
  `conversations_list*.json`, `conversation_detail.json`, `team.json`, `teams_list.json`,
  `teams_assistant_{answer_advice,answer_patch}.json`, `teams_assistant_patch.sse`,
  `auth_verify.json`, `me.json`, `me_guest.json`, `search_response.json`,
  `sprites_response.json`, `learnset_response.json`, `api_error.json`.
- A `Fixtures.load(name)` helper reads a named fixture off the classpath; a "decode every
  fixture" parameterized test ensures none rot.
- Build test DTOs from fixtures, not inline literals, so a contract change fails decoding
  loudly.

## Per-phase gates (summary; see `implementation-plan.md`)
- Every phase gates on `:app:compileDebugKotlin :app:testDebugUnitTest` (+ `:app:lint`).
- **CP-A** (after P6 — chat feature) and **CP-C** (after P11) add an instrumentation run +
  a scripted live guest-chat screenshot drive on the AVD.
- Auth/account phases (P8) add a review of the token path (Keystore storage, 401→guest,
  no token logging).

## What is NOT tested here
- The agent's reasoning quality / `OakAnswer` *content* — that's the backend's eval suite
  (`web/eval/`), unchanged. The client only tests that it faithfully **renders and
  round-trips** whatever the contract delivers.
</content>
