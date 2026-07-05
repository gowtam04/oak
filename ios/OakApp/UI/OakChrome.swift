import SwiftUI
import UIKit

/// Oak's chrome layer — the parts of the brand that make a screen read as Oak the
/// moment it lights up: canvas-colored nav/tab bars (not Apple's translucent
/// material), the 2pt red thread at the top of every root screen, and the wordmark
/// lockup. Kept out of `Theme.swift` (pure tokens) because these touch UIKit
/// appearance proxies and compose views.
enum OakChrome {
  /// Installs Oak's global `UIBarAppearance` so every `NavigationStack` nav bar and
  /// the root `TabView` tab bar render on the **canvas** paper with a hairline
  /// `separator` bottom edge, Fredoka nav titles, and a red-tinted selected tab —
  /// replacing the default translucent system material (diagnosis §1, tell #3).
  ///
  /// Called once at app launch. Appearance proxies are process-global and the
  /// colors are dynamic `UIColor`s, so light/dark tracking is automatic.
  @MainActor
  static func applyBarAppearance() {
    // Fredoka titles when the face is available; system font otherwise.
    let titleFont = UIFont(name: "Fredoka-SemiBold", size: 17)
    let largeTitleFont = UIFont(name: "Fredoka-SemiBold", size: 32)

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
  /// The web page's 2pt `--poke-red` top border, translated: a full-width accent
  /// rule pinned at the top of a root screen's content band, just under the nav
  /// bar (SwiftUI doesn't expose the nav bar's own top edge without UIKit hacks,
  /// so the top of the content band is the faithful, robust anchor). Decorative
  /// (hidden from VoiceOver) and static, so no Reduce Motion concern.
  func oakRedThread() -> some View {
    safeAreaInset(edge: .top, spacing: 0) {
      Rectangle()
        .fill(Theme.accent)
        .frame(maxWidth: .infinity)
        .frame(height: 2)
        .accessibilityHidden(true)
    }
  }
}

/// Oak's wordmark lockup — the rounded-square brand tile (icon.svg geometry:
/// `#EE5A5A` square, white "O" ring) beside the Fredoka "Oak" wordmark. Used as
/// the Chat root's leading nav item (§4.1). Decorative tile + text; exposed to
/// VoiceOver as the single label "Oak".
struct OakWordmarkLockup: View {
  /// The tile edge length. Defaults to the nav-header size; the empty-state hero
  /// passes ~48.
  var tileSize: CGFloat = 24
  /// The wordmark's Dynamic Type anchor — `.title3` in the header, `.largeTitle`
  /// (Fredoka 34) for the hero.
  var titleStyle: Font.TextStyle = .title3
  /// Whether the tile carries a raised shadow (the hero lifts off the canvas).
  var elevated: Bool = false
  /// Whether the "Oak" wordmark is shown beside the tile. The nav-leading slot
  /// passes `false` — iOS 26 wraps a leading toolbar item in a circular glass
  /// chip that would crop a wide tile+text lockup, so only the (square) tile,
  /// which fits the chip cleanly, is shown there. The hero keeps the full lockup.
  var showsWordmark: Bool = true

  var body: some View {
    HStack(spacing: tileSize * 0.28) {
      RoundedRectangle(cornerRadius: tileSize * 0.25, style: .continuous)
        .fill(Theme.accent)
        .frame(width: tileSize, height: tileSize)
        .overlay(
          Circle()
            .strokeBorder(.white, lineWidth: tileSize * 0.13)
            .frame(width: tileSize * 0.52, height: tileSize * 0.52)
        )
        .modifier(OptionalRaisedShadow(active: elevated))
      if showsWordmark {
        Text("Oak")
          .font(Theme.display(titleStyle))
          .foregroundStyle(Theme.textStrong)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Oak")
    .accessibilityAddTraits(.isHeader)
  }
}

/// Applies `Theme.Shadow.raised` only when `active` — used so the wordmark tile
/// lifts off the canvas in the empty-state hero but stays flat in the nav header.
private struct OptionalRaisedShadow: ViewModifier {
  let active: Bool
  func body(content: Content) -> some View {
    if active {
      content.oakShadow(.raised)
    } else {
      content
    }
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
