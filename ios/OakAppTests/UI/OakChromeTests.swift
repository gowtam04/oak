import SwiftUI
import Testing
import UIKit

@testable import OakApp

/// Pins enamel chrome contracts: opaque nav appearance, the five-tab dock
/// vocabulary (ADR-6), and that the system tab-bar translucency gate is gone
/// (the visible dock is ``OakTabDock``, not `UITabBar`).
@MainActor
struct OakChromeTests {
  @Test
  func oakAppTabHasFiveCases() {
    #expect(OakAppTab.allCases == [.chat, .teams, .usage, .dex, .settings])
    #expect(OakAppTab.chat.title == "Chat")
    #expect(OakAppTab.usage.title == "Usage")
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

  @Test
  func tabDockBottomLiftClearsHomeIndicator() {
    #expect(OakTabDockMetrics.bottomLift(inset: 34) == 12)
    #expect(OakTabDockMetrics.bottomLift(inset: 0) == 0)
    #expect(OakTabDockMetrics.bottomLift(inset: 10) == 0)
  }
}
