import Foundation

@testable import OakApp

/// Scripted ``VoiceAudioIO`` test double — the analog of the web suite's
/// `FakeAudio`. Records the ordered method calls, the enqueued playback chunks,
/// and lets a test feed mic chunks into the capture stream. ``sampleRate``
/// defaults to 24000 (an xAI-supported PCM rate).
///
/// The ``captionProbe`` hook lets a test PROVE ordering: it is invoked at the
/// instant ``flush()`` is called, so a barge-in test can capture the assistant
/// caption before the session clears it and confirm flush ran first.
///
/// `@MainActor`: ``VoiceAudioIO`` is main-actor-isolated (the session drives it
/// entirely on the main actor); the suite is `@MainActor` too.
@MainActor
final class FakeVoiceAudioIO: VoiceAudioIO {
  let sampleRate: Int

  /// Ordered method-call log: `startCapture`, `enqueue:<b64>`, `flush`,
  /// `stopCapture`, `close`.
  private(set) var calls: [String] = []
  private(set) var enqueued: [String] = []

  /// When set, ``startCapture()`` throws this instead of returning a stream.
  var startCaptureError: Error?

  /// Invoked (on the main actor) at each ``flush()``; its return value is appended
  /// to ``probedCaptions``. A test sets it to `{ session.caption.assistant }` to
  /// snapshot state at flush time.
  var captionProbe: (@MainActor @Sendable () -> String)?
  private(set) var probedCaptions: [String] = []

  private var captureContinuation: AsyncStream<String>.Continuation?

  init(sampleRate: Int = 24000) {
    self.sampleRate = sampleRate
  }

  func startCapture() async throws -> AsyncStream<String> {
    calls.append("startCapture")
    if let startCaptureError { throw startCaptureError }
    return AsyncStream { continuation in
      self.captureContinuation = continuation
    }
  }

  func stopCapture() {
    calls.append("stopCapture")
    captureContinuation?.finish()
    captureContinuation = nil
  }

  func enqueue(_ base64: String) {
    calls.append("enqueue:\(base64)")
    enqueued.append(base64)
  }

  func flush() {
    calls.append("flush")
    if let captionProbe {
      probedCaptions.append(MainActor.assumeIsolated { captionProbe() })
    }
  }

  func close() {
    calls.append("close")
  }

  // MARK: Test drivers

  /// Feed one base64 mic chunk into the capture stream.
  func feedChunk(_ base64: String) {
    captureContinuation?.yield(base64)
  }
}
