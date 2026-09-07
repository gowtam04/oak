import SwiftUI
import Testing
import UIKit

@testable import OakApp

/// Pins enamel chrome contracts: opaque nav appearance, the four-tab dock
/// vocabulary, and that the system tab-bar translucency gate is gone (the
/// visible dock is ``OakTabDock``, not `UITabBar`).
@MainActor
struct OakChromeTests {
  @Test
  func oakAppTabHasFourCases() {
    #expect(OakAppTab.allCases == [.chat, .teams, .dex, .settings])
    #expect(OakAppTab.chat.title == "Chat")
    #expect(OakAppTab.teams.systemImage == "square.grid.3x2.fill")
  }

  @Test
  func applyBarAppearancePaintsOpaqueEnamelNav() {
    OakChrome.applyBarAppearance()
    let nav = UINavigationBar.appearance()
    #expect(nav.standardAppearance.backgroundColor != nil)
    #expect(nav.isTranslucent == false)
  }

  @Test
  func tabDockAndPaperSheetModifiersCompile() {
    _ = OakTabDock(selection: .constant(.chat))
    _ = Color.clear.oakEnamelNav()
    _ = Color.clear.oakPaperSheet()
    _ = Color.clear.oakHidesSystemTabBar()
    _ = Color.clear.oakDisableScrollEdgeGlass()
    #expect(Bool(true))
  }
}
