import SwiftUI

/// Top-level navigation shell: a two-tab `TabView` (Chat / Account). Chat is the
/// default surface on launch (M-AC-UI2.1); conversation history is folded into the
/// Chat tab WhatsApp-style (the list appears once signed in), so there is no
/// separate History or Teams tab in phase 1.
///
/// This view is the single wiring point for launch behavior:
///   * on appear it restores the session (a stored Bearer token resolves to
///     signed-in, otherwise guest);
///   * when the auth state flips to signed-in it imports the in-memory guest
///     thread into durable history.
///
/// Both side-effects are non-fatal — they swallow their own errors — so a transient
/// backend problem never blocks the UI or costs the user their on-screen thread.
struct RootView: View {
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  var body: some View {
    TabView {
      Tab("Chat", systemImage: "bubble.left.and.text.bubble.right") {
        ChatTabView()
      }
      Tab("Account", systemImage: "person.crop.circle") {
        AccountView(model: AccountViewModel(auth: services.auth, appState: appState))
      }
    }
    .tint(Theme.accent)
    .task { await appState.restoreSession(using: services.auth) }
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue {
        Task { await appState.importGuestThread(using: services.history) }
      }
    }
  }
}

#Preview {
  RootView()
    .environment(AppState())
    .oakServices(.preview())
}
