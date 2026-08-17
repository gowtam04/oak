# Chat QoL — Implementation Plan

Mode: PM. Budget: hobby. All phases are documentation-ready for
`/build-orchestrator`. No phase is optional.

Pinned commands (also in [deployment.md](./deployment.md)):

```text
test:       cd web && npm test
test_one:   cd web && npx vitest run <file> [-t "<name>"]
typecheck:  cd web && npm run typecheck
build:      cd web && npm run build
lint:       cd web && npm run lint
ios_test:   cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'
android_test: cd android && ./gradlew --no-daemon :app:testDebugUnitTest
```

## File Structure (Ownership Map)

### New — data / server

| File | Purpose | Owner |
|---|---|---|
| `web/drizzle/0019_chat_qol.sql` | Additive tables/columns (use next journal id if 0019 is taken) | data |
| `web/src/data/repos/folder-repo.ts` | Folder CRUD + unfile-on-delete | data |
| `web/src/data/repos/folder-repo.test.ts` | Folder repo tests | data |
| `web/src/data/repos/share-repo.ts` | Snapshot create/getLive/list/revoke/deleteForAccount | data |
| `web/src/data/repos/share-repo.test.ts` | Share repo tests | data |
| `web/src/data/repos/scope-mru-repo.ts` | MRU upsert + list | data |
| `web/src/data/repos/scope-mru-repo.test.ts` | MRU tests | data |
| `web/src/server/chat/bound-teams.ts` | Resolve mention UUIDs | chat |
| `web/src/server/chat/bound-teams.test.ts` | Unbound / guest / multi | chat |
| `web/src/server/export/conversation-export.ts` | Markdown + pdfkit PDF | export |
| `web/src/server/export/conversation-export.test.ts` | Q+A+tables, no tool trace | export |
| `web/src/agent/prompts/bound-teams.ts` | Ephemeral segment text | chat |

### New — API routes

| File | Purpose |
|---|---|
| `web/src/app/api/scope/route.ts` | PUT chip persist |
| `web/src/app/api/scope/route.test.ts` | |
| `web/src/app/api/folders/route.ts` | GET/POST |
| `web/src/app/api/folders/[id]/route.ts` | PATCH/DELETE |
| `web/src/app/api/folders/route.test.ts` | |
| `web/src/app/api/shares/route.ts` | POST create, GET list |
| `web/src/app/api/shares/[id]/route.ts` | DELETE revoke |
| `web/src/app/api/shares/public/[id]/route.ts` | GET public JSON |
| `web/src/app/api/shares/[id]/import-team/route.ts` | POST import |
| `web/src/app/api/shares/route.test.ts` | (covers the family) |
| `web/src/app/a/[id]/page.tsx` | Public HTML + noindex |
| `web/src/app/a/[id]/unavailable.tsx` | Revoked/unknown state |
| `web/src/app/api/conversations/[id]/export/route.ts` | GET md\|pdf |
| `web/src/app/api/conversations/[id]/export/route.test.ts` | |
| `web/src/app/api/conversations/[id]/fork/route.ts` | POST fork |
| `web/src/app/api/conversations/[id]/fork/route.test.ts` | |
| `web/src/app/api/conversations/[id]/pins/route.ts` | POST pin/unpin |
| `web/src/app/api/conversations/bulk/route.ts` | POST bulk |
| `web/src/app/api/conversations/bulk/route.test.ts` | |

### New — portable + web UI

| File | Purpose |
|---|---|
| `web/src/lib/oak-answer-human-md.ts` | Human copy projection |
| `web/src/lib/oak-answer-human-md.test.ts` | Lockstep fixtures |
| `web/src/lib/chat/follow-up-chips.ts` | Chip derivation |
| `web/src/lib/chat/follow-up-chips.test.ts` | Caps + no calc/add-to-team |
| `web/src/lib/chat/slash-commands.ts` | Leading-slash parse |
| `web/src/lib/chat/slash-commands.test.ts` | unknown → message |
| `web/src/lib/api/share-client.ts` | never-throw share fetches |
| `web/src/lib/api/folder-client.ts` | never-throw folder fetches |
| `web/src/lib/api/scope-client.ts` | PUT /api/scope |
| `web/src/components/chat/TurnActions.tsx` | Retry / edit / pin / fork |
| `web/src/components/chat/PinStrip.tsx` | Jump list |
| `web/src/components/chat/MentionAutocomplete.tsx` | `@` |
| `web/src/components/chat/FollowUpChipRow.tsx` | Chips |
| `web/src/components/chat/CommandPalette.tsx` | ⌘K |
| `web/src/components/chat/ShortcutOverlay.tsx` | `?` chords |
| `web/src/components/account/SharedByMe.tsx` | Revoke list |
| `web/src/components/chat/*.test.tsx` | jsdom component tests |

### New — iOS

| File | Purpose |
|---|---|
| `ios/OakApp/Features/Chat/AnswerCard/OakAnswerHumanMarkdown.swift` | Human copy |
| `ios/OakApp/Features/Chat/FollowUpChips.swift` | Chip derivation |
| `ios/OakApp/Features/Chat/SlashCommands.swift` | Slash parse |
| `ios/OakApp/Features/Chat/TurnActions.swift` | Card menu |
| `ios/OakApp/Features/Chat/PinStripView.swift` | Jump list |
| `ios/OakApp/Features/Chat/MentionAutocomplete.swift` | `@` |
| `ios/OakApp/Features/History/FolderSupport.swift` | Folder/archive/bulk VM bits if not in HistoryViewModel |
| `ios/OakApp/Features/Account/SharedByMeView.swift` | Shared-by-me |
| `ios/OakApp/Features/Share/ShareSnapshotView.swift` | Public snapshot |
| `ios/OakAppTests/OakAnswerHumanMarkdownTests.swift` | Same fixtures as web |
| `ios/OakAppTests/FollowUpChipsTests.swift` | |
| `ios/OakAppTests/SlashCommandsTests.swift` | |

### New — Android

| File | Purpose |
|---|---|
| `android/.../features/chat/HumanMarkdown.kt` | Human copy |
| `android/.../features/chat/FollowUpChips.kt` | |
| `android/.../features/chat/SlashCommands.kt` | |
| `android/.../features/chat/TurnActions.kt` | |
| `android/.../features/chat/PinStrip.kt` | |
| `android/.../features/chat/MentionAutocomplete.kt` | |
| `android/.../features/account/SharedByMe.kt` | |
| `android/.../features/share/ShareSnapshotScreen.kt` | |
| `android/.../app/src/test/.../HumanMarkdownTest.kt` | Same fixtures |
| `android/.../app/src/test/.../FollowUpChipsTest.kt` | |
| `android/.../app/src/test/.../SlashCommandsTest.kt` | |

### Modified

| File | Purpose |
|---|---|
| `web/package.json` / lockfile | add `nanoid`, `pdfkit`, types |
| `web/src/data/schema.ts` | new tables/columns |
| `web/drizzle/meta/_journal.json` (+ snapshot if the project commits them) | register 0019 |
| `web/src/data/repos/conversation-repo.ts` | replaceLastPair, folder/archive/bulk/fork/pins, list filters |
| `web/src/data/repos/conversation-repo.test.ts` | |
| `web/src/data/repos/accounts-repo.ts` | deleteAccount cascade |
| `web/src/data/repos/accounts-repo.test.ts` | shares/folders/mru gone |
| `web/src/server/session-store.ts` | guest replaceLastPair |
| `web/src/server/session-store.test.ts` | if present; else add |
| `web/src/lib/sse/sse-types.ts` | `recovery`, `mentioned_team_ids` |
| `web/src/app/api/chat/route.ts` | recovery persist, mentions, MRU touch |
| `web/src/app/api/chat/route.test.ts` + `web/test/chat-route-persistence.integration.test.ts` | |
| `web/src/server/run-turn.ts` | persist branch only if that’s where append lives — keep logic in route if that’s current |
| `web/src/agent/types.ts` | `boundTeams?` |
| `web/src/agent/context.ts` | bind |
| `web/src/agent/prompts/index.ts` | attach ephemeral segment |
| `web/src/app/api/auth/me/route.ts` | `lastUsedScopes` |
| `web/src/app/api/conversations/route.ts` | list filters |
| `web/src/app/api/conversations/[id]/route.ts` | PATCH archived/folder |
| `web/src/lib/api/history-client.ts` | new fields + fork/bulk/export helpers |
| `web/src/lib/hooks/use-conversations.ts` | folder/archive/bulk |
| `web/src/app/page.tsx` | undo, recovery, scope PUT, slashes, empty desk, palette hook |
| `web/src/components/answer-card/ReceiptsFooter.tsx` | human copy + share |
| `web/src/components/controls/ScopeChip.tsx` | MRU group |
| `web/src/components/admin/operator-access-disclosure.ts` | public shares |
| `web/src/components/admin/operator-access-disclosure.test.tsx` | |
| History list UI files (web `ConversationRow` / sidebar) | folders, multi-select |
| Account UI (web) | SharedByMe mount |
| iOS `ChatViewModel.swift`, `ComposerView.swift`, `AnswerCardView.swift`, `ChatView.swift`, `HistoryService.swift`, `HistoryListViewModel.swift`, `OakAPIClient.swift`, wire models | |
| Android `ChatViewModel.kt`, `Composer.kt`, `AnswerCard.kt`, `ChatScreen.kt`, `HistoryService.kt`, `HistoryViewModel.kt`, `OakAPIClient`/`wire/*` | |

Builder locates the exact history/account filenames if they differ slightly; do not create a second history client.

---

## Phase 1: Data Model

- **What gets built:** schema + migration 0019; folder/share/mru repos; `replaceLastPair` (DB + session-store); conversation list/archive/folder/pin/fork helpers; `deleteAccount` cascade; add `nanoid` + `pdfkit` to `package.json`.
- **Depends on:** nothing
- **Produces:** persisted entities and repo functions. No HTTP yet.
- **Parallel opportunities:** none — sequential (`schema.ts` is the hub)
- **Test focus:** repo tests via `createPgSchema`; replaceLastPair keeps one pair; folder delete unfiles; share getLive hides revoked; deleteAccount removes shares/folders/mru; guest session replace.
- **Requirement refs:** ORG-BR-1..4, PIN-BR-1, SHARE-BR-2/3/9, REC-BR-2/4, CQ-OQ-1, AUTH-BR-5

## Phase 2: Chat Recovery And Mentions

- **What gets built:** `ChatRequestBody.recovery` + `mentioned_team_ids`; bound-teams resolver; `ctx.boundTeams`; ephemeral prompt segment; chat route: 400 unbound, 409 nothing_to_replace, persist replace vs append; MRU `touch` on resolved signed-in turn (fire-and-forget).
- **Depends on:** Phase 1
- **Produces:** working retry/edit persist; mention bind; no UI.
- **Parallel opportunities:** none — `route.ts` + `sse-types.ts` hub
- **Test focus:** route tests with mocked `runOak`: retry success replaces; stop/error leaves old pair; unbound mention never `startTurn`; guest replace; `mentioned_team_ids` on guest → 400.
- **Requirement refs:** REC-US-1..3, REC-BR-1..8, MEN-US-1, MEN-BR-1..4, AUTH-BR-4, SCOPE-BR-2 (MRU on sent turn)

## Phase 3: Scope And MRU API

- **What gets built:** `PUT /api/scope`; `GET /api/auth/me` `lastUsedScopes`; `scope-client.ts`.
- **Depends on:** Phase 1
- **Produces:** chip-pick persist without a turn.
- **Parallel opportunities:** can run **in parallel with Phases 4, 5, 6** (disjoint route files). Not with Phase 2 (`me` is independent of chat route).
- **Test focus:** signed-in updates last_used_scope + conversation format; guest needs session_id; unknown format 400; me returns MRU order.
- **Requirement refs:** SCOPE-US-1, SCOPE-US-2, SCOPE-BR-1..3, SCOPE-AC-1.1..2.3

## Phase 4: Share API And Public Page

- **What gets built:** share routes, public JSON, `/a/[id]` page + unavailable, import-team, share-client.
- **Depends on:** Phase 1
- **Produces:** create/view/revoke/list/import.
- **Parallel opportunities:** with 3, 5, 6
- **Test focus:** snapshot fidelity; revoked 404; noindex metadata; guest cannot create; import creates **viewer** team; conversation delete leaves share; account delete removes share; public GET rate-limited.
- **Requirement refs:** SHARE-US-1..5, SHARE-BR-1..9, AUTH-BR-2/3/6, COPY allowed on public page (CQ-OQ-5)

## Phase 5: Export API

- **What gets built:** `conversation-export.ts` + export route.
- **Depends on:** Phase 1 (pdfkit already in package.json)
- **Produces:** md + pdf downloads.
- **Parallel opportunities:** with 3, 4, 6
- **Test focus:** includes Q+A+tables; excludes tool-activity; empty → 400; guest 401.
- **Requirement refs:** EXP-US-1, EXP-US-2, EXP-BR-1/2

## Phase 6: Organize API

- **What gets built:** folders routes; pins; fork; bulk; conversations GET/PATCH filters; history-client extensions.
- **Depends on:** Phase 1
- **Produces:** full organize HTTP.
- **Parallel opportunities:** with 3, 4, 5
- **Test focus:** one folder; delete folder unfiles; default list hides archived; search include_archived; pin assistant-only + cap; fork copies prefix+pins+scope, unfiled; bulk skip foreign ids.
- **Requirement refs:** PIN-US-1, FORK-US-1, ORG-US-1..3, PIN-BR-*, FORK-BR-*, ORG-BR-*

## Phase 7: Portable Projections

- **What gets built:** human-copy, chips, slash parse + fixture tests that natives will clone.
- **Depends on:** nothing (pure). May start anytime; must finish before client UI phases consume fixtures.
- **Produces:** oracle fixtures for three clients.
- **Parallel opportunities:** with Phases 1–6
- **Test focus:** human copy has prose/table/caveats/Showdown, not citation schema; chips respect caps and never emit calc/add-to-team; `/usage` unknown when `hasUsagePage=false`; unknown slash → message.
- **Requirement refs:** COPY-US-1, COPY-BR-1/2, CHIP-US-1, CHIP-BR-1..3, SLASH-US-1, SLASH-BR-1/2

## Phase 8: Web UI

- **What gets built:** page.tsx wiring (undo 3s, recovery POSTs, scope PUT on chip, slash intercept, empty desk, palette/shortcuts); TurnActions, PinStrip, mentions, chips, ReceiptsFooter share+human copy; history folders/bulk; Account SharedByMe; ScopeChip MRU; public page copy button.
- **Depends on:** Phases 2–7
- **Produces:** complete web product surface.
- **Parallel opportunities:** **with Phases 9 and 10** (no shared files)
- **Test focus:** jsdom/fullstack: undo calls stop; retry keeps old card until answer; chip pick without send calls PUT /api/scope; empty desk recents; palette lists; guest hides share/pin/fork.
- **Requirement refs:** all REC/COPY/SHARE/EXP/PIN/FORK/ORG/MEN/CHIP/SLASH/NAV/EMPTY/SCOPE user stories that are web-visible; NAV-US-1/2 web-only

## Phase 9: iOS Client

- **What gets built:** wire fields; ChatViewModel recovery/undo/mentions/slashes/scope PUT/chips; answer-card actions; history folders/archive/bulk/fork; SharedByMe; ShareSnapshotView; human markdown + tests vs Phase 7 fixtures. **No** palette/shortcuts.
- **Depends on:** Phases 2–7
- **Produces:** iOS parity except web-only NAV.
- **Parallel opportunities:** with Phase 8 and Phase 10
- **Test focus:** VM unit tests with fakes; markdown/chip/slash lockstep.
- **Requirement refs:** same as Phase 8 minus NAV-US-1/2

## Phase 10: Android Client

- **What gets built:** same as Phase 9 for Kotlin/Compose. No palette/shortcuts.
- **Depends on:** Phases 2–7
- **Produces:** Android parity except web-only NAV.
- **Parallel opportunities:** with Phase 8 and Phase 9
- **Test focus:** JUnit + fakes; lockstep fixtures.
- **Requirement refs:** same as Phase 9

## Phase 11: Privacy And Cross-Client Polish

- **What gets built:** operator-access disclosure + privacy copy; fix any three-client drift found in review; typecheck/lint; confirm `/usage` hidden on native slashes.
- **Depends on:** Phases 8, 9, 10
- **Produces:** shippable pack.
- **Parallel opportunities:** none
- **Test focus:** disclosure test; smoke that public share is noindex; three-client action matrix.
- **Requirement refs:** SHARE privacy disclosure, AUTH-BR-2, operational NFRs, three-client rule

## Integration checkpoints

1. **After 2+3+4+5+6 — backend-stack:** recovery, mentions, scope, share, export, organize against real Testcontainers Postgres. No UI.
2. **After 8 — web-ui-api:** guest and signed-in flows in fullstack tests.
3. **After 9+10 — native-wire:** iOS/Android fakes match `sse-types` + new routes.
4. **After 11 — three-client:** retry/edit/undo/copy/share/pin/fork/folders/scope/mentions exist on all three except palette/shortcuts.

---

## Build Manifest

```yaml
commands:
  test: "cd web && npm test"
  test_one: "cd web && npx vitest run"
  typecheck: "cd web && npm run typecheck"
  build: "cd web && npm run build"
  lint: "cd web && npm run lint"
phases:
  - id: p1
    name: Data Model
    depends_on: []
    owns:
      - "web/package.json"
      - "web/package-lock.json"
      - "web/drizzle/0019_chat_qol.sql"
      - "web/drizzle/meta/**"
      - "web/src/data/schema.ts"
      - "web/src/data/repos/conversation-repo.ts"
      - "web/src/data/repos/conversation-repo.test.ts"
      - "web/src/data/repos/folder-repo.ts"
      - "web/src/data/repos/folder-repo.test.ts"
      - "web/src/data/repos/share-repo.ts"
      - "web/src/data/repos/share-repo.test.ts"
      - "web/src/data/repos/scope-mru-repo.ts"
      - "web/src/data/repos/scope-mru-repo.test.ts"
      - "web/src/data/repos/accounts-repo.ts"
      - "web/src/data/repos/accounts-repo.test.ts"
      - "web/src/server/session-store.ts"
      - "web/src/server/session-store.test.ts"
    shared: []
    requirement_refs: [ORG-BR-1, ORG-BR-2, PIN-BR-1, SHARE-BR-2, SHARE-BR-3, REC-BR-2, CQ-OQ-1]
    test_focus: "repo + session-store replaceLastPair, cascade delete"
    flags: []
  - id: p2
    name: Chat Recovery And Mentions
    depends_on: [p1]
    owns:
      - "web/src/lib/sse/sse-types.ts"
      - "web/src/app/api/chat/route.ts"
      - "web/src/app/api/chat/route.test.ts"
      - "web/test/chat-route-persistence.integration.test.ts"
      - "web/src/server/run-turn.ts"
      - "web/src/server/chat/bound-teams.ts"
      - "web/src/server/chat/bound-teams.test.ts"
      - "web/src/agent/types.ts"
      - "web/src/agent/context.ts"
      - "web/src/agent/prompts/bound-teams.ts"
      - "web/src/agent/prompts/index.ts"
    shared: []
    requirement_refs: [REC-US-1, REC-US-2, REC-US-3, REC-BR-1, REC-BR-2, MEN-US-1, MEN-BR-1, MEN-BR-2]
    test_focus: "replace-on-success, unbound mention 400, stop keeps old pair"
    flags: []
  - id: p3
    name: Scope And MRU API
    depends_on: [p1]
    owns:
      - "web/src/app/api/scope/route.ts"
      - "web/src/app/api/scope/route.test.ts"
      - "web/src/app/api/auth/me/route.ts"
      - "web/src/lib/api/scope-client.ts"
    shared: []
    requirement_refs: [SCOPE-US-1, SCOPE-US-2, SCOPE-BR-1, SCOPE-BR-2]
    test_focus: "PUT /api/scope persist without a turn; me.lastUsedScopes"
    flags: []
  - id: p4
    name: Share API And Public Page
    depends_on: [p1]
    owns:
      - "web/src/app/api/shares/**"
      - "web/src/app/a/**"
      - "web/src/lib/api/share-client.ts"
    shared: []
    requirement_refs: [SHARE-US-1, SHARE-US-2, SHARE-US-3, SHARE-US-4, SHARE-US-5, SHARE-BR-1, SHARE-BR-4]
    test_focus: "snapshot, revoke 404, import-team, noindex"
    flags: []
  - id: p5
    name: Export API
    depends_on: [p1]
    owns:
      - "web/src/server/export/**"
      - "web/src/app/api/conversations/[id]/export/**"
    shared: []
    requirement_refs: [EXP-US-1, EXP-US-2, EXP-BR-1]
    test_focus: "md+pdf content, guest 401, empty 400"
    flags: []
  - id: p6
    name: Organize API
    depends_on: [p1]
    owns:
      - "web/src/app/api/folders/**"
      - "web/src/app/api/conversations/route.ts"
      - "web/src/app/api/conversations/[id]/route.ts"
      - "web/src/app/api/conversations/[id]/fork/**"
      - "web/src/app/api/conversations/[id]/pins/**"
      - "web/src/app/api/conversations/bulk/**"
      - "web/src/lib/api/history-client.ts"
      - "web/src/lib/api/folder-client.ts"
      - "web/src/lib/hooks/use-conversations.ts"
    shared: []
    requirement_refs: [PIN-US-1, FORK-US-1, ORG-US-1, ORG-US-2, ORG-US-3]
    test_focus: "folders, archive default, fork prefix, bulk skip foreign"
    flags: []
  - id: p7
    name: Portable Projections
    depends_on: []
    owns:
      - "web/src/lib/oak-answer-human-md.ts"
      - "web/src/lib/oak-answer-human-md.test.ts"
      - "web/src/lib/chat/follow-up-chips.ts"
      - "web/src/lib/chat/follow-up-chips.test.ts"
      - "web/src/lib/chat/slash-commands.ts"
      - "web/src/lib/chat/slash-commands.test.ts"
    shared: []
    requirement_refs: [COPY-US-1, CHIP-US-1, SLASH-US-1, CHIP-BR-1, SLASH-BR-1]
    test_focus: "human copy fixtures; chip caps; slash unknown=text"
    flags: []
  - id: p8
    name: Web UI
    depends_on: [p2, p3, p4, p5, p6, p7]
    owns:
      - "web/src/app/page.tsx"
      - "web/src/components/chat/**"
      - "web/src/components/account/SharedByMe.tsx"
      - "web/src/components/auth/AuthMenu.tsx"
      - "web/src/components/landing/LandingSection.tsx"
      - "web/src/components/answer-card/ReceiptsFooter.tsx"
      - "web/src/components/controls/ScopeChip.tsx"
      - "web/src/components/history/**"
      - "web/test/page-chat-qol.fullstack.test.tsx"
    shared: []
    requirement_refs: [REC-US-1, COPY-US-1, SHARE-US-1, NAV-US-1, NAV-US-2, EMPTY-US-1]
    test_focus: "fullstack undo/retry/scope PUT/empty desk/guest hides organize"
    flags: [ui]
  - id: p9
    name: iOS Client
    depends_on: [p2, p3, p4, p5, p6, p7]
    owns:
      - "ios/OakApp/Features/Chat/**"
      - "ios/OakApp/Features/History/**"
      - "ios/OakApp/Features/Account/**"
      - "ios/OakApp/Features/Share/**"
      - "ios/OakApp/Networking/**"
      - "ios/OakApp/Models/**"
      - "ios/OakAppTests/**"
    shared: []
    requirement_refs: [REC-US-1, COPY-US-1, SHARE-US-1, EMPTY-US-1, SCOPE-US-1]
    test_focus: "VM fakes + markdown/chip/slash lockstep"
    flags: [ui]
  - id: p10
    name: Android Client
    depends_on: [p2, p3, p4, p5, p6, p7]
    owns:
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/history/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/account/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/share/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/services/**"
      - "android/app/src/main/kotlin/ai/gowtam/oak/wire/**"
      - "android/app/src/test/**"
    shared: []
    requirement_refs: [REC-US-1, COPY-US-1, SHARE-US-1, EMPTY-US-1, SCOPE-US-1]
    test_focus: "JUnit fakes + markdown/chip/slash lockstep"
    flags: [ui]
  - id: p11
    name: Privacy And Cross-Client Polish
    depends_on: [p8, p9, p10]
    owns:
      - "web/src/components/admin/operator-access-disclosure.ts"
      - "web/src/components/admin/operator-access-disclosure.test.tsx"
      - "web/src/app/privacy/page.tsx"
    shared: []
    requirement_refs: [SHARE-BR-4, AUTH-BR-2]
    test_focus: "disclosure copy; noindex still true; three-client matrix"
    flags: []
integration_checkpoints:
  - after: [p2, p3, p4, p5, p6]
    name: backend-stack
    verifies: "recovery, mentions, scope, share, export, organize against real Postgres"
  - after: [p8]
    name: web-ui-api
    verifies: "guest vs signed-in chat QoL on web"
  - after: [p9, p10]
    name: native-wire
    verifies: "iOS/Android speak the same new fields and routes"
  - after: [p11]
    name: three-client
    verifies: "parity except web-only palette/shortcuts"
```

## Orchestrator notes

- **p3, p4, p5, p6** are disjoint after p1 — run in parallel (worktrees).
- **p7** is fully independent — start immediately.
- **p8, p9, p10** are disjoint — three-client parallel after APIs + projections.
- `web/src/app/page.tsx` is **only** p8. Do not let native phases touch it.
- iOS/Android `owns` globs are wide so one worker per platform owns the whole client delta. Do **not** split one platform across two writers.
- If `run-turn.ts` does not currently persist, p2 should not invent a persist there — keep persist in `route.ts` / the existing persist call site and drop `run-turn.ts` from `owns` if unused.
- Migration tag: if `0019_*` already exists on `develop` at build time, use the next number. Do not edit old migrations.
- After adding npm deps, refresh the Docker `node_modules` volume.
