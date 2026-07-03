import Foundation

/// A tiny time seam for the voice session state machine (a later task): reading
/// "now" and sleeping for a duration, both behind a protocol so idle-timeout /
/// max-session-length logic can be driven deterministically in tests instead of
/// racing real `Task.sleep` wall-clock time.
protocol VoiceClock: Sendable {
  /// The current time.
  func now() -> Date

  /// Suspends for `ms` milliseconds. Mirrors `Task.sleep`'s cancellation
  /// behavior — a cancelled task throws `CancellationError` instead of
  /// completing the sleep.
  func sleep(forMilliseconds ms: Int) async throws
}

/// Production ``VoiceClock`` over the real wall clock and `Task.sleep`.
struct LiveVoiceClock: VoiceClock {
  func now() -> Date { Date() }

  func sleep(forMilliseconds ms: Int) async throws {
    try await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
  }
}
