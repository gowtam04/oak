import SwiftUI

/// The Chat tab's auth-adaptive root — launches straight into a fresh chat, with
/// history one Back away (chat-experience.md M-CHAT-US-2/3; history-and-teams.md
/// M-HIST-US-2/3).
///
/// It branches on ``AppState/authState``:
///   - **Signed in:** a `NavigationStack` seeded on ``ChatRoute/new`` — launch and a
///     freshly completed sign-in both land directly on a new, unsaved thread; Back
///     pops to the saved-conversation list (``ConversationListView``, titled
///     "Chats"), reachable via the list's own New Chat action too. Selecting a row
///     pushes ``ChatRoute/existing(_:)`` — both routes resolve to a
///     ``ChatThreadScreen`` that seeds and renders the thread (M-AC-H3.1).
///   - **Guest:** the tab opens directly into a single in-memory chat thread
///     (``ChatView``) with the "Sign in to save your conversations" nudge; tapping it
///     presents the email-OTP sheet (``AuthView``). Completing sign-in flips
///     ``AppState/authState`` and this view re-renders into the signed-in stack.
///
/// It is a no-argument view: it reads the service container and ``AppState`` from the
/// environment itself, so `RootView` constructs it as `ChatTabView()`.
struct ChatTabView: View {
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  /// Drives the guest sign-in sheet.
  @State private var showSignIn = false

  /// The signed-in conversation stack's path. Seeded on `.new` so launch opens
  /// directly on a fresh thread, with the "Chats" list one Back away.
  @State private var path: [ChatRoute] = [.new]

  var body: some View {
    Group {
      if case .signedIn = appState.authState {
        signedInHome
      } else {
        guestHome
      }
    }
    // A completed sign-in flips the whole tab into the signed-in stack: drop the
    // sign-in sheet and reset the navigation path so it opens on a fresh chat,
    // matching the cold-launch behavior above.
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue {
        showSignIn = false
        path = [.new]
      }
    }
  }

  // MARK: Signed-in — saved-conversation list + pushed threads

  private var signedInHome: some View {
    NavigationStack(path: $path) {
      ConversationListView(
        model: HistoryListViewModel(history: services.history),
        onSelect: { path.append(.existing($0)) },
        // The New-Chat toolbar button moved to the list's floating action disc
        // (one-handed reach); this is its action.
        onNewChat: { path.append(.new) }
      )
      .oakRedThread()
      // Inline title with a custom Space Grotesk principal view. Root cause of the
      // old phantom band: the screen used the default (large) title display mode,
      // and our global largeTitleTextAttributes custom Space Grotesk UIFont
      // doesn't render on iOS 26's large-title band — it reserved the tall band
      // but drew nothing. Inline mode removes the band; the principal view
      // guarantees the Space Grotesk face.
      .navigationTitle("Chats")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Chats")
            .font(Theme.display(.headline))
            .foregroundStyle(Theme.textStrong)
            .accessibilityAddTraits(.isHeader)
        }
      }
      .navigationDestination(for: ChatRoute.self) { route in
        // New Chat from a pushed saved thread seeds a fresh `.new` route (mirrors the
        // post-sign-in seeding above) so it opens as a new pushed thread.
        ChatThreadScreen(source: route, onNewChat: { path = [.new] })
          .oakRedThread()
      }
    }
  }

  // MARK: Guest — single in-memory thread

  private var guestHome: some View {
    NavigationStack {
      ChatView(
        model: ChatViewModel(chat: services.chat, appState: appState),
        showsNewConversationButton: true,
        signInAction: { showSignIn = true }
      )
      .oakRedThread()
    }
    .sheet(isPresented: $showSignIn) {
      AuthView(model: AuthViewModel(auth: services.auth, appState: appState))
    }
  }
}

/// A navigation route within the signed-in Chat tab: start a fresh thread, or open
/// a saved conversation (identified by its list summary). Hashable so it can ride
/// the `NavigationStack` path.
enum ChatRoute: Hashable {
  /// Start a brand-new, unsaved thread.
  case new
  /// Open and resume an existing saved conversation.
  case existing(ConversationSummary)
}
