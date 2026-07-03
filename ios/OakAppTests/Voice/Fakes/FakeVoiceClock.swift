import Foundation

@testable import OakApp

/// Manual ``VoiceClock`` test double: ``now()`` returns a settable ``current``
/// date, and ``sleep(forMilliseconds:)`` suspends until the test explicitly
/// ``fireSleep()``s it — so the max-session timer fires deterministically rather
/// than racing wall-clock time. Cancellation resumes the pending sleep with a
/// `CancellationError` (mirroring `Task.sleep`), so tearing the session down
/// never leaks the suspended continuation.
///
/// `@unchecked Sendable`: driven serially from the main actor.
final class FakeVoiceClock: VoiceClock, @unchecked Sendable {
  var current = Date(timeIntervalSince1970: 1000)
  private(set) var sleepRequests: [Int] = []

  private var continuation: CheckedContinuation<Void, Error>?

  func now() -> Date { current }

  func sleep(forMilliseconds ms: Int) async throws {
    sleepRequests.append(ms)
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        if Task.isCancelled {
          continuation.resume(throwing: CancellationError())
        } else {
          self.continuation = continuation
        }
      }
    } onCancel: {
      let pending = self.continuation
      self.continuation = nil
      pending?.resume(throwing: CancellationError())
    }
  }

  // MARK: Test drivers

  /// Complete the pending sleep as though its full duration elapsed.
  func fireSleep() {
    let pending = continuation
    continuation = nil
    pending?.resume()
  }
}
