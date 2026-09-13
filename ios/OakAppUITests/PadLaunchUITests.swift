import UIKit
import XCTest

/// iPad idiom launch pin (P-SHELL-BR-4, P-CON-2, ADR-P1 / CP-P1).
///
/// Hermetic — no backend. Skips on iPhone so `uitest_iphone` still owns the
/// tab-shell assertion in ``LaunchUITests``. On iPad, `PadRootView` must be
/// in the hierarchy and the iPhone dock must not.
final class PadLaunchUITests: XCTestCase {
  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  @MainActor
  func testIPadLaunchShowsPadRootWithoutTabDock() throws {
    guard UIDevice.current.userInterfaceIdiom == .pad else {
      throw XCTSkip("iPad-only launch pin (P-SHELL-BR-4); iPhone tab shell is LaunchUITests.")
    }

    let app = XCUIApplication().launchOak()
    XCTAssertTrue(
      app.wait(for: .runningForeground, timeout: 15),
      "App did not reach the foreground after launch."
    )

    let padRoot = app.descendants(matching: .any)["pad-root"]
    XCTAssertTrue(
      padRoot.waitForExistence(timeout: 15),
      "Expected PadRootView (pad-root) on iPad launch."
    )
    XCTAssertFalse(
      app.oakTabBar.exists,
      "iPhone tab dock must not appear on iPad (P-SHELL-BR-4)."
    )
  }
}
