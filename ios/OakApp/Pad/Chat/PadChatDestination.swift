import SwiftUI

/// Chat pane policy (api-design.md, P-SHELL-AC-5.4). Collapse order: hide the
/// conversation list first (medium + inspector), then stack the inspector under
/// the thread (compact). Default `inspectorOpen: false` keeps P3 call sites.
enum PadChatColumns {
  static func showsListColumn(mode: PadLayoutMode, inspectorOpen: Bool = false) -> Bool {
    switch mode {
    case .regular: true
    case .medium: !inspectorOpen
    case .compact: false
    }
  }

  /// Width/inspector policy **and** the user's Chat-list collapse
  /// (P-CHAT-AC-1.8). Default `userCollapsed: false` keeps P3 call sites.
  static func showsPersistentList(
    mode: PadLayoutMode,
    inspectorOpen: Bool = false,
    userCollapsed: Bool = false
  ) -> Bool {
    !userCollapsed && showsListColumn(mode: mode, inspectorOpen: inspectorOpen)
  }

  static func showsInspector(mode: PadLayoutMode, inspectorOpen: Bool) -> Bool {
    switch mode {
    case .regular, .medium, .compact: inspectorOpen
    }
  }

  /// Compact always *would* stack; layout only stacks when the inspector is also open.
  static func stacksInspectorUnderThread(mode: PadLayoutMode) -> Bool {
    mode == .compact
  }

  /// Guests see sign-in copy in the list column, not a fake empty history
  /// (P-CHAT-AC-1.5, P-AUTH-AC-1.3).
  static func listShowsSignIn(isSignedIn: Bool) -> Bool {
    !isSignedIn
  }
}

/// Loads a saved conversation into the live Pad ``ChatViewModel`` the same way
/// iPhone ``ChatThreadScreen`` does (`HistoryDetailViewModel.load` → `resume`
/// → `loadResumed`). Never constructs a new chat VM.
enum PadChatSession {
  @MainActor
  static func resume(
    summary: ConversationSummary,
    history: any HistoryService,
    appState: AppState,
    into model: ChatViewModel
  ) async -> String? {
    let detailVM = HistoryDetailViewModel(
      summary: summary,
      history: history,
      appState: appState
    )
    await detailVM.load()
    guard let detail = detailVM.detail else {
      return detailVM.errorMessage ?? HistoryDetailViewModel.genericMessage
    }
    detailVM.resume()
    model.loadResumed(
      conversationId: detail.id,
      format: detail.format,
      turns: detail.turns,
      activeTurnId: detail.activeTurn?.turnId,
      pinnedMessageIds: detail.pinnedMessageIds
    )
    return nil
  }

  @MainActor
  static func resume(
    conversationId: String,
    history: any HistoryService,
    appState: AppState,
    into model: ChatViewModel
  ) async -> String? {
    let summary = ConversationSummary(
      id: conversationId,
      title: "Conversation",
      format: .champions,
      pinned: false,
      updatedAt: 0
    )
    return await resume(summary: summary, history: history, appState: appState, into: model)
  }
}

/// Pad Chat destination: mail-style list | thread | inspector from the
/// **window** layout mode (P-CHAT-US-1, P-SHELL-AC-5.4). Compact uses the
/// thread and a list overlay; inspector stacks under the thread.
/// Does **not** embed iPhone ``ChatView`` (sheets / voice cover / artifact sheet).
struct PadChatDestination: View {
  var model: ChatViewModel
  var shell: PadShellModel
  /// Window-level mode from ``PadRootView`` — not remaining pane width after
  /// the sidebar (iPad Mini portrait is medium and must keep list | thread).
  var layoutMode: PadLayoutMode
  var onSignIn: () -> Void
  /// Host starts Voice: `destination = .chat` then this overlay (P-CHAT-AC-5.3).
  var onStartVoice: () -> Void = {}
  var isVoicePresented: Bool = false
  var onEndVoice: () -> Void = {}
  /// Host-owned session so rotation does not recreate/end Voice.
  var voiceSession: Binding<VoiceSession?> = .constant(nil)

  @Environment(\.services) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var listOverlayPresented = false
  @State private var artifactModel: ArtifactViewModel?

  var body: some View {
    let inspectorOpen = artifactModel?.isPresented ?? false
    let policyShowsList = PadChatColumns.showsListColumn(
      mode: layoutMode,
      inspectorOpen: inspectorOpen
    )
    let showsPersistentList = PadChatColumns.showsPersistentList(
      mode: layoutMode,
      inspectorOpen: inspectorOpen,
      userCollapsed: shell.chatListCollapsed
    )
    let showsInspector = PadChatColumns.showsInspector(mode: layoutMode, inspectorOpen: inspectorOpen)
    let stacksInspector = PadChatColumns.stacksInspectorUnderThread(mode: layoutMode)
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        HStack(spacing: 0) {
          if showsPersistentList {
            PadConversationListColumn(
              chatModel: model,
              onNewConversation: startNewConversation,
              onSignIn: onSignIn,
              onCollapse: { shell.collapseChatList() },
              headerLeadingInset: listHeaderLeadingInset
            )
            .disabled(isVoicePresented)
            .allowsHitTesting(!isVoicePresented)
            .frame(width: PadLayout.chatListMinWidth)
            .frame(maxHeight: .infinity)
            .transition(.move(edge: .leading))
            columnSeparator
          }

          VStack(spacing: 0) {
            PadThreadColumn(
              model: model,
              artifactModel: artifactModel,
              signInAction: guestSignInAction,
              showsListButton: !showsPersistentList && !listOverlayPresented,
              onPresentList: {
                if policyShowsList {
                  shell.expandChatList()
                } else {
                  listOverlayPresented = true
                }
              },
              onNewConversation: startNewConversation,
              onVoice: onStartVoice,
              isVoicePresented: isVoicePresented
            )
            .overlay {
              if isVoicePresented {
                PadVoiceWorkspace(
                  sessionId: model.sessionId,
                  format: model.displayFormat,
                  session: voiceSession,
                  onEnd: onEndVoice
                )
              }
            }
            .id("pad-live-thread")
            .frame(maxWidth: .infinity)
            .frame(maxHeight: (stacksInspector && showsInspector) ? nil : .infinity)
            .frame(
              height: (stacksInspector && showsInspector)
                ? geo.size.height * PadLayout.stackedWorkspaceMinFraction
                : nil
            )

            if stacksInspector, showsInspector, let artifactModel {
              rowSeparator
              PadInspectorColumn(model: artifactModel)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)

          if showsInspector, !stacksInspector, let artifactModel {
            columnSeparator
            PadInspectorColumn(model: artifactModel)
              .frame(width: PadLayout.inspectorMinWidth)
              .frame(maxHeight: .infinity)
          }
        }

        if !policyShowsList, listOverlayPresented {
          compactListOverlay
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task(id: model.isSignedIn) {
      artifactModel = ArtifactViewModel(
        service: services.artifact,
        format: model.displayFormat,
        isSignedIn: model.isSignedIn,
        pins: services.artifactPins,
        conversationId: model.sessionId
      )
    }
    .onChange(of: model.sessionId) { _, id in
      artifactModel?.conversationId = id
      artifactModel?.dismiss()
    }
    .onChange(of: layoutMode) { _, newMode in
      if PadChatColumns.showsListColumn(
        mode: newMode,
        inspectorOpen: artifactModel?.isPresented ?? false
      ) {
        listOverlayPresented = false
      }
    }
    .onChange(of: artifactModel?.isPresented ?? false) { _, open in
      if PadChatColumns.showsListColumn(mode: layoutMode, inspectorOpen: open) {
        listOverlayPresented = false
      }
    }
    .onChange(of: isVoicePresented) { _, presented in
      if presented { listOverlayPresented = false }
    }
    .onChange(of: shell.chatListCollapsed) { _, collapsed in
      if collapsed { listOverlayPresented = false }
    }
    .background(Theme.canvas)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: listOverlayPresented)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: inspectorOpen)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: shell.chatListCollapsed)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-chat-destination")
  }

  private var columnSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(width: 1)
  }

  private var rowSeparator: some View {
    Rectangle()
      .fill(Theme.separator)
      .frame(height: 1)
  }

  private var listHeaderLeadingInset: CGFloat {
    (layoutMode == .compact || shell.sidebarCollapsed)
      ? PadLayout.overlayControlInset
      : Theme.Spacing.lg
  }

  private var guestSignInAction: (() -> Void)? {
    model.isSignedIn ? nil : onSignIn
  }

  private func startNewConversation() {
    if isVoicePresented { onEndVoice() }
    model.startNewConversation()
    listOverlayPresented = false
    artifactModel?.dismiss()
  }

  private var compactListOverlay: some View {
    ZStack(alignment: .leading) {
      Theme.scrim
        .ignoresSafeArea()
        .onTapGesture { listOverlayPresented = false }
        .accessibilityLabel("Dismiss conversations")
        .accessibilityAddTraits(.isButton)
      PadConversationListColumn(
        chatModel: model,
        onNewConversation: startNewConversation,
        onSignIn: {
          listOverlayPresented = false
          onSignIn()
        },
        onDidSelect: { listOverlayPresented = false },
        headerLeadingInset: listHeaderLeadingInset
      )
      .disabled(isVoicePresented)
      .allowsHitTesting(!isVoicePresented)
      .frame(width: PadLayout.chatListMinWidth)
      .frame(maxHeight: .infinity)
      .background(Theme.canvas)
      .transition(.move(edge: .leading))
    }
  }
}
