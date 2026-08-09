import Foundation
import Observation
import UIKit

/// A pending soft-update offer ready to present as a dismissible sheet.
struct SoftUpdateOffer: Equatable, Sendable, Identifiable {
  /// Store marketing version (also used as the sheet identity).
  var id: String { latest }
  let latest: String
  let local: String
  let storeURL: URL
}

/// Drives P0 soft-update: throttled auto-check on launch/foreground, manual check
/// from Account, dismissible sheet, and 7-day snooze after "Not now".
///
/// `@MainActor @Observable` — all UI state mutates on the main actor. Depends on
/// the ``UpdateService`` protocol and an ``UpdatePromptStoring`` store so tests
/// run fully offline.
@MainActor
@Observable
final class UpdateViewModel {
  /// Minimum gap between automatic checks (launch / foreground).
  static let checkInterval: TimeInterval = 24 * 60 * 60
  /// How long "Not now" suppresses auto-prompts for the same store version.
  static let snoozeInterval: TimeInterval = 7 * 24 * 60 * 60

  static let upToDateMessage = "You're up to date."
  static let checkFailedMessage = "Couldn't check right now. Try again later."

  private let service: any UpdateService
  private let store: any UpdatePromptStoring
  private let openURL: @MainActor (URL) -> Void
  private let now: () -> Date
  private let localVersion: () -> String

  /// Soft-update offer to present; `nil` when no sheet should show.
  private(set) var pendingSoftUpdate: SoftUpdateOffer?

  /// `true` while a check (auto or manual) is in flight.
  private(set) var isChecking = false

  /// User-facing status for the Account manual check (up-to-date / error). Cleared
  /// when the sheet is the signal, or via ``dismissManualMessage()``.
  private(set) var manualMessage: String?

  init(
    service: any UpdateService,
    store: any UpdatePromptStoring = UserDefaultsUpdatePromptStore(),
    openURL: @escaping @MainActor (URL) -> Void = { UIApplication.shared.open($0) },
    now: @escaping () -> Date = Date.init,
    localVersion: @escaping () -> String = { AppVersion.marketing }
  ) {
    self.service = service
    self.store = store
    self.openURL = openURL
    self.now = now
    self.localVersion = localVersion
  }

  // MARK: Actions

  /// Automatic check (launch / foreground). No-ops when the 24h throttle is still
  /// warm, or when the offered store version is within the snooze window.
  func checkIfNeeded() async {
    let timestamp = now()
    if let last = store.lastCheckAt, timestamp.timeIntervalSince(last) < Self.checkInterval {
      return
    }
    await performCheck(respectSnooze: true, recordCheck: true, surfaceManual: false)
  }

  /// Manual "Check for updates". Always hits the service (bypasses throttle and
  /// snooze). Surfaces an up-to-date / error message when there is no sheet to show.
  func checkManually() async {
    await performCheck(respectSnooze: false, recordCheck: true, surfaceManual: true)
  }

  /// "Not now" — dismiss the sheet and snooze this store version for 7 days.
  func dismissSoftUpdate() {
    guard let pending = pendingSoftUpdate else { return }
    store.dismissedVersion = pending.latest
    store.dismissedAt = now()
    pendingSoftUpdate = nil
  }

  /// "Update" — open the App Store product page and dismiss the sheet **without**
  /// snoozing, so a later check can re-prompt if the user did not actually update.
  func openStore() {
    guard let pending = pendingSoftUpdate else { return }
    openURL(pending.storeURL)
    pendingSoftUpdate = nil
  }

  /// Clears the Account-side status message.
  func dismissManualMessage() {
    manualMessage = nil
  }

  // MARK: Internals

  private func performCheck(
    respectSnooze: Bool,
    recordCheck: Bool,
    surfaceManual: Bool
  ) async {
    isChecking = true
    defer { isChecking = false }

    if surfaceManual {
      manualMessage = nil
    }

    let local = localVersion()
    let result = await service.checkForUpdate(localVersion: local)

    if recordCheck {
      store.lastCheckAt = now()
    }

    switch result {
    case .upToDate:
      pendingSoftUpdate = nil
      if surfaceManual {
        manualMessage = Self.upToDateMessage
      }

    case .available(let latest, let storeURL):
      if respectSnooze, isSnoozed(version: latest) {
        Log.update.info("update snoozed store=\(latest, privacy: .public)")
        return
      }
      pendingSoftUpdate = SoftUpdateOffer(
        latest: latest,
        local: local,
        storeURL: storeURL
      )
      // Sheet is the signal — no separate Account toast for "available".

    case .unavailable:
      if surfaceManual {
        manualMessage = Self.checkFailedMessage
      }
    }
  }

  private func isSnoozed(version: String) -> Bool {
    guard store.dismissedVersion == version, let dismissedAt = store.dismissedAt else {
      return false
    }
    return now().timeIntervalSince(dismissedAt) < Self.snoozeInterval
  }
}
