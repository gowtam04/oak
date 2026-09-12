# Oak for iPad — API and Internal Seams

Mode: PM
Budget Tier: hobby

**No new HTTP endpoints.** iPad uses the iPhone client’s existing
`OakAPIClient` / `ChatService` / `HistoryService` / `TeamService` /
`ArtifactService` / `Usage` / Dex lookup / calc / voice / auth
contracts (`docs/features/iphone-app/architecture/api-design.md`).

This file specifies the **internal seams** autonomous builders will
get wrong if unspecified: layout mode, shell model, context-chip send,
and the one allowed `ChatViewModel` hook.

## Conventions

- Auth, errors, rate limits: unchanged (`OakError`, in-domain answers).
- Champions-first: `scope_seed` remains unused for routing; chip is display-only.

## HTTP

None added. Context chip must not invent `context:` JSON on `POST /api/chat`.

Existing `ChatRequest` already has `mentionedTeamIds: [String]?` — use it
for a team chip.

## Internal Interfaces

### `PadLayout` (pure, testable)

```swift
enum PadLayoutMode: Equatable, Sendable {
  case regular   // width >= 1100
  case medium    // 700 ..< 1100
  case compact   // < 700
}

enum PadLayout {
  static let regularMinWidth: CGFloat = 1100
  static let mediumMinWidth: CGFloat = 700
  static let sidebarWidth: CGFloat = 220
  static let sidebarRailWidth: CGFloat = 72
  static let chatListMinWidth: CGFloat = 260
  static let inspectorMinWidth: CGFloat = 320
  static let companionMinWidth: CGFloat = 320
  static let readableProseWidth: CGFloat = 720
  static let companionDefaultFraction: CGFloat = 0.38
  static let companionMinFraction: CGFloat = 0.28
  static let companionMaxFraction: CGFloat = 0.48
  static let stackedWorkspaceMinFraction: CGFloat = 0.52

  static func mode(for width: CGFloat) -> PadLayoutMode
}
```

`PadColumnStack` reads `GeometryReader` **container** width (the window
minus nothing but safe area). Do **not** use `horizontalSizeClass` to
choose `PadRootView` vs `RootView`. Idiom chooses the root; width
chooses the mode inside `PadRootView`.

**Chat pane policy (P-SHELL-AC-5.4):**

| Mode | Inspector closed | Inspector open |
| --- | --- | --- |
| regular | list \| thread | list \| thread \| inspector |
| medium | list \| thread | thread \| inspector (list via overlay control) |
| compact | thread; list overlay | thread stacked above inspector (thread larger share) |

**Companion policy:**

| Orientation / mode | Placement |
| --- | --- |
| landscape regular/medium | trailing column, width = fraction × remaining |
| compact or portrait | bottom pane, height = (1 − workspaceFraction) |

Portrait uses stacked even if width would be `regular` (13-inch
portrait is usually `medium` anyway). Use `verticalSizeClass == .regular
&& width < height` **or** an explicit `isPortrait` from geometry
(`size.height > size.width`) to stack companion. Prefer
`size.height > size.width` so Split View tall windows stack too.

### `PadShellModel` (@MainActor, @Observable)

```swift
@MainActor @Observable
final class PadShellModel {
  var destination: PadDestination = .chat
  var companionOpen: Bool = false
  var companionFraction: CGFloat = PadLayout.companionDefaultFraction
  var stackedWorkspaceFraction: CGFloat = 0.62
  var sidebarOverlayPresented: Bool = false
  var contextChip: PadContextChip? = nil
  private(set) var previousDestination: PadDestination = .chat

  func select(_ destination: PadDestination)
  /// Calc workspace; stores previousDestination for Done.
  func openCalc(scenario: CalcScenario?)
  func closeCalc()
  func revealCompanion()
  func hideCompanion()
  /// Teams / Dex / Usage / Calc only. No-op on Chat.
  func setContextChip(_ chip: PadContextChip?)
  func dismissCenteredPanels() // destination switch
}
```

**`select` rules:**

1. If `destination` changes away from current, dismiss centered panels
   (artifact panel, auth, import, add-to-team). Do **not** reset
   companionOpen when moving among teams/usage/dex/calc.
2. Selecting `.chat` does not show companion (Chat *is* the thread).
3. Selecting `.teams` / `.dex` / `.usage` / `.calc` from `.chat` leaves
   companion **closed** unless it was already open from a previous
   non-chat destination in this session (P-SHELL-AC-2.1 is “when I first
   arrive” — implement as: companionOpen is false at launch; first
   landing on a workspace from cold start is closed; if user opened it
   then it sticks).
4. `AppState.pendingDestination` is consumed here on iPad (mirror
   `RootView`’s switch, do not edit `RootView`).

### `PadContextChip` send mapping

Builders must implement `func apply(to message: String) -> (text: String, mentionedTeamIds: [String]?)`.

| Chip | `text` | `mentionedTeamIds` |
| --- | --- | --- |
| nil | user message unchanged | nil (VM still parses `@` mentions) |
| `.team(id,name,liveShowdown)` | If `liveShowdown` is empty: user message unchanged (mention bind is enough). If non-empty: append `\n\nLive team draft (\(name)):\n\`\`\`\n{showdown}\n\`\`\`` | `[id]` **union** any `@` mentions the VM already binds |
| `.pokemon/.move/.ability/.item/.usageSpecies` | Prefix `Regarding {name}.\n\n` + user message | unchanged |
| `.calc` | Reuse the **existing** Explain prompt string `CalculatorView` already builds for `onExplain` / `pendingChatSend`. If the user typed extra text, send `explainPrompt + "\n\n" + user` | unchanged |

The **user bubble must show the actual `text` sent** (no hidden injection).
The chip remains visible until dismissed; do not also hide the prefix
from the transcript.

Dismissed chip (`nil`) → send is a normal turn.

### Allowed `ChatViewModel` hook (shared file, iPhone no-op)

iPhone never sets this. Default empty.

```swift
// ChatViewModel
/// Extra team ids merged into send's mentionedTeamIds. iPhone leaves empty.
var extraMentionedTeamIds: [String] = []
```

`send()` already binds `@` mentions. Implementation:

```text
mentionedTeamIds = unique(parsedMentions + extraMentionedTeamIds)
```

`PadComposerHost` sets `extraMentionedTeamIds` from the chip before
`send()`, then clears them after the send call returns (sync start of
stream). Do **not** add a new `ChatService.send` parameter.

### Drag-and-drop images

No API change. `PadComposerHost` uses `.onDrop` of `UTType.image`
(and file URLs that load as images) → existing `ChatViewModel` staging
API that `ComposerView` already uses for library/camera (the same
`addImages` / cap path). Fifth image or non-image: set the existing
attach-note / `OakError.imageRejected` message; do not crash.

### Artifact presentations

```swift
enum PadArtifactSurface {
  case inspector   // Chat destination
  case centered    // companion outside Chat
}
```

Both call `ArtifactViewModel.openEntity` / `openSnapshot` / etc.
iPhone `artifactViewerHost` is not used on iPad.

### Voice

Reuse `VoiceSession` / `VoiceOverlayView` internals inside
`PadVoiceWorkspace`. Starting Voice: `destination = .chat` then present
workspace over the thread column (P-CHAT-AC-5.3). Do not add voice HTTP.

## Errors

Unchanged. Transport → banner in the thread/companion. Image reject →
composer note. Usage down → existing copy in Dex section and Usage
destination.

## External Providers

None new. Photos, camera, microphone — existing purpose strings.
Trackpad/keyboard are system.
