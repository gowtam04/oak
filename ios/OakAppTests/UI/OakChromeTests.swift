import SwiftUI
import Testing
import UIKit

@testable import OakApp

/// Pins the iOS 26 tab-dock translucency gate. Appearance proxies are
/// process-global, so these tests call `applyBarAppearance()` and read
/// `UITabBar.appearance()` — they do not render pixels.
@MainActor
struct OakChromeTests {
  @Test
  func opaqueTabDockIsNotForcedOnIOS26() {
    if #available(iOS 26.0, *) {
      #expect(!OakChrome.forcesOpaqueTabDock)
    } else {
      #expect(OakChrome.forcesOpaqueTabDock)
    }
  }

  @Test
  func applyBarAppearanceMatchesDockGate() {
    OakChrome.applyBarAppearance()
    // UIAppearance getters do not round-trip; a fresh bar picks up the proxy.
    let tabBar = UITabBar()
    #expect(tabBar.isTranslucent == !OakChrome.forcesOpaqueTabDock)
    #expect(UITabBar.appearance().standardAppearance.backgroundColor != nil)
  }
}
