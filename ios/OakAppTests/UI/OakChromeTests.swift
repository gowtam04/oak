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

  @Test
  func keyboardOverlapIgnoresHomeIndicator() {
    #expect(OakTabDockMetrics.keyboardOverlap(bottomInset: 34, homeIndicator: 34) == 0)
    #expect(OakTabDockMetrics.keyboardOverlap(bottomInset: 336, homeIndicator: 34) == 302)
    #expect(OakTabDockMetrics.keyboardOverlap(bottomInset: 300, homeIndicator: 0) == 300)
    #expect(OakTabDockMetrics.keyboardOverlap(bottomInset: 10, homeIndicator: 34) == 0)
  }

  @Test
  func screenCoverIsZeroWhenKeyboardIsOffscreen() {
    let window = CGRect(x: 0, y: 0, width: 390, height: 844)
    let hidden = CGRect(x: 0, y: 844, width: 390, height: 336)
    let shown = CGRect(x: 0, y: 508, width: 390, height: 336)
    #expect(OakTabDockMetrics.screenCover(keyboardFrameInWindow: hidden, windowBounds: window) == 0)
    #expect(OakTabDockMetrics.screenCover(keyboardFrameInWindow: shown, windowBounds: window) == 336)
  }

  @Test
  func dockReservationCollapsesOnceKeyboardCoversDock() {
    #expect(OakTabDockMetrics.dockReservation(dockHeight: 83, keyboardOverlap: 0) == 83)
    #expect(OakTabDockMetrics.dockReservation(dockHeight: 83, keyboardOverlap: 40) == 43)
    #expect(OakTabDockMetrics.dockReservation(dockHeight: 83, keyboardOverlap: 302) == 0)
    #expect(OakTabDockMetrics.dockReservation(dockHeight: 83, keyboardOverlap: 400) == 0)
  }
}
