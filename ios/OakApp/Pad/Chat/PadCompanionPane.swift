import SwiftUI

/// Companion chat pane: the live ``ChatViewModel`` (ADR-P3) with
/// ``ChatThreadStack`` + ``PadComposerHost``. Not shown on Chat
/// (P-SHELL-AC-2.4, P-SHELL-BR-2). Artifacts use the centered panel VM,
/// not the Chat inspector (P-CHAT-BR-4, ADR-P5).
struct PadCompanionPane: View {
  var model: ChatViewModel
  var shell: PadShellModel
  var artifactModel: ArtifactViewModel?
  var signInAction: (() -> Void)?
  /// Switches to Chat and presents ``PadVoiceWorkspace`` on the thread
  /// (P-CHAT-AC-5.3). Companion itself is not a Voice surface.
  var onVoice: (() -> Void)? = nil

  @Environment(AppState.self) private var appState
  @Environment(\.scenePhase) private var scenePhase

  @FocusState private var composerFocused: Bool
  @State private var sendPulse = false
  @State private var keyboardOverlap: CGFloat = 0

  var body: some View {
    VStack(spacing: 0) {
      header
      ChatThreadStack(
        model: model,
        artifactModel: artifactModel,
        signInAction: signInAction,
        sendPulse: $sendPulse,
        onDismissComposer: { composerFocused = false }
      )
      PadComposerHost(
        model: model,
        onVoice: onVoice,
        voiceReady: voiceReady,
        onSignInNudge: signInAction,
        sendPulse: sendPulse,
        contextChip: shell.contextChip,
        onDismissChip: { shell.setContextChip(nil) },
        isInputFocused: $composerFocused
      )
    }
    .environment(\.answerCanvas, .padThread)
    .padding(.bottom, keyboardOverlap)
    .oakKeyboardOverlap($keyboardOverlap)
    .background(Theme.canvas)
    .onAppear {
      model.reattachIfNeeded()
      Task { await model.loadMentionTeams() }
    }
    .onChange(of: scenePhase) { _, newPhase in
      switch newPhase {
      case .background:
        model.sceneDidEnterBackground()
      case .active:
        model.sceneWillEnterForeground()
      default:
        break
      }
    }
    .onChange(of: appState.pendingChatSend) { _, prompt in
      guard let prompt else { return }
      appState.pendingChatSend = nil
      model.composerText = prompt
      model.send()
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-companion-pane")
  }

  /// Same signed-in gate as the Chat thread composer (P-CHAT-AC-5.4). Mic
  /// permission-on-use stays in ``ComposerView``.
  private var voiceReady: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  private var header: some View {
    HStack(spacing: Theme.Spacing.sm) {
      Text(OakAppTab.chat.title)
        .font(Theme.display(.headline))
        .foregroundStyle(Theme.textPrimary)
      Spacer(minLength: 0)
      Button {
        shell.hideCompanion()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(Theme.accent)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Hide chat")
    }
    .padding(.horizontal, Theme.Spacing.sm)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }
}
