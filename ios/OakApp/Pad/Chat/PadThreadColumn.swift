import SwiftUI

/// Thread column of Pad Chat: ``AnswerCanvas/padThread``, empty
/// ``PadEmptyWorkbench``, ``ChatThreadStack`` for turns, pin strip, and
/// ``PadComposerHost`` (P-CHAT-AC-2, US-3, US-4, AC-6.1, P-ART-US-2).
struct PadThreadColumn: View {
  var model: ChatViewModel
  var artifactModel: ArtifactViewModel?
  var signInAction: (() -> Void)?
  var showsListButton: Bool = false
  var onPresentList: (() -> Void)?
  var onNewConversation: () -> Void
  /// Starts Voice on the Chat thread canvas (P-CHAT-US-5). `nil` leaves the
  /// composer mic a no-op after the existing sign-in / permission gates.
  var onVoice: (() -> Void)? = nil
  /// When true, the typed thread + composer are inert to VoiceOver and hits
  /// (the Voice overlay sits above).
  var isVoicePresented: Bool = false

  @Environment(AppState.self) private var appState
  @Environment(\.services) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase

  @FocusState private var composerFocused: Bool
  @State private var sendPulse = false
  @State private var keyboardOverlap: CGFloat = 0
  @State private var pinStrip: PinnedArtifactStripViewModel?

  var body: some View {
    VStack(spacing: 0) {
      header
      if let pinStrip {
        PinnedArtifactStrip(model: pinStrip) { artifact in
          artifactModel?.openSnapshot(artifact)
        }
      }
      if showsEmptyWorkbench {
        PadEmptyWorkbench(
          model: model,
          sendPulse: $sendPulse,
          onDismissComposer: { composerFocused = false }
        )
        Divider()
        if let banner = model.errorBanner {
          errorBannerView(banner)
            .transition(bannerTransition)
        }
      } else {
        ChatThreadStack(
          model: model,
          artifactModel: artifactModel,
          signInAction: signInAction,
          sendPulse: $sendPulse,
          onDismissComposer: { composerFocused = false }
        )
      }
      PadComposerHost(
        model: model,
        onVoice: onVoice,
        voiceReady: voiceReady,
        onSignInNudge: signInAction,
        sendPulse: sendPulse,
        isInputFocused: $composerFocused
      )
    }
    .environment(\.answerCanvas, .padThread)
    .padding(.bottom, keyboardOverlap)
    .oakKeyboardOverlap($keyboardOverlap)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.errorBanner)
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
    .task(id: "\(model.sessionId)-\(model.isSignedIn)") {
      guard model.isSignedIn else {
        pinStrip = nil
        return
      }
      let strip = PinnedArtifactStripViewModel(
        pins: services.artifactPins,
        isSignedIn: true,
        conversationId: model.sessionId
      )
      pinStrip = strip
      await strip.load()
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-thread-column")
    .allowsHitTesting(!isVoicePresented)
    .accessibilityHidden(isVoicePresented)
  }

  private var voiceReady: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  /// Empty thread (and not mid-stream) uses the Pad workbench, not the phone desk.
  private var showsEmptyWorkbench: Bool {
    model.turns.isEmpty && !model.isStreaming
  }

  private var bannerTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
  }

  @ViewBuilder
  private func errorBannerView(_ banner: ChatViewModel.ErrorBanner) -> some View {
    HStack(alignment: .top, spacing: Theme.Spacing.sm) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(Theme.danger)
        .symbolEffect(.pulse, options: .nonRepeating, isActive: !reduceMotion)
      Text(banner.message)
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .leading)
      if banner.isRetryable {
        Button("Retry") { model.retry() }
          .font(Theme.display(.footnote))
          .buttonStyle(.borderless)
          .tint(Theme.accent)
      }
    }
    .padding(Theme.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.danger.opacity(0.12))
  }

  /// Display-only regulation chip (P-CHAT-AC-6.3) plus list/new controls.
  private var header: some View {
    HStack(spacing: Theme.Spacing.sm) {
      if showsListButton {
        Button {
          onPresentList?()
        } label: {
          Image(systemName: "list.bullet")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Conversations")
      }
      Spacer(minLength: 0)
      RegulationChip()
        .accessibilityValue(model.regulationLabel)
      Spacer(minLength: 0)
      Button {
        onNewConversation()
      } label: {
        Label("New conversation", systemImage: "square.and.pencil")
          .labelStyle(.iconOnly)
      }
      .accessibilityLabel("New conversation")
    }
    // Compact: leave room for PadRootView's overlay sidebar button (44 + sm).
    .padding(.leading, showsListButton ? 56 : Theme.Spacing.md)
    .padding(.trailing, Theme.Spacing.md)
    .padding(.top, Theme.Spacing.sm)
    .padding(.bottom, Theme.Spacing.xs)
  }
}
