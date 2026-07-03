import Foundation

/// Batches a stream of PCM16 samples into fixed-size base64 uplink chunks — the
/// pure core of the mic-capture path, factored out of ``LiveVoiceAudioIO`` so the
/// 100 ms accumulate-and-slice logic is unit-testable without an audio stack.
///
/// Mirrors the web client's `accumulate` loop (`web/src/lib/voice/audio-io.ts`):
/// append incoming samples, emit one base64 chunk per whole `chunkSamples` worth,
/// and CARRY the remainder to the next append — never dropping samples (a gap
/// would break xAI's voice-activity detection).
///
/// No `AVFoundation` import: byte/sample math only, so it is testable without a
/// simulator audio stack and reusable by a future watchOS/other client.
struct VoiceChunkAccumulator {
  /// Samples per emitted chunk (e.g. 2400 = 100 ms at 24 kHz).
  let chunkSamples: Int
  private var buffer: [Int16] = []

  init(chunkSamples: Int) {
    precondition(chunkSamples > 0, "chunkSamples must be positive")
    self.chunkSamples = chunkSamples
  }

  /// Convenience: size the chunk to `seconds` of audio at `sampleRate`, matching
  /// the web's `Math.round(sampleRate * CHUNK_SECONDS)`.
  init(sampleRate: Int, seconds: Double = 0.1) {
    self.init(chunkSamples: Int((Double(sampleRate) * seconds).rounded()))
  }

  /// Append `samples` and return zero or more base64 PCM16 chunks — one per whole
  /// ``chunkSamples`` now buffered. Any leftover is carried into the next call.
  mutating func append(_ samples: [Int16]) -> [String] {
    buffer.append(contentsOf: samples)
    guard buffer.count >= chunkSamples else { return [] }

    var chunks: [String] = []
    var consumed = 0
    while buffer.count - consumed >= chunkSamples {
      let chunk = Array(buffer[consumed..<(consumed + chunkSamples)])
      chunks.append(VoicePCM.int16ToBase64(chunk))
      consumed += chunkSamples
    }
    buffer.removeFirst(consumed)
    return chunks
  }
}
