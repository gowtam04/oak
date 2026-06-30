import SwiftUI

/// The Chat tab's auth-adaptive root — the WhatsApp-style restructure of the chat
/// experience (chat-experience.md M-CHAT-US-2/3; history-and-teams.md M-HIST-US-2/3).
///
/// It branches on ``AppState/authState``:
///   - **Signed in:** a `NavigationStack` whose root is the saved-conversation list
///     (``ConversationListView``) titled "Chats", with a **New Chat** toolbar button.
///     Selecting a row pushes ``ChatRoute/existing(_:)``; New Chat pushes
///     ``ChatRoute/new`` — both resolve to a ``ChatThreadScreen`` that seeds and
///     renders the thread, so Back returns to the list (M-AC-H3.1).
///   - **Guest:** the tab opens directly into a single in-memory chat thread
///     (``ChatView``) with the "Sign in to save your conversations" nudge; tapping it
///     presents the email-OTP sheet (``AuthView``). Completing sign-in flips
///     ``AppState/authState`` and this view re-renders into the signed-in list.
///
/// It is a no-argument view: it reads the service container and ``AppState`` from the
/// environment itself, so `RootView` constructs it as `ChatTabView()`.
struct ChatTabView: View {
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  /// Drives the guest sign-in sheet.
  @State private var showSignIn = false

  /// The signed-in conversation stack's path (the list root + pushed threads).
  @State private var path: [ChatRoute] = []

  var body: some View {
    Group {
      if case .signedIn = appState.authState {
        signedInHome
      } else {
        guestHome
      }
    }
    // A completed sign-in flips the whole tab into the conversation list: drop the
    // sign-in sheet and reset the navigation path so it opens at the list root.
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue {
        showSignIn = false
        path = []
      }
    }
  }

  // MARK: Signed-in — saved-conversation list + pushed threads

  private var signedInHome: some View {
    NavigationStack(path: $path) {
      ConversationListView(
        model: HistoryListViewModel(history: services.history),
        onSelect: { path.append(.existing($0)) }
      )
      .navigationTitle("Chats")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            path.append(.new)
          } label: {
            Label("New Chat", systemImage: "square.and.pencil")
          }
        }
      }
      .navigationDestination(for: ChatRoute.self) { route in
        ChatThreadScreen(source: route)
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
