import SwiftUI
import UIKit

/// Oak's chrome layer — the parts of the brand that make a screen read as Oak the
/// moment it lights up: canvas-colored nav/tab bars (not Apple's translucent
/// material) and the `Oak.` wordmark lockup. Kept out of `Theme.swift` (pure
/// tokens) because these touch UIKit appearance proxies and compose views.
enum OakChrome {
  /// Installs Oak's global `UIBarAppearance` so every `NavigationStack` nav bar and
  /// the root `TabView` tab bar render on the **canvas** paper with a hairline
  /// `separator` bottom edge, Figtree nav titles, and a red-tinted selected
  /// tab — replacing the default translucent system material (diagnosis §1, tell #3).
  ///
  /// Called once at app launch. Appearance proxies are process-global and the
  /// colors are dynamic `UIColor`s, so light/dark tracking is automatic.
  @MainActor
  static func applyBarAppearance() {
    // Figtree titles when the face is available; system font otherwise.
    let titleFont = UIFont(name: "Figtree-SemiBold", size: 17)
    let largeTitleFont = UIFont(name: "Figtree-SemiBold", size: 28)

    let nav = UINavigationBarAppearance()
    nav.configureWithOpaqueBackground()
    nav.backgroundColor = Theme.uiCanvas
    // A hairline bottom edge instead of the default system shadow/blur.
    nav.shadowColor = Theme.uiSeparator
    var titleAttrs: [NSAttributedString.Key: Any] = [.foregroundColor: Theme.uiTextStrong]
    if let titleFont { titleAttrs[.font] = titleFont }
    nav.titleTextAttributes = titleAttrs
    var largeAttrs: [NSAttributedString.Key: Any] = [.foregroundColor: Theme.uiTextStrong]
    if let largeTitleFont { largeAttrs[.font] = largeTitleFont }
    nav.largeTitleTextAttributes = largeAttrs

    UINavigationBar.appearance().standardAppearance = nav
    UINavigationBar.appearance().scrollEdgeAppearance = nav
    UINavigationBar.appearance().compactAppearance = nav
    UINavigationBar.appearance().tintColor = Theme.uiAccent

    let tab = UITabBarAppearance()
    tab.configureWithOpaqueBackground()
    tab.backgroundColor = Theme.uiCanvas
    tab.shadowColor = Theme.uiSeparator
    // Red for the selected item; muted warm ink at rest — color is paired with the
    // always-present label text, so it's never the sole carrier of meaning.
    for item in [tab.stackedLayoutAppearance, tab.inlineLayoutAppearance, tab.compactInlineLayoutAppearance] {
      item.selected.iconColor = Theme.uiAccent
      item.selected.titleTextAttributes = [.foregroundColor: Theme.uiAccent]
      item.normal.iconColor = Theme.uiTextSecondary
      item.normal.titleTextAttributes = [.foregroundColor: Theme.uiTextSecondary]
    }
    UITabBar.appearance().standardAppearance = tab
    UITabBar.appearance().scrollEdgeAppearance = tab
  }
}

extension View {
  /// Retired: Signal forbids a red header slab. Kept as a no-op so leftover
  /// call sites compile; do not reintroduce the 2pt accent bar.
  func oakRedThread() -> some View { self }
}

/// Oak's wordmark lockup — Figtree "Oak" plus a red period. No tile, no white
/// ring, no concentric rings. Used as the Chat root's leading nav item.
/// Exposed to VoiceOver as the single label "Oak".
struct OakWordmarkLockup: View {
  /// Unused (kept so existing call sites compile). The Signal lockup is type
  /// only — never a brand tile.
  var tileSize: CGFloat = 24
  /// The wordmark's Dynamic Type anchor — `.headline` (~18pt) in the header.
  var titleStyle: Font.TextStyle = .headline
  /// Unused (kept so existing call sites compile). No tile to elevate.
  var elevated: Bool = false
  /// Unused for layout: Signal always shows `Oak.` — never a tile — even when
  /// a caller passes `false` (the old tile-only nav slot).
  var showsWordmark: Bool = true

  var body: some View {
    // Retained API knobs (tile / elevation / hide-wordmark) no longer change
    // the lockup — Signal is always `Oak.` with a red period.
    let _ = (tileSize, elevated, showsWordmark)
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      Text("Oak")
        .foregroundStyle(Theme.textStrong)
      Text(".")
        .foregroundStyle(Theme.accent)
    }
    .font(Theme.display(titleStyle))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Oak")
    .accessibilityAddTraits(.isHeader)
  }
}

#if DEBUG
#Preview("Wordmark lockup") {
  VStack(spacing: 24) {
    OakWordmarkLockup()
    OakWordmarkLockup(tileSize: 40)
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.canvas)
}
#endif
