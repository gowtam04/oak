# Build Progress

Status: `in-progress`

## References

- Architecture: `docs/features/team-from-box/architecture/design.md`
- Requirements: `docs/features/team-from-box/requirements/requirements.md`
- Build Manifest: `present` (`docs/features/team-from-box/architecture/design.md`)
- Mode: `PM`
- Budget Tier: `hobby`
- Rigor: `standard` (PM + 4 phases: tests → red → impl → impl review → regression; skip test-review unless tests look weak)

## Environment

- Install / test / typecheck / build commands (from architecture/manifest):
  - test: `cd web && npm test`
  - test_one: `cd web && npx vitest run <file>`
  - typecheck: `cd web && npm run typecheck`
  - lint: `cd web && npm run lint`
  - build: `cd web && npm run build`
  - eval_deterministic: `cd web && npx tsx eval/run.ts --deterministic`
- Notes:
  - Worktree: `/Users/gowtam/Projects/oak-team-from-box` on `agent/team-from-box` off `develop` @ `c6ba880`
  - Prose↔manifest: Phase 4 YAML owns only `web/eval/**`; architecture prose + AGENTS.md three-way client rule expands to iOS/Android warning-code decode. Parent assigned that expansion; not a product invention.
  - `legalizeTeam` keeps existing `(members, format, db)` and adds optional 4th `options?: { keepSpecies?: string[] }`.

## Resume Snapshot

- Last completed phase id / name: box-p1 (lookup_box + compact learnset) — verified
- Last green verification: `npx vitest run src/agent/schemas.test.ts src/agent/tools/compact-learnset.test.ts src/agent/tools/lookup-box.oracle.test.ts --project node` → 47/47 pass. Typecheck: pdfkit missing in host node_modules (pre-existing env; not this feature).
- Open review findings: none (Phase 1 impl review: approve)
- Worktrees / branches in play: `/Users/gowtam/Projects/oak-team-from-box` (`agent/team-from-box`)

## Current Phase

- Phase name / number / manifest id: Phase 2+3 test-author wave (after box-p1 verified)
- Requirement refs: see Phase 2 / Phase 3
- Status: `in-progress`
- Active workers: none yet (starting P2/P3 test-authors)

## Phase Log

### Phase 1: lookup_box + compact learnset

Requirement refs: BOX-AC-3.2, BOX-AC-3.4, BOX-BR-5, BOX-BR-7

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | schemas.test.ts + compact-learnset.test.ts + lookup-box.oracle.test.ts |
| Red check | done | MIXED/red: 21 pass (old schemas) / 26 fail (new T22) |
| Test review | skipped (PM standard rigor) | |
| Implementation | done | T22 tool + compactMoves + append-only barrel |
| Impl review | done | approve, no MUST/SHOULD |
| Regression | done | 47/47 pass |

Files created/modified:
- web/src/agent/schemas.ts, schemas.test.ts
- web/src/agent/tools/lookup-box.ts, lookup-box.oracle.test.ts
- web/src/agent/tools/compact-learnset.ts, compact-learnset.test.ts
- web/src/agent/tools/index.ts

Verification commands and results:
- vitest (3 files, node): 47 passed
- typecheck: unrelated pdfkit missing in host node_modules

MUST-FIX / SHOULD-FIX: none

Parent-local glue: `web/src/app/api/chat/route.test.ts` tools length 20→21 (ADR-5 mentions test; T22 is the real 21st tool).

### Phase 2: Classifier + runtime loop + legalize keep

Not started.

### Phase 3: Prompt + pins + agent-design doc

Not started.

### Phase 4: Eval + warning render sanity

Not started.

## Integration

- Checkpoints (from architecture):
  - After box-p1: lookup_box compact I/O
  - After box-p2: cap 6 + keepSpecies
  - After box-p3: box-build section in cached body
  - Final: keep + no SQL/wiki
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
