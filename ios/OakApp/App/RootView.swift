import SwiftUI

/// Top-level navigation shell: a three-tab `TabView` (Chat / Teams / Account). Chat is
/// the default surface on launch (M-AC-UI2.1); conversation history is folded into the
/// Chat tab WhatsApp-style (the list appears once signed in), so there is no separate
/// History tab. Teams hosts the team-builder library (``TeamsListView``, which already
/// owns its own `NavigationStack` and guest-vs-signed-in branching internally).
///
/// This view is the single wiring point for launch behavior:
///   * on appear it restores the session (a stored Bearer token resolves to
///     signed-in, otherwise guest);
///   * when the auth state flips to signed-in it imports the in-memory guest
///     thread into durable history.
///
/// Both side-effects are non-fatal — they swallow their own errors — so a transient
/// backend problem never blocks the UI or costs the user their on-screen thread.
///
/// Chrome (UI-polish P6): the tab bar tracks a `selection` so a switch fires a
/// light `Haptics.tap()` and the selected tab's icon plays a one-shot
/// `.symbolEffect(.bounce)`. The bounce is a decorative enhancement layered over
/// the label text (which always carries the meaning), so no Reduce Motion gate is
/// needed — SwiftUI's symbol effects already no-op under that setting.
struct RootView: View {
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  /// The selected tab, tracked so tab changes can fire haptics + a symbol bounce.
  @State private var selection: AppTab = .chat

  /// The three root destinations. Named `AppTab` to avoid colliding with SwiftUI's
  /// `Tab`; `Hashable` so it can back the `TabView(selection:)`.
  private enum AppTab: Hashable {
    case chat
    case teams
    case account
  }

  var body: some View {
    TabView(selection: $selection) {
      Tab(value: AppTab.chat) {
        ChatTabView()
      } label: {
        Label("Chat", systemImage: "bubble.left.and.text.bubble.right")
          .symbolEffect(.bounce, value: selection == .chat)
      }
      Tab(value: AppTab.teams) {
        TeamsListView(
          model: TeamsListViewModel(teamService: services.teams, dexLookup: services.dexLookup)
        )
      } label: {
        Label("Teams", systemImage: "square.grid.3x2.fill")
          .symbolEffect(.bounce, value: selection == .teams)
      }
      Tab(value: AppTab.account) {
        AccountView(model: AccountViewModel(auth: services.auth, appState: appState))
      } label: {
        Label("Account", systemImage: "person.crop.circle")
          .symbolEffect(.bounce, value: selection == .account)
      }
    }
    .tint(Theme.accent)
    .onChange(of: selection) { _, _ in Haptics.tap() }
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
