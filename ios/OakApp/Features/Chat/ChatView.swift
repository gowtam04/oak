import SwiftUI
import UIKit

/// The chat thread screen (chat-experience.md M-CHAT-US-1/2/3/4): a scrolling
/// conversation of user messages and reasoned answers, a live streaming section
/// while a turn is in flight, a recoverable error banner, and the composer.
///
/// The view owns its ``ChatViewModel`` (`@State`) and drives it directly; all logic
/// and the SSE reducer live in the view model. Finalized answers render through the
/// full field-by-field ``AnswerCardView`` tree (status, reasoning, citations,
/// inferences, candidates, damage calc, team blocks, clarify options, suggestions,
/// uncertainty…); a clarify-option or suggestion tap is sent verbatim as the next
/// user turn. Layout uses Dynamic-Type styles and semantic colors so it adapts to
/// text size and light/dark.
///
/// The view is **content-only** — it does not own a `NavigationStack`; the caller
/// provides one (the guest single-thread home wraps it; a signed-in thread is pushed
/// onto the Chat tab's stack). Two flags adapt it to those contexts:
/// ``showsNewConversationButton`` hides the toolbar's New-conversation button for a
/// pushed signed-in thread (where "New Chat" lives on the list and Back returns to
/// it), and ``signInAction`` — set for a guest only — renders the "Sign in to save
/// your conversations" nudge above the thread (accounts-and-access.md M-ACCT-US-1).
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

  /// Flipped `true` in the empty state's `.onAppear` so the example chips cascade in
  /// once (staggered fade), rather than snapping in with the hero.
  @State private var emptyStateAppeared = false

  /// The thread's artifact bottom-sheet viewer (artifact-viewer.md M-ART-US-1/2/3).
  /// One per chat thread, hosted once via ``artifactViewerHost(_:)``. Built lazily in
  /// `.task(id:)` (the environment isn't available in `init`) and rebuilt when the
  /// Champions toggle flips so entity fetches re-scope to the active format
  /// (M-BR-ART-4); rebuilding clears the back stack, which is fine since the sheet is
  /// closed when the composer toggle is reached.
  @State private var artifactModel: ArtifactViewModel?

  /// Drives the voice-mode `.fullScreenCover` (``VoiceLauncher``). Flipped true by
  /// the composer's mic button (only after it's cleared the sign-in + microphone
  /// permission gates); flipping back to false — however the cover closes — is
  /// what triggers ``refreshAfterVoice()``.
  @State private var isVoicePresented = false

  /// Whether the toolbar shows the New-conversation button (M-CHAT-US-3). On for the
  /// guest single thread; off for a pushed signed-in thread.
  private let showsNewConversationButton: Bool

  /// When non-nil, renders the guest sign-in nudge above the thread; the "Sign in"
  /// button calls this (it presents the sign-in sheet). `nil` for a signed-in thread.
  private let signInAction: (() -> Void)?

  init(
    model: ChatViewModel,
    showsNewConversationButton: Bool = true,
    signInAction: (() -> Void)? = nil
  ) {
    _model = State(initialValue: model)
    self.showsNewConversationButton = showsNewConversationButton
    self.signInAction = signInAction
  }

  var body: some View {
    VStack(spacing: 0) {
      if let signInAction {
        signInNudge(action: signInAction)
          .transition(bannerTransition)
      }
      thread
      Divider()
      if let banner = model.errorBanner {
        errorBannerView(banner)
          .transition(bannerTransition)
      }
      ComposerView(
        model: model,
        onVoice: { isVoicePresented = true },
        voiceReady: voiceReady,
        onSignInNudge: signInAction
      )
    }
    // The error banner slides up from the composer seam as it appears/clears.
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.errorBanner)
    // Answer arrival is a redundant success haptic — the new card is the visible cue
    // (M-AC-UI9.3). Fires only when the newest turn is an assistant answer.
    .onChange(of: model.turns.count) { _, _ in
      if case .assistant = model.turns.last?.content { Haptics.success() }
    }
    .navigationTitle("Oak")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      // The scope control (GS-C): the header's visible counterpart to the `scope`
      // SSE event and the ONLY interactive scope control (the Champions pill +
      // Account toggle are gone). Centered so it reads as the thread's scope, not
      // an action; disabled mid-stream so a turn's scope stays stable.
      ToolbarItem(placement: .principal) {
        scopeChip
      }
      if showsNewConversationButton {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            model.startNewConversation()
          } label: {
            Label("New conversation", systemImage: "square.and.pencil")
          }
        }
      }
    }
    // Tear down the stream when the screen goes away (conventions.md "Concurrency").
    // cancelStreaming also releases the screen-wake hold, so it can't stick on.
    .onDisappear { model.cancelStreaming() }
    // Screen-off auto-reconnect: arm on background, fire any deferred retry on resume.
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
    .task(id: model.displayFormat) {
      let viewer = ArtifactViewModel(
        service: services.artifact,
        format: model.displayFormat
      )
      // "Ask about this in chat" prefills the composer (no auto-send) and the sheet
      // closes itself — mirrors the web viewer's `askInChat`.
      viewer.onAskInChat = { [weak model] text in model?.prefillComposer(text) }
      artifactModel = viewer
    }
    // Host the artifact bottom sheet once at the screen level; pushing an entity
    // opens it, an empty back stack closes it (M-AC-A3.3, M-BR-ART-5).
    .artifactViewerHost(artifactModel)
    // Voice mode (T5): a fresh `VoiceLauncher` — and a fresh `VoiceSession` — is
    // built every time this opens. However it closes (End button, `.onDisappear`
    // teardown, anything else), the `isVoicePresented` binding flips back to
    // false, which is what triggers the post-session refresh below.
    .fullScreenCover(isPresented: $isVoicePresented) {
      VoiceLauncher(sessionId: model.sessionId, format: model.displayFormat)
    }
    .onChange(of: isVoicePresented) { wasPresented, isPresented in
      if wasPresented, !isPresented { refreshAfterVoice() }
    }
  }

  // MARK: Scope chip (generation-scope GS-C)

  /// The header scope control: a compact pill showing the displayed scope's short
  /// label, opening a menu of all six known formats as an inline radio list
  /// (checkmark on the current pick). Picking one seeds the next turn's scope
  /// (`selectScope`). Disabled while a turn streams so the scope can't change
  /// mid-turn — mirrors `ScopeChip.tsx` (label = the scope, menu = the six
  /// `Format.knownCases`, disabled while streaming).
  @ViewBuilder
  private var scopeChip: some View {
    Menu {
      Picker(
        "Answer scope",
        selection: Binding(
          get: { model.displayFormat },
          set: { model.selectScope($0) }
        )
      ) {
        ForEach(Format.knownCases, id: \.self) { format in
          Text(format.displayLabel).tag(format)
        }
      }
    } label: {
      HStack(spacing: 3) {
        Text(model.displayFormat.shortLabel)
          .font(Theme.body(.footnote).weight(.semibold))
        Image(systemName: "chevron.down")
          .font(.system(size: 9, weight: .bold))
      }
      .foregroundStyle(Theme.textSecondary)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(Theme.surface, in: Capsule())
      .overlay(Capsule().strokeBorder(Theme.separator, lineWidth: 1))
      .contentShape(Capsule())
    }
    .disabled(model.isStreaming)
    .accessibilityLabel("Answer scope")
    .accessibilityValue(model.displayFormat.displayLabel)
    .accessibilityHint("Choose which game or generation answers are based on")
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

  // MARK: Sign-in nudge (guest)

  /// A slim banner inviting a guest to sign in so their conversations persist
  /// (accounts-and-access.md M-ACCT-US-1). Shown only in the guest single-thread
  /// context; the "Sign in" button presents the sign-in sheet via ``signInAction``.
  /// Styled like the error banner — an icon paired with text so meaning is never
  /// carried by color alone (M-AC-UI9.3).
  @ViewBuilder
  private func signInNudge(action: @escaping () -> Void) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "icloud.and.arrow.up")
        .foregroundStyle(Theme.accent)
      Text("Sign in to save your conversations")
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button("Sign in", action: action)
        .font(Theme.display(.footnote))
        .buttonStyle(.borderless)
        .tint(Theme.accent)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.accent.opacity(0.10))
  }

  // MARK: Thread

  private var thread: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 16) {
          if model.turns.isEmpty && !model.isStreaming {
            emptyState
          }

          ForEach(model.turns) { turn in
            turnView(turn)
              .id(turn.id)
          }
          // Turn insertion animates so the user bubble's entrance transition fires
          // (Reduce Motion: the transition itself degrades to opacity-only).
          .animation(reduceMotion ? nil : Theme.Motion.smooth, value: model.turns.count)

          // The in-flight turn: live status + streamed prose as it arrives.
          if model.isStreaming || !model.streamingText.isEmpty {
            inProgressView
              .id(Self.inProgressAnchor)
          }
        }
        .padding(16)
      }
      .scrollDismissesKeyboard(.interactively)
      // Keep the newest content in view as turns/tokens arrive (M-AC-2.2).
      .onChange(of: model.turns.count) { _, _ in scrollToBottom(proxy) }
      .onChange(of: model.streamingText) { _, _ in scrollToBottom(proxy) }
      .onChange(of: model.toolActivities.count) { _, _ in scrollToBottom(proxy) }
    }
  }

  @ViewBuilder
  private func turnView(_ turn: ChatViewModel.ChatTurnItem) -> some View {
    switch turn.content {
    case let .user(text, imageCount):
      UserMessageView(text: text, imageCount: imageCount)
    case let .assistant(answer):
      // The full field-by-field card. A clarify-option / suggestion tap sends its
      // text verbatim as the next user turn; tapping a candidate / subject / type or
      // a proposed/saved team opens it in the artifact viewer (M-ART-US-1/2/3).
      AnswerCardView(
        answer: answer,
        onFollowUp: sendFollowUp,
        onOpenSavedTeam: { ref in
          Task { await artifactModel?.openSavedTeam(id: ref.id, name: ref.name) }
        },
        onOpenEntity: { kind, query in
          Task { await artifactModel?.openEntity(kind: kind, query: query) }
        },
        onOpenProposedTeam: { team, warnings in
          artifactModel?.openProposedTeam(team, warnings: warnings)
        },
        onOpenComparison: { subjects in
          artifactModel?.openComparison(subjects)
        },
        onOpenDamageCalc: { damageCalc in
          artifactModel?.openDamageCalc(damageCalc)
        }
      )
    }
  }

  /// Sends `text` verbatim as the next user message (clarify options + suggestion
  /// chips). A no-op while a turn is already streaming.
  private func sendFollowUp(_ text: String) {
    model.composerText = text
    model.send()
  }

  /// The live streaming section: the status ticker, then the streamed prose (which
  /// the terminal answer later replaces, authoritatively).
  private var inProgressView: some View {
    VStack(alignment: .leading, spacing: 12) {
      StreamingStatusView(
        phase: model.streamingPhase,
        activities: model.toolActivities,
        reconnecting: model.reconnecting
      )
      if !model.streamingText.isEmpty {
        MarkdownBlockView(model.streamingText)
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// The seed prompts offered on an empty thread; a tap sends the text verbatim
  /// as the first user turn (same path as a suggestion chip). Games-wide since
  /// oak-v2 — mirrors the web starter prompts (at least one non-competitive).
  private static let exampleQuestions = [
    "What's Garchomp's best moveset?",
    "Who outspeeds Dragapult?",
    "Where do I get HM Fly in HeartGold?",
    "Who leads the guild in Pokémon Mystery Dungeon Explorers?",
  ]

  /// The current Champions regulation, duplicated from web's `CHAMPIONS_REGULATION`
  /// (`web/src/data/formats.ts` — no shared module between the two clients). Update
  /// it here when that rotates, alongside `Format.displayLabel`'s "Reg M-B".
  private static let championsRegulation = "Regulation M-B"

  /// A branded empty state: the ``OakBrandMark`` hero, a title + description, and the
  /// example-question chips (styled like ``SuggestionsView`` chips) that cascade in.
  private var emptyState: some View {
    VStack(spacing: 20) {
      OakBrandMark()

      VStack(spacing: 6) {
        Text("Ask Oak")
          .font(Theme.display(.title))
          .foregroundStyle(Theme.textPrimary)
        Text("Every answer carries its reasoning, sources, and the generation it's based on.")
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textSecondary)
          .multilineTextAlignment(.center)
        // Scope hint parity with web's `ChatThread.tsx` empty state — the chip
        // (top of the screen) is the interactive counterpart named here.
        Text("Answers default to Pokémon Champions (\(Self.championsRegulation)). For any other game — a mainline generation or a spin-off like Mystery Dungeon — just mention it (“in HeartGold”, “gen 7”), or pick a scope with the chip at the top.")
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textMuted)
          .multilineTextAlignment(.center)
          .padding(.top, 2)
      }

      VStack(spacing: 8) {
        ForEach(Array(Self.exampleQuestions.enumerated()), id: \.offset) { index, question in
          exampleChip(question, index: index)
        }
      }
      .padding(.top, 4)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 48)
    .padding(.horizontal, 8)
    .onAppear { emptyStateAppeared = true }
  }

  /// One example-question chip. Accent-tinted bordered capsule (mirrors the suggestion
  /// chips); tapping sends it as the next user turn. Cascades in with a per-index
  /// stagger, collapsing to an instant appearance under Reduce Motion.
  private func exampleChip(_ text: String, index: Int) -> some View {
    let shown = reduceMotion || emptyStateAppeared
    return Button {
      Haptics.tap()
      sendFollowUp(text)
    } label: {
      Text(text)
        .font(Theme.body(.subheadline).weight(.medium))
        .foregroundStyle(Theme.accent)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Theme.accent.opacity(0.12), in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.35), lineWidth: 1))
        .contentShape(Capsule())
    }
    .buttonStyle(OakPressableButtonStyle())
    .opacity(shown ? 1 : 0)
    .offset(y: shown ? 0 : 8)
    .animation(reduceMotion ? nil : Theme.Motion.staggered(index), value: emptyStateAppeared)
    .accessibilityLabel("Ask: \(text)")
    .accessibilityHint("Sends this as your next message")
  }

  /// The entrance transition for the error banner / sign-in nudge — a slide up from
  /// the composer seam, degrading to a plain crossfade under Reduce Motion.
  private var bannerTransition: AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
  }

  // MARK: Error banner

  @ViewBuilder
  private func errorBannerView(_ banner: ChatViewModel.ErrorBanner) -> some View {
    HStack(alignment: .top, spacing: 8) {
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
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.danger.opacity(0.12))
  }

  // MARK: Helpers

  private static let inProgressAnchor = "oak.inProgress"

  private func scrollToBottom(_ proxy: ScrollViewProxy) {
    withAnimation(.easeOut(duration: 0.2)) {
      if model.isStreaming || !model.streamingText.isEmpty {
        proxy.scrollTo(Self.inProgressAnchor, anchor: .bottom)
      } else if let last = model.turns.last {
        proxy.scrollTo(last.id, anchor: .bottom)
      }
    }
  }
}

// MARK: - User message

/// A user's message bubble, trailing-aligned. Shows an attached-image caption when
/// the turn carried photos (the actual thumbnails are P8).
private struct UserMessageView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let text: String
  let imageCount: Int

  var body: some View {
    HStack {
      Spacer(minLength: 32)
      VStack(alignment: .trailing, spacing: 4) {
        if !text.isEmpty {
          Text(text)
            .font(Theme.body(.body))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
              LinearGradient(
                colors: [Theme.accent, Theme.accentActive],
                startPoint: .top,
                endPoint: .bottom
              ),
              in: bubbleShape
            )
            // A small tinted halo to lift the user's own bubble off the thread.
            .oakShadow(Theme.Shadow.glow(Theme.accent))
        }
        if imageCount > 0 {
          Label("\(imageCount) image(s) attached", systemImage: "photo")
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
        }
      }
    }
    .transition(entrance)
  }

  /// Asymmetric corners — the bottom-trailing corner tucks in (`Radius.sm`) so the
  /// bubble reads as anchored to the sender's edge; the rest stay `Radius.lg`.
  private var bubbleShape: UnevenRoundedRectangle {
    UnevenRoundedRectangle(
      topLeadingRadius: Theme.Radius.lg,
      bottomLeadingRadius: Theme.Radius.lg,
      bottomTrailingRadius: Theme.Radius.sm,
      topTrailingRadius: Theme.Radius.lg,
      style: .continuous
    )
  }

  /// Pops in from the sending corner (scale + rise + fade); Reduce Motion keeps only
  /// the fade (constraint 2). Removal is always a plain fade.
  private var entrance: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(
      insertion: .scale(scale: 0.92, anchor: .bottomTrailing)
        .combined(with: .opacity)
        .combined(with: .offset(y: 8)),
      removal: .opacity
    )
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
    scopeSeed: Format?
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
}

#Preview("Chat") {
  let state = AppState()
  return NavigationStack {
    ChatView(model: ChatViewModel(chat: PreviewChatService(), appState: state))
  }
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
  .environment(state)
}
#endif
