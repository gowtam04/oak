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
  /// (``ServiceContainer/artifact``). Available here because the whole app is wrapped
  /// in `.oakServices(…)` above `RootView`.
  @Environment(\.services) private var services

  /// The thread's artifact bottom-sheet viewer (artifact-viewer.md M-ART-US-1/2/3).
  /// One per chat thread, hosted once via ``artifactViewerHost(_:)``. Built lazily in
  /// `.task(id:)` (the environment isn't available in `init`) and rebuilt when the
  /// Champions toggle flips so entity fetches re-scope to the active format
  /// (M-BR-ART-4); rebuilding clears the back stack, which is fine since the sheet is
  /// closed when the composer toggle is reached.
  @State private var artifactModel: ArtifactViewModel?

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
      }
      thread
      Divider()
      if let banner = model.errorBanner {
        errorBannerView(banner)
      }
      ComposerView(model: model)
    }
    .navigationTitle("Oak")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
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
    .onDisappear { model.cancelStreaming() }
    // Build the viewer once on appear, and rebuild it when the Champions toggle
    // flips so its fixed format re-scopes to the active mode (M-BR-ART-4).
    .task(id: model.championsMode) {
      artifactModel = ArtifactViewModel(
        service: services.artifact,
        format: model.championsMode ? .champions : .scarletViolet
      )
    }
    // Host the artifact bottom sheet once at the screen level; pushing an entity
    // opens it, an empty back stack closes it (M-AC-A3.3, M-BR-ART-5).
    .artifactViewerHost(artifactModel)
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
      StreamingStatusView(phase: model.streamingPhase, activities: model.toolActivities)
      if !model.streamingText.isEmpty {
        MarkdownText(model.streamingText)
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var emptyState: some View {
    ContentUnavailableView {
      Label("Ask Oak", systemImage: "bubble.left.and.text.bubble.right")
    } description: {
      Text("Every answer carries its reasoning, sources, and the generation it's based on.")
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 48)
  }

  // MARK: Error banner

  @ViewBuilder
  private func errorBannerView(_ banner: ChatViewModel.ErrorBanner) -> some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(Theme.danger)
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
            .background(Theme.accent, in: RoundedRectangle(cornerRadius: Theme.Radius.lg))
        }
        if imageCount > 0 {
          Label("\(imageCount) image(s) attached", systemImage: "photo")
            .font(Theme.body(.caption))
            .foregroundStyle(Theme.textSecondary)
        }
      }
    }
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
    championsMode: Bool
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
  NavigationStack {
    ChatView(model: ChatViewModel(chat: PreviewChatService(), appState: AppState()))
  }
}

#Preview("Chat (guest nudge)") {
  NavigationStack {
    ChatView(
      model: ChatViewModel(chat: PreviewChatService(), appState: AppState()),
      signInAction: {}
    )
  }
}
#endif
