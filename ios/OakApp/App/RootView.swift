import SwiftUI

/// Top-level navigation shell: five always-mounted panes (Chat / Teams / Usage /
/// Dex / Settings) with ``OakTabDock`` as the only tab control — no system
/// `TabView`. Calc stays a cover, not a tab (ADR-6). Chat is the default surface
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
/// Chrome: ``OakTabDock`` (full-bleed paper shelf, coral selected labels) is
/// the only tab control, so iOS 26 never draws Liquid Glass or steals dock taps.
/// A switch fires `Haptics.tap()` and the selected icon plays a one-shot
/// `.symbolEffect(.bounce)`. The bounce is decorative (the label carries the
/// meaning); SwiftUI's symbol effects already no-op under Reduce Motion.
struct RootView: View {
  @Environment(\.services) private var services
  @Environment(\.scenePhase) private var scenePhase
  @Environment(AppState.self) private var appState
  @Environment(UpdateViewModel.self) private var updateModel

  /// The selected tab, tracked so tab changes can fire haptics + a symbol bounce.
  @State private var selection: OakAppTab = .chat
  @State private var presentedShareId: String?
  @State private var calculatorCover: CalculatorCover?
  /// Keyboard coverage above the home indicator. Used to pin the overlay dock
  /// at the physical bottom (offset down, covered) and collapse the hidden
  /// spacer so the composer sits on the keyboard instead of on the dock.
  @State private var keyboardOverlap: CGFloat = 0
  /// Intrinsic layout height of ``OakTabDock``, measured from the overlay (the
  /// spacer is height-clamped and cannot be the source of truth).
  @State private var dockHeight: CGFloat = 0

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        tabPane(.chat) {
          ChatTabView()
        }
        tabPane(.teams) {
          TeamsListView(
            model: TeamsListViewModel(teamService: services.teams, dexLookup: services.dexLookup)
          )
        }
        tabPane(.usage) {
          UsageView(
            model: UsageViewModel(
              usage: services.usage,
              isSignedIn: {
                if case .signedIn = appState.authState { return true }
                return false
              }()
            )
          )
        }
        tabPane(.dex) {
          DexView()
        }
        tabPane(.settings) {
          NavigationStack {
            AccountView(model: AccountViewModel(auth: services.auth, appState: appState))
          }
          .oakEnamelNav()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      // Canvas fills any leftover system-bar overlay so a launch flash never
      // reveals window-black. The visible dock is ``OakTabDock`` (paper shelf),
      // stacked below the tabs so Chat's composer and lists are never covered.
      .background(Theme.canvas.ignoresSafeArea())
      .oakDisableScrollEdgeGlass()
      // Hidden sibling keeps the dock's layout height in the VStack so Chat's
      // composer is never covered. NavigationStack's UIKit view is full-window
      // and would steal dock taps if the interactive shelf lived only here.
      // When the keyboard covers the dock, reservation collapses to 0 so the
      // composer lands on the keyboard rather than a dock-sized gap above it.
      OakTabDock(selection: $selection)
        .hidden()
        .accessibilityHidden(true)
        .allowsHitTesting(false)
        .frame(height: dockHeight == 0 ? nil : dockReservation, alignment: .top)
        .clipped()
    }
    .overlay(alignment: .bottom) {
      // Offset — not `.ignoresSafeArea(.keyboard)` — because ignoring the
      // keyboard expands the dock downward from the keyboard-safe bottom and
      // leaves the labels riding the keyboard.
      OakTabDock(selection: $selection)
        .background {
          GeometryReader { geo in
            Color.clear
              .onAppear { dockHeight = geo.size.height }
              .onChange(of: geo.size.height) { _, height in dockHeight = height }
          }
        }
        .offset(y: keyboardOverlap)
    }
    .oakKeyboardOverlap($keyboardOverlap)
    .background(Theme.canvas.ignoresSafeArea())
    .tint(Theme.accent)
    .environment(\.showsAddToTeam, isSignedIn)
    .onChange(of: selection) { _, _ in Haptics.tap() }
    .task {
      await appState.restoreSession(using: services.auth)
      await appState.refreshRegulation(using: services.regulation)
      await updateModel.checkIfNeeded()
    }
    .onChange(of: scenePhase) { _, phase in
      // Foreground re-check is throttled inside the view model (24h).
      if phase == .active {
        Task {
          await appState.refreshRegulation(using: services.regulation)
          await updateModel.checkIfNeeded()
        }
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
        .oakPaperSheet()
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
      .oakPaperSheet()
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
  }

  private var dockReservation: CGFloat {
    OakTabDockMetrics.dockReservation(dockHeight: dockHeight, keyboardOverlap: keyboardOverlap)
  }

  @ViewBuilder
  private func tabPane<Content: View>(_ tab: OakAppTab, @ViewBuilder content: () -> Content) -> some View {
    content()
      .opacity(selection == tab ? 1 : 0)
      .allowsHitTesting(selection == tab)
      .accessibilityHidden(selection != tab)
      .zIndex(selection == tab ? 1 : 0)
  }

  private var isSignedIn: Bool {
    if case .signedIn = appState.authState { return true }
    return false
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
