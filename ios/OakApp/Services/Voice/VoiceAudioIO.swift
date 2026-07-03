import Foundation

/// Real-time audio capture + playback for voice mode — a faithful Swift port of
/// the web client's `VoiceAudioIO` seam (`web/src/lib/voice/voice-session.ts`),
/// with mic capture surfaced as an `AsyncStream` of base64 PCM16 frames (the web
/// passes an `onChunk` callback instead).
///
/// PROTOCOL ONLY — the live `AVAudioEngine` implementation is a later task. Tests
/// drive a scripted fake, so the session never touches the device audio stack.
protocol VoiceAudioIO: Sendable {
  /// The capture/playback sample rate — one of xAI's supported PCM rates (see
  /// ``VoicePCM/supportedSampleRates``). Sent to the server in `session.update`.
  var sampleRate: Int { get }

  /// Begin mic capture. The returned stream yields ~100 ms base64 PCM16 chunks
  /// until ``stopCapture()`` (or ``close()``) finishes it.
  func startCapture() async throws -> AsyncStream<String>

  /// Stop mic capture and release the microphone, finishing the capture stream.
  func stopCapture()

  /// Queue one base64 PCM16 chunk for gapless playback.
  func enqueue(_ base64: String)

  /// Stop and clear ALL queued/playing audio immediately (barge-in).
  func flush()

  /// Tear down capture, playback, and the audio session entirely.
  func close()
}
