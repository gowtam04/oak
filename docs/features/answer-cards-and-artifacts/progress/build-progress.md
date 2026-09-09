# Build Progress

Status: `COMPLETE`

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

- Last completed phase id / name: Wave 3 P6+P7+P8 UI verified after wiring pass
- Last green verification: web jsdom 180 + tsc clean; Android targeted 119; iOS 187. web-verbs checkpoint green.
- Open review findings: Wave 3 MUST-FIX wiring applied (Add/Compare/calc hops/table/highlight/pin strip). Residual SHOULD-FIX (calc IVs already on web; some hop prefill edges) deferred to P9 drift pass.
- Worktrees / branches in play:
  - `/Users/gowtam/Documents/Projects/oak-answer-cards` — `agent/answer-cards-and-artifacts` @ `5177cee`

## Current Phase

- Phase name / number / manifest id: Wave 3 complete. Next: P9 polish + disclosure.
- Requirement refs: ADD-US-1–4, DEX-US-1, CALC-US-1–2/8–9, TBL-US-1–3, CMP-US-1, CIT-US-1, PIN-US-1–3 (UI), COMPACT-US-1, PASTE-US-1, AUTH-BR-1, VOICE-US-1
- Status: `verified`
- Active workers: none

## Phase Log

### Phase 1: Data model and citation contract

Requirement refs: CIT-US-2, CIT-AC-2.1–2.2, CIT-BR-3, PIN-BR-1–5 (repo), COMPACT-BR-2/4 (column), VOICE-AC-1.2 (`origin`)

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | sanitize + pin-repo + schema/origin + density + updateAssistantAnswer |
| Red check | done | new modules fail-to-import; schema new cases fail; repo TRUNCATE waits on 0020 |
| Test review | skipped unless weak | PM standard rigor |
| Implementation | | |
| Impl review | | |
| Regression | | |

### Phase 2: Calc engine and POST /api/calc

Requirement refs: CALC-US-4–7, CALC-AC-4.1–4.4, 5.1–5.4, 6.3, 7.1, CALC-BR-1–3, 6–8

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | six new files; P2 author retried after capacity 500 |
| Red check | done | all six fail-to-import |
| Implementation | | |
| Impl review | | |
| Regression | | |

### Phase 3: Dex `?format=` on move / ability / item

Requirement refs: DEX-US-2, DEX-AC-2.1–2.2, DEX-BR-3

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | tightening arity locks after unexpected pass |
| Red check | weak | extra JS args ignored; default chain already matches assertions |
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

- Full suite: web 355 targeted (jsdom 173 + node 182); Android 164; iOS OakAppTests 679 — all pass
- Typecheck / build: `tsc --noEmit` clean; `eslint` 0 errors (109 existing warnings); Android unit + iOS xcodebuild TEST SUCCEEDED
- Requirement refs covered: ADD/DEX/CALC/TBL/CMP/CIT/PIN/COMPACT/PASTE/VOICE/AUTH-BR-1; P9 privacy voice hydrate
- Review findings remaining: none blocking. Residual hop-prefill polish is product-complete for the pack.
- Unresolved risks: none for ship of this pack. Voice compile `effort: none` now wired on Grok.

## Parent-Local Fixes

- 2026-08-17: killed stuck `[explore]` preflight (`01a011ab-4030-7b41-a17f-8fb2d2bf8fc9`); continued from architecture + existing tests.
- Peak writers raised to 5 per user review of the plan.
