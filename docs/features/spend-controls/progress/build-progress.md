# Build Progress

Status: `in-progress`

## References

- Architecture: `docs/features/spend-controls/architecture/design.md`
- Requirements: `docs/features/spend-controls/requirements/requirements.md`
- Build Manifest: present (`architecture/design.md` YAML)
- Mode: `PM`
- Budget Tier: `hobby`
- Rigor: `full` for sc-p1/sc-p2/sc-p3 (security/auth-heavy); `standard` for sc-p4

## Environment

- Install / test / typecheck / build commands (from architecture/manifest):
  - `cd web && npx vitest run <file>`
  - `cd web && npm run test:components`
  - `cd web && npm run typecheck`
  - `cd web && npm run lint`
  - `cd web && npm test` (Docker / Testcontainers)
  - `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`
  - `cd android && ./gradlew --no-daemon :app:testDebugUnitTest`
- Notes:
  - Worktree: `/Users/gowtam/Projects/oak-spend-controls` branch `agent/spend-controls` off `develop` (`c6ba880`)
  - Companion `team-from-box` is a separate worktree — do not touch those files
  - Do not modify `web/src/server/rate-limit.ts`
  - Parent-local: symlinked `web/node_modules` → main checkout (worktree had no install). Use `./node_modules/.bin/vitest`, not a global `npx vitest`.

## Resume Snapshot

- Last completed phase id / name: sc-p1 Schema + repo + admission core (`verified`)
- Last green verification: vitest node spend-repo.oracle + spend-control + schema + sql-sandbox → 92 passed. typecheck: pre-existing pdfkit only.
- Open review findings: none
- Worktrees / branches in play: `/Users/gowtam/Projects/oak-spend-controls` (`agent/spend-controls`)

## Current Phase

- Phase name / number / manifest id: sc-p2 ∥ sc-p3 test-authors
- Requirement refs: P2 SC-US-5..7 / SC-BR-1,7; P3 SC-US-1..4 / SC-BR-12
- Status: `in-progress`
- Active workers: `[test-author] P2` route tests; `[test-author] P3` admin tests (disjoint files)

## Phase Log

### Phase 1: Schema + repo + admission core (`sc-p1`)

Requirement refs: SC-BR-2, SC-BR-4, SC-BR-5, SC-BR-6, SC-BR-8, SC-BR-10, SC-BR-11, SC-BR-13, SC-AC-1.3, SC-AC-4.1, SC-AC-4.3, SC-AC-8.1

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | oracle + unit; review findings fixed |
| Red check | done | MIXED as expected (missing modules then) |
| Test review | done | request-changes then approve |
| Implementation | done | 0021, spend-repo, spend-control |
| Impl review | done | approve |
| Regression | verified | 92 passed |

### Phase 2: Route admission + recording (`sc-p2`)

Requirement refs: SC-US-5, SC-US-6, SC-US-7, SC-AC-5.1–5.3, SC-AC-6.1–6.4, SC-BR-1, SC-BR-7

### Phase 3: Admin panel (`sc-p3`)

Requirement refs: SC-US-1..4, SC-AC-2.2, SC-AC-3.1, SC-AC-4.2, SC-BR-12

### Phase 4: Client banners (`sc-p4`)

Requirement refs: SC-AC-5.4, SC-AC-6.5, SC-BR-14, SC-BR-15

## Integration

- Checkpoints (from architecture):
  1. After sc-p1+sc-p2: refuse before model/xAI
  2. After sc-p3: panel write is next admission
  3. After sc-p4: web/iOS/Android distinct copy
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
