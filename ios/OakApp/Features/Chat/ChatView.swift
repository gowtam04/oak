import SwiftUI
import UIKit

/// The chat thread screen (chat-experience.md M-CHAT-US-1/2/3/4): a scrolling
/// conversation of user messages and reasoned answers, a live streaming section
/// while a turn is in flight, a recoverable error banner, and the composer.
///
/// The view owns its ``ChatViewModel`` (`@State`) and drives it directly; all logic
/// and the SSE reducer live in the view model. Thread content is ``ChatThreadStack``;
/// this wrapper keeps iPhone screen chrome: toolbar, composer, artifact sheet, voice
/// cover, and calculator sheet.
///
/// The view is **content-only** — it does not own a `NavigationStack`; the caller
/// provides one (the guest single-thread home wraps it; a signed-in thread is pushed
/// onto the Chat tab's stack). Two flags adapt it to those contexts:
/// ``showsNewConversationButton`` hides the toolbar's New-conversation button for a
/// pushed signed-in thread (where "New Chat" lives on the list and Back returns to
/// it), and ``signInAction`` — set for a guest only — renders a quiet "Sign in to
/// save your conversations" row inside the scrollable thread, above the empty
/// state when empty and with the bottom-anchored conversation cluster otherwise
/// (accounts-and-access.md M-ACCT-US-1) — not a full-width band under the header.
struct ChatView: View {
  @State private var model: ChatViewModel

  /// The injected service container — read to build the artifact viewer's data seam
  /// (``ServiceContainer/artifact``) and, after a voice session ends, to reload the
  /// thread (``ServiceContainer/history``). Available here because the whole app is
  /// wrapped in `.oakServices(…)` above `RootView`.
  @Environment(\.services) private var services

  /// Read to gate voice mode (signed-in only, M-AC voice-mode) and to build the
  /// signed-out mic nudge.
  @Environment(AppState.self) private var appState

  /// Gates every entrance/movement animation (constraint 2): under Reduce Motion the
  /// bubble/banner slides and the chip cascade collapse to plain opacity or nothing.
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Drives the screen-off auto-reconnect: a `.background` transition mid-stream arms
  /// the retry gate, `.active` fires any deferred retry (mirrors web's
  /// `visibilitychange` handling in `sse-client.ts`).
  @Environment(\.scenePhase) private var scenePhase

  /// A single scale pulse on the send button, fired when an example chip is tapped so
  /// the eye lands where the action is (§4.01). Skipped under Reduce Motion.
  @State private var sendPulse = false

  /// Composer focus — lifted so tapping the thread can dismiss the keyboard.
  @FocusState private var composerFocused: Bool

  /// The thread's artifact bottom-sheet viewer (artifact-viewer.md M-ART-US-1/2/3).
  /// One per chat thread, hosted once via ``artifactViewerHost(_:)``. Built lazily in
  /// `.task(id:)` (the environment isn't available in `init`) and rebuilt when the
  /// Champions toggle flips so entity fetches re-scope to the active format
  /// (M-BR-ART-4); rebuilding clears the back stack, which is fine since the sheet is
  /// closed when the composer toggle is reached.
  @State private var artifactModel: ArtifactViewModel?
  @State private var calculator: CalculatorViewModel?
  @State private var pinStrip: PinnedArtifactStripViewModel?

  private var calculatorPresented: Binding<Bool> {
    Binding(
      get: { model.isCalculatorPresented },
      set: { if !$0 { model.dismissCalculator() } }
    )
  }

  /// Drives the voice-mode `.fullScreenCover` (``VoiceLauncher``). Flipped true by
  /// the composer's mic button (only after it's cleared the sign-in + microphone
  /// permission gates); flipping back to false — however the cover closes — is
  /// what triggers ``refreshAfterVoice()``.
  @State private var isVoicePresented = false

  /// Whether the toolbar shows the New-conversation button (M-CHAT-US-3). On for the
  /// guest single thread; off for a pushed signed-in thread.
  private let showsNewConversationButton: Bool

  /// When set, the toolbar shows a New-conversation button even on a pushed thread
  /// (where the leading wordmark is absent), and tapping it calls this instead of
  /// ``ChatViewModel/startNewConversation()`` — letting a signed-in pushed thread route
  /// New Chat back to the tab's stack (TestFlight AG4sZ6E).
  private let onNewConversation: (() -> Void)?

  /// When non-nil, renders the guest sign-in nudge in the thread; the "Sign in"
  /// button calls this (it presents the sign-in sheet). `nil` for a signed-in thread.
  private let signInAction: (() -> Void)?

  init(
    model: ChatViewModel,
    showsNewConversationButton: Bool = true,
    onNewConversation: (() -> Void)? = nil,
    signInAction: (() -> Void)? = nil
  ) {
    _model = State(initialValue: model)
    self.showsNewConversationButton = showsNewConversationButton
    self.onNewConversation = onNewConversation
    self.signInAction = signInAction
  }

  var body: some View {
    VStack(spacing: 0) {
      if let pinStrip {
        PinnedArtifactStrip(model: pinStrip) { artifact in
          artifactModel?.openSnapshot(artifact)
        }
      }
      ChatThreadStack(
        model: model,
        artifactModel: artifactModel,
        signInAction: signInAction,
        sendPulse: $sendPulse,
        onDismissComposer: { composerFocused = false }
      )
      ComposerView(
        model: model,
        onVoice: {
          guard VoiceCapture.isEnabled else { return }
          isVoicePresented = true
        },
        voiceReady: voiceReady,
        onSignInNudge: signInAction,
        sendPulse: sendPulse,
        isInputFocused: $composerFocused
      )
    }
    // The error banner slides up from the composer seam as it appears/clears.
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.errorBanner)
    .navigationTitle("Oak")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      // Enamel lockup (coral tile + white Fredoka "Oak") leading, so the Chat
      // root reads as Oak the instant it opens. Only on the root (guest single
      // thread); a pushed signed-in thread keeps the system back button leading.
      if showsNewConversationButton {
        ToolbarItem(placement: .topBarLeading) {
          OakWordmarkLockup()
            .fixedSize()
        }
        .oakLidItem()
      }
      // Informational regulation chip (CF-UI-US-2) — not a format picker.
      ToolbarItem(placement: .principal) {
        scopeChip
      }
      .oakLidItem()
      ToolbarItem(placement: .topBarTrailing) {
        HStack(spacing: 12) {
          if model.isSignedIn, !model.turns.isEmpty {
            Menu {
              Button("Export Markdown") {
                Task { await exportThread(.markdown) }
              }
              Button("Export PDF") {
                Task { await exportThread(.pdf) }
              }
            } label: {
              Label("Export", systemImage: "square.and.arrow.up")
            }
          }
          if showsNewConversationButton || onNewConversation != nil {
            Button {
              if let onNewConversation {
                onNewConversation()
              } else {
                model.startNewConversation()
              }
            } label: {
              Label("New conversation", systemImage: "square.and.pencil")
            }
          }
        }
      }
      .oakLidItem()
    }
    // Navigating away UNSUBSCRIBES — it never cancels generation (background-turns
    // design §6.2). `detach` closes the socket, keeps the pending-turn pointer, and
    // releases the screen-wake hold; the server turn keeps running and is reattached
    // on return.
    .onDisappear { model.detach() }
    // Returning to the thread: if a turn is still generating for it but the socket has
    // dropped, reattach to its live stream and rebuild the in-flight UI from the replay.
    .onAppear {
      model.reattachIfNeeded()
      Task { await model.loadMentionTeams() }
    }
    // Background: take a short grace window so a nearly-done turn finishes streaming.
    // Foreground: reattach to a still-running turn whose socket dropped.
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
    // Build the viewer once on appear, and rebuild it when the displayed scope
    // changes (a chip pick or a resolved `scope` event) so its fixed format
    // re-scopes to the active scope (M-BR-ART-4; web scopes the viewer to
    // `displayFormat` too).
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
    .task(id: model.displayFormat) {
      let viewer = ArtifactViewModel(
        service: services.artifact,
        format: model.displayFormat,
        isSignedIn: model.isSignedIn,
        pins: services.artifactPins,
        conversationId: model.sessionId
      )
      artifactModel = viewer
    }
    .sheet(isPresented: calculatorPresented) {
      if let calculator {
        CalculatorView(
          model: calculator,
          onExplain: { prompt in
            model.composerText = prompt
            model.send()
          },
          onExpand: {
            let scenario = calculator.scenario
            model.dismissCalculator()
            appState.pendingDestination = .calculator(scenario)
          },
          onDismiss: { model.dismissCalculator() }
        )
        .oakPaperSheet()
      }
    }
    .onChange(of: model.calculatorHop) { _, hop in
      guard let hop else {
        calculator = nil
        return
      }
      let vm = calculator ?? CalculatorViewModel(
        calc: services.calc,
        format: hop.format,
        presentation: hop.kind == .fullScreen ? .fullScreen : .overlay
      )
      if let scenario = hop.scenario {
        vm.applyPrefill(scenario)
      } else {
        vm.applySlashRest(hop.rest)
      }
      calculator = vm
    }
    .onChange(of: appState.pendingChatSend) { _, prompt in
      guard let prompt else { return }
      appState.pendingChatSend = nil
      model.composerText = prompt
      model.send()
    }
    // Host the artifact bottom sheet once at the screen level; pushing an entity
    // opens it, an empty back stack closes it (M-AC-A3.3, M-BR-ART-5).
    .artifactViewerHost(artifactModel)
    // Voice mode (T5): capture is gated by ``VoiceCapture/isEnabled``. When on,
    // a fresh `VoiceLauncher` — and a fresh `VoiceSession` — is built every
    // time this opens. However it closes (End button, `.onDisappear` teardown,
    // anything else), the `isVoicePresented` binding flips back to false,
    // which is what triggers the post-session refresh below.
    .fullScreenCover(isPresented: $isVoicePresented) {
      if VoiceCapture.isEnabled {
        VoiceLauncher(sessionId: model.sessionId, format: model.displayFormat)
      }
    }
    .onChange(of: isVoicePresented) { wasPresented, isPresented in
      if wasPresented, !isPresented { refreshAfterVoice() }
    }
  }

  // MARK: Scope chip (generation-scope GS-C)

  /// Display-only regulation chip (CF-CHAT-US-1 / CF-UI-US-2). Not a menu of
  /// games — tap does not switch scope.
  @ViewBuilder
  private var scopeChip: some View {
    RegulationChip()
      .accessibilityValue(model.regulationLabel)
  }

  // MARK: Voice mode (T5)

  /// Voice mode is signed-in only (the server 401s a guest, component-design.md
  /// voice-mode section) — the composer's mic button uses this to choose between
  /// the permission gate and the sign-in nudge.
  private var voiceReady: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  /// Reloads the thread once the voice overlay closes, guest-guarded (mirrors
  /// web's `handleVoiceClose`). The realtime session persisted its turns
  /// server-side as it went, so this is the same "pull the authoritative thread"
  /// refresh a normal answer's finalize already relies on elsewhere — errors
  /// (including a 401 that slipped through, or the just-finished turn not having
  /// landed yet) are silently swallowed rather than surfaced as a banner.
  private func refreshAfterVoice() {
    guard case .signedIn = appState.authState else { return }
    Task {
      guard let detail = try? await services.history.get(id: model.sessionId) else { return }
      model.loadResumed(conversationId: detail.id, format: detail.format, turns: detail.turns)
    }
  }

  private func exportThread(_ format: ConversationExportFormat) async {
    guard let url = await model.exportConversation(as: format) else { return }
    SystemShare.present(items: [url])
  }
}

// MARK: - Optional artifact-viewer host

private extension View {
  /// Hosts the artifact bottom sheet once the thread's ``ArtifactViewModel`` has been
  /// built (it's created lazily in `.task`, so it's `nil` for the first frame).
  ///
  /// The sheet is attached to a **stateless background layer** rather than wrapped
  /// around `self` in a conditional: the chat subtree (composer focus, scroll offset)
  /// then keeps a stable identity when the model flips `nil → non-nil` on first
  /// appear. A `.sheet` presents window-modally regardless of its anchor, so a
  /// `Color.clear` host is sufficient; it reuses the model-owned
  /// ``SwiftUICore/View/artifactViewer(_:)`` modifier.
  func artifactViewerHost(_ model: ArtifactViewModel?) -> some View {
    background {
      if let model {
        Color.clear.artifactViewer(model)
      }
    }
  }
}

#if DEBUG
/// A preview/canvas ``ChatService`` that streams a short scripted answer without the
/// network. Shared by the chat feature's previews (internal, not `private`).
struct PreviewChatService: ChatService {
  func send(
    sessionId: String,
    message: String,
    images: [UIImage],
    scopeSeed: Format?,
    recovery: ChatRecovery?,
    mentionedTeamIds: [String]?
  ) -> AsyncThrowingStream<SSEEvent, Error> {
    AsyncThrowingStream { continuation in
      let answer = OakAnswer(
        status: .answered,
        answerMarkdown: "**Garchomp** is a Dragon/Ground pseudo-legendary with a base stat total of 600.",
        reasoningMarkdown: "Resolved Garchomp and read its base stats and typing.",
        citations: [],
        inferences: [],
        generationBasis: GenerationBasis(generation: "Gen 9 (Scarlet/Violet)", fallback: false, note: nil),
        subjects: nil,
        candidates: nil,
        damageCalc: nil,
        suggestions: nil,
        question: nil,
        uncertaintyFlags: nil,
        proposedTeam: nil,
        savedTeam: nil,
        proposedTeamWarnings: nil
      )
      continuation.yield(.toolActivity(tool: "resolve_entity", label: "Resolving \"Garchomp\""))
      continuation.yield(.answerStart)
      continuation.yield(.answerDelta(text: answer.answerMarkdown))
      continuation.yield(.answer(answer))
      continuation.finish()
    }
  }

  func resumeStream(turnId: String, sessionId: String) -> AsyncThrowingStream<SSEEvent, Error> {
    AsyncThrowingStream { $0.finish() }
  }

  func stop(turnId: String, sessionId: String) async throws {}

  func persistScope(
    format: Format,
    conversationId: String?,
    sessionId: String
  ) async throws -> [Format] { [] }
}

#Preview("Chat") {
  let state = AppState()
  return NavigationStack {
    ChatView(model: ChatViewModel(chat: PreviewChatService(), appState: state))
  }
  .oakEnamelNav()
  .environment(state)
}

#Preview("Chat (guest nudge)") {
  let state = AppState()
  return NavigationStack {
    ChatView(
      model: ChatViewModel(chat: PreviewChatService(), appState: state),
      signInAction: {}
    )
  }
  .oakEnamelNav()
  .environment(state)
}
#endif
