import Foundation

@testable import OakApp

/// In-memory ``UpdateService`` test double. Outcome is configurable; call count
/// is recorded so throttle/manual tests can assert the service was or was not hit.
///
/// `@unchecked Sendable`: mutable config is driven serially from the main actor
/// in unit tests (same pattern as ``FakeAuthService``).
final class FakeUpdateService: UpdateService, @unchecked Sendable {
  var result: UpdateCheckResult = .upToDate
  private(set) var checkCount = 0
  private(set) var lastLocalVersion: String?

  func checkForUpdate(localVersion: String) async -> UpdateCheckResult {
    checkCount += 1
    lastLocalVersion = localVersion
    return result
  }
}
