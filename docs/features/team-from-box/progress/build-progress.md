# Build Progress

Status: `COMPLETE`

## References

- Architecture: `docs/features/team-from-box/architecture/design.md`
- Requirements: `docs/features/team-from-box/requirements/requirements.md`
- Build Manifest: `present` (`docs/features/team-from-box/architecture/design.md`)
- Mode: `PM`
- Budget Tier: `hobby`
- Rigor: `standard` (PM + 4 phases: tests → red → impl → impl review → regression)

## Environment

- Commands: `cd web && npx vitest run <file>`; `npm test`; `npm run typecheck`; `npm run lint`; `npx tsx eval/run.ts --deterministic`
- Notes:
  - Worktree: `/Users/gowtam/Projects/oak-team-from-box` on `agent/team-from-box`
  - Typecheck: host `node_modules` lacks `pdfkit` (pre-existing env; not this feature)
  - `eval/run.ts --deterministic` needs `XAI_API_KEY`; Vitest dummy keys cover the same subset

## Resume Snapshot

- Last completed phase: box-p4 verified
- Last green verification: 737 targeted vitest tests passed (node 728 + jsdom 9). iOS TeamWarningDecodeTests + ToolTrailTests passed. Android TeamDecodeTest + StreamingHeuristicTest passed.
- Open review findings: none
- Branch: `agent/team-from-box`

## Current Phase

- Phase: COMPLETE
- Status: `verified`

## Phase Log

### Phase 1: lookup_box + compact learnset

Requirement refs: BOX-AC-3.2, BOX-AC-3.4, BOX-BR-5, BOX-BR-7

All steps done. T22 appended after T21. Empty learnset is found+unavailable.

### Phase 2: Classifier + runtime loop + legalize keep

Requirement refs: BOX-US-1, BOX-US-5, BOX-AC-1.*, BOX-AC-3.1/3.3, BOX-BR-1/2/9/10/11

Cap 6, SQL/wiki deny, keepSpecies, learnset_unavailable soft, follow-up inherit. Review MUST-FIX (KR 빼지 keep-set, warning emission, follow-up inherit) resolved.

### Phase 3: Prompt + pins + agent-design doc

Requirement refs: BOX-US-2/3/4, BOX-BR-5/6/7

`## Box-build` above Full build. T22 in tools.md. Review SHOULD-FIX (two-path exclusion, AC pins, cached prefix) resolved.

### Phase 4: Eval + warning render sanity

Requirement refs: BOX-AC-1.2, BOX-AC-2.4, BOX-AC-3.1

G61 structural proposed_team + warning + forbiddenTools. iOS/Android `learnset_unavailable`. `lookup_box` thinking-trace lock-step.

## Integration

- After box-p1: lookup_box compact I/O — pass
- After box-p2: cap 6 + keepSpecies — pass
- After box-p3: box-build section in cached body — pass
- Final: keep + no SQL/wiki — G61 structural — pass

## Final Verification

- Feature tests: 737 passed
- iOS decode + tool-trail: passed
- Android decode + streaming heuristic: passed
- Full `npm test` / typecheck / lint: not run as whole-repo (pdfkit typecheck env; full suite is Docker-heavy). Targeted feature suite is green.
- Review findings remaining: none

## Parent-Local Fixes

- `web/src/app/api/chat/route.test.ts` tools length 20→21 (ADR-5 mentions test)
- G61 dropped `mustInclude: ["Learnset unavailable"]` after structural card gates landed
