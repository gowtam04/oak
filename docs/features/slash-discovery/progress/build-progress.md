# Build Progress

Status: `COMPLETE`

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
- Notes: Feature docs copied into worktree (untracked on shared `develop`). Manifest vs prose: P4 `ChatViewModelReducerTest.kt` assigned to P4 worker (slash-only). Do not edit shared `develop` checkout. `web/node_modules` is a symlink to the primary checkout (parent-local setup). `src/lib/chat/*.test.ts` is in the **jsdom** Vitest project (P1 glue in `vitest.config.ts`) so slash oracles do not start Testcontainers.

## Resume Snapshot

- Last completed phase id / name: p5 lockstep (COMPLETE)
- Last green verification:
  - Web jsdom 126/126 — `slash-commands` 20, `slash-picker` 18, `slash-search` 14, `SlashAutocomplete` 9, `Composer` 26, `page-slash-discovery.fullstack` 18, `page-chat-qol.fullstack` 21
  - iOS 55/55 — `SlashCommandsTests` + `SlashPickerTests` + `SlashDiscoveryViewModelTests` (iPhone 17 simulator)
  - Android 81/81 — `SlashCommandsTest` 22, `SlashPickerTest` 18, `SlashDiscoveryViewModelTest` 19, `ChatViewModelReducerTest` 22
- Open review findings: none. P5 oracle drift: none (six tokens + empty copy match; `/newish`/`/foo` are message; no `/dt` `/weak` `/learn`).
- Worktrees / branches in play: `../oak-slash-discovery` on `agent/slash-discovery`

## Current Phase

- Phase name / number / manifest id: p5 (three-client checkpoint / lockstep)
- Requirement refs: SD-US-9, SD-BR-15, SD-BR-19
- Status: `verified`
- Active workers: none
- P1 verified: oracle-stable commit `0002f1f`
- P2/P3/P4 verified: hops + oracles (counts above). Extra wiring outside P3/P4 `owns`: iOS `ChatTabView` / `ChatThreadScreen` / `ChatView`; Android `ChatScreen` / `MainActivity`.

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

### Phase 2: Web picker, keyboard, hops

Requirement refs: SD-US-1..8, SD-AC-5.9, SD-BR-2, SD-BR-3, SD-BR-7, SD-BR-8, SD-BR-9, SD-BR-11, SD-BR-12, SD-BR-13, SD-BR-14, SD-BR-16

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | red tests in `adf211e`; fullstack `page-slash-discovery.fullstack.test.tsx` |
| Implementation | done | picker + Composer + `page.tsx` hops; `page-chat-qol` slash expects patched (shared on collision) |
| Regression | done | P5 re-ran P2 jsdom subset **126/126 pass** |

Files (owns + shared slash expects): `slash-search.ts`, `SlashAutocomplete.tsx`, `Composer.tsx`, `types.ts`, `page.tsx`, `globals.css`, `page-slash-discovery.fullstack.test.tsx`, `page-chat-qol.fullstack.test.tsx`

### Phase 3: iOS lockstep

Requirement refs: SD-US-1..7, SD-AC-8.6, SD-AC-9.1

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | clone oracles + `SlashDiscoveryViewModelTests` |
| Implementation | done | `SlashPicker` / `SlashAutocomplete` / `ChatViewModel` / `ComposerView` |
| Extra wiring | done | not in P3 `owns`: `ChatTabView`, `ChatThreadScreen` (`dexLookup:`), `ChatView` (`dismissSlashPicker` on keyboard dismiss) |
| Regression | done | P5 re-ran slash `OakAppTests` **55/55 pass** |

### Phase 4: Android lockstep

Requirement refs: SD-US-1..7, SD-AC-5.7, SD-AC-8.6, SD-AC-9.1

| Step | Status | Notes |
|------|--------|-------|
| Tests | done | clone oracles + `SlashDiscoveryViewModelTest` + slash cases in `ChatViewModelReducerTest` |
| Implementation | done | picker / VM fan-out / `Usage(slug)` / `requestDex` kind |
| Extra wiring | done | not in P4 `owns`: `ChatScreen` (slash insert callbacks), `MainActivity` (`dexLookup`) |
| Regression | done | P5 re-ran P4 unit tests **81/81 pass** |

### Phase 5: Three-client checkpoint

Requirement refs: SD-US-9, SD-BR-15, SD-BR-19

| Step | Status | Notes |
|------|--------|-------|
| Grep hops | done | web fullstack, iOS `SlashDiscoveryViewModelTests`, Android `SlashDiscoveryViewModelTest` all cover help, bare `/`, usage slug, dex kind, images kept, edit last, unknown=`/foo` message |
| Oracle lockstep | done | six tokens + `PICKER_CAPTION` / `EMPTY_DEX` / `EMPTY_USAGE` / `EMPTY_TEAMS` / `EMPTY_TEAMS_GUEST` match exactly |
| SD-BR-19 | done | `/newish` and `/foo` are message; no `/dt` `/weak` `/learn` / `/get_pokemon` commands |
| Drift repair | n/a | no oracle edits |
| Status | verified | parent marked COMPLETE |

## Integration

- Checkpoints (from architecture when present): oracle-stable (P1), web-hops (P2), ios-hops (P3), android-hops (P4), lockstep (P5)
- Seams covered: portable parse + picker catalog; send intercept (help/bare/usage-slug/dex-kind/images/edit-last/unknown=message) on web `page.tsx`, iOS `ChatViewModel`, Android `ChatViewModel`
- Results:
  - oracle-stable: P1 `0002f1f`
  - web-hops: 126 jsdom pass
  - ios-hops: 55 pass
  - android-hops: 81 pass
  - lockstep: commands + empty copy + hop coverage match; unknown = message; no second query language.

## Final Verification

- Full suite: not run (architecture: no Testcontainers node suite). Targeted: web jsdom 126, iOS 55, Android 81.
- Typecheck / build: full `tsc` has a pre-existing `ChatThread.test.tsx` `onEditLast` error unrelated to this pack. Browser: no local `:3000`; web hops verified via fullstack jsdom.
- Requirement refs covered: SD-US-1..9, SD-AC-*, SD-BR-1..19 as cited per phase; Chat QoL SLASH-BR-2 / SLASH-AC-1.6 / SLASH-AC-2.5; CALC-US-3.
- Review findings remaining: none
- Unresolved risks: extra wiring files outside P3/P4 owns (dexLookup inject + picker mount) are required. Empty-desk `onOpenUsage` still uses `/meta` (redirects; out of this pack).

## Parent-Local Fixes

- Android `develop` did not compile: `TeamService.setTemplate` missing (`PokemonUsagePane.kt`) and `DexDetailScreen` passed undeclared `onApplySpecies`. Glue so P4 tests can compile. Not slash product behavior.

- Symlink `web/node_modules` was stale; ran `npm install` in the worktree.
- First P1 red runner reported missing `src/lib/chat/` — files exist in the worktree; runner cwd was wrong. Retrying with `--project jsdom` after a vitest include glue so oracles do not start Testcontainers (architecture: no Docker for oracle tests).
- `web/vitest.config.ts`: include `src/lib/chat/**/*.test.ts` in jsdom and exclude from node so slash oracles do not start Testcontainers.
