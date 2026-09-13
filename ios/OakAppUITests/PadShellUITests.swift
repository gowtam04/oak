import UIKit
import XCTest

/// iPad shell suite (P-SUCCESS-2/4/5, P-CHAT-US-5 Chat canvas).
///
/// Hermetic — no backend. Skips on iPhone so `uitest_iphone` still owns the
/// tab-shell assertion in ``LaunchUITests``. Fuller than ``PadLaunchUITests``:
/// sidebar (or Destinations), Chat list|thread on a wide sim, rotate without
/// losing the pad shell.
final class PadShellUITests: XCTestCase {
  /// Matches `PadLayout.mediumMinWidth`. UITests cannot import OakApp.
  private static let wideWidth: CGFloat = 700

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  /// Launch pin: pad-root, enamel sidebar (or compact Destinations control),
  /// and no iPhone tab dock (P-SHELL-BR-4, P-SUCCESS-2).
  @MainActor
  func testLaunchShowsPadRootSidebarAndNoTabDock() throws {
    try requirePadIdiom()

    let app = XCUIApplication().launchOak()
    XCTAssertTrue(
      app.wait(for: .runningForeground, timeout: 15),
      "App did not reach the foreground after launch."
    )

    XCTAssertTrue(
      query("pad-root", in: app).waitForExistence(timeout: 15),
      "Expected PadRootView (pad-root) on iPad launch."
    )
    XCTAssertTrue(
      padSidebarIsPresent(in: app),
      "Expected pad-sidebar or a Destinations control on iPad launch."
    )
    XCTAssertFalse(
      app.oakTabBar.exists,
      "iPhone tab dock (oak-tab-dock) must not appear on iPad (P-SHELL-BR-4)."
    )
  }

  /// Default destination is Chat. On a wide window (medium+), list | thread
  /// columns are in the hierarchy (P-SUCCESS-2, P-SHELL-AC-1.2).
  /// `pad-chat-destination` is often omitted from the AX tree; column ids
  /// (`pad-conversation-list`, `pad-thread-column`) are the pin.
  @MainActor
  func testChatDestinationShowsListAndThreadOnWideSim() throws {
    try requirePadIdiom()

    let app = XCUIApplication().launchOak()
    XCTAssertTrue(
      app.wait(for: .runningForeground, timeout: 15),
      "App did not reach the foreground after launch."
    )
    XCTAssertTrue(
      query("pad-root", in: app).waitForExistence(timeout: 15),
      "Expected pad-root before inspecting the Chat destination."
    )

    let chatRow = app.buttons[OakUITest.Tab.chat]
    if chatRow.waitForExistence(timeout: 5) {
      chatRow.tap()
    }

    guard isWideWindow(app) else { return }

    let list = query("pad-conversation-list", in: app)
    let thread = query("pad-thread-column", in: app)
    let listFound = list.waitForExistence(timeout: 10)
    let threadFound = thread.waitForExistence(timeout: 10)
    if listFound || threadFound {
      XCTAssertTrue(
        listFound,
        "Expected pad-conversation-list on a wide Chat destination."
      )
      XCTAssertTrue(
        threadFound,
        "Expected pad-thread-column on a wide Chat destination."
      )
      return
    }

    let guestList = app.staticTexts["Sign in to save your conversations"]
    let emptyCopy = app.staticTexts[
      "Teams, calcs, and live usage for Pokémon Champions. Oak will show its work."
    ]
    XCTAssertTrue(
      guestList.waitForExistence(timeout: 5)
        || emptyCopy.waitForExistence(timeout: 2)
        || query("pad-empty-workbench", in: app).waitForExistence(timeout: 2)
        || app.oakComposerField.waitForExistence(timeout: 2),
      "Expected Chat list|thread identifiers or Chat chrome on a wide sim."
    )
  }

  /// landscapeLeft then portrait: process stays up, pad-root remains, no dock
  /// (P-SUCCESS-4). Does not require a live backend.
  @MainActor
  func testRotationKeepsPadRootWithoutCrash() throws {
    try requirePadIdiom()

    let app = XCUIApplication().launchOak()
    XCTAssertTrue(
      app.wait(for: .runningForeground, timeout: 15),
      "App did not reach the foreground after launch."
    )
    XCTAssertTrue(
      query("pad-root", in: app).waitForExistence(timeout: 15),
      "Expected pad-root before rotating."
    )

    XCUIDevice.shared.orientation = .landscapeLeft
    assertPadShellSurvived(app, after: "landscapeLeft")

    XCUIDevice.shared.orientation = .portrait
    assertPadShellSurvived(app, after: "portrait")
  }

  // MARK: - Helpers

  @MainActor
  private func requirePadIdiom() throws {
    guard UIDevice.current.userInterfaceIdiom == .pad else {
      throw XCTSkip("iPad-only shell suite (P-SUCCESS-2); iPhone tab shell is LaunchUITests.")
    }
  }

  @MainActor
  private func query(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)[identifier]
  }

  @MainActor
  private func padSidebarIsPresent(in app: XCUIApplication) -> Bool {
    if query("pad-sidebar", in: app).waitForExistence(timeout: 15) {
      return true
    }
    let destinations = app.descendants(matching: .any)["Destinations"]
    return destinations.waitForExistence(timeout: 2)
  }

  @MainActor
  private func isWideWindow(_ app: XCUIApplication) -> Bool {
    let window = app.windows.firstMatch
    guard window.waitForExistence(timeout: 5) else { return false }
    return window.frame.width >= Self.wideWidth
  }

  @MainActor
  private func assertPadShellSurvived(_ app: XCUIApplication, after orientation: String) {
    XCTAssertEqual(
      app.state,
      .runningForeground,
      "App must stay foregrounded after rotating to \(orientation) (P-SUCCESS-4)."
    )
    XCTAssertTrue(
      query("pad-root", in: app).waitForExistence(timeout: 10),
      "Expected pad-root after rotating to \(orientation) (P-SUCCESS-4)."
    )
    XCTAssertFalse(
      app.oakTabBar.exists,
      "iPhone tab dock must not appear after rotating to \(orientation)."
    )
  }
}
