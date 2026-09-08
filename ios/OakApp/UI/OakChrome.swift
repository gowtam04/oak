import SwiftUI
import UIKit

/// The five root destinations (ADR-6). Named `OakAppTab` to avoid colliding with
/// SwiftUI's `Tab`. Display order: Chat / Teams / Usage / Dex / Settings.
/// Calc stays a cover, not a tab. `Hashable` so it can key dock bounce state.
enum OakAppTab: String, Hashable, CaseIterable, Sendable {
  case chat
  case teams
  case usage
  case dex
  case settings

  var title: String {
    switch self {
    case .chat: "Chat"
    case .teams: "Teams"
    case .usage: "Usage"
    case .dex: "Dex"
    case .settings: "Settings"
    }
  }

  var systemImage: String {
    switch self {
    case .chat: "bubble.left.and.text.bubble.right"
    case .teams: "square.grid.3x2.fill"
    case .usage: "chart.bar"
    case .dex: "books.vertical"
    case .settings: "gearshape"
    }
  }
}

/// Oak's chrome layer — the enamel lid (opaque coral nav through the status bar)
/// and paper tab dock. Kept out of `Theme.swift` (pure tokens) because these
/// touch UIKit appearance proxies and compose views.
enum OakChrome {
  /// Installs Oak's global `UIBarAppearance` so every `NavigationStack` nav bar
  /// is **opaque enamel** (`uiPokeRed`) — never system material / Liquid Glass.
  ///
  /// The root tab bar is **not** the system `UITabBar`: `RootView` hosts panes
  /// in a `ZStack` and draws ``OakTabDock``. Tab-bar appearance is still painted
  /// opaque as a safety net if a system bar flashes during launch.
  ///
  /// Called once at app launch. Appearance proxies are process-global and the
  /// colors are dynamic `UIColor`s, so light/dark tracking is automatic.
  @MainActor
  static func applyBarAppearance() {
    let titleFont = UIFont(name: "Fredoka-SemiBold", size: 17)
    let largeTitleFont = UIFont(name: "Fredoka-SemiBold", size: 28)

    let nav = UINavigationBarAppearance()
    nav.configureWithOpaqueBackground()
    nav.backgroundColor = Theme.uiPokeRed
    // 12% mix of neutral-900 into poke-red-active — opaque hairline, no blur.
    nav.shadowColor = uiEnamelEdge
    var titleAttrs: [NSAttributedString.Key: Any] = [.foregroundColor: Theme.uiOnRed]
    if let titleFont { titleAttrs[.font] = titleFont }
    nav.titleTextAttributes = titleAttrs
    var largeAttrs: [NSAttributedString.Key: Any] = [.foregroundColor: Theme.uiOnRed]
    if let largeTitleFont { largeAttrs[.font] = largeTitleFont }
    nav.largeTitleTextAttributes = largeAttrs

    let navBar = UINavigationBar.appearance()
    navBar.standardAppearance = nav
    navBar.scrollEdgeAppearance = nav
    navBar.compactAppearance = nav
    navBar.compactScrollEdgeAppearance = nav
    navBar.tintColor = Theme.uiOnRed
    navBar.isTranslucent = false

    let tab = UITabBarAppearance()
    tab.configureWithOpaqueBackground()
    tab.backgroundColor = Theme.uiSurface
    tab.shadowColor = Theme.uiSeparator
    for item in [tab.stackedLayoutAppearance, tab.inlineLayoutAppearance, tab.compactInlineLayoutAppearance] {
      item.selected.iconColor = Theme.uiAccent
      item.selected.titleTextAttributes = [.foregroundColor: Theme.uiAccent]
      item.normal.iconColor = Theme.uiTextSecondary
      item.normal.titleTextAttributes = [.foregroundColor: Theme.uiTextSecondary]
    }
    let tabBar = UITabBar.appearance()
    tabBar.standardAppearance = tab
    tabBar.scrollEdgeAppearance = tab
  }

  /// Opaque 12% mix of `#231F1C` (neutral-900) into poke-red-active.
  /// Light active `#C93B3B`; dark active `#B33A3A`.
  private static let uiEnamelEdge = UIColor { traits in
    let active: UInt32 = traits.userInterfaceStyle == .dark ? 0xB33A3A : 0xC93B3B
    return mix(rgb: 0x231F1C, over: active, amount: 0.12)
  }

  private static func mix(rgb a: UInt32, over b: UInt32, amount: CGFloat) -> UIColor {
    func channel(_ value: UInt32, shift: UInt32) -> CGFloat {
      CGFloat((value >> shift) & 0xFF) / 255
    }
    let t = amount
    let u = 1 - amount
    return UIColor(
      red: channel(a, shift: 16) * t + channel(b, shift: 16) * u,
      green: channel(a, shift: 8) * t + channel(b, shift: 8) * u,
      blue: channel(a, shift: 0) * t + channel(b, shift: 0) * u,
      alpha: 1
    )
  }
}

extension View {
  /// Opaque enamel navigation bar on every `NavigationStack`. Pairs with
  /// `OakChrome.applyBarAppearance()` so status bar + nav bar are one coral fill
  /// with white ink. Do not map this to Liquid Glass.
  func oakEnamelNav() -> some View {
    self
      .toolbarColorScheme(.dark, for: .navigationBar)
      .toolbarBackground(Theme.accent, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .oakDisableScrollEdgeGlass()
  }

  /// Retired: the lid *is* the red slab (painted by `applyBarAppearance` /
  /// `oakEnamelNav`). Kept as a no-op so leftover call sites compile. Do not
  /// reintroduce a 2pt thread on cream.
  func oakRedThread() -> some View { self }

  /// Paper canvas fill for sheets — kills iOS 26's frosted presentation chrome.
  /// Callers still set their own detents.
  func oakPaperSheet() -> some View {
    self
      .presentationBackground(Theme.canvas)
      .presentationCornerRadius(24)
      .presentationDragIndicator(.visible)
  }

  /// Hides the system `TabView` bar (including iOS 26's Liquid Glass capsule)
  /// so ``OakTabDock`` is the only tab chrome.
  func oakHidesSystemTabBar() -> some View {
    self
      .toolbar(.hidden, for: .tabBar)
      .toolbarBackground(.hidden, for: .tabBar)
  }

  /// iOS 26 auto-blurs scroll content under system bars. Enamel lids and the
  /// paper dock are opaque, so the fade is just leftover glass — disable it.
  @ViewBuilder
  func oakDisableScrollEdgeGlass() -> some View {
    if #available(iOS 26.0, *) {
      self.scrollEdgeEffectHidden()
    } else {
      self
    }
  }
}

extension ToolbarContent {
  /// Hides iOS 26's shared glass capsule on a toolbar item. Enamel lid
  /// chrome is opaque paint; this is an opt-out, not a glass recipe.
  @ToolbarContentBuilder
  func oakLidItem() -> some ToolbarContent {
    if #available(iOS 26.0, *) {
      self.sharedBackgroundVisibility(.hidden)
    } else {
      self
    }
  }
}

/// Opaque paper tab shelf that replaces iOS 26's Liquid Glass `TabView` bar.
/// Full-bleed `--surface` through the home indicator, 1px `--border` hairline
/// on top, coral selected labels — no capsule, no selected pill, no shadow.
///
/// `RootView`'s `VStack` lays out in the safe rect, which would leave a full
/// home-indicator band empty under the labels. ``bottomLift`` drops the items
/// into that inset so they sit just above the pill; the surface paint already
/// fills to the screen edge.
enum OakTabDockMetrics {
  /// Clearance above the home-indicator pill.
  /// `lg` (16) sat too close; zero lift sat a full inset band too high.
  static let homeIndicatorClearance: CGFloat = 22

  static func bottomLift(inset: CGFloat) -> CGFloat {
    max(inset - homeIndicatorClearance, 0)
  }
}

struct OakTabDock: View {
  @Binding var selection: OakAppTab
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var bounceGeneration: [OakAppTab: Int] = [:]

  var body: some View {
    HStack(spacing: 0) {
      ForEach(OakAppTab.allCases, id: \.self) { tab in
        dockItem(tab)
      }
    }
    .padding(.top, Theme.Spacing.xs)
    .frame(maxWidth: .infinity)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Theme.separator)
        .frame(height: 1)
        .allowsHitTesting(false)
    }
    .background(Theme.surface.ignoresSafeArea(edges: .bottom))
    .padding(.bottom, -bottomLift)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("oak-tab-dock")
  }

  /// Pull items down by the bottom inset minus ``OakTabDockMetrics`` clearance
  /// so labels stay above the home-indicator pill. Home-button devices
  /// (inset 0) stay put. Read from the key window because SwiftUI has no
  /// `safeAreaInsets` environment key, and a `GeometryReader` inside the
  /// already-inset `VStack` reports 0.
  private var bottomLift: CGFloat {
    OakTabDockMetrics.bottomLift(inset: Self.keyWindowBottomInset)
  }

  private static var keyWindowBottomInset: CGFloat {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    let window = windows.first(where: \.isKeyWindow) ?? windows.first
    return window?.safeAreaInsets.bottom ?? 0
  }

  private func dockItem(_ tab: OakAppTab) -> some View {
    let isSelected = selection == tab
    return Button {
      guard selection != tab else { return }
      // Assign selection outside withAnimation — wrapping it swallows the
      // one-shot symbol bounce on the newly selected icon.
      selection = tab
      if !reduceMotion { bounceGeneration[tab, default: 0] += 1 }
    } label: {
      VStack(spacing: 2) {
        Image(systemName: tab.systemImage)
          .font(.system(size: 20, weight: .semibold))
          .symbolEffect(.bounce, options: .nonRepeating, value: bounceGeneration[tab, default: 0])
        Text(tab.title)
          .font(Theme.body(.caption2, weight: .semibold))
          .lineLimit(1)
      }
      .foregroundStyle(isSelected ? Theme.accent : Theme.textSecondary)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: isSelected)
      .frame(maxWidth: .infinity)
      .padding(.top, Theme.Spacing.sm)
      .padding(.bottom, Theme.Spacing.xs)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .contentShape(Rectangle())
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityRemoveTraits(isSelected ? [] : .isSelected)
  }
}

/// Oak's wordmark lockup — 32pt coral tile (white O ring) plus white Fredoka
/// "Oak". Used as the Chat root's leading nav item. Exposed to VoiceOver as
/// the single label "Oak".
struct OakWordmarkLockup: View {
  /// Lid tile size in points. Default 32 matches the mock mark.
  var tileSize: CGFloat = 32
  /// The wordmark's Dynamic Type anchor — `.headline` (~17pt) in the header.
  var titleStyle: Font.TextStyle = .headline
  /// Extra white ring + drop shadow when the lockup sits on the enamel lid.
  var elevated: Bool = true
  /// When `false`, the tile is shown without the "Oak" word.
  var showsWordmark: Bool = true

  var body: some View {
    HStack(alignment: .center, spacing: Theme.Spacing.sm) {
      OakBrandMark(size: tileSize)
        .overlay {
          if elevated {
            RoundedRectangle(cornerRadius: tileSize * 7 / 32, style: .continuous)
              .strokeBorder(Color.white.opacity(0.62), lineWidth: 2)
              .padding(-2)
          }
        }
        .shadow(
          color: elevated ? Color.black.opacity(0.24) : .clear,
          radius: 1,
          y: 1
        )
      if showsWordmark {
        Text("Oak")
          .font(Theme.display(titleStyle))
          .foregroundStyle(elevated ? Theme.onRed : Theme.textStrong)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Oak")
    .accessibilityAddTraits(.isHeader)
  }
}

#if DEBUG
#Preview("Wordmark lockup") {
  VStack(spacing: 24) {
    OakWordmarkLockup()
      .padding()
      .background(Theme.accent)
    OakWordmarkLockup(tileSize: 40)
      .padding()
      .background(Theme.accent)
    OakWordmarkLockup(elevated: false)
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.canvas)
}

#Preview("Tab dock") {
  @Previewable @State var selection: OakAppTab = .chat
  VStack {
    Spacer()
    OakTabDock(selection: $selection)
  }
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.canvas)
}
#endif
