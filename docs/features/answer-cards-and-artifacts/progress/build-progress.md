# Build Progress

Status: `in-progress`

## References

- Architecture: `docs/features/answer-cards-and-artifacts/architecture/`
- Requirements: `docs/features/answer-cards-and-artifacts/requirements/`
- Build Manifest: present (`architecture/implementation-plan.md`)
- Mode: `PM`
- Budget Tier: `hobby`
- Rigor: `standard` (PM + 9 phases: test-author → red → implement → impl review → regression)

## Environment

- Install / test / typecheck / build commands (from architecture/manifest):
  - `cd web && npm test`
  - `cd web && npx vitest run <file>`
  - `cd web && npm run typecheck`
  - `cd web && npm run lint`
  - `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`
  - `cd android && ./gradlew --no-daemon :app:testDebugUnitTest`
- Notes:
  - Parent worktree: `/Users/gowtam/Documents/Projects/oak-answer-cards` on `agent/answer-cards-and-artifacts` (from `develop` @ 9c21c78)
  - Feature docs already on `develop` (merge `agent/answer-cards-artifacts-docs`)
  - Peak concurrent writers: **5** (user-approved)
  - Explore preflight was cancelled (stuck); parent used architecture + existing test files as the convention source
  - `npm test` needs Docker (Testcontainers Postgres + Redis)

## Resume Snapshot

- Last completed phase id / name: none
- Last green verification: none
- Open review findings: none
- Worktrees / branches in play:
  - `/Users/gowtam/Documents/Projects/oak-answer-cards` — `agent/answer-cards-and-artifacts`

## Current Phase

- Phase name / number / manifest id: Wave 1 — P1 ∥ P2 ∥ P3 tests
- Requirement refs: see phase log
- Status: `in-progress`
- Active workers (role → owned files / isolation): launching three `[test-author]`s in the shared agent worktree

## Phase Log

### Phase 1: Data model and citation contract

Requirement refs: CIT-US-2, CIT-AC-2.1–2.2, CIT-BR-3, PIN-BR-1–5 (repo), COMPACT-BR-2/4 (column), VOICE-AC-1.2 (`origin`)

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | |
| Red check | | |
| Test review | skipped unless weak | PM standard rigor |
| Implementation | | |
| Impl review | | |
| Regression | | |

### Phase 2: Calc engine and POST /api/calc

Requirement refs: CALC-US-4–7, CALC-AC-4.1–4.4, 5.1–5.4, 6.3, 7.1, CALC-BR-1–3, 6–8

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | |
| Red check | | |
| Implementation | | |
| Impl review | | |
| Regression | | |

### Phase 3: Dex `?format=` on move / ability / item

Requirement refs: DEX-US-2, DEX-AC-2.1–2.2, DEX-BR-3

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | |
| Red check | | |
| Implementation | | |
| Impl review | | |
| Regression | | |

## Integration

- Checkpoints (from architecture):
  - after P2: calc-api
  - after P1+P5: pins-and-prefs
  - after P4: voice-same-row
  - after P6: web-verbs
  - after P7+P8: native-parity
  - after P9: lockstep
- Seams covered:
- Results:

## Final Verification

- Full suite:
- Typecheck / build:
- Requirement refs covered / gaps:
- Review findings remaining (should be none):
- Unresolved risks:

## Parent-Local Fixes

- 2026-08-17: killed stuck `[explore]` preflight (`01a011ab-4030-7b41-a17f-8fb2d2bf8fc9`); continued from architecture + existing tests.
- Peak writers raised to 5 per user review of the plan.
