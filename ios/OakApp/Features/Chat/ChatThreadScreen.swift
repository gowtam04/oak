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
/// still offers a New-conversation button (TestFlight AG4sZ6E): a `.new` route starts
/// a fresh thread in place, an `.existing` route routes back to the tab's stack via
/// ``onNewChat`` so it becomes a new pushed thread rather than mutating the saved one.
struct ChatThreadScreen: View {
  let source: ChatRoute

  /// Invoked by the toolbar's New-conversation button when this screen is showing a
  /// saved (`.existing`) thread — the Chat tab seeds a fresh `.new` route with it. `nil`
  /// falls back to starting a new conversation in place.
  var onNewChat: (() -> Void)? = nil

  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  /// The seeded thread view model, built once by ``prepare()``.
  @State private var model: ChatViewModel?

  /// A load failure message (existing-conversation path only), or `nil`.
  @State private var loadError: String?

  var body: some View {
    Group {
      if let model {
        ChatView(
          model: model,
          showsNewConversationButton: false,
          onNewConversation: {
            // A `.new` route is already a fresh thread — start over in place; an
            // `.existing` (saved) thread routes New Chat back to the tab's stack so it
            // opens as a new pushed thread instead of mutating the saved conversation.
            switch source {
            case .new:
              model.startNewConversation()
            case .existing:
              onNewChat?()
            }
          }
        )
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
      model = ChatViewModel(
        chat: services.chat,
        appState: appState,
        history: services.history,
        teams: services.teams,
        shares: services.shares,
        voice: services.voice
      )

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
        let vm = ChatViewModel(
          chat: services.chat,
          appState: appState,
          history: services.history,
          teams: services.teams,
          shares: services.shares,
          voice: services.voice
        )
        // Honor the conversation's `active_turn` (design §5.4): if a turn is still
        // generating for this thread, `loadResumed` records it and reattaches to its
        // live stream — so reopening a mid-generation conversation (even after an app
        // relaunch, when the device-local pending pointer is gone) resumes the answer.
        vm.loadResumed(
          conversationId: detail.id,
          format: detail.format,
          turns: detail.turns,
          activeTurnId: detail.activeTurn?.turnId,
          pinnedMessageIds: detail.pinnedMessageIds
        )
        model = vm
      } else {
        loadError = detailVM.errorMessage ?? HistoryDetailViewModel.genericMessage
      }
    }
  }
}
