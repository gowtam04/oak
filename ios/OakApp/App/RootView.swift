import SwiftUI

/// Top-level navigation shell: a five-tab `TabView` (Chat / Teams / Usage / Dex /
/// Settings). Calc stays a cover, not a tab (ADR-6). Chat is the default surface
/// on launch (M-AC-UI2.1); conversation history is folded into the Chat tab
/// WhatsApp-style. Teams hosts the living Champions library plus archive. Usage
/// is the public live ladder. Dex browses the Champions roster. Settings is a
/// first-class tab (account, appearance, about).
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
  @Environment(\.scenePhase) private var scenePhase
  @Environment(AppState.self) private var appState
  @Environment(UpdateViewModel.self) private var updateModel

  /// The selected tab, tracked so tab changes can fire haptics + a symbol bounce.
  @State private var selection: AppTab = .chat
  @State private var presentedShareId: String?
  @State private var calculatorCover: CalculatorCover?

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
      Tab(value: AppTab.usage) {
        UsageView(
          model: UsageViewModel(
            usage: services.usage,
            isSignedIn: {
              if case .signedIn = appState.authState { return true }
              return false
            }()
          )
        )
      } label: {
        Label("Usage", systemImage: "chart.bar")
          .symbolEffect(.bounce, value: selection == .usage)
      }
      Tab(value: AppTab.dex) {
        DexView()
      } label: {
        Label("Dex", systemImage: "books.vertical")
          .symbolEffect(.bounce, value: selection == .dex)
      }
      Tab(value: AppTab.settings) {
        NavigationStack {
          AccountView(model: AccountViewModel(auth: services.auth, appState: appState))
        }
        .oakEnamelNav()
      } label: {
        Label("Settings", systemImage: "gearshape")
          .symbolEffect(.bounce, value: selection == .settings)
      }
    }
    // Canvas fills any tab-bar overlay region so iOS 26's floating capsule
    // never reveals window-black. `oakTabBarUnminimized` stops scroll-minimize
    // from collapsing the capsule and leaving a blank band.
    .background(Theme.canvas.ignoresSafeArea())
    .oakTabBarUnminimized()
    .tint(Theme.accent)
    .environment(\.showsAddToTeam, isSignedIn)
    .onChange(of: selection) { _, _ in Haptics.tap() }
    .task {
      await appState.restoreSession(using: services.auth)
      await updateModel.checkIfNeeded()
    }
    .onChange(of: scenePhase) { _, phase in
      // Foreground re-check is throttled inside the view model (24h).
      if phase == .active {
        Task { await updateModel.checkIfNeeded() }
      }
    }
    .onChange(of: appState.authState) { _, newValue in
      if case .signedIn = newValue {
        Task { await appState.importGuestThread(using: services.history) }
      }
    }
    .onChange(of: appState.pendingDestination) { _, destination in
      guard let destination else { return }
      switch destination {
      case .teams, .team:
        selection = .teams
      case .dex, .dexHop:
        selection = .dex
      case let .calculator(scenario):
        calculatorCover = CalculatorCover(scenario: scenario)
        appState.pendingDestination = nil
      case .conversation:
        selection = .chat
      case let .share(id):
        presentedShareId = id
        appState.pendingDestination = nil
      case .usage:
        selection = .usage
      }
    }
    .sheet(item: Binding(
      get: { presentedShareId.map { IdentifiedShare(id: $0) } },
      set: { presentedShareId = $0?.id }
    )) { item in
      ShareSnapshotView(shareId: item.id)
    }
    .onOpenURL { url in
      if let id = Self.shareId(from: url) {
        presentedShareId = id
      }
    }
    .sheet(
      item: Binding(
        get: { updateModel.pendingSoftUpdate },
        set: { newValue in
          // Swipe-to-dismiss / system dismiss → same as "Not now" (snooze).
          if newValue == nil, updateModel.pendingSoftUpdate != nil {
            updateModel.dismissSoftUpdate()
          }
        }
      )
    ) { offer in
      UpdateAvailableSheet(
        offer: offer,
        onUpdate: { updateModel.openStore() },
        onNotNow: { updateModel.dismissSoftUpdate() }
      )
    }
    .fullScreenCover(item: $calculatorCover) { cover in
      CalculatorDestinationView(
        calc: services.calc,
        format: .champions,
        scenario: cover.scenario,
        onExplain: { prompt in
          appState.pendingChatSend = prompt
          calculatorCover = nil
          selection = .chat
        },
        onDismiss: { calculatorCover = nil }
      )
    }
    .sheet(isPresented: addToTeamPresented) {
      if let incoming = appState.pendingAddToTeam {
        AddToTeamSheet(
          model: AddToTeamViewModel(
            teams: services.teams,
            isSignedIn: true,
            conversationFormat: .champions,
            incoming: incoming
          ),
          onOpened: { id, _ in
            appState.pendingAddToTeam = nil
            appState.pendingDestination = .team(id: id)
          }
        )
      }
    }
  }

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
  }

  private var addToTeamPresented: Binding<Bool> {
    Binding(
      get: { isSignedIn && appState.pendingAddToTeam != nil },
      set: { if !$0 { appState.pendingAddToTeam = nil } }
    )
  }
}

private struct CalculatorCover: Identifiable {
  let id = UUID()
  let scenario: CalcScenario?
}

/// Full-screen first-class calculator (CALC-AC-1.2). Carries the overlay scenario
/// on Expand so the form is not reset.
private struct CalculatorDestinationView: View {
  let calc: any CalcService
  let format: Format
  let scenario: CalcScenario?
  var onExplain: (String) -> Void
  var onDismiss: () -> Void

  @State private var model: CalculatorViewModel?

  var body: some View {
    Group {
      if let model {
        CalculatorView(
          model: model,
          onExplain: { onExplain($0) },
          onDismiss: onDismiss
        )
      } else {
        ProgressView()
      }
    }
    .onAppear {
      let vm = CalculatorViewModel(calc: calc, format: format, presentation: .fullScreen)
      if let scenario {
        vm.applyPrefill(scenario)
      }
      model = vm
    }
  }
}

private struct IdentifiedShare: Identifiable {
  let id: String
}

extension RootView {
  /// `/a/{id}` on the Oak origin (public share links).
  static func shareId(from url: URL) -> String? {
    let parts = url.pathComponents.filter { $0 != "/" }
    guard parts.count >= 2, parts[0] == "a" else { return nil }
    let id = parts[1]
    return id.isEmpty ? nil : id
  }
}

#Preview {
  RootView()
    .environment(AppState())
    .oakServices(.preview())
}
