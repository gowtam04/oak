# Answer cards and artifacts — Implementation Plan

Mode: PM. Budget: hobby. All phases are in scope for
`/build-orchestrator`. Nothing here is optional.

Pinned commands (also in [deployment.md](./deployment.md)):

```text
test:         cd web && npm test
test_one:     cd web && npx vitest run <file> [-t "<name>"]
typecheck:    cd web && npm run typecheck
build:        cd web && npm run build
lint:         cd web && npm run lint
ios_test:     cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'
android_test: cd android && ./gradlew --no-daemon :app:testDebugUnitTest
```

## File Structure (Ownership Map)

### New — data / contracts

| File | Purpose | Owner phase |
|---|---|---|
| `web/drizzle/0020_answer_card_artifacts.sql` | `account.answer_density`; `conversation_artifact_pin` | P1 |
| `web/src/agent/sanitize-citation-anchors.ts` | Strip bad `anchor` / model-emitted `origin` | P1 |
| `web/src/agent/sanitize-citation-anchors.test.ts` | Invalid anchors never fail a fixture answer | P1 |
| `web/src/data/repos/artifact-pin-repo.ts` | list / get / insert (cap 5) / delete / deleteForConversation / deleteForAccount | P1 |
| `web/src/data/repos/artifact-pin-repo.test.ts` | Cap, isolation, cascade | P1 |
| `web/src/lib/calc/calc-schema.ts` | `CalcScenario`, `CalcResult`, Zod | P2 |
| `web/src/lib/calc/calc-schema.test.ts` | | P2 |
| `web/src/lib/calc/default-level.ts` | `defaultCalcLevel(format)` | P2 |
| `web/src/lib/calc/default-level.test.ts` | 50 vs 100 matrix vs `formats.ts` | P2 |
| `web/src/lib/calc/explain-prompt.ts` | Deterministic Explain message | P2 |
| `web/src/lib/calc/explain-prompt.test.ts` | | P2 |
| `web/src/server/calc/modifiers.ts` | Catalog → multipliers + `unsupported[]` | P2 |
| `web/src/server/calc/modifiers.test.ts` | Each listed item/weather/screen; leftovers unsupported | P2 |
| `web/src/server/calc/calc-engine.ts` | Resolve + stats + estimate + spreads + caveat | P2 |
| `web/src/server/calc/calc-engine.test.ts` | Incomplete, 0×, Life Orb, old-gen caveat | P2 |
| `web/src/data/teams/place-on-team.ts` | `placeSpeciesOnTeam` | P5 |
| `web/src/data/teams/place-on-team.test.ts` | first empty, full, replace, copy-fields | P5 |
| `web/src/lib/candidates-tsv.ts` | Visible rows → TSV | P5 |
| `web/src/lib/candidates-tsv.test.ts` | | P5 |
| `web/src/lib/pokemon-compare.ts` | `diffPokemonProfiles` | P5 |
| `web/src/lib/pokemon-compare.test.ts` | Cross-scope tags, movepool diff | P5 |
| `web/src/lib/proposed-team-showdown.ts` | Thin wrapper over existing serialize | P5 |
| `web/src/lib/proposed-team-showdown.test.ts` | Same string as human-md Showdown section | P5 |
| `web/src/server/voice/tool-trace-store.ts` | In-process buffer | P4 |
| `web/src/server/voice/tool-trace-store.test.ts` | | P4 |
| `web/src/server/voice/hydrate-store.ts` | running / failed / abort | P4 |
| `web/src/server/voice/hydrate-store.test.ts` | Preempt | P4 |
| `web/src/agent/prompts/voice-compile.ts` | Compile prompt (not domain.ts) | P4 |
| `web/src/server/voice/run-voice-compile.ts` | submit_answer-only loop + same-row write | P4 |
| `web/src/server/voice/run-voice-compile.test.ts` | Mock provider; replace row; abort | P4 |

### New — API routes

| File | Purpose | Phase |
|---|---|---|
| `web/src/app/api/calc/route.ts` | POST estimate | P2 |
| `web/src/app/api/calc/route.test.ts` | | P2 |
| `web/src/lib/api/calc-client.ts` | never-throw | P2 |
| `web/src/app/api/conversations/[id]/artifact-pins/route.ts` | GET list + POST | P5 |
| `web/src/app/api/conversations/[id]/artifact-pins/[pinId]/route.ts` | GET snapshot + DELETE | P5 |
| `web/src/app/api/conversations/[id]/artifact-pins/route.test.ts` | cap, 401, 404 | P5 |
| `web/src/app/api/account/preferences/route.ts` | PATCH density | P5 |
| `web/src/app/api/account/preferences/route.test.ts` | | P5 |
| `web/src/app/api/voice/hydrate/route.ts` | POST retry; GET status | P4 |
| `web/src/app/api/voice/hydrate/route.test.ts` | | P4 |

### New — web UI

| File | Purpose | Phase |
|---|---|---|
| `web/src/components/calc/CalculatorPanel.tsx` | Shared form | P6 |
| `web/src/components/calc/CalculatorOverlay.tsx` | Chat overlay | P6 |
| `web/src/components/calc/CalculatorPanel.test.tsx` | | P6 |
| `web/src/app/calc/page.tsx` | First-class screen | P6 |
| `web/src/components/teams/AddToTeamPicker.tsx` | Team list + replace sheet | P6 |
| `web/src/components/teams/AddToTeamPicker.test.tsx` | Guest hidden (caller) | P6 |
| `web/src/components/artifact/PinnedArtifactStrip.tsx` | Strip | P6 |
| `web/src/components/answer-card/CitationHighlight.tsx` | Span highlight | P6 |
| `web/src/lib/api/artifact-pin-client.ts` | | P5 |
| `web/src/lib/api/preferences-client.ts` | | P5 |

### New — iOS

| File | Purpose | Phase |
|---|---|---|
| `ios/OakApp/Models/Wire/CalcWire.swift` | Scenario / result | P7 |
| `ios/OakApp/Services/CalcService.swift` | POST /api/calc | P7 |
| `ios/OakApp/Features/Calc/CalculatorView.swift` | Full + sheet | P7 |
| `ios/OakApp/Features/Teams/AddToTeamSheet.swift` | Picker | P7 |
| `ios/OakApp/Features/Teams/PlaceOnTeam.swift` | Port of placeSpeciesOnTeam | P5 |
| `ios/OakApp/Features/Chat/CandidatesTsv.swift` | TSV | P5 |
| `ios/OakApp/Features/Artifact/PokemonCompare.swift` | Diff | P5 |
| `ios/OakApp/Features/Artifact/PinnedArtifactStrip.swift` | Strip | P7 |
| `ios/OakApp/Services/ArtifactPinService.swift` | Pins API | P7 |
| `ios/OakAppTests/PlaceOnTeamTests.swift` | Lockstep | P5 |
| `ios/OakAppTests/SlashCommandsTests.swift` | extend `/calc` | P5 |
| `ios/OakAppTests/CandidatesTsvTests.swift` | | P5 |
| `ios/OakAppTests/PokemonCompareTests.swift` | | P5 |
| `ios/OakAppTests/CalcWireTests.swift` | | P7 |

### New — Android

| File | Purpose | Phase |
|---|---|---|
| `android/.../wire/CalcWire.kt` | | P8 |
| `android/.../services/CalcService.kt` | | P8 |
| `android/.../features/calc/CalculatorScreen.kt` | | P8 |
| `android/.../features/teams/AddToTeamSheet.kt` | | P8 |
| `android/.../features/teams/PlaceOnTeam.kt` | | P5 |
| `android/.../features/chat/CandidatesTsv.kt` | | P5 |
| `android/.../features/artifact/PokemonCompare.kt` | | P5 |
| `android/.../features/artifact/PinnedArtifactStrip.kt` | | P8 |
| `android/.../services/ArtifactPinService.kt` | | P8 |
| `android/.../test/.../PlaceOnTeamTest.kt` | | P5 |
| `android/.../test/.../SlashCommandsTest.kt` | extend `/calc` | P5 |
| `android/.../test/.../CandidatesTsvTest.kt` | | P5 |
| `android/.../test/.../PokemonCompareTest.kt` | | P5 |

(`android/...` = `android/app/src/main/kotlin/ai/gowtam/oak/` and
`android/app/src/test/java/ai/gowtam/oak/`.)

### Modified (single owner)

| File | Change | Phase |
|---|---|---|
| `web/src/data/schema.ts` | column + pin table | P1 |
| `web/src/data/repos/accounts-repo.ts` | get/set density | P1 |
| `web/src/data/repos/conversation-repo.ts` | `updateAssistantAnswer`; delete pins on conversation/account delete | P1 |
| `web/src/agent/schemas.ts` | `citation.anchor`; server-owned `origin?: "voice"` | P1 |
| `web/src/agent/runtime.ts` | sanitize before parse | P1 |
| `web/src/agent/prompts/domain.ts` | teach anchors + span comments | P1 |
| `web/src/server/voice/voice-session.ts` or transcript synthesizer | stamp `origin: "voice"` | P4 |
| `web/src/app/api/voice/tool/route.ts` | append trace | P4 |
| `web/src/app/api/voice/transcript/route.ts` | start compile | P4 |
| `web/src/app/api/chat/route.ts` | `abortVoiceCompile` before startTurn | P4 |
| `web/src/data/reference-pages.ts` + move/ability/item `page.tsx` | honor `?format=` | P3 |
| `web/src/lib/chat/slash-commands.ts` + `.test.ts` | `{ type: "calc"; rest }` | P5 |
| `web/src/app/api/auth/me/route.ts` | `answerDensity` | P5 |
| `web/src/app/api/conversations/[id]/route.ts` | `pinnedArtifacts` | P5 |
| `web/src/components/answer-card/*` (listed in P6) | verbs, highlight, compact, paste | P6 |
| `web/src/components/artifact/*` header/actions | Dex, compare, pin, add | P6 |
| `web/src/app/page.tsx` | overlay, `/calc`, hydrate banner | P6 |
| Account UI (web) | density toggle | P6 |
| iOS `OakAnswer.swift`, `Citation`, answer card, artifact VM, Dex VM, ChatViewModel, Account | | P7 |
| Android `OakAnswer.kt`, answer card, artifact VM, Dex VM, ChatViewModel, Account | | P8 |
| Privacy / `operator-access-disclosure.ts` | voice may hydrate | P9 |

**Do not modify:** the 20-tool barrel (`tools/index.ts`), `estimate-damage.ts` formula (call it; don’t change the contract), Chat QoL chip derivation (still no calc/add chips).

---

## Phase 1: Data model and citation contract

- **What gets built:** migration `0020`; `answer_density`; pin table + repo; `citation.anchor` + `origin`; `sanitizeCitationAnchors`; runtime hook; `domain.ts` teaching; `updateAssistantAnswer` + delete-pin hooks on conversation/account delete.
- **Depends on:** nothing
- **Produces:** durable schema; safe submit_answer; pin repo
- **Parallel opportunities:** none inside the phase — sequential. **P2 and P3 may start in parallel with P1** (disjoint owns).
- **Test focus:** sanitize never fails a legal answer; bad anchors dropped; pin repo cap 5 + isolation; accounts-repo density NULL = full
- **Requirement refs:** CIT-US-2, CIT-AC-2.1–2.2, CIT-BR-3, PIN-BR-1–5 (repo only), COMPACT-BR-2/4 (column only), VOICE-AC-1.2 (`origin` field)

## Phase 2: Calc engine and `POST /api/calc`

- **What gets built:** calc-schema, default level, modifier catalog, engine, route, client, explain-prompt
- **Depends on:** nothing (uses existing formulas + repos)
- **Produces:** authenticated-optional estimate API
- **Parallel opportunities:** runs in parallel with P1 and P3
- **Test focus:** incomplete → no fake 0; status move; Life Orb applied; leftovers in `unsupported`; gen-1 caveat; common_spreads only when defender EVs default; `defaultCalcLevel` matrix
- **Requirement refs:** CALC-US-4–7, CALC-AC-4.1–4.4, 5.1–5.4, 6.3, 7.1, CALC-BR-1–3, 6–8

## Phase 3: Dex `?format=` on move / ability / item

- **What gets built:** `reference-pages` + the three `[slug]/page.tsx` honor `?format=` the way Pokédex already does (soft fallback)
- **Depends on:** nothing
- **Produces:** DEX-BR-3 URLs that work
- **Parallel opportunities:** parallel with P1 and P2
- **Test focus:** `?format=gen-5` on a move page does not silently show SV-only data as if it were gen-5
- **Requirement refs:** DEX-US-2, DEX-AC-2.1–2.2, DEX-BR-3

## Phase 4: Voice compile (same row)

- **What gets built:** tool-trace + hydrate stores; `voice-compile` prompt; `runVoiceCompile`; stamp `origin`; hook tool + transcript + chat abort; `GET/POST /api/voice/hydrate`
- **Depends on:** P1 (`updateAssistantAnswer`, `origin`, sanitize)
- **Produces:** speech-first thin card that upgrades in place; Retry; preempt
- **Parallel opportunities:** none with P1 (depends). Parallel with P2/P3. Sequential internally.
- **Test focus:** transcript 200 before compile finishes; success overwrites same id; fail leaves thin card + failed status; chat POST aborts compile; Retry re-runs; compile is not a second message pair
- **Requirement refs:** VOICE-US-1–3, VOICE-AC-1.1–2.3, 3.1–3.3, VOICE-BR-1–6

## Phase 5: Portable lockstep + pin/preference HTTP

- **What gets built:** slash `{ type:"calc" }` on web+iOS+Android parsers + tests (Chat QoL `/calc` unknown tests flip here); `placeSpeciesOnTeam` + native ports; TSV; pokemon-compare; Showdown wrapper; pin routes + client; preferences route; `GET /api/auth/me` `answerDensity`; `GET /api/conversations/:id` `pinnedArtifacts`
- **Depends on:** P1 (pin repo, density column)
- **Produces:** all client contracts except visual chrome
- **Parallel opportunities:** after P1; parallel with P4 (disjoint). Native lockstep files in this phase are **this phase’s owns** — P7/P8 must not rewrite parsers.
- **Test focus:** `/calc` not a message; `/calc foo vs bar` has rest; place first-empty/full/replace; TSV columns; compare two scopes; pin 409 at 6; guest 401 on pins/preferences
- **Requirement refs:** CALC-US-3, CALC-AC-3.1–3.4, CALC-BR-4, ADD-BR-1–2, TBL-US-4, CMP-US-2–3, PIN-US-1–3 (API), COMPACT-US-2 (API), PASTE-BR-2, AUTH-BR-1–3

## Phase 6: Web UI

- **What gets built:** Calculator overlay + `/calc` page; Add to team on every structured Pokémon; Dex button on artifact (four kinds); candidate sort/filter/row-pin/TSV; Compare with…; citation highlight + open; pin strip + pin action; compact on Account + AnswerCard; Showdown button on proposal; `/calc` slash dispatch; hydrate banner + Retry; guest hide Add/Pin
- **Depends on:** P2, P3, P5 (P4 for hydrate chrome — if P4 is late, hydrate UI can no-op on missing field)
- **Produces:** complete web surface
- **Parallel opportunities:** **P6 ∥ P7 ∥ P8** after P5 (and P2/P3). Disjoint trees.
- **Test focus:** jsdom: guest has no Add/Pin; Dex not on type artifact; table filter does not fetch M; compact hides reasoning/sources only; Explain does not close overlay
- **Requirement refs:** ADD-US-1–4, DEX-US-1, CALC-US-1–2, 8–9, TBL-US-1–3, CMP-US-1, CIT-US-1, PIN-US-1–3 (UI), COMPACT-US-1, PASTE-US-1, AUTH-BR-1, plus UI file

## Phase 7: iOS UI

- **What gets built:** same verbs as P6 on OakApp: Calculator full+sheet, AddToTeamSheet, Dex hop sets tab format, table tools, Compare with, highlight, pin strip, compact, Showdown, `/calc`, voice finishing/Retry/mic glyph
- **Depends on:** P2, P3, P5; P4 for voice chrome
- **Produces:** complete iOS surface
- **Parallel opportunities:** parallel with P6 and P8
- **Test focus:** VM/unit: slash calc; place-on-team already in P5; hydrate retry calls POST /api/voice/hydrate; guest hide
- **Requirement refs:** same IDs as P6 (iOS)

## Phase 8: Android UI

- **What gets built:** same as P7 **except** no mic session. Still render `origin === voice`, compact, calc, add, Dex, table, compare, highlight, pins, Showdown, `/calc`
- **Depends on:** P2, P3, P5
- **Produces:** complete Android surface
- **Parallel opportunities:** parallel with P6 and P7
- **Test focus:** same as P7 minus voice session
- **Requirement refs:** same IDs as P6 (Android). VOICE stories apply only to rendering a hydrated card, not capturing voice

## Phase 9: Polish and disclosure

- **What gets built:** operator-access / privacy line for hydrated voice; three-client drift pass (card order, guest hide, `/calc` tests); fixture lockstep if any string drifted
- **Depends on:** P6, P7, P8
- **Produces:** shippable pack
- **Parallel opportunities:** none — sequential review
- **Test focus:** `npm run typecheck` + `lint`; confirm Chat QoL chip tests still forbid add-to-team **chips**
- **Requirement refs:** operational privacy note; AUTH-BR-1 cross-client

---

## Integration checkpoints

1. **After P2** — `POST /api/calc` against Testcontainers: Garchomp Earthquake vs a known defender returns a range + `is_estimate`.
2. **After P1+P5** — signed-in pin create/list/delete + 409 on 6th; `/api/auth/me` density; conversation GET lists pins.
3. **After P4** — transcript then mocked compile replaces `answer_json` on the same assistant id; chat POST aborts.
4. **After P6** — web: add-to-team RMW + editor query; overlay `/calc`; citation highlight; guest UI hide.
5. **After P7+P8** — native calc + add + Dex format hop + TSV + pin strip against the same APIs.
6. **After P9** — three-client slash `/calc` + Showdown paste + place-on-team fixtures match.

## Build Manifest

```yaml
commands:
  test: "cd web && npm test"
  test_one: "cd web && npx vitest run <file> [-t \"<name>\"]"
  typecheck: "cd web && npm run typecheck"
  build: "cd web && npm run build"
  lint: "cd web && npm run lint"
  ios_test: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'"
  android_test: "cd android && ./gradlew --no-daemon :app:testDebugUnitTest"
phases:
  - id: p1
    name: Data model and citation contract
    depends_on: []
    owns:
      - "web/drizzle/0020_answer_card_artifacts.sql"
      - "web/src/data/schema.ts"
      - "web/src/data/repos/artifact-pin-repo.ts"
      - "web/src/data/repos/artifact-pin-repo.test.ts"
      - "web/src/data/repos/accounts-repo.ts"
      - "web/src/data/repos/conversation-repo.ts"
      - "web/src/agent/schemas.ts"
      - "web/src/agent/sanitize-citation-anchors.ts"
      - "web/src/agent/sanitize-citation-anchors.test.ts"
      - "web/src/agent/runtime.ts"
      - "web/src/agent/prompts/domain.ts"
    shared: []
    requirement_refs: [CIT-US-2, CIT-AC-2.1, CIT-AC-2.2, CIT-BR-3, PIN-BR-1, COMPACT-BR-2]
    test_focus: "sanitize + pin repo cap/isolation + density default"
  - id: p2
    name: Calc engine and POST /api/calc
    depends_on: []
    owns:
      - "web/src/lib/calc/**"
      - "web/src/server/calc/**"
      - "web/src/app/api/calc/**"
      - "web/src/lib/api/calc-client.ts"
    shared: []
    requirement_refs: [CALC-US-4, CALC-US-5, CALC-US-6, CALC-US-7, CALC-BR-1, CALC-BR-3, CALC-BR-6, CALC-BR-8]
    test_focus: "engine + route: incomplete, modifiers, old-gen caveat, common spreads"
  - id: p3
    name: Dex ?format= on move / ability / item
    depends_on: []
    owns:
      - "web/src/data/reference-pages.ts"
      - "web/src/app/(reference)/moves/**"
      - "web/src/app/(reference)/abilities/**"
      - "web/src/app/(reference)/items/**"
    shared: []
    requirement_refs: [DEX-US-2, DEX-AC-2.1, DEX-BR-3]
    test_focus: "format query honored on non-pokemon reference pages"
  - id: p4
    name: Voice compile (same row)
    depends_on: [p1]
    owns:
      - "web/src/server/voice/tool-trace-store.ts"
      - "web/src/server/voice/tool-trace-store.test.ts"
      - "web/src/server/voice/hydrate-store.ts"
      - "web/src/server/voice/hydrate-store.test.ts"
      - "web/src/agent/prompts/voice-compile.ts"
      - "web/src/server/voice/run-voice-compile.ts"
      - "web/src/server/voice/run-voice-compile.test.ts"
      - "web/src/app/api/voice/hydrate/**"
      - "web/src/app/api/voice/tool/route.ts"
      - "web/src/app/api/voice/transcript/route.ts"
      - "web/src/app/api/chat/route.ts"
      - "web/src/server/voice/voice-session.ts"
    shared:
      - "web/src/data/repos/conversation-repo.ts"
    requirement_refs: [VOICE-US-1, VOICE-US-2, VOICE-US-3, VOICE-BR-1, VOICE-BR-5]
    test_focus: "same-row replace; abort on chat POST; retry; no second pair"
  - id: p5
    name: Portable lockstep + pin/preference HTTP
    depends_on: [p1]
    owns:
      - "web/src/data/teams/place-on-team.ts"
      - "web/src/data/teams/place-on-team.test.ts"
      - "web/src/lib/candidates-tsv.ts"
      - "web/src/lib/candidates-tsv.test.ts"
      - "web/src/lib/pokemon-compare.ts"
      - "web/src/lib/pokemon-compare.test.ts"
      - "web/src/lib/proposed-team-showdown.ts"
      - "web/src/lib/proposed-team-showdown.test.ts"
      - "web/src/lib/chat/slash-commands.ts"
      - "web/src/lib/chat/slash-commands.test.ts"
      - "web/src/app/api/conversations/[id]/artifact-pins/**"
      - "web/src/lib/api/artifact-pin-client.ts"
      - "web/src/app/api/account/preferences/**"
      - "web/src/lib/api/preferences-client.ts"
      - "web/src/app/api/auth/me/route.ts"
      - "web/src/app/api/conversations/[id]/route.ts"
      - "ios/OakApp/Features/Teams/PlaceOnTeam.swift"
      - "ios/OakApp/Features/Chat/CandidatesTsv.swift"
      - "ios/OakApp/Features/Artifact/PokemonCompare.swift"
      - "ios/OakApp/Features/Chat/SlashCommands.swift"
      - "ios/OakAppTests/PlaceOnTeamTests.swift"
      - "ios/OakAppTests/SlashCommandsTests.swift"
      - "ios/OakAppTests/CandidatesTsvTests.swift"
      - "ios/OakAppTests/PokemonCompareTests.swift"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/teams/PlaceOnTeam.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/CandidatesTsv.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/artifact/PokemonCompare.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashCommands.kt"
      - "android/app/src/test/java/ai/gowtam/oak/features/teams/PlaceOnTeamTest.kt"
      - "android/app/src/test/java/ai/gowtam/oak/features/chat/SlashCommandsTest.kt"
      - "android/app/src/test/java/ai/gowtam/oak/features/chat/CandidatesTsvTest.kt"
      - "android/app/src/test/java/ai/gowtam/oak/features/artifact/PokemonCompareTest.kt"
    shared: []
    requirement_refs: [CALC-US-3, CALC-BR-4, ADD-BR-1, TBL-US-4, PIN-US-3, AUTH-BR-1]
    test_focus: "slash /calc; place-on-team; TSV; pin cap; preference PATCH"
  - id: p6
    name: Web UI
    depends_on: [p2, p3, p5]
    owns:
      - "web/src/components/calc/**"
      - "web/src/app/calc/**"
      - "web/src/components/teams/AddToTeamPicker.tsx"
      - "web/src/components/teams/AddToTeamPicker.test.tsx"
      - "web/src/components/artifact/PinnedArtifactStrip.tsx"
      - "web/src/components/answer-card/**"
      - "web/src/components/artifact/**"
      - "web/src/app/page.tsx"
    shared:
      - "web/src/components/artifact/**"
    requirement_refs: [ADD-US-1, DEX-US-1, CALC-US-1, CALC-US-2, TBL-US-1, CMP-US-1, CIT-US-1, PASTE-US-1, COMPACT-US-1]
    test_focus: "jsdom guest hide; table shown-set; overlay explain; Dex on artifact"
    flags: [ui]
  - id: p7
    name: iOS UI
    depends_on: [p2, p3, p5]
    owns:
      - "ios/OakApp/Models/Wire/CalcWire.swift"
      - "ios/OakApp/Services/CalcService.swift"
      - "ios/OakApp/Features/Calc/**"
      - "ios/OakApp/Features/Teams/AddToTeamSheet.swift"
      - "ios/OakApp/Features/Artifact/PinnedArtifactStrip.swift"
      - "ios/OakApp/Services/ArtifactPinService.swift"
      - "ios/OakApp/Features/Chat/**"
      - "ios/OakApp/Features/Artifact/**"
      - "ios/OakApp/Features/Dex/**"
      - "ios/OakApp/Features/Account/**"
      - "ios/OakApp/Models/Wire/OakAnswer.swift"
      - "ios/OakAppTests/CalcWireTests.swift"
    shared:
      - "ios/OakApp/Features/Chat/SlashCommands.swift"
      - "ios/OakApp/Features/Chat/AnswerCard/**"
    requirement_refs: [ADD-US-1, DEX-US-1, CALC-US-1, VOICE-US-1, PIN-US-1]
    test_focus: "VM: calc hop, add-to-team, hydrate retry, guest hide"
    flags: [ui]
  - id: p8
    name: Android UI
    depends_on: [p2, p3, p5]
    owns:
      - "android/app/src/main/kotlin/ai/gowtam/oak/wire/CalcWire.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/services/CalcService.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/calc/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/teams/AddToTeamSheet.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/artifact/PinnedArtifactStrip.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/services/ArtifactPinService.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/artifact/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/dex/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/account/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/wire/OakAnswer.kt"
    shared:
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashCommands.kt"
    requirement_refs: [ADD-US-1, DEX-US-1, CALC-US-1, PIN-US-1, COMPACT-US-1]
    test_focus: "VM: calc hop, add-to-team, guest hide; no new voice session"
    flags: [ui]
  - id: p9
    name: Polish and disclosure
    depends_on: [p6, p7, p8]
    owns:
      - "web/src/components/admin/operator-access-disclosure.ts"
      - "web/src/app/privacy/page.tsx"
    shared: []
    requirement_refs: [AUTH-BR-1]
    test_focus: "disclosure test + typecheck/lint; chip tests still forbid add-to-team chips"
integration_checkpoints:
  - after: [p2]
    name: calc-api
    verifies: "POST /api/calc returns an estimate without a model call"
  - after: [p1, p5]
    name: pins-and-prefs
    verifies: "pin CRUD + cap + preference PATCH against Testcontainers"
  - after: [p4]
    name: voice-same-row
    verifies: "thin card upgrades in place; chat POST preempts compile"
  - after: [p6]
    name: web-verbs
    verifies: "add-to-team, overlay calc, highlight, guest hide"
  - after: [p7, p8]
    name: native-parity
    verifies: "same APIs from iOS/Android unit fakes"
  - after: [p9]
    name: lockstep
    verifies: "slash /calc + Showdown + place-on-team fixtures match across clients"
```

### Manifest notes for orchestrators

- **P1 ∥ P2 ∥ P3** are disjoint. Start them together.
- **P4** shares `conversation-repo.ts` with P1 — do not start P4 until P1 lands that file.
- **P5** slash/parser files are **not** re-owned by P7/P8. P7/P8 `owns` Chat/Artifact globs are for UI; if a worker would rewrite `SlashCommands.swift` / `.kt`, stop — those landed in P5. Listed under P7/P8 `shared` as a collision warning.
- **P6** `web/src/components/artifact/**` is both in owns and shared because P6 is the only web writer; the duplicate `shared` entry tells later polish not to dual-write with a second web worker.
- P7 `Features/Chat/**` + `Features/Artifact/**` are broad; **one** iOS implementer for P7, not two.

## Orchestrator Notes

- Mode PM, budget hobby: infer ordinary React/SwiftUI/Compose details; do not invent a 21st tool or a calc microservice.
- Prefer this manifest for DAG and `owns`.
- Worktrees if running P6/P7/P8 together (three trees).
- TDD per slice: red tests in P1/P2/P4/P5 especially (`sanitize`, calc engine, pin cap, slash).
