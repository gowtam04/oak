import SwiftUI

/// iPad app shell: enamel sidebar + measured columns + destination host
/// (ADR-P1, ADR-P2, P-SHELL-BR-4). Owns the live ``ChatViewModel`` (ADR-P3).
struct PadRootView: View {
  @State private var shell = PadShellModel()
  @State private var chatModel: ChatViewModel?
  @State private var companionArtifactModel: ArtifactViewModel?
  @State private var showSignIn = false
  @State private var presentedShareId: String?
  @State private var addToTeamIncoming: TeamMember?
  /// Voice workspace over the Chat thread canvas (P-CHAT-US-5). Not a cover.
  @State private var isVoicePresented = false
  /// Lives on the root so rotation / list-column collapse cannot end Voice.
  @State private var voiceSession: VoiceSession?

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState
  @Environment(UpdateViewModel.self) private var updateModel
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    applyChrome(to: shellBody)
  }

  private var shellBody: some View {
    @Bindable var shell = shell
    return GeometryReader { geo in
      let mode = PadLayout.mode(for: geo.size.width)
      ZStack(alignment: .leading) {
        HStack(spacing: 0) {
          persistentSidebar(mode: mode)
          PadColumnStack(
            containerSize: geo.size,
            companionOpen: showsCompanion,
            companionFraction: $shell.companionFraction,
            stackedWorkspaceFraction: $shell.stackedWorkspaceFraction
          ) {
            destinationPane(mode: mode)
              .overlay {
                workspaceCenteredPanel
              }
          } companion: {
            companionPane
          }
        }

        if mode == .compact && shell.sidebarOverlayPresented {
          overlaySidebar
        }
      }
      .frame(width: geo.size.width, height: geo.size.height)
      .accessibilityElement(children: .contain)
      #if DEBUG
      .accessibilityIdentifier("pad-root")
      #endif
    }
    .background(Theme.canvas.ignoresSafeArea())
    .tint(Theme.accent)
  }

  private func applyChrome<Content: View>(to view: Content) -> some View {
    view
      .environment(\.showsAddToTeam, isSignedIn)
      .environment(\.padPresentAddToTeam, addToTeamPresenter)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: shell.sidebarOverlayPresented)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: shell.sidebarCollapsed)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: shell.companionOpen)
      .onAppear { ensureChatModel() }
      .task {
        ensureChatModel()
        await appState.restoreSession(using: services.auth)
        await appState.refreshRegulation(using: services.regulation)
        await updateModel.checkIfNeeded()
        consumePendingDestination()
      }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active {
          Task {
            await appState.refreshRegulation(using: services.regulation)
            await updateModel.checkIfNeeded()
          }
        }
      }
      .onChange(of: appState.authState) { _, newValue in
        if case .signedIn = newValue {
          showSignIn = false
          shell.dismissCenteredPanels()
          Task { await importGuestThreadIfNeeded() }
        }
      }
      .onChange(of: chatModel?.isCalculatorPresented ?? false) { _, presented in
        if presented { consumeCalculatorHop() }
      }
      .onChange(of: updateModel.pendingSoftUpdate) { _, offer in
        if offer != nil { shell.centeredPanelPresented = true }
      }
      .onChange(of: appState.pendingDestination) { _, _ in
        consumePendingDestination()
      }
      .onChange(of: isVoicePresented) { wasPresented, isPresented in
        if wasPresented, !isPresented { refreshAfterVoice() }
      }
      .onChange(of: shell.destination) { _, dest in
        if dest != .chat, isVoicePresented {
          endVoice()
        }
      }
      .onChange(of: chatModel?.sessionId) { _, id in
        companionArtifactModel?.conversationId = id
        companionArtifactModel?.dismiss()
        if isVoicePresented { endVoice() }
      }
      .onChange(of: companionArtifactModel?.isPresented ?? false) { _, open in
        if open {
          shell.centeredPanelPresented = true
        }
      }
      .onChange(of: shell.centeredPanelPresented) { _, presented in
        if !presented {
          showSignIn = false
          addToTeamIncoming = nil
          companionArtifactModel?.dismiss()
          if updateModel.pendingSoftUpdate != nil {
            updateModel.dismissSoftUpdate()
          }
        }
      }
      .task(id: isSignedIn) {
        let chat = ensureChatModel()
        ensureCompanionArtifact(for: chat)
      }
      .sheet(item: Binding(
        get: { presentedShareId.map { PadIdentifiedShare(id: $0) } },
        set: { presentedShareId = $0?.id }
      )) { item in
        ShareSnapshotView(shareId: item.id)
          .oakPaperSheet()
      }
      .onOpenURL { url in
        if let id = RootView.shareId(from: url) {
          presentedShareId = id
        }
      }
  }

  @ViewBuilder
  private func persistentSidebar(mode: PadLayoutMode) -> some View {
    if shell.sidebarCollapsed {
      EmptyView()
    } else {
      switch mode {
      case .regular:
        PadSidebar(
          style: .expanded,
          selected: shell.destination.sidebarTab,
          onSelect: selectTab,
          onCollapse: { shell.collapseSidebar() }
        )
        .frame(width: PadLayout.sidebarWidth)
        .transition(.move(edge: .leading))
      case .medium:
        PadSidebar(
          style: .rail,
          selected: shell.destination.sidebarTab,
          onSelect: selectTab,
          onCollapse: { shell.collapseSidebar() }
        )
        .frame(width: PadLayout.sidebarRailWidth)
        .transition(.move(edge: .leading))
      case .compact:
        EmptyView()
      }
    }
  }

  private func destinationPane(mode: PadLayoutMode) -> some View {
    let _ = chatModel?.isCalculatorPresented
    return Group {
      if let chatModel {
        PadDestinationHost(
          destination: shell.destination,
          chatModel: chatModel,
          shell: shell,
          layoutMode: mode,
          onSignIn: presentSignIn,
          onCloseCalc: { shell.closeCalc() },
          onStartVoice: startVoice,
          isVoicePresented: isVoicePresented,
          onEndVoice: endVoice,
          voiceSession: $voiceSession
        )
      } else {
        Theme.canvas
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .overlay(alignment: .topLeading) {
      if showsDestinationsReveal(mode: mode) && !shell.sidebarOverlayPresented {
        destinationsRevealButton(mode: mode)
      }
    }
    .overlay(alignment: .topTrailing) {
      if allowsCompanion {
        companionRevealButton
      }
    }
  }

  private func showsDestinationsReveal(mode: PadLayoutMode) -> Bool {
    mode == .compact || shell.sidebarCollapsed
  }

  /// Compact: overlay. Regular/medium with the sidebar user-collapsed:
  /// restore the persistent column (P-SHELL-AC-8.2).
  private func destinationsRevealButton(mode: PadLayoutMode) -> some View {
    Button {
      if mode == .compact {
        shell.sidebarOverlayPresented = true
      } else {
        shell.expandSidebar()
      }
    } label: {
      Image(systemName: "sidebar.leading")
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(Theme.accent)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .padding(Theme.Spacing.sm)
    .accessibilityLabel("Destinations")
    .accessibilityIdentifier("pad-sidebar-reveal")
  }

  private var overlaySidebar: some View {
    ZStack(alignment: .leading) {
      Theme.scrim
        .ignoresSafeArea()
        .onTapGesture { shell.sidebarOverlayPresented = false }
        .accessibilityLabel("Dismiss destinations")
        .accessibilityAddTraits(.isButton)
      PadSidebar(
        style: .expanded,
        selected: shell.destination.sidebarTab,
        onSelect: selectTab
      )
      .frame(width: PadLayout.sidebarWidth)
      .transition(.move(edge: .leading))
    }
  }

  @ViewBuilder
  private var companionPane: some View {
    if let chatModel {
      PadCompanionPane(
        model: chatModel,
        shell: shell,
        artifactModel: companionArtifactModel,
        signInAction: guestSignInAction,
        onVoice: startVoice
      )
    } else {
      Theme.canvas
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  @ViewBuilder
  private var workspaceCenteredPanel: some View {
    if showSignIn {
      PadCenteredPanel(onDismiss: dismissSignIn) {
        AuthView(model: AuthViewModel(auth: services.auth, appState: appState))
      }
    } else if let offer = updateModel.pendingSoftUpdate {
      PadCenteredPanel(onDismiss: dismissUpdate) {
        UpdateAvailableSheet(
          offer: offer,
          onUpdate: { updateModel.openStore() },
          onNotNow: dismissUpdate
        )
      }
    } else if let incoming = addToTeamIncoming {
      PadCenteredPanel(onDismiss: dismissAddToTeam) {
        AddToTeamSheet(
          model: AddToTeamViewModel(
            teams: services.teams,
            isSignedIn: true,
            conversationFormat: .champions,
            incoming: incoming
          ),
          onOpened: { id, _ in
            dismissAddToTeam()
            appState.pendingDestination = .team(id: id)
          },
          onCancel: { dismissAddToTeam() }
        )
      }
    } else if let companionArtifactModel, companionArtifactModel.isPresented {
      PadCenteredPanel(onDismiss: {
        companionArtifactModel.dismiss()
        shell.dismissCenteredPanels()
      }) {
        PadInspectorColumn(model: companionArtifactModel)
      }
    }
  }

  private var companionRevealButton: some View {
    Button {
      if shell.companionOpen {
        shell.hideCompanion()
      } else {
        shell.revealCompanion()
      }
    } label: {
      Image(systemName: shell.companionOpen ? "bubble.left.fill" : "bubble.left")
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(Theme.accent)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .padding(Theme.Spacing.sm)
    .accessibilityLabel(shell.companionOpen ? "Hide chat" : "Show chat")
    .accessibilityIdentifier("pad-companion-reveal")
  }

  private var showsCompanion: Bool {
    shell.companionOpen && allowsCompanion
  }

  private var allowsCompanion: Bool {
    switch shell.destination {
    case .teams, .usage, .dex, .calc: true
    case .chat, .settings: false
    }
  }

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  private var guestSignInAction: (() -> Void)? {
    guard !isSignedIn else { return nil }
    return { presentSignIn() }
  }

  private var addToTeamPresenter: (@MainActor (TeamMember) -> Void)? {
    guard isSignedIn else { return nil }
    return { incoming in presentAddToTeam(incoming) }
  }

  /// Switch to Chat, then present Voice over the thread column (P-CHAT-AC-5.3).
  /// Capture kill switch and signed-in gate match iPhone ``ChatView``.
  private func startVoice() {
    guard VoiceCapture.isEnabled else { return }
    guard isSignedIn else { return }
    shell.select(.chat)
    isVoicePresented = true
  }

  /// Explicit End, leaving Chat, or a live-session change. Ends the realtime
  /// session here — not in overlay ``View/onDisappear`` (rotation).
  private func endVoice() {
    voiceSession?.end()
    voiceSession = nil
    guard isVoicePresented else { return }
    isVoicePresented = false
  }

  /// Pull the authoritative thread after Voice closes (same as iPhone
  /// ``ChatView``). Errors are swallowed — the session already persisted turns.
  private func refreshAfterVoice() {
    guard isSignedIn, let chatModel else { return }
    Task {
      guard let detail = try? await services.history.get(id: chatModel.sessionId) else { return }
      chatModel.loadResumed(conversationId: detail.id, format: detail.format, turns: detail.turns)
    }
  }

  private func presentSignIn() {
    showSignIn = true
    shell.centeredPanelPresented = true
  }

  private func dismissSignIn() {
    showSignIn = false
    shell.dismissCenteredPanels()
  }

  private func dismissUpdate() {
    updateModel.dismissSoftUpdate()
    shell.dismissCenteredPanels()
  }

  private func presentAddToTeam(_ incoming: TeamMember) {
    addToTeamIncoming = incoming
    shell.centeredPanelPresented = true
  }

  private func dismissAddToTeam() {
    addToTeamIncoming = nil
    shell.dismissCenteredPanels()
  }

  private func consumeCalculatorHop() {
    guard let chatModel, let hop = chatModel.calculatorHop else { return }
    let scenario = hop.scenario ?? parseCalcSlashRest(hop.rest, format: .champions)
    shell.openCalc(scenario: scenario)
    chatModel.dismissCalculator()
  }

  private func selectTab(_ tab: OakAppTab) {
    if shell.destination.sidebarTab != tab {
      shell.select(tab.padDestination)
    }
    shell.sidebarOverlayPresented = false
  }

  /// One live VM for Chat + later companion (ADR-P3). Constructed once.
  @discardableResult
  private func ensureChatModel() -> ChatViewModel {
    if let chatModel { return chatModel }
    let vm = ChatViewModel(
      chat: services.chat,
      appState: appState,
      history: services.history,
      teams: services.teams,
      shares: services.shares,
      voice: services.voice,
      dexLookup: services.dexLookup
    )
    chatModel = vm
    ensureCompanionArtifact(for: vm)
    return vm
  }

  private func ensureCompanionArtifact(for chat: ChatViewModel) {
    companionArtifactModel = ArtifactViewModel(
      service: services.artifact,
      format: chat.displayFormat,
      isSignedIn: chat.isSignedIn,
      pins: services.artifactPins,
      conversationId: chat.sessionId
    )
  }

  private func consumePendingDestination() {
    guard let destination = appState.pendingDestination else { return }
    switch destination {
    case .teams, .team:
      shell.select(.teams())
    case let .dex(query):
      if let hop = PendingDexHop.consume(.dex(query: query)), let route = hop.route {
        shell.select(.dex(route))
      } else {
        shell.select(.dex())
      }
    case let .dexHop(hop):
      shell.select(.dex(DexEntityRoute(kind: hop.kind, query: hop.query)))
    case let .calculator(scenario):
      shell.openCalc(scenario: scenario)
      appState.pendingDestination = nil
    case let .conversation(id):
      shell.select(.chat)
      appState.pendingDestination = nil
      Task { await openConversation(id: id) }
    case let .share(id):
      presentedShareId = id
      appState.pendingDestination = nil
    case let .usage(slug):
      let trimmed = slug?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if trimmed.isEmpty {
        shell.select(.usage())
      } else {
        shell.select(.usage(slug: trimmed))
      }
    }
  }

  private func openConversation(id: String) async {
    let vm = ensureChatModel()
    _ = await PadChatSession.resume(
      conversationId: id,
      history: services.history,
      appState: appState,
      into: vm
    )
  }

  /// Persist the guest thread, then bind the same live VM to the imported
  /// conversation (Pad keeps one VM across sign-in; iPhone rebuilds via ChatTab).
  private func importGuestThreadIfNeeded() async {
    let id = await appState.importGuestThread(using: services.history)
    if let id {
      await openConversation(id: id)
    }
  }
}

private struct PadIdentifiedShare: Identifiable {
  let id: String
}

#if DEBUG
#Preview("Pad shell") {
  PadRootView()
}
#endif
