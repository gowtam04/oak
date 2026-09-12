# Oak for iPad — Component Design

Mode: PM
Budget Tier: hobby

Layering is unchanged: Views → ViewModels → Services → Networking.
iPad adds a **Pad** view layer. It does not add services.

## Components

### PadRootView

| Aspect | Detail |
| --- | --- |
| Responsibility | iPad app shell: sidebar, column stack, destination host, companion, calc workspace, centered panels, consume `pendingDestination` |
| Owns | `PadRootView.swift`, wiring of `PadShellModel` + live `ChatViewModel` |
| Exposes | The iPad UI |
| Depends on | `PadShellModel`, `PadLayout`, destination views, `AppState`, `ServiceContainer` |
| File location | `ios/OakApp/Pad/PadRootView.swift` |
| Patterns | Mirror `RootView` side effects (restore session, regulation, update sheet, guest import) **without editing RootView** |

### PadShellModel

| Aspect | Detail |
| --- | --- |
| Responsibility | iPad chrome state (destination, companion, chip, fractions) |
| Owns | `PadShellModel.swift` |
| Exposes | API in `api-design.md` |
| Depends on | `PadLayout`, `PadContextChip`, `PadDestination` |
| File location | `ios/OakApp/Pad/PadShellModel.swift` |
| Patterns | `@MainActor @Observable` like `AppState`, but **not** merged into `AppState` |

### PadLayout + PadColumnStack + PadSidebar

| Aspect | Detail |
| --- | --- |
| Responsibility | Width → mode; enamel sidebar; HStack/VStack columns; overlay rail; split drag |
| Owns | `PadLayout.swift`, `PadColumnStack.swift`, `PadSidebar.swift`, `PadSplitHandle.swift` |
| Exposes | `PadLayout.mode(for:)`, stack that yields proposed column frames |
| Depends on | `Theme`, `OakAppTab` titles/icons (read-only) |
| File location | `ios/OakApp/Pad/` |
| Patterns | Custom chrome like `OakTabDock` — no system `NavigationSplitView`, no Liquid Glass |

### Pad Chat destination

| Aspect | Detail |
| --- | --- |
| Responsibility | Mail-style list \| thread \| inspector; empty workbench; pin strip; guest list-column sign-in |
| Owns | `PadChatDestination.swift`, `PadConversationListColumn.swift`, `PadThreadColumn.swift`, `PadEmptyWorkbench.swift`, `PadComposerHost.swift`, `PadInspectorColumn.swift` |
| Exposes | Chat UI on iPad |
| Depends on | Existing `HistoryListViewModel` / `ConversationListView` **row content** if extractable; `ChatViewModel`; `AnswerCardView`; `ComposerView`; `ArtifactViewModel`; `PinnedArtifactStrip`; extracted `ChatThreadStack` |
| File location | `ios/OakApp/Pad/Chat/` |
| Patterns | Do not embed iPhone `ChatView` (it owns sheets + voice cover + artifact sheet) |

### Pad Companion

| Aspect | Detail |
| --- | --- |
| Responsibility | Same `ChatViewModel` in a pane; context chip; stacked vs trailing |
| Owns | `PadCompanionPane.swift`, `PadContextChipView.swift` |
| Exposes | Companion column/bottom pane |
| Depends on | `PadComposerHost`, `ChatThreadStack`, `PadShellModel` |
| File location | `ios/OakApp/Pad/Chat/` |

### Pad Teams workbench

| Aspect | Detail |
| --- | --- |
| Responsibility | Library \| 6-slot canvas \| slot inspector |
| Owns | `PadTeamsWorkbench.swift`, `PadTeamCanvas.swift`, `PadSlotInspector.swift` |
| Exposes | Teams UI on iPad |
| Depends on | `TeamsListViewModel`, `TeamEditorViewModel` (reuse; do not fork editor logic). Slot inspector renders the **same fields** as `TeamEditorView` for one slot — extract slot editors from `TeamEditorView` if needed (shared, iPhone wrapper stays stacked). |
| File location | `ios/OakApp/Pad/Teams/` |

### Pad Dex / Usage / Calc / Settings

| Aspect | Detail |
| --- | --- |
| Responsibility | Index\|profile, ladder\|species, attacker\|defender\|result, settings list\|detail |
| Owns | `PadDexSplit.swift`, `PadUsageSplit.swift`, `PadCalcWorkspace.swift`, `PadSettingsSplit.swift` |
| Depends on | `DexViewModel`, `UsageViewModel`, `CalculatorViewModel`, `AccountViewModel`; `EntityDetailView`; usage species content; calc side editors extracted from `CalculatorView`; settings pages extracted from `AccountView` without changing iPhone `AccountView` appearance |
| File location | `ios/OakApp/Pad/Dex/`, `Usage/`, `Calc/`, `Settings/` |

### Pad overlays

| Aspect | Detail |
| --- | --- |
| Responsibility | Centered panels replacing iPhone sheets on iPad |
| Owns | `PadCenteredPanel.swift` |
| Exposes | `.padCenteredPanel(item:)` helper |
| Depends on | Existing `AuthView`, `ShowdownImportView`, add-to-team, compare picker, `UpdateAvailableSheet` **content** — present those roots inside the panel, not as `.sheet` on iPad |
| File location | `ios/OakApp/Pad/PadCenteredPanel.swift` |

### Pad Voice workspace

| Aspect | Detail |
| --- | --- |
| Responsibility | Voice takes over Chat thread canvas |
| Owns | `PadVoiceWorkspace.swift` |
| Depends on | Existing `VoiceSession`, orb views |
| File location | `ios/OakApp/Pad/Chat/PadVoiceWorkspace.swift` |

### Shared leaves (modify only when a phase lists them)

| Component | iPad use | iPhone freeze |
| --- | --- | --- |
| `ChatThreadStack` (new extract from `ChatView`) | Pad thread + companion | `ChatView` becomes wrapper + sheets |
| `ChatViewModel.extraMentionedTeamIds` | Context chip | Default `[]` |
| `AnswerCanvas` environment (new) | Readable prose / wide data | Unset = today’s full-width stack |
| `ComposerView` | Embedded in `PadComposerHost` | Unchanged chrome; **no** iPad-only UI in this file |
| `ArtifactViewModel` | Inspector + panel | Sheet still uses it |
| `CalculatorView` side editors | Pad three-pane | Stacked form remains |
| `AccountView` sections | Settings detail pages | Single scroll remains |
| `OakApp.swift` | Idiom switch | Phone branch identical |

**Forbidden to modify for iPad layout:** `RootView.swift`, `OakTabDock` / dock metrics, `ChatTabView.swift` navigation IA, iPhone `ArtifactSheetView` presentation, `TeamsAssistantSheet.swift`.

## Dependency Graph

```text
OakApp.swift
  ├─ RootView (phone)          → existing feature views
  └─ PadRootView (pad)
       ├─ PadShellModel
       ├─ PadLayout / PadColumnStack / PadSidebar
       ├─ ChatViewModel (live)
       ├─ PadChatDestination ── ChatThreadStack, PadComposerHost, PadInspectorColumn
       ├─ PadCompanionPane ──── same ChatViewModel + chip
       ├─ PadTeamsWorkbench ─── TeamsListViewModel, TeamEditorViewModel
       ├─ PadDexSplit / PadUsageSplit
       ├─ PadCalcWorkspace
       ├─ PadSettingsSplit
       └─ PadCenteredPanel / PadVoiceWorkspace
              │
              ▼
         existing Services → OakAPIClient
```

## Boundary Rules

- Pad views never call `OakAPIClient`.
- Pad views may read `AppState` and services from the environment.
- `PadShellModel` must not be injected on iPhone.
- Shared extracts must compile into iPhone `ChatView` / `CalculatorView` /
  `AccountView` with **no visual change**. Gate: existing iPhone unit tests
  + hermetic UI tests stay green on an **iPhone** simulator.

## Environment keys (new)

```swift
struct AnswerCanvas: Equatable {
  var proseMaxWidth: CGFloat? // nil = use container (iPhone)
  var dataUsesFullWidth: Bool  // true on Pad thread
}
```

Set only by `PadThreadColumn` / companion. Default: `proseMaxWidth: nil`,
`dataUsesFullWidth: false` (current iPhone stacking).

## File Structure (Ownership Map)

Every path below is **create** unless marked **modify**. Tests sit next to
the production they cover.

```text
ios/project.yml                                          # MODIFY — TARGETED_DEVICE_FAMILY "1,2" (P1)
ios/OakApp/Resources/Info.plist                          # MODIFY — UISupportedInterfaceOrientations~ipad (P1)
ios/OakApp/App/OakApp.swift                              # MODIFY — idiom switch to PadRootView (P1)
ios/ci/ios.yml                                           # MODIFY — also build/test iPad sim (P1/P10)

ios/OakApp/Pad/PadRootView.swift                         # iPad shell
ios/OakApp/Pad/PadDestination.swift                      # enum
ios/OakApp/Pad/PadDestinationHost.swift                  # switch on destination (shared across destination phases)
ios/OakApp/Pad/PadShellModel.swift                       # chrome VM
ios/OakApp/Pad/PadLayout.swift                           # widths + mode(for:)
ios/OakApp/Pad/PadColumnStack.swift                      # HStack/VStack + geometry
ios/OakApp/Pad/PadSidebar.swift                          # enamel destination list
ios/OakApp/Pad/PadSplitHandle.swift                      # draggable split
ios/OakApp/Pad/PadCenteredPanel.swift                    # modal panel chrome

ios/OakApp/Pad/Chat/PadChatDestination.swift
ios/OakApp/Pad/Chat/PadConversationListColumn.swift
ios/OakApp/Pad/Chat/PadThreadColumn.swift
ios/OakApp/Pad/Chat/PadEmptyWorkbench.swift
ios/OakApp/Pad/Chat/PadComposerHost.swift                # chip + onDrop + ComposerView
ios/OakApp/Pad/Chat/PadInspectorColumn.swift
ios/OakApp/Pad/Chat/PadCompanionPane.swift
ios/OakApp/Pad/Chat/PadContextChip.swift                 # enum + apply(to:)
ios/OakApp/Pad/Chat/PadContextChipView.swift
ios/OakApp/Pad/Chat/PadVoiceWorkspace.swift

ios/OakApp/Pad/Teams/PadTeamsWorkbench.swift
ios/OakApp/Pad/Teams/PadTeamCanvas.swift
ios/OakApp/Pad/Teams/PadSlotInspector.swift

ios/OakApp/Pad/Dex/PadDexSplit.swift
ios/OakApp/Pad/Usage/PadUsageSplit.swift
ios/OakApp/Pad/Calc/PadCalcWorkspace.swift
ios/OakApp/Pad/Settings/PadSettingsSplit.swift

ios/OakApp/Features/Chat/ChatThreadStack.swift           # NEW extract
ios/OakApp/Features/Chat/ChatView.swift                  # MODIFY — use ChatThreadStack (P3)
ios/OakApp/Features/Chat/ChatViewModel.swift             # MODIFY — extraMentionedTeamIds (P6)
ios/OakApp/Features/Chat/AnswerCard/AnswerCanvas.swift   # NEW environment
ios/OakApp/Features/Chat/AnswerCard/AnswerCardView.swift # MODIFY — honor AnswerCanvas (P4)
ios/OakApp/Features/Calc/CalculatorView.swift            # MODIFY — extract side editors if required (P9)
ios/OakApp/Features/Account/AccountView.swift            # MODIFY — extract pages if required (P9)

ios/OakAppTests/Pad/PadLayoutTests.swift
ios/OakAppTests/Pad/PadShellModelTests.swift
ios/OakAppTests/Pad/PadContextChipTests.swift
ios/OakAppTests/Chat/ChatViewModelExtraMentionsTests.swift  # P6; or extend ChatViewModelTests.swift (shared)

ios/OakAppUITests/PadShellUITests.swift                  # P10 hermetic: idiom pad, sidebar, no tab dock
```

**Do not create:** a second Xcode target, Mac Catalyst flags, keyboard-shortcut
map, Pencil handlers, Android/web tablet files.

**Do not modify:** `ios/OakApp/App/RootView.swift`, `ios/OakApp/UI/OakChrome.swift`
dock implementation (reading `OakAppTab` is fine).
