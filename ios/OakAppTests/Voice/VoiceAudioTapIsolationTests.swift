import AVFoundation
import Foundation
import Testing
import os

@testable import OakApp

/// Regression coverage for the build-11 voice-mode crash: the mic-capture tap
/// block was formed inside `@MainActor LiveVoiceAudioIO.startCapture()`, so under
/// Swift 6 strict concurrency it inherited main-actor isolation at runtime and
/// trapped (`dispatch_assert_queue` → `EXC_BREAKPOINT`) when AVFAudio invoked it
/// on the realtime render thread. The fix hoists the tap body into a
/// `nonisolated static` helper (`LiveVoiceAudioIO.processTap`) called through an
/// explicitly `@Sendable` block. These tests pin that:
///
/// 1. `processTap` runs correctly when invoked OFF the main thread (a regression to
///    inherited `@MainActor` isolation would trap here and fail the suite), and
/// 2. the tap body is assignable to an explicitly `@Sendable` closure of the
///    `AVAudioNodeTapBlock` shape — a compile-level pin, so a future main-actor
///    touch on this path becomes a build error instead of a device crash.
struct VoiceAudioTapIsolationTests {

  private static let sampleRate = 24_000

  private static func makeConverter() -> CaptureConverter {
    let sourceFormat = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1)!
    let targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: Double(sampleRate),
      channels: 1,
      interleaved: true
    )!
    return CaptureConverter(from: sourceFormat, to: targetFormat)!
  }

  // MARK: off-main delivery

  /// Drive `processTap` from a background queue — exactly where AVFAudio runs the
  /// real tap — and assert converted PCM16 chunks arrive on the capture stream. If
  /// the helper ever regains `@MainActor` isolation, this off-main call trips the
  /// dispatch-queue assert and fails, reproducing the build-11 crash in the suite.
  @Test
  func processTapDeliversChunksWhenInvokedOffMainThread() async {
    let sampleRate = Self.sampleRate
    let accumulator = OSAllocatedUnfairLock(initialState: VoiceChunkAccumulator(sampleRate: sampleRate))

    let stream = AsyncStream<String> { continuation in
      DispatchQueue.global(qos: .userInitiated).async {
        // Everything the tap needs is built HERE so nothing non-Sendable crosses
        // the queue boundary — only the Sendable accumulator + continuation are
        // captured, mirroring the production tap's capture list.
        let converter = Self.makeConverter()
        // 200 ms of a constant tone at 24 kHz → 4800 samples → two 100 ms chunks.
        let frames: AVAudioFrameCount = 4800
        let sourceFormat = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1)!
        let buffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: frames)!
        buffer.frameLength = frames
        if let channel = buffer.floatChannelData {
          for i in 0..<Int(frames) { channel[0][i] = 0.5 }
        }
        LiveVoiceAudioIO.processTap(
          buffer: buffer,
          converter: converter,
          accumulator: accumulator,
          sink: continuation
        )
        continuation.finish()
      }
    }

    var chunks: [String] = []
    for await chunk in stream { chunks.append(chunk) }

    // The off-main tap produced audio without tripping an isolation assert.
    #expect(!chunks.isEmpty)
    #expect(chunks.allSatisfy { !VoicePCM.base64ToInt16($0).isEmpty })
  }

  // MARK: compile-level isolation pin

  /// The tap body must be assignable to an explicitly `@Sendable` closure with the
  /// `AVAudioNodeTapBlock` signature. If `processTap` regained `@MainActor`
  /// isolation, calling it from this non-isolated `@Sendable` closure would fail to
  /// COMPILE — converting the render-thread crash into a build-time error.
  @Test
  func tapBodyIsAssignableToASendableTapBlock() {
    let converter = Self.makeConverter()
    let accumulator = OSAllocatedUnfairLock(initialState: VoiceChunkAccumulator(sampleRate: Self.sampleRate))
    var continuation: AsyncStream<String>.Continuation!
    _ = AsyncStream<String> { continuation = $0 }
    let sink = continuation!

    let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
      LiveVoiceAudioIO.processTap(buffer: buffer, converter: converter, accumulator: accumulator, sink: sink)
    }

    // Referencing it is enough — the assignment above is the actual assertion.
    _ = tapBlock
    #expect(Bool(true))
  }
}
