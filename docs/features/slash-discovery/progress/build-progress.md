# Build Progress

Status: `in-progress`

## References

- Architecture: `docs/features/slash-discovery/architecture/design.md`
- Requirements: `docs/features/slash-discovery/requirements/requirements.md`
- Build Manifest: present (`architecture/design.md` YAML)
- Mode: `PM`
- Budget Tier: `hobby`
- Rigor: `standard` (PM + 5 phases: tests → red → impl → impl review → regression; skip test-review unless tests look weak)

## Environment

- Worktree: `/Users/gowtam/Documents/Projects/oak-slash-discovery`
- Branch: `agent/slash-discovery` (from `develop` @ `b8dd082`)
- Install / test / typecheck / build commands (from architecture/manifest):
  - `cd web && npx vitest run <files>` (jsdom/oracle/fullstack; not full Testcontainers `npm test`)
  - `cd web && npm run typecheck`
  - `cd web && npm run lint` (final)
  - iOS: `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`
  - Android: `cd android && export JAVA_HOME=/opt/homebrew/opt/openjdk@17 && ./gradlew --no-daemon :app:testDebugUnitTest`
- Notes: Feature docs copied into worktree (untracked on shared `develop`). Manifest vs prose: P4 `ChatViewModelReducerTest.kt` assigned to P4 worker (slash-only). Do not edit shared `develop` checkout. `web/node_modules` is a symlink to the primary checkout (parent-local setup). `src/lib/chat/*.test.ts` runs in the **node** Vitest project and starts Testcontainers — Docker required for P1 despite architecture “no Docker” line.

## Resume Snapshot

- Last completed phase id / name: p1 (oracle-stable)
- Last green verification: `npx vitest run --project jsdom src/lib/chat/slash-commands.test.ts src/lib/chat/slash-picker.test.ts` — 38/38 pass. Full `tsc --noEmit` has a pre-existing error in `ChatThread.test.tsx` (`onEditLast` not on `ChatThreadProps`) unrelated to this pack.
- Open review findings: none (SHOULD-FIX stale hasUsagePage JSDoc fixed by parent)
- Worktrees / branches in play: `../oak-slash-discovery` on `agent/slash-discovery`

## Current Phase

- Phase name / number / manifest id: p1
- Requirement refs: SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10, SD-BR-17, SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-4.3, SD-AC-7.1
- Status: `in-progress`
- Active workers (role → owned files / isolation): [explore] conventions; [test-author] P1 oracle tests (`slash-commands.test.ts`, `slash-picker.test.ts`)

## Phase Log

### Phase 1: Portable send parse + picker oracle

Requirement refs: SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10, SD-BR-17, SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-4.3, SD-AC-7.1

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | slash-commands.test.ts updated; slash-picker.test.ts created |
| Red check | done | MIXED expected: 15 old parse cases pass; 5 new cases fail; slash-picker import missing. `npx vitest run --project jsdom src/lib/chat/slash-commands.test.ts src/lib/chat/slash-picker.test.ts` |
| Test review | skipped | PM standard rigor; tests look strong |
| Implementation | done | slash-commands.ts + slash-picker.ts |
| Impl review | done | approve after SHOULD-FIX JSDoc |
| Regression | done | 38/38 jsdom oracle pass |

Files created/modified:
- web/src/lib/chat/slash-commands.ts
- web/src/lib/chat/slash-commands.test.ts
- web/src/lib/chat/slash-picker.ts
- web/src/lib/chat/slash-picker.test.ts
- web/vitest.config.ts (parent glue: lib/chat *.test.ts → jsdom)
- docs/features/slash-discovery/**

Verification commands and results:
- Red: 15 old pass, 5 new fail, slash-picker missing module (expected)
- Green: 38 passed (20 commands + 18 picker)

MUST-FIX / SHOULD-FIX (all must be fixed before phase verified): none remaining

Checkpoint: oracle-stable — natives can clone without guessing.

## Integration

- Checkpoints (from architecture when present): oracle-stable (P1), web-hops (P2), ios-hops (P3), android-hops (P4), lockstep (P5)
- Seams covered:
- Results:

## Final Verification

- Full suite:
- Typecheck / build:
- Requirement refs covered / gaps:
- Review findings remaining (should be none):
- Unresolved risks:

## Parent-Local Fixes

- Symlink `web/node_modules` was stale; ran `npm install` in the worktree.
- First P1 red runner reported missing `src/lib/chat/` — files exist in the worktree; runner cwd was wrong. Retrying with `--project jsdom` after a vitest include glue so oracles do not start Testcontainers (architecture: no Docker for oracle tests).
- `web/vitest.config.ts`: include `src/lib/chat/**/*.test.ts` in jsdom and exclude from node so slash oracles do not start Testcontainers.
