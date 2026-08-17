# Answer cards and artifacts — Component Design

Each component: one job, one owner, listed files in
[implementation-plan.md](./implementation-plan.md).

## 1. Citation sanitize + highlight

**Owns:** making `anchor` safe and mapping tap → span/row.

| Piece | Path | Role |
|---|---|---|
| Schema | `web/src/agent/schemas.ts` | optional `citation.anchor` |
| Sanitize | `web/src/agent/sanitize-citation-anchors.ts` | strip before Zod + persist |
| Prompt | `web/src/agent/prompts/domain.ts` | teach anchors + span comments |
| Highlight (web) | `web/src/components/answer-card/CitationHighlight.tsx` | wrap spans, scroll/focus |
| Highlight (iOS/Android) | `CitationsView` / `Citations.kt` | same rules |
| Origin stamp | `synthesizeVoiceAnswer` + sanitize | `origin: "voice"` server-owned |

**Depends on:** existing `citationSchema`, `ReceiptsFooter` /
`CitationsView` tap path (today opens entity). **Change:** tap
still opens the artifact **and** highlights if linked
(**CIT-BR-1**).

**Does not own:** artifact viewer fetch.

## 2. Calc engine

**Owns:** turning a `CalcScenario` into an estimate.

| Piece | Path | Role |
|---|---|---|
| Scenario types | `web/src/lib/calc/calc-schema.ts` | portable Zod + types |
| Level default | `defaultCalcLevel(format)` in same folder | CALC-BR-7 |
| Modifier catalog | `web/src/server/calc/modifiers.ts` | weather / screens / listed items → multipliers; unsupported list |
| Engine | `web/src/server/calc/calc-engine.ts` | resolve entities via repos, `computeStat`, `estimateDamage`, common spreads, old-gen caveat |
| Route | `web/src/app/api/calc/route.ts` | POST, public, rate-limit |
| Client | `web/src/lib/api/calc-client.ts` | never-throw |

**Depends on:** `formulas/*`, pokedex/move repos, `/api/search` for
slash prefill (client). **Does not** call `runOak`.

Natives: `CalcService.swift` / `CalcService.kt` POST the same body.

## 3. Calculator UI

**Owns:** overlay + first-class screen.

| Web | iOS | Android |
|---|---|---|
| `components/calc/CalculatorPanel.tsx` (shared form) | `Features/Calc/CalculatorView.swift` | `features/calc/CalculatorScreen.kt` |
| `components/calc/CalculatorOverlay.tsx` | sheet over chat | sheet over chat |
| `app/calc/page.tsx` | `AppDestination.calculator` | `SurfaceRequest.Calculator` |

State: `CalcScenario` in component/VM. Debounce slider POSTs.
**Explain** builds `explainCalcPrompt` and calls existing send.
**Expand** navigates with the scenario in query/nav extras
(`?` payload or `sessionStorage` key `oak-calc-scenario` on web).

**Does not own:** pinning (calls pin client) or artifact stack
(can `openStructured` a calc snapshot).

## 4. Add-to-team

**Owns:** picker + `placeSpeciesOnTeam` + navigation to editor.

| Piece | Path |
|---|---|
| Pure place | `web/src/data/teams/place-on-team.ts` (portable; clone Swift/Kotlin) |
| Field copy | `fieldsFromSurface(surface)` — species + named set fields only |
| Web picker | `components/teams/AddToTeamPicker.tsx` |
| iOS/Android | `AddToTeamSheet` |

**Surfaces that host the verb:** `SpriteCard`, `CandidateTable` row
menu, comparison cell, `ProposedTeamCard` member, Pokémon
`PokemonArtifact` header. Hidden if `!signedIn`.

After success: web `navigateTo(/teams?team=&slot=)`; native push
editor with `focusedSlot`.

**Does not own:** team validation (existing `updateTeam`).

## 5. Table tools

**Owns:** client-only sort/filter/row-pin/TSV on **shown** rows.

`CandidateTable.tsx` / `CandidatesTableView.swift` / `CandidatesTable.kt`
gain local state. No API. TSV helper
`web/src/lib/candidates-tsv.ts` + lockstep native.

## 6. Compare builder

**Owns:** `Compare with…` picker + `diffPokemonProfiles`.

| Piece | Path |
|---|---|
| Diff | `web/src/lib/pokemon-compare.ts` (portable) |
| Picker | artifact header action → species+scope search (`/api/search`) → two `fetchEntityArtifact` → `openStructured({ kind:"comparison", … })` |

Existing answer “Compare in viewer” stays.

## 7. Pins

**Owns:** snapshot create/list/delete + conversation strip.

| Piece | Path |
|---|---|
| Repo | `web/src/data/repos/artifact-pin-repo.ts` |
| Routes | `api/conversations/[id]/artifact-pins/route.ts` + `[pinId]/route.ts` |
| Client | `web/src/lib/api/artifact-pin-client.ts` |
| Strip | `components/artifact/PinnedArtifactStrip.tsx` |

Pin action lives on team / comparison / calc artifact headers
when signed-in. Entity artifacts: no control.

## 8. Voice compile

**Owns:** tool-trace buffer, compile loop, same-row overwrite.

| Piece | Path |
|---|---|
| Trace store | `web/src/server/voice/tool-trace-store.ts` |
| Hydrate registry | `web/src/server/voice/hydrate-store.ts` (running/failed/abort) |
| Prompt | `web/src/agent/prompts/voice-compile.ts` |
| Runner | `web/src/server/voice/run-voice-compile.ts` |
| Repo write | `updateAssistantAnswer` on conversation-repo |
| Retry route | `api/voice/hydrate/route.ts` |

**Does not** use `startTurn` / turn-store 409. Chat POST calls
`abortVoiceCompile(conversationId)` first.

Clients: if `hydrate.status === "running"` show “finishing
card…”; `failed` show Retry. Mic glyph if `answer.origin === "voice"`.

Android: no mic. Still render `origin` and a hydrated card if
history contains one.

## 9. Compact / full

**Owns:** preference read/write + card collapse.

| Piece | Path |
|---|---|
| Account column + me/PATCH | data + `api/account/preferences` |
| Web | `AnswerCard` reads preference context; Account toggle |
| Native | Account screen + `AnswerCardView` |

Per-card override is local UI state, not PATCH.

## 10. Slash `/calc`

**Owns:** parser extension + dispatch to overlay.

Modify `slash-commands.ts` / `SlashCommands.swift` / `SlashCommands.kt`
only in the portable-parse phase so all three stay lockstep. Page /
VMs in the UI phases call the overlay.

## 11. Dex format on reference pages

**Owns:** `?format=` on move/ability/item loaders
(`reference-pages.ts` + those `page.tsx` files). Pokémon already
works. Native Dex VM `format` write before push.

## 12. Existing components this pack must not fork

- Artifact viewer stack / `GET /api/entity` — extend actions only
- Team editor — destination of add-to-team, not rewritten
- `serializeShowdown` / human-md — reused for PASTE
- Chat QoL chips — still must not invent add-to-team; the **on-card
  verb** is this pack
- 20 chat tools — unchanged

## Cross-cutting

- **Signed-in gating** is UI-hide + existing 401/404. No new auth.
- **Three-client lockstep** for: slash parse, TSV, Showdown paste,
  `placeSpeciesOnTeam`, `diffPokemonProfiles`, `explainCalcPrompt`,
  `defaultCalcLevel`, citation highlight rules, `CalcScenario` wire.
- **Design system:** existing type badges, sprites, caveat strip.
