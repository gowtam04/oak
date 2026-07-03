# Oak for Android

A native **Kotlin / Jetpack Compose** client for Oak, the Pokémon reasoning chat agent.
The app is a pure client to Oak's existing Next.js backend (under `../web/`): it holds
**no LLM keys and no database** and talks only to the HTTP/SSE API. Requirements,
architecture, and the per-phase build plan live in
[`../docs/features/android-app/`](../docs/features/android-app/).

- **Package:** `ai.gowtam.oak` · **minSdk 26** (Android 8.0) · **compileSdk/targetSdk 36**.
- **Kotlin 2.1** with the `compose-compiler` plugin, **AGP 8.13**, **Gradle 8.13** — the
  wrapper is committed; there is no system Gradle and no Android Studio project to
  generate (unlike iOS's `xcodegen`, `settings.gradle.kts`/`build.gradle.kts` are the
  checked-in source of truth).
- **No Hilt/Dagger/Koin, no SSE library, no charting/markdown library** — MVVM by hand
  (`ViewModel` + `StateFlow`) over a service-interface seam, four utility dependencies
  only (OkHttp, kotlinx.serialization, Coil, `security-crypto`). See DADR-5 in
  `../docs/features/android-app/architecture/decisions.md`.

## Layout

```
android/
├── settings.gradle.kts / build.gradle.kts   Gradle root — checked-in, no generation step
├── gradle/                                  committed wrapper (8.13) + version catalog
├── local.properties                         sdk.dir=~/Library/Android/sdk (git-ignored, per host)
└── app/
    └── src/
        ├── main/kotlin/ai/gowtam/oak/
        │   ├── app/            application entry point, nav graph, top-level state
        │   ├── networking/     OkHttp client, SSE byte-stream parser, error mapping
        │   ├── wire/           kotlinx.serialization DTOs mirroring web/src/lib/sse + agent/schemas
        │   ├── services/       service interfaces + Live implementations over networking
        │   ├── features/       chat (+ answercard), artifact, auth, account, history, teams
        │   └── ui/             shared Compose theme/components (the Oak design system)
        ├── test/kotlin/…       JVM unit tests (JUnit4, no emulator)
        ├── test/resources/fixtures/   committed REST/SSE fixtures (see Testing below)
        └── androidTest/kotlin/…       Compose UI instrumentation (needs a booted AVD)
```

This is a structural, class-for-class port of `ios/OakApp/` (App → Networking → Models/Wire
→ Services → Features → UI), not a from-scratch design — see
`../docs/features/android-app/architecture/overview.md` for the mapping and the "ground
truth" note.

## Prerequisites

- **JDK 17** via Homebrew, **not linked** (don't `brew link`) — export it per-command or
  per-shell:
  ```bash
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17
  ```
- **Android SDK** at `~/Library/Android/sdk` (platforms 33/35/36, build-tools 35/36,
  emulator + platform-tools). `adb` is **not** on `PATH` — use the full path
  `~/Library/Android/sdk/platform-tools/adb`. `local.properties` (git-ignored) must set
  `sdk.dir=/Users/<you>/Library/Android/sdk` — copy/adjust it per host.
- An **AVD** named `OakPixel` (Pixel 7, API 35 / android-35) for instrumentation tests —
  create it once via Android Studio's Device Manager or `avdmanager`, or use the
  `emulator` CLI boot command below with a different AVD name you've already created.

## Build & test

All commands run from **`android/`**, with `JAVA_HOME` exported as above.

```bash
cd android
export JAVA_HOME=/opt/homebrew/opt/openjdk@17

# Compile (== typecheck) — a build IS the type-check, same as Swift
./gradlew --no-daemon :app:compileDebugKotlin

# JVM unit tests (337 tests) — no emulator needed
./gradlew --no-daemon :app:testDebugUnitTest

# A single unit test class
./gradlew --no-daemon :app:testDebugUnitTest --tests "ai.gowtam.oak.networking.SseParserTest"

# Lint
./gradlew --no-daemon :app:lint

# Debug / release APKs
./gradlew --no-daemon :app:assembleDebug
./gradlew --no-daemon :app:assembleRelease
```

Prefer **`--no-daemon`** — the Gradle daemon hangs in sandboxed/CI-style shells; a plain
`./gradlew` invocation without it can appear to stall indefinitely.

### Instrumentation tests (Compose UI, needs a booted AVD)

```bash
# Boot the AVD headless
~/Library/Android/sdk/emulator/emulator -avd OakPixel \
  -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &
~/Library/Android/sdk/platform-tools/adb wait-for-device

# Run the instrumentation suite (16 tests)
./gradlew --no-daemon :app:connectedDebugAndroidTest
```

## Testing philosophy

Mirrors the iOS split seam-for-seam (full detail in
`../docs/features/android-app/architecture/testing-strategy.md`):

- **JVM unit tests** (`src/test/`) are the bulk of coverage: DTO decode/round-trip against
  committed fixtures, the SSE parser/splitter, `OakError` mapping, the ported pure
  team-patch functions, `ImageEncoder`, `TokenStore`, and every ViewModel driven against
  `Fake…` services (`kotlinx-coroutines-test` for virtual time, OkHttp `MockWebServer` for
  real HTTP round-trips). No emulator, no Docker.
- **Compose instrumentation** (`src/androidTest/`) covers what can only be verified
  on-device: AnswerCard render-if-present guards, OTP entry, the team editor grids, and a
  live guest-chat smoke test against the deployed backend.
- **Fixtures are copied from `ios/OakAppTests/Fixtures/`** — real, captured backend
  responses (REST JSON + raw `.sse` streams), not hand-written stubs. When the wire
  contract changes on either client, **update fixtures on both sides** so they don't
  silently drift apart; a "decode every fixture" parameterized test on the Android side
  fails loudly if one rots.

## KDoc hazard

**Never write the literal sequence `` `*/ `` (backtick immediately followed by
`*/`) inside a KDoc comment.** KDoc blocks are `/** … */`, same as Javadoc — the
first `*/` the compiler sees closes the comment early, silently truncating the doc and
often breaking the following declaration's parse. This bites most often when
documenting example code or a path/glob in backticks that happens to end right before a
close — e.g. writing an inline-code span immediately followed by the comment's closing
`*/` with no separating space. Always leave a space (or a line break) between a
backtick-quoted code span and the comment terminator.

## Release build caveats

- **`assembleRelease` is R8-minified** (`isMinifyEnabled = true`, `isShrinkResources =
  true`) — if you add a dependency that needs keep rules, update
  `app/proguard-rules.pro`.
- **Signed with the debug keystore for v1.** There is no Play Console upload key yet;
  Play Store signing is explicitly deferred (DADR / D-CON-6, D-OQ-4) — `assembleRelease`
  only needs to produce an installable, verifiable APK, not a store-ready artifact.
- Install and inspect the release build the same way as debug:
  ```bash
  ~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
  ```

## BaseURL

The backend base URL is a `BuildConfig` field (`BASE_URL`), currently set to production
(`https://oak-gowtam.fly.dev`) for **both** debug and release build types —
`app/build.gradle.kts` `defaultConfig`/`release`. There is no dedicated staging Fly app
yet (same situation as iOS); point a build type at a real staging host there if one is
stood up.

## Play Store listing

Deferred for v1 — see the "Future Play submission prerequisites" section of
`../docs/features/android-app/architecture/deployment.md`. v1 ships as an
emulator/device-installable, `adb`-sideloadable APK only.
