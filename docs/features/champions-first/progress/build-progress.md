# Build Progress

Status: `COMPLETE` (pending merge to `develop`)

## References

- Architecture: `docs/features/champions-first/architecture/`
- Requirements: `docs/features/champions-first/requirements/`
- Build Manifest: present (`docs/features/champions-first/architecture/implementation-plan.md`)
- Mode: `PM`
- Budget Tier: `startup`
- Rigor: `standard`

## Environment

- Web: Node 26 for vitest (Node 20 hits Testcontainers/undici crash)
- iOS: xcodebuild OakAppTests
- Android: `JAVA_HOME=/opt/homebrew/opt/openjdk@17` Gradle unit tests
- Integration worktree: `/Users/gowtam/Documents/Projects/oak-champions-first` on `agent/champions-first`

## Resume Snapshot

- Last completed phase: P9 + typecheck glue (`e89072b`)
- Last green verification:
  - Web typecheck: clean after `e89072b`
  - Web lint: 0 errors
  - Eval cases/deterministic/run tests: 184 passed
  - iOS OakAppTests: 761 passed (P7)
  - Android JVM: compile + unit tests BUILD SUCCESSFUL (P8, 664+ tests)
- Open review findings: none
- Branch: `agent/champions-first` contains P1–P9

## Current Phase

- Status: `verified` — merge to `develop` is the remaining ops step

## Phase Log

P1 TurnScope — verified. Always `ctx.mode = "champions"`.
P2 ReferenceCutover — verified. Migration 0023 + Champions ingest.
P3 Tools/prompt — verified. 17-tool barrel, decline phrase.
P4 Teams API — verified. Living vs archived.
P5 Usage — verified. Live API, apply-set, `/meta` → `/usage`.
P6a Chrome — verified. Regulation chip, starters, landing.
P6b Teams UI — verified. Archive + Stat Points + apply confirm.
P6c Dex/calc — verified. Champions-only, 404, L50 SP.
P7 iOS — verified. Fifth Usage tab.
P8 Android — verified. Usage as Dex section; no Voice mic.
P9 Docs/eval — verified. AGENTS/README/eval Champions-only.

## Integration

- agent-stack: 673 tests passed after oracle glue
- api-stack: 191 tests passed
- native: iOS 761 + Android JVM green
- Typecheck: clean after glue

## Final Verification

- Typecheck: pass (`e89072b`)
- Lint: 0 errors
- Eval harness: pass
- Full `npm test` (entire node+jsdom suite) not re-run as a single command in the last pass; targeted suites per phase passed
- Browser E2E: not run (no local Next against prod DB in this session)
- Prod migrate+ingest: documented, not executed

## Parent-Local Fixes

- Worktree/branch orchestration, test commits, merges
- Oracle off-roster names vs Champions fixture (`945e84e`)
- Typecheck/eval harness glue (`e89072b`)
