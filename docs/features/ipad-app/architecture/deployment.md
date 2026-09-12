# Oak for iPad — Deployment

Mode: PM
Budget Tier: hobby

Every choice reuses the existing iPhone pipeline. **No new servers.**

## Build & Test Commands

Keep identical to the Build Manifest in `implementation-plan.md`.

| Command | Value |
| --- | --- |
| generate | `cd ios && xcodegen generate` |
| test | `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'` |
| test_ipad | `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'` |
| test_one | `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests/<Suite>/<test> -destination 'platform=iOS Simulator,name=iPhone 17'` |
| typecheck | `cd ios && xcodebuild build -scheme OakApp -destination 'platform=iOS Simulator,name=iPhone 17'` |
| typecheck_ipad | `cd ios && xcodebuild build -scheme OakApp -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'` |
| build | `cd ios && xcodebuild -scheme OakApp -configuration Release build -destination 'generic/platform=iOS'` |
| uitest_iphone | `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppUITests -destination 'platform=iOS Simulator,name=iPhone 17'` |
| uitest_ipad | `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppUITests/PadShellUITests -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'` |

If a named simulator is missing, use `xcrun simctl list devices available` and substitute an iOS 18+ iPhone and iPad. `xcodegen generate` after `project.yml` edits.

**iPhone UITests must not run on an iPad destination** — they assert the tab dock.

## Hosting / Runtime

- **Choice:** Same App Store app (`ai.gowtam.oak`). Same Fly backend.
- **Why it fits the tier:** Zero new compute.
- **Notes:** After P1, the binary is iPhone+iPad. App Store Connect will require an **iPad screenshot set** on the next version that includes this binary (P-SUCCESS-5). Listing copy does not claim new agent features.

## Database / jobs / object storage / cache

- **Choice:** none new
- **Why:** P-API-BR-1, hobby, online-only client

## Observability

- **Choice:** existing `OSLog` + TestFlight crashes
- **Why:** hobby; no new analytics product

## Secrets

- **Choice:** existing Keychain session token; no iPad-specific secrets

## Environments & CI/CD

- Debug → staging BaseURL; Release → production (unchanged).
- CI (`ios/ci/ios.yml`): keep iPhone  unit-test job; P10 adds an iPad **unit** test destination (or a second matrix entry). Do not drop the iPhone job.
- TestFlight: exercise iPad Mini + a 13-inch before App Store.
- Archive/export flow unchanged (`ios/README.md`). Bump `CURRENT_PROJECT_VERSION` for TestFlight as today.

## App Store / orientations

- iPhone screenshots: still portrait iPhone (existing).
- iPad screenshots: landscape (primary) + at least one portrait, showing sidebar and a split (Chat list|thread or Teams workbench) — not letterboxed iPhone frames.
- Update `docs/app-store/screenshots.md` (P10). `docs/app-store/ios.md` copy stays Champions coach; do not add “iPad-only features.”

## Rough Monthly Cost Estimate

Bucket: **$0** incremental.

| Item | ~$/mo |
| --- | --- |
| Extra Fly/Redis | $0 |
| Apple Developer | existing |
| CI macOS minutes | small bump if iPad sim job added |
| **Total bucket** | **$0** extra infra |

Fits hobby. If CI time becomes painful, keep iPad tests as `test_ipad` local + one CI iPad unit job, not a full device matrix.
