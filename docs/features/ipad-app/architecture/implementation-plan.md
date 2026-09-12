# Oak for iPad — Implementation Plan

Mode: PM
Budget Tier: hobby

Requirements: `docs/features/ipad-app/requirements/` (`P-*`).
Stack: existing `ios/` client. **No `web/` changes.**

iPhone `RootView` / tab dock / sheets stay. All new UI lives under
`ios/OakApp/Pad/` except listed shared extracts.

## File Structure (Ownership Map)

See `component-design.md` §File Structure. That tree is the source of
truth for paths and purposes. Phases below assign `owns` / `shared`.

---

## Phase 1: Device family and idiom gate

- **What gets built:** `TARGETED_DEVICE_FAMILY = "1,2"` on project +
  OakApp target (override XcodeGen’s `1,2` injection explicitly as
  `"1,2"`). Info.plist: keep iPhone
  `UISupportedInterfaceOrientations` portrait-only; add
  `UISupportedInterfaceOrientations~ipad` with all four orientations.
  `OakApp.swift`: `userInterfaceIdiom == .pad` → `PadRootView()` else
  existing `RootView()`. `PadRootView` is a full-window `Theme.canvas`
  with a temporary “Oak iPad” label so the app launches on iPad.
  `PadDestination.swift` enum. Do **not** change `RootView.swift`.
- **Depends on:** nothing
- **Produces:** iPad-capable binary; iPhone launch path byte-equivalent
- **Parallel opportunities:** none — sequential
- **Test focus:** unit smoke still runs on iPhone simulator; add a
  tiny test or UI launch that on iPad idiom `PadRootView` is in the
  hierarchy (can be a DEBUG-only accessibility id `pad-root`). iPhone
  UI test “boots to tab shell” still passes on **iPhone** destination.
- **Requirement refs:** P-CON-1, P-CON-2, P-SHELL-BR-4, P-NFR-9,
  ADR-P1, ADR-P6

---

## Phase 2: Pad layout engine + sidebar

- **What gets built:** `PadLayout` constants + `mode(for:)`.
  `PadColumnStack`, `PadSplitHandle`, `PadSidebar` (Chat / Teams /
  Usage / Dex / Settings, enamel, selected state). `PadShellModel`
  (destination, companion flags stubbed closed). `PadRootView` +
  **create** `PadDestinationHost` with **inline placeholders** per
  destination (title on canvas). Later destination phases replace
  those cases and list this file as `shared`. Compact: sidebar
  overlay/rail. Portrait geometry stacks later panes. Keyboard:
  composer not in this phase.
- **Depends on:** P1
- **Produces:** Navigable iPad chrome; destinations are placeholders
- **Parallel opportunities:** none — sequential (`PadRootView` wiring)
- **Test focus:** `PadLayoutTests` — width 1200→regular, 900→medium,
  600→compact; portrait height>width stacks companion region even if
  width is medium. `PadShellModelTests` — select destination; calc
  remembers previous; destination switch would dismiss panels (method
  exists even if no panel yet).
- **Requirement refs:** P-SHELL-US-1, P-SHELL-AC-1.1–1.4, P-SHELL-BR-1,
  P-SHELL-BR-5, P-SHELL-US-5, P-SHELL-AC-5.1–5.3, P-UI-AC-4.3, ADR-P2

---

## Phase 3: Extract thread stack + Pad Chat list | thread

- **What gets built:** `ChatThreadStack` extracted from `ChatView`
  (turns, streaming, error banner, follow-ups). iPhone `ChatView`
  uses it and **keeps** artifact sheet, voice cover, composer,
  calculator cover. `PadChatDestination`: signed-in
  `PadConversationListColumn` (reuse `HistoryListViewModel` /
  conversation rows) | `PadThreadColumn` (stack + iPhone
  `ComposerView` for now). Guest: sign-in copy in list column;
  thread is the live `ChatViewModel` owned by `PadRootView`.
  `PadEmptyWorkbench` can still be a simple empty thread. Wire
  `PadDestinationHost` chat case to `PadChatDestination`. Live
  `ChatViewModel` created in `PadRootView` (ADR-P3).
- **Depends on:** P2
- **Produces:** Working iPad chat (send/stream) without inspector /
  companion / drop
- **Parallel opportunities:** none — `ChatView.swift` extract is
  serial
- **Test focus:** existing `ChatViewModelTests` still green.
  Pad: selecting a conversation updates the thread VM session.
  iPhone UI tests on iPhone destination still find the tab dock.
- **Requirement refs:** P-CHAT-US-1, P-CHAT-AC-1.1–1.5, P-CHAT-AC-2.4,
  P-CHAT-AC-6.1–6.3, P-SHELL-BR-1, P-AUTH-AC-1.3, ADR-P3

---

## Phase 4: Answer canvas + empty workbench + drag-and-drop

- **What gets built:** `AnswerCanvas` environment. `AnswerCardView`
  (and table/calc/type/team blocks as needed) honor: prose capped at
  `proseMaxWidth` when set; data blocks expand to the column when
  `dataUsesFullWidth`. iPhone default unset → **no visual change**.
  `PadEmptyWorkbench` (identity, coach line, existing example prompts
  as a spacious grid; same prompt strings). `PadComposerHost` wraps
  `ComposerView` with `.onDrop` → existing image staging + cap
  messages. Library + camera remain via `ComposerView`.
- **Depends on:** P3
- **Produces:** Tablet answers + desk empty state + drop attach
- **Parallel opportunities:** AnswerCanvas vs PadEmptyWorkbench vs
  onDrop could split **only if** they don’t share `PadThreadColumn`
  — keep sequential; one worker.
- **Test focus:** AnswerCard with canvas set vs default (iPhone-like).
  Drop fifth image / non-image rejected (`PadComposerHost` unit if
  logic extracted; otherwise VM cap tests already exist — add a small
  helper `PadImageDrop.validate`).
- **Requirement refs:** P-CHAT-US-2, P-CHAT-AC-2.1–2.3, P-CHAT-US-3,
  P-CHAT-AC-3.1–3.2, P-CHAT-US-4, P-CHAT-AC-4.1–4.4, P-SHELL-AC-7.3–7.4,
  P-UI-AC-3.1, P-UI-AC-4.1, P-WF-US-7

---

## Phase 5: Inspector + pins

- **What gets built:** `PadInspectorColumn` hosting existing
  `ArtifactViewModel` + `EntityDetailView` / comparison / etc.
  Thread taps open inspector (not a sheet). Dismiss restores thread
  width. Medium: hide list when inspector open. Compact: stack
  inspector under thread (thread larger share). Pin strip on the
  thread opens inspector. iPhone `ArtifactSheetView` unused on iPad.
- **Depends on:** P4
- **Produces:** Chat co-visibility of answer + artifact
- **Parallel opportunities:** none
- **Test focus:** ArtifactViewModel back stack still unit-tested.
  PadLayout policy table (regular/medium/compact × inspector) as
  tests in `PadLayoutTests` (expand).
- **Requirement refs:** P-ART-US-1, P-ART-AC-1.1–1.6, P-ART-US-2,
  P-ART-AC-2.1–2.3, P-CHAT-BR-1–3, P-CHAT-AC-1.6–1.7, P-SHELL-AC-5.4,
  P-WF-US-2, ADR-P5

---

## Phase 6: Companion + context chip

- **What gets built:** `PadCompanionPane` (same live `ChatViewModel`).
  Reveal/hide control on Teams/Usage/Dex/Calc placeholders and later
  real destinations. Default closed; remembered across those four.
  Portrait/compact: workspace top, companion bottom, draggable
  fractions clamped. `PadContextChip` + `apply(to:)` + view.
  `ChatViewModel.extraMentionedTeamIds`. `PadComposerHost` shows chip
  and applies mapping on send. Destination switch dismisses centered
  panels (hook). Companion artifacts → `PadCenteredPanel` (introduce
  panel chrome here).
- **Depends on:** P5
- **Produces:** Side-by-side chat + workspace (workspace still
  placeholder except Chat)
- **Parallel opportunities:** none — ChatViewModel hook is serial
- **Test focus:** `PadContextChipTests` for every case in
  `api-design.md`. `PadShellModelTests` companion remember/close.
  `ChatViewModel` extra IDs merge with `@` mentions; iPhone tests
  still have empty extra IDs.
- **Requirement refs:** P-SHELL-US-2–4, P-SHELL-AC-2.1–2.6,
  P-SHELL-AC-3.1–3.4, P-SHELL-AC-4.1–4.5, P-SHELL-BR-2–3,
  P-SHELL-US-6, P-CHAT-BR-4, P-TEAM-US-4 (chip only until P7),
  ADR-P3, ADR-P4, P-WF-US-3

---

## Phase 7: Teams workbench

- **What gets built:** `PadTeamsWorkbench`, `PadTeamCanvas` (six
  slots), `PadSlotInspector` (full set + Stat Points + warn-but-allow).
  Library from `TeamsListViewModel`. Guest unlock via
  `PadCenteredPanel` + `AuthView`. Import/export/add-to-team as
  centered panels. Assistant control = `revealCompanion()` + team
  chip with live Showdown from `TeamEditorViewModel` draft. No
  `TeamsAssistantSheet` on iPad.
- **Depends on:** P6
- **Produces:** Team workbench
- **Parallel opportunities:** none with P8/P9 if `PadDestinationHost`
  is patched here — see manifest `shared`. Destination **folder** is
  disjoint from Dex/Calc; host file is shared.
- **Test focus:** existing team editor VM tests; canvas selection
  updates inspector; guest sees unlock not a list.
- **Requirement refs:** P-TEAM-US-1–4, P-TEAM-AC-2.1–2.8, P-TEAM-AC-3.*,
  P-TEAM-AC-4.*, P-TEAM-AC-5–6, P-TEAM-BR-1–6, P-WF-US-3

---

## Phase 8: Dex + Usage

- **What gets built:** `PadDexSplit` (sections + search | profile).
  Pokémon profile **Usage section** using existing usage service
  (fail-soft). `PadUsageSplit` (ladder | species). Hops from
  `pendingDestination` / Open in Dex.
- **Depends on:** P6 (companion chip for Dex/Usage objects). Can
  proceed after P6 even if P7 is in flight if `PadDestinationHost`
  patches are serialized.
- **Produces:** Tablet Dex and Usage
- **Parallel opportunities:** Dex folder ∥ Usage folder (two files
  sets). `PadDestinationHost` shared with P7/P9.
- **Test focus:** existing Dex/Usage VMs; usage-unavailable on
  profile doesn’t hide Dex fields.
- **Requirement refs:** P-DEX-US-1–2, P-DEX-AC-*, P-USE-US-1,
  P-USE-AC-*, P-REF-BR-1–2, P-WF-AC-4.1

---

## Phase 9: Calc workspace + Settings + remaining panels

- **What gets built:** `PadCalcWorkspace` (attacker | defender |
  visible result/field). Extract side editors from `CalculatorView`
  **only if** required; iPhone stacked calc must look the same.
  Explain → live thread / companion (`onExplain` already exists).
  `PadSettingsSplit` (list | detail). Auth/OTP, deletion, update
  prompt, add-to-team, compare — all `PadCenteredPanel` on iPad.
  Pointer secondary-click already uses context menus; verify lists
  have them (no hover-only).
- **Depends on:** P6
- **Produces:** Full destination set
- **Parallel opportunities:** Calc folder ∥ Settings folder; shared
  `CalculatorView.swift` / `AccountView.swift` if extracted — then
  **not** parallel with each other if both extract; keep **sequential
  inside P9** if those two shared files are touched.
- **Test focus:** result visible without scrolling off (layout test /
  snapshot-free frame assertion if practical). Settings guest vs
  signed-in rows. iPhone Account/Calc tests still pass.
- **Requirement refs:** P-CALC-US-1, P-CALC-AC-*, P-SET-US-1,
  P-SET-AC-*, P-REF-AC-1.1, P-REF-BR-3–4, P-SHELL-AC-7.1–7.2,
  P-WF-US-5, P-WF-US-10, P-AUTH-US-2–4

---

## Phase 10: Voice workspace + iPad UI tests + store readiness

- **What gets built:** `PadVoiceWorkspace` (Chat destination thread
  canvas). Guest gate unchanged. `PadShellUITests`: launch iPad →
  sidebar visible, **no** `OakTabDock`; rotate keeps destination;
  Chat two columns on a wide sim. CI: compile/test iPad simulator
  unit tests (`PadLayoutTests` run on any destination). Document
  iPad screenshot set in `docs/app-store/screenshots.md` (listing
  copy unchanged; **no new capabilities**). Hardware keyboard:
  composer focuses; OTP autofill already on `AuthView`.
- **Depends on:** P7, P8, P9
- **Produces:** Launch-bar evidence for P-SUCCESS-2/4/5
- **Parallel opportunities:** Voice file ∥ UITests ∥ screenshots doc
  (three disjoint paths)
- **Test focus:** hermetic UI: sidebar identifiers, no tab dock,
  orientation change doesn’t crash. Voice unit tests unchanged.
- **Requirement refs:** P-CHAT-US-5, P-CHAT-AC-5.1–5.4, P-CHAT-BR-6,
  P-SUCCESS-1–5, P-NFR-3–7, P-NFR-10–11, P-WF-US-8–9, P-UI-US-3

---

## Integration Seams / Checkpoints

| After | Name | Verifies |
| --- | --- | --- |
| P1 | **CP-P1 idiom** | iPhone sim → tab dock. iPad sim → `pad-root`. Orientations: iPhone portrait-only; iPad rotates. |
| P3 | **CP-P3 chat** | iPad send → SSE stream → answer in thread column. iPhone chat still works. |
| P5 | **CP-P5 inspector** | Tap entity → inspector, thread remains. Rotate stacks inspector. |
| P6 | **CP-P6 companion** | Reveal companion on Dex placeholder; same thread; chip send mapping unit tests. |
| P7 | **CP-P7 teams** | Library \| canvas \| inspector; Assistant opens companion with team chip. |
| P9 | **CP-P9 workspaces** | Calc result visible; Settings list\|detail; OTP panel; add-to-team panel. |
| P10 | **CP-P10 launch** | Mini-width (or skinny window) keeps Pad shell. Voice. UITests. Screenshot checklist. |

Manual device pass (not CI): iPad Mini, 11-inch, 13-inch, Split View
50%, Magic Keyboard, trackpad secondary-click, drag screenshot onto
composer.

---

## Build Manifest

```yaml
commands:
  test: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'"
  test_ipad: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'"
  test_one: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests/<Suite>/<test> -destination 'platform=iOS Simulator,name=iPhone 17'"
  typecheck: "cd ios && xcodebuild build -scheme OakApp -destination 'platform=iOS Simulator,name=iPhone 17'"
  typecheck_ipad: "cd ios && xcodebuild build -scheme OakApp -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'"
  build: "cd ios && xcodebuild -scheme OakApp -configuration Release build -destination 'generic/platform=iOS'"
  uitest_iphone: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppUITests -destination 'platform=iOS Simulator,name=iPhone 17'"
  uitest_ipad: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppUITests/PadShellUITests -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'"
  generate: "cd ios && xcodegen generate"
phases:
  - id: p1
    name: Device family and idiom gate
    depends_on: []
    owns:
      - "ios/project.yml"
      - "ios/OakApp/Resources/Info.plist"
      - "ios/OakApp/App/OakApp.swift"
      - "ios/OakApp/Pad/PadDestination.swift"
    shared:
      - "ios/OakApp/Pad/PadRootView.swift"
    requirement_refs: [P-CON-1, P-CON-2, P-SHELL-BR-4, P-NFR-9]
    test_focus: "iPhone tab shell still launches; iPad shows pad-root"
    flags: [scaffold]
  - id: p2
    name: Pad layout engine + sidebar
    depends_on: [p1]
    owns:
      - "ios/OakApp/Pad/PadLayout.swift"
      - "ios/OakApp/Pad/PadColumnStack.swift"
      - "ios/OakApp/Pad/PadSidebar.swift"
      - "ios/OakApp/Pad/PadSplitHandle.swift"
      - "ios/OakApp/Pad/PadShellModel.swift"
      - "ios/OakApp/Pad/PadDestinationHost.swift"
      - "ios/OakAppTests/Pad/PadLayoutTests.swift"
      - "ios/OakAppTests/Pad/PadShellModelTests.swift"
    shared:
      - "ios/OakApp/Pad/PadRootView.swift"
    requirement_refs: [P-SHELL-US-1, P-SHELL-US-5, P-SHELL-BR-1, P-SHELL-BR-5]
    test_focus: "PadLayout breakpoints; shell destination select"
    flags: []
  - id: p3
    name: Extract thread stack + Pad Chat list | thread
    depends_on: [p2]
    owns:
      - "ios/OakApp/Features/Chat/ChatThreadStack.swift"
      - "ios/OakApp/Pad/Chat/PadChatDestination.swift"
      - "ios/OakApp/Pad/Chat/PadConversationListColumn.swift"
      - "ios/OakApp/Pad/Chat/PadThreadColumn.swift"
    shared:
      - "ios/OakApp/Features/Chat/ChatView.swift"
      - "ios/OakApp/Pad/PadDestinationHost.swift"
      - "ios/OakApp/Pad/PadRootView.swift"
    requirement_refs: [P-CHAT-US-1, P-CHAT-AC-1.1, P-CHAT-AC-1.5, P-AUTH-AC-1.3]
    test_focus: "existing ChatViewModel tests; iPhone ChatView still hosts sheets"
    flags: []
  - id: p4
    name: Answer canvas + empty workbench + drag-and-drop
    depends_on: [p3]
    owns:
      - "ios/OakApp/Features/Chat/AnswerCard/AnswerCanvas.swift"
      - "ios/OakApp/Pad/Chat/PadEmptyWorkbench.swift"
    shared:
      - "ios/OakApp/Features/Chat/AnswerCard/AnswerCardView.swift"
      - "ios/OakApp/Pad/Chat/PadComposerHost.swift"
      - "ios/OakApp/Pad/Chat/PadThreadColumn.swift"
    requirement_refs: [P-CHAT-US-2, P-CHAT-US-3, P-CHAT-US-4, P-SHELL-AC-7.3]
    test_focus: "AnswerCanvas default vs pad; image cap on drop"
    flags: []
  - id: p5
    name: Inspector + pins
    depends_on: [p4]
    owns:
      - "ios/OakApp/Pad/Chat/PadInspectorColumn.swift"
    shared:
      - "ios/OakApp/Pad/Chat/PadChatDestination.swift"
      - "ios/OakApp/Pad/Chat/PadThreadColumn.swift"
      - "ios/OakAppTests/Pad/PadLayoutTests.swift"
    requirement_refs: [P-ART-US-1, P-ART-US-2, P-SHELL-AC-5.4, P-CHAT-BR-3]
    test_focus: "column policy with inspector; ArtifactViewModel stack"
    flags: []
  - id: p6
    name: Companion + context chip
    depends_on: [p5]
    owns:
      - "ios/OakApp/Pad/Chat/PadCompanionPane.swift"
      - "ios/OakApp/Pad/Chat/PadContextChip.swift"
      - "ios/OakApp/Pad/Chat/PadContextChipView.swift"
      - "ios/OakApp/Pad/PadCenteredPanel.swift"
      - "ios/OakAppTests/Pad/PadContextChipTests.swift"
    shared:
      - "ios/OakApp/Features/Chat/ChatViewModel.swift"
      - "ios/OakApp/Pad/PadShellModel.swift"
      - "ios/OakApp/Pad/PadRootView.swift"
      - "ios/OakApp/Pad/Chat/PadComposerHost.swift"
      - "ios/OakAppTests/Pad/PadShellModelTests.swift"
    requirement_refs: [P-SHELL-US-2, P-SHELL-US-3, P-SHELL-BR-2, P-CHAT-BR-4]
    test_focus: "chip apply(to:); companion remember; extraMentionedTeamIds"
    flags: []
  - id: p7
    name: Teams workbench
    depends_on: [p6]
    owns:
      - "ios/OakApp/Pad/Teams/PadTeamsWorkbench.swift"
      - "ios/OakApp/Pad/Teams/PadTeamCanvas.swift"
      - "ios/OakApp/Pad/Teams/PadSlotInspector.swift"
    shared:
      - "ios/OakApp/Pad/PadDestinationHost.swift"
    requirement_refs: [P-TEAM-US-2, P-TEAM-US-4, P-TEAM-BR-5]
    test_focus: "guest unlock; slot selection; no TeamsAssistantSheet on pad"
    flags: []
  - id: p8
    name: Dex + Usage
    depends_on: [p6]
    owns:
      - "ios/OakApp/Pad/Dex/PadDexSplit.swift"
      - "ios/OakApp/Pad/Usage/PadUsageSplit.swift"
    shared:
      - "ios/OakApp/Pad/PadDestinationHost.swift"
    requirement_refs: [P-DEX-US-1, P-DEX-US-2, P-USE-US-1]
    test_focus: "usage fail-soft on Pokémon profile"
    flags: []
  - id: p9
    name: Calc workspace + Settings + remaining panels
    depends_on: [p6]
    owns:
      - "ios/OakApp/Pad/Calc/PadCalcWorkspace.swift"
      - "ios/OakApp/Pad/Settings/PadSettingsSplit.swift"
    shared:
      - "ios/OakApp/Pad/PadDestinationHost.swift"
      - "ios/OakApp/Features/Calc/CalculatorView.swift"
      - "ios/OakApp/Features/Account/AccountView.swift"
    requirement_refs: [P-CALC-US-1, P-SET-US-1, P-AUTH-US-2]
    test_focus: "iPhone calc/account appearance unchanged; pad splits"
    flags: []
  - id: p10
    name: Voice workspace + iPad UI tests + store readiness
    depends_on: [p7, p8, p9]
    owns:
      - "ios/OakApp/Pad/Chat/PadVoiceWorkspace.swift"
      - "ios/OakAppUITests/PadShellUITests.swift"
      - "docs/app-store/screenshots.md"
    shared:
      - "ios/ci/ios.yml"
      - "ios/OakApp/Pad/PadRootView.swift"
    requirement_refs: [P-CHAT-US-5, P-SUCCESS-2, P-SUCCESS-4, P-SUCCESS-5]
    test_focus: "hermetic iPad UI: sidebar, no tab dock, rotate"
    flags: []
integration_checkpoints:
  - after: [p1]
    name: CP-P1 idiom
    verifies: "iPhone → RootView/tab dock; iPad → PadRootView; iPad rotates"
  - after: [p3]
    name: CP-P3 chat
    verifies: "iPad chat SSE; iPhone chat regression"
  - after: [p5]
    name: CP-P5 inspector
    verifies: "inspector co-visibility; collapse order"
  - after: [p6]
    name: CP-P6 companion
    verifies: "one ChatViewModel; context chip mapping"
  - after: [p7]
    name: CP-P7 teams
    verifies: "workbench + Assistant=companion"
  - after: [p9]
    name: CP-P9 workspaces
    verifies: "calc/settings/panels"
  - after: [p10]
    name: CP-P10 launch
    verifies: "Mini/split shell; Voice; screenshots checklist"
```

**Parallelism note:** P7, P8, P9 all `depends_on: p6` and own disjoint
`Pad/Teams|Dex|Usage|Calc|Settings` folders. They **share**
`PadDestinationHost.swift` — orchestrator must serialize host edits
(one patch per phase) or run P7→P8→P9 sequentially. Do not dual-write
`ChatView.swift`, `ChatViewModel.swift`, or `RootView.swift`.

## Orchestrator Notes

- Mode **PM**, budget **hobby** — lighter TDD than Developer, but
  PadLayout / PadShellModel / PadContextChip are unit-tested first
  (pure rules).
- **Never** assign `ios/OakApp/App/RootView.swift` to a worker.
- iPhone UITests stay on an **iPhone** destination; they will fail on
  iPad because the tab dock is gone — that is expected.
- Simulator name `iPad Pro 13-inch (M4)` may differ per Xcode; pick
  any available iPad 18+ sim and record it in the PR if renamed.
- After P1, App Store Connect will expect iPad screenshots on the
  next submission — P10 updates `docs/app-store/screenshots.md`.
