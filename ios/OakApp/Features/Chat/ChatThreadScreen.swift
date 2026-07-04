import SwiftUI

/// A per-conversation loader pushed onto the signed-in Chat tab's stack
/// (history-and-teams.md M-HIST-US-3; chat-experience.md M-CHAT-US-3). It turns a
/// ``ChatRoute`` into a ready-to-drive ``ChatViewModel`` and renders the thread:
///
///   - ``ChatRoute/new`` — clears the active conversation (and the guest thread, if
///     a guest) and builds a fresh thread, so the agent has no prior context.
///   - ``ChatRoute/existing(_:)`` — loads the saved conversation through the already-
///     tested ``HistoryDetailViewModel`` (`load` → `resume`), then seeds a new
///     ``ChatViewModel`` with its rehydrated turns and conversation id so the earlier
///     answers re-render and follow-ups continue the saved thread (M-AC-H3.1/H3.2).
///
/// While the detail loads it shows a `ProgressView`; a load failure shows the
/// detail view model's message with a Retry that re-runs the load. The pushed thread
/// hides the New-conversation button — Back returns to the list, and New Chat lives
/// on the list (the Chat tab's toolbar).
struct ChatThreadScreen: View {
  let source: ChatRoute

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  /// The seeded thread view model, built once by ``prepare()``.
  @State private var model: ChatViewModel?

  /// A load failure message (existing-conversation path only), or `nil`.
  @State private var loadError: String?

  var body: some View {
    Group {
      if let model {
        ChatView(model: model, showsNewConversationButton: false)
      } else if let loadError {
        ContentUnavailableView {
          Label("Couldn't open conversation", systemImage: "exclamationmark.triangle")
        } description: {
          Text(loadError)
        } actions: {
          Button("Retry") {
            self.loadError = nil
            Task { await prepare() }
          }
        }
      } else {
        loadingSkeleton
      }
    }
    .task { await prepare() }
  }

  /// The conversation-load placeholder (§4.08): skeleton message rows standing in for
  /// the thread while the saved detail loads, instead of the app's only bare
  /// `ProgressView`. A trailing bubble-shaped block (a user message) and a leading
  /// group (an answer), both on the ``SkeletonBlock`` shimmer. Decorative and hidden
  /// from VoiceOver — the screen announces the loading state (M-AC-UI9.3).
  private var loadingSkeleton: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
      // A user message: a trailing, bubble-shaped block.
      HStack {
        Spacer(minLength: Theme.Spacing.xxl)
        SkeletonBlock(width: 160, height: 40)
      }
      // An answer: a leading masthead bar + two prose lines.
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        SkeletonBlock(width: 220, height: 20)
        SkeletonBlock(height: 12)
        SkeletonBlock(width: 180, height: 12)
      }
    }
    .padding(Theme.Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .accessibilityHidden(true)
    .accessibilityLabel("Loading conversation")
  }

  /// Builds the thread's view model for ``source``. Idempotent: once a model exists
  /// it returns immediately, so the initial `.task` and a Retry never double-load.
  private func prepare() async {
    guard model == nil else { return }
    switch source {
    case .new:
      // A truly fresh thread: drop any active conversation (and, for a guest, the
      // in-memory thread) so the new `ChatViewModel` mints a fresh session id.
      appState.activeConversationId = nil
      if case .guest = appState.authState { appState.guestThread = [] }
      model = ChatViewModel(chat: services.chat, appState: appState)

    case .existing(let summary):
      let detailVM = HistoryDetailViewModel(
        summary: summary,
        history: services.history,
        appState: appState
      )
      await detailVM.load()
      if let detail = detailVM.detail {
        // Bind the active conversation, then seed a thread with its rehydrated turns.
        detailVM.resume()
        let vm = ChatViewModel(chat: services.chat, appState: appState)
        vm.loadResumed(conversationId: detail.id, format: detail.format, turns: detail.turns)
        model = vm
      } else {
        loadError = detailVM.errorMessage ?? HistoryDetailViewModel.genericMessage
      }
    }
  }
}
