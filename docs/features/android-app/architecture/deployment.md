# Oak Android — Deployment & Infrastructure

Budget Tier: hobby
Backend Topology: existing Next.js monolith (Fly.io, unchanged) + native Android client

The Android app adds **zero** server infrastructure and **zero** backend changes — it's a
pure client of the already-deployed backend. "Deployment" for v1 means an
emulator-verified debug + release APK (DADR-11); Play Store signing and listing are
deferred.

## Hosting / Runtime
- **Android app:** v1 distributed as an APK installed via `adb install` on the local
  emulator (and sideloadable on a device). No Play App Signing / Play Console in v1.
- **Backend:** unchanged — the existing Next.js monolith on **Fly.io** (`oak-gowtam`). No
  redeploy is required for Android (account deletion + Bearer auth already shipped for iOS).
- Region/redundancy: inherit the backend's setup; no change.

## Build environment (verified)
- Android SDK at `~/Library/Android/sdk`: platforms 33/35/36, build-tools 35/36, emulator +
  API 35 AVDs, platform-tools. `adb` is NOT on PATH — use the full
  `~/Library/Android/sdk/platform-tools/adb`.
- **JDK 17** at `/opt/homebrew/opt/openjdk@17` (not linked — export `JAVA_HOME` explicitly).
- No system Gradle — the **Gradle wrapper is committed**. No Android Studio; everything runs
  via `./gradlew` + emulator CLI.
- `local.properties` sets `sdk.dir=~/Library/Android/sdk` (git-ignored, generated per host).

## Build variants
- **debug** → staging/prod base URL via the `OAK_STAGING` build flag (a `buildConfigField`
  or a `productFlavor`/`buildType` toggle), `applicationIdSuffix` optional; debuggable.
- **release** → prod base URL; minify/R8 optional (kept off in v1 for simplicity, or a
  conservative `proguard-rules.pro` that keeps kotlinx.serialization + Coil). Signed with a
  local debug/dev key for v1 (no upload key).

## Database / storage / jobs / caching
- **None added.** No on-device DB (online-only). No object storage — images are sent inline
  (base64) on the chat turn and never stored. Coil's default in-process disk/memory cache
  handles sprite images (free); no other client caching.

## Observability
- **Android:** `android.util.Log` categories (free, on-device, viewable via `adb logcat`);
  crash reports via logcat / Play Console once listed. **No** third-party analytics or crash
  SDK (DADR-14) — adoption metrics are aspirational, not instrumented in v1.
- **Backend:** unchanged (existing Fly.io logs).

## Secrets management
- **Android:** the only on-device "secret" is the user's **session token** in
  **Keystore-backed `EncryptedSharedPreferences`** (`AES256_GCM`, Keystore master key). No
  API keys ship in the app (the backend holds all LLM/DB keys).
- **Backend:** unchanged (Fly secrets).

## Build, test & install commands (from `android/`, JDK 17 exported)
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17

# Compile (== typecheck) + JVM unit tests — the per-phase gate
./gradlew :app:compileDebugKotlin :app:testDebugUnitTest

# Lint
./gradlew :app:lint

# APKs
./gradlew :app:assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:assembleRelease     # app/build/outputs/apk/release/app-release.apk

# Instrumentation (AVD must be booted)
~/Library/Android/sdk/emulator/emulator -avd <API35_AVD> -no-window -no-snapshot &
~/Library/Android/sdk/platform-tools/adb wait-for-device
./gradlew :app:connectedDebugAndroidTest

# Install + screenshot drive
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
~/Library/Android/sdk/platform-tools/adb exec-out screencap -p > shot.png
```

## Versioning
- `versionName` (user-facing, e.g. `1.0.0`) and `versionCode` (monotonic integer) live in
  `app/build.gradle.kts` `defaultConfig`. `versionCode` must increment for any future Play
  upload (analogous to the iOS `CURRENT_PROJECT_VERSION` bump rule). v1 starts at
  `versionName "1.0.0"`, `versionCode 1`.

## Environments
- **Backend:** prod (existing) doubles as the client's target; a Fly staging app is optional.
  Debug points at staging if one exists, else prod with a guest/dev account for the checkpoints.
- **Android:** local emulator/device → (future) Play internal testing → Play production.

## Cost estimate (order of magnitude)
| Item | Cost |
|---|---|
| Google Play Developer account (only if/when listing) | **$25 one-time** (deferred — not needed for v1 APK delivery) |
| Backend infra (existing Fly.io) | unchanged — no added cost from the client |
| Analytics / crash SDK | **$0** (on-device only) |
| CI | **$0** (v1 is local; a future GitHub Actions Linux runner builds+unit-tests for free-ish) |
| **Total new spend (v1)** | **≈ $0** |

v1 is emulator-verified APKs, so there is **no** mandatory spend. The $25 Play fee applies
only when the store listing is pursued (a later, additive step).

## Future Play submission prerequisites (not gating v1)
- In-app **account deletion** (already built — P8) + a Play Data-safety form disclosing:
  email (auth), conversation text + images sent to backend/model provider; no third-party
  analytics.
- Adaptive app icon + brand assets; accurate content rating.
- Privacy policy URL + the in-app non-affiliation disclaimer (DADR-14).
- IP/trademark posture: tolerated-risk fan tool (DADR-14) — an IP-attorney pass stays
  prudent but is not gating.
</content>
