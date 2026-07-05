import SwiftUI

/// The destinations reachable from the More tab's list. Adding a future destination
/// (e.g. a settings or about screen) is one new case here plus one branch in
/// ``MoreView``'s `.navigationDestination(for:)` — the tab itself never changes.
enum MoreDestination: String, CaseIterable, Identifiable, Hashable {
  case account

  var id: String { rawValue }

  var title: String {
    switch self {
    case .account: return "Account"
    }
  }

  var systemImage: String {
    switch self {
    case .account: return "person.crop.circle"
    }
  }
}

/// The More tab's root screen (nav restructure: Chat / Teams / More): a list of
/// destinations, currently just Account. Owns the tab's `NavigationStack` (the
/// ``TeamsListView`` pattern) so pushed destinations — ``AccountView`` today — stay
/// one level deep instead of nesting a second stack.
struct MoreView: View {
  @Environment(\.services) private var services
  @Environment(AppState.self) private var appState

  var body: some View {
    NavigationStack {
      List(MoreDestination.allCases) { destination in
        NavigationLink(value: destination) {
          row(for: destination)
        }
        .listRowBackground(Theme.surface)
      }
      .scrollContentBackground(.hidden)
      .background(Theme.canvas)
      .oakRedThread()
      // Inline title + Fredoka principal — same phantom-band fix as the Chats list
      // (the large-title band renders no visible custom-font title on iOS 26).
      .navigationTitle("More")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("More")
            .font(Theme.display(.headline))
            .foregroundStyle(Theme.textStrong)
            .accessibilityAddTraits(.isHeader)
        }
      }
      .navigationDestination(for: MoreDestination.self) { destination in
        switch destination {
        case .account:
          AccountView(model: AccountViewModel(auth: services.auth, appState: appState))
        }
      }
    }
  }

  @ViewBuilder
  private func row(for destination: MoreDestination) -> some View {
    Label {
      VStack(alignment: .leading, spacing: 2) {
        Text(destination.title)
          .font(Theme.body(.body))
        Text(subtitle(for: destination))
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
      }
    } icon: {
      Image(systemName: destination.systemImage)
        .foregroundStyle(Theme.accent)
    }
  }

  /// The row's second line. For Account this mirrors the tab's own subtitle
  /// convention: the signed-in email, or an invitation to sign in for a guest.
  private func subtitle(for destination: MoreDestination) -> String {
    switch destination {
    case .account:
      if case .signedIn(let email) = appState.authState {
        return email
      }
      return "Sign in"
    }
  }
}

#if DEBUG
#Preview("Guest") {
  MoreView()
    .environment(AppState())
    .oakServices(.preview())
}

#Preview("Signed in") {
  let state = AppState()
  state.completeSignIn(email: "ash@pallet.town")
  return MoreView()
    .environment(state)
    .oakServices(.preview())
}
#endif
