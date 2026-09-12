# Oak for iPad — Architecture Decisions

Mode: PM
Budget Tier: hobby

iPhone ADRs (native SwiftUI, Observation, iOS 18, no third-party packages,
SSE parser, Bearer auth) **still apply**. These ADRs are iPad-only.

### ADR-P1: Idiom-gated `PadRootView` + shared leaves

- **Context:** P-CON-2 / P-UI-BR-1 freeze the iPhone UI. P-SHELL-BR-4 forbids
  falling back to the iPhone UI on iPad, including Mini and Split View.
- **Options considered:**
  - Idiom-gated Pad root + shared leaves — two shells, one VM/service layer
  - Size-class branches inside today’s screens — fewer files, high iPhone risk
  - Separate OakPad target — isolation, two binaries, violates one listing
- **Decision:** `OakApp` keeps one `WindowGroup`. `userInterfaceIdiom == .pad`
  shows `PadRootView`; otherwise existing `RootView`. iPad containers are new
  files under `ios/OakApp/Pad/`. Shared: view models, services, wire DTOs, and
  **leaf widgets** (`AnswerCardView` tree, `EntityDetailView`, `ComposerView`
  internals, calc side editors, auth form content). Leaves may read **column
  width**, not idiom, so iPhone layout stays the default when the environment
  key is unset.
- **Rationale:** Highest chance of an unchanged iPhone tab dock and sheets.
  Compact iPad still uses `PadRootView` (stacked), never `OakTabDock`.
- **Consequences:** More files. Builders must not “tidy” `RootView` /
  `ChatTabView` / `OakTabDock` while adding iPad. Extracting a thread stack
  from `ChatView` is an allowed, test-gated shared refactor (Phase 3).
- **Links:** P-CON-2, P-SHELL-BR-4, P-UI-BR-1, P-SUCCESS-2.

### ADR-P2: Custom measured columns, not `NavigationSplitView`

- **Context:** Collapse order is product-defined: sidebar → rail/overlay;
  Chat drops the list first; then stack inspector/companion. Oak already
  rejected system `TabView` for `OakTabDock` (enamel, no Liquid Glass).
- **Options considered:**
  - Custom `HStack`/`VStack` with `PadLayout.mode(for: width)`
  - `NavigationSplitView` + inspector
- **Decision:** Custom Oak columns. `PadLayout` maps **container width**
  (not `horizontalSizeClass`) to `regular | medium | compact`. Size class
  is not used to swap shells.
- **Rationale:** Exact collapse order and enamel sidebar are not
  `NavigationSplitView`’s contract. Width-based mode keeps a skinny Stage
  Manager window on the iPad shell (P-SHELL-AC-5.1).
- **Consequences:** We own split drags, VoiceOver regions, and keyboard
  avoidance. Do not introduce a third layout library.
- **Links:** P-SHELL-US-5, P-SHELL-AC-5.4, P-UI-AC-4.3.

### ADR-P3: One live `ChatViewModel` for Chat + companion

- **Context:** Companion is the Chat destination’s current thread
  (P-SHELL-BR-2), off by default outside Chat.
- **Options considered:**
  - Pad-owned `ChatViewModel` shared by Chat destination and companion
  - Per-destination VMs (breaks one-thread)
  - Continue creating a VM inside `ChatView` `@State` (companion would
    tear it down)
- **Decision:** `PadRootView` owns **one** `ChatViewModel` for the live
  thread (guest or signed-in current conversation). Chat list selection
  replaces that VM’s session the same way iPhone list→thread does.
  Companion is a **pane** on that VM, not a second chat. iPhone
  `ChatTabView` / `ChatView` `@State` ownership is unchanged.
- **Rationale:** Companion cannot survive destination switches if the VM
  lives inside a Chat-only view.
- **Consequences:** Pad chat must not use iPhone `ChatView` as the
  screen (it owns sheets, voice cover, artifact sheet). Pad composes
  extracted thread content + `PadComposerHost` + inspector.
- **Links:** P-SHELL-US-2, P-SHELL-BR-2, P-CHAT-BR-6.

### ADR-P4: Teams Assistant on iPad is Chat + context chip, not builder SSE

- **Context:** iPhone Teams Assistant is `TeamsAssistantViewModel` +
  `TeamsAssistantService` (live unsaved draft, Apply/Undo `TeamPatch`).
  Product chose one Chat thread with a team context chip, not a second
  brain.
- **Options considered:**
  - ChatViewModel + chip (draft as client context)
  - Companion chrome with Assistant brain in Teams
  - Toggle between both
- **Decision:** iPad does **not** host `TeamsAssistantViewModel`. The
  Assistant control reveals companion chat. The chip uses existing
  `mentionedTeamIds` for a saved team and includes the **live Showdown
  of the on-screen draft** in the sent user text so unsaved inspector
  edits are visible to Oak **without a new endpoint**. Explicit apply
  remains existing answer **team-block apply**. iPhone keeps
  `TeamsAssistantSheet`.
- **Rationale:** P-API-BR-3 forbids a new builder API. P-SHELL-BR-2
  forbids a second thread. Main chat already proposes/applies teams.
- **Consequences:** iPad drafting is slightly less “patch/undo” than
  the iPhone sheet. That is an accepted presentation difference, not a
  dropped destination. Do not silently call `TeamsAssistantService`
  from companion.
- **Links:** P-TEAM-US-4, P-SHELL-AC-3.1, P-API-BR-3, P-WF-AC-3.2.

### ADR-P5: Inspector vs centered panel by destination

- **Context:** Chat artifacts are a trailing inspector; companion
  artifacts over Teams/Dex/Usage/Calc are centered panels.
- **Decision:** One `ArtifactViewModel` (existing back stack).
  `PadInspectorColumn` is the Chat presentation. `PadCenteredPanel`
  wraps `EntityDetailView` / comparison / etc. when companion is
  showing an artifact outside Chat. iPhone `ArtifactSheetView` stays.
- **Rationale:** Same artifact brain, two presentations, matches
  P-CHAT-BR-3 / P-CHAT-BR-4 / P-SHELL-AC-4.5.
- **Consequences:** Opening an artifact from companion does not push
  the Chat inspector. Destination switch dismisses the panel
  (`P-SHELL-AC-6.1`); rotation does not.
- **Links:** P-ART-US-1, P-SHELL-AC-4.5, P-SHELL-US-6.

### ADR-P6: Device family 1,2; iPhone portrait-only; iPad all orientations

- **Context:** `project.yml` forces `TARGETED_DEVICE_FAMILY: "1"` so
  App Store Connect does not demand iPad screenshots. Info.plist is
  portrait-only. Product now requires iPad portrait + landscape and an
  iPad screenshot set.
- **Decision:** Target family `"1,2"`. Keep
  `UISupportedInterfaceOrientations` as **portrait-only for iPhone**.
  Add `UISupportedInterfaceOrientations~ipad` with portrait, upside-
  down, landscape left, landscape right. `UIRequiresFullScreen` stays
  unset/false so Split View works. `SUPPORTS_MACCATALYST` stays `NO`.
- **Rationale:** P-SUCCESS-4/5 + P-OOS-3 (no Mac). iPhone portrait
  freeze is P-CON-2.
- **Consequences:** ASC will require iPad screenshots before the next
  App Store submission that includes this binary. TestFlight on iPad
  becomes a launch gate. CI must **compile** for an iPad simulator;
  iPhone unit tests remain the default fast gate.
- **Links:** P-SUCCESS-5, P-NFR-6, P-NFR-9, P-OOS-3, P-OOS-4.

### ADR-P7: Session-only chrome state

- **Context:** P-OQ-1 allowed local persistence of companion
  open/closed and split ratios.
- **Decision:** `PadShellModel` holds companion open/closed, split
  fractions, overlay-sidebar presented, and the context chip in
  **memory for the process**. Not `UserDefaults`, not the account, not
  synced to iPhone/web. Killing the app resets companion to closed
  (product default).
- **Rationale:** Product default is off; syncing chrome to the phone
  would be a new preference product.
- **Consequences:** Rotate/Split View in-session keeps state
  (`P-SHELL-AC-5.5`). Cold launch does not restore companion open.
- **Links:** P-OQ-1, P-SHELL-BR-3, `data-and-entities.md`.

## Unresolved (explicitly deferred)

- **Pixel-perfect enamel sidebar icons** — follow existing SF Symbols
  from `OakAppTab`; visual polish is implementation, not a new ADR.
- **Second Stage Manager window** — not designed (P-OQ-3). Each
  `WindowGroup` instance would independently construct `PadRootView`;
  no cross-window sync.
