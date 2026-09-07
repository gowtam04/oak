# Build Progress

Status: `in-progress`

## References

- Architecture: `docs/features/champions-first/architecture/`
- Requirements: `docs/features/champions-first/requirements/`
- Build Manifest: present (`docs/features/champions-first/architecture/implementation-plan.md`)
- Mode: `PM`
- Budget Tier: `startup`
- Rigor: `standard` (PM + 9 phases: test-author → red → implement → impl review → regression; skip test-review unless tests look weak)

## Environment

- Install / test / typecheck / build commands (from architecture/manifest):
  - `cd web && npx vitest run <file>`
  - `cd web && npm run typecheck`
  - `cd web && npm run lint`
  - `cd web && npm test` (Docker)
  - `cd web && npm run build`
  - iOS: `cd ios && xcodegen generate && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`
  - Android: `JAVA_HOME=/opt/homebrew/opt/openjdk@17` + `./gradlew --no-daemon :app:compileDebugKotlin` / `:app:testDebugUnitTest`
- Notes:
  - Integration worktree: `/Users/gowtam/Documents/Projects/oak-champions-first` on `agent/champions-first` (from `develop` @ 2659b62)
  - Do **not** merge to `develop` until P7+P8 land on this branch (CF-OPS-BR-4)
  - Manifest extras assigned by parent: sql-sandbox.test.ts + encounter-repo (+ tests) → P2; deleted-tool oracles + gen-scope/reference-tools + thinking-trace → P3
  - P6c sequenced after P5 (UsageBlock → GET /api/usage)

## Resume Snapshot

- Last completed phase id / name: none
- Last green verification (commands + outcome summary): none
- Open review findings (MUST-FIX + SHOULD-FIX — both must clear before phase verified): none
- Worktrees / branches in play (if any):
  - `/Users/gowtam/Documents/Projects/oak-champions-first` (`agent/champions-first`) — integration
  - Shared checkout `/Users/gowtam/Documents/Projects/Oak` remains `develop` (do not edit)

## Current Phase

- Phase name / number / manifest id: Wave 1 tests (p1 ∥ p2 ∥ p3)
- Requirement refs: see phase log
- Status: `in-progress`
- Active workers (role → owned files / isolation):
  - pending spawn: three `[test-author]` workers, shared worktree, disjoint owns

## Phase Log

### Phase P1: Turn scope always Champions

Requirement refs: CF-CHAT-AC-1.1 (server), CF-CHAT-AC-3.2–3.4, CF-DATA-BR-1, CF-DATA-BR-7, CF-DATA-BR-21, CF-AUTH-AC-1.1

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | |
| Red check | | |
| Test review | skipped | PM standard rigor |
| Implementation | | |
| Impl review | | |
| Regression | | |

### Phase P2: Reference cutover

Requirement refs: CF-DATA-BR-3, CF-OPS-US-1, CF-OPS-AC-1.1, CF-OPS-AC-1.2, CF-OPS-AC-1.5, CF-DEX-AC-1.3, CF-INT-BR-3

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | |
| Red check | | |
| Test review | skipped | |
| Implementation | | |
| Impl review | | |
| Regression | | |

### Phase P3: Tools and prompt

Requirement refs: CF-CHAT-US-2, CF-CHAT-AC-2.1–2.5, CF-VOICE-US-1, CF-BOX-AC-1.1, CF-DATA-BR-4, CF-DATA-BR-5, CF-INT-BR-1, ADR-2, ADR-8

| Step | Status | Notes |
|------|--------|-------|
| Tests | in-progress | |
| Red check | | |
| Test review | skipped | |
| Implementation | | |
| Impl review | | |
| Regression | | |

## Integration

- Checkpoints (from architecture when present): agent-stack, api-stack, web-ui, native-clients, launch-bar
- Seams covered:
- Results:

## Final Verification

- Full suite:
- Typecheck / build:
- Requirement refs covered / gaps:
- Review findings remaining (should be none):
- Unresolved risks:

## Parent-Local Fixes

(none yet)
