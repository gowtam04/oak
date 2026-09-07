import SwiftUI
import UIKit

/// Oak's chrome layer — the enamel lid (opaque coral nav through the status bar)
/// and paper tab dock. Kept out of `Theme.swift` (pure tokens) because these
/// touch UIKit appearance proxies and compose views.
enum OakChrome {
  /// iOS 18 can force a full-width opaque paper dock. iOS 26's tab bar is a
  /// floating capsule; `UITabBar.isTranslucent = false` still reserves the old
  /// dock height and leaves it unpainted (black void above the capsule).
  static var forcesOpaqueTabDock: Bool {
    if #available(iOS 26.0, *) { return false }
    return true
  }

  /// Installs Oak's global `UIBarAppearance` so every `NavigationStack` nav bar
  /// is **opaque enamel** (`uiPokeRed`) and the root `TabView` tab bar is paper
  /// (`uiSurface`) — never system material / Liquid Glass.
  ///
  /// Called once at app launch. Appearance proxies are process-global and the
  /// colors are dynamic `UIColor`s, so light/dark tracking is automatic.
  ///
  /// Tab-bar *colors* apply on every OS. Tab-bar *translucency* is gated by
  /// ``forcesOpaqueTabDock`` — see that flag's doc for the iOS 26 inset bug.
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
    // Explicit on both sides: opaque appearance can leave the flag false
    // even when we skip the iOS 18 assignment.
    tabBar.isTranslucent = !forcesOpaqueTabDock
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
  }

  /// Retired: the lid *is* the red slab (painted by `applyBarAppearance` /
  /// `oakEnamelNav`). Kept as a no-op so leftover call sites compile. Do not
  /// reintroduce a 2pt thread on cream.
  func oakRedThread() -> some View { self }

  /// iOS 26 can shrink the floating tab capsule on scroll, which reopens a
  /// blank band under content. Pin the capsule so every tab keeps a stable
  /// bottom edge. No-op below iOS 26 (no minimize behavior).
  func oakTabBarUnminimized() -> some View {
    modifier(OakTabBarUnminimized())
  }
}

private struct OakTabBarUnminimized: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      content.tabBarMinimizeBehavior(.never)
    } else {
      content
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
#endif
