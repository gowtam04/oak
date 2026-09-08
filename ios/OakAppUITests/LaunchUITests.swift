import XCTest

/// Launch smoke (hermetic — no backend). The app boots to the tab shell — Chat
/// and Settings — with Chat as the default surface (M-AC-UI2.1). Runs in any
/// environment; it is the floor the rest of the suite builds on. The full critical
/// path (ask → streamed answer) lives in ``ChatCriticalPathUITests`` and runs live
/// (CP5).
final class LaunchUITests: XCTestCase {
  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  @MainActor
  func testLaunchShowsTabShell() {
    let app = XCUIApplication().launchOak()

    XCTAssertTrue(
      app.wait(for: .runningForeground, timeout: 15),
      "App did not reach the foreground after launch."
    )
    XCTAssertTrue(
      app.oakTabBar.firstMatch.waitForExistence(timeout: 15),
      "Expected the root tab shell to render on launch."
    )
  }

  /// Every parity surface is reachable from the tab bar (M-UI-US-2 / M-AC-UI2.2):
  /// Chat and Settings are both present (History folded into the Chat tab).
  @MainActor
  func testAllParityTabsPresent() {
    let app = XCUIApplication().launchOak()
    XCTAssertTrue(app.oakTabBar.firstMatch.waitForExistence(timeout: 15))

    for label in OakUITest.Tab.all {
      XCTAssertTrue(
        app.oakTabBar.buttons[label].waitForExistence(timeout: 5),
        "Expected the \(label) tab to be reachable from the tab shell."
      )
    }
  }

  /// ``OakTabDock`` (not a leftover system `TabView`) owns selection: tapping a
  /// dock button marks only that button selected.
  @MainActor
  func testTabDockSelectsOnlyTheActiveTab() {
    let app = XCUIApplication().launchOak()
    XCTAssertTrue(app.oakTabBar.firstMatch.waitForExistence(timeout: 15))

    for label in OakUITest.Tab.all {
      XCTAssertTrue(goToTab(label, in: app), "Expected the \(label) tab to be reachable.")
      let selected = app.oakTabBar.buttons[label]
      let becameSelected = NSPredicate(format: "isSelected == true")
      let wait = XCTNSPredicateExpectation(predicate: becameSelected, object: selected)
      XCTAssertEqual(
        XCTWaiter.wait(for: [wait], timeout: 5),
        .completed,
        "Expected \(label) to become the selected dock button."
      )
      for other in OakUITest.Tab.all {
        let button = app.oakTabBar.buttons[other]
        XCTAssertEqual(
          button.isSelected,
          other == label,
          "After tapping \(label), \(other) isSelected=\(button.isSelected)."
        )
      }
    }
  }
}
