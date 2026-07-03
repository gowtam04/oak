import Foundation
import Testing

@testable import OakApp

/// Unit tests for `VoiceChunkAccumulator` — the pure 100 ms accumulate-and-slice
/// core of mic capture, ported from the web client's `accumulate` loop
/// (`web/src/lib/voice/audio-io.ts`). No audio stack involved.
struct VoiceChunkAccumulatorTests {

  /// Decode a base64 chunk back to samples for size/content assertions.
  private func decode(_ chunk: String) -> [Int16] {
    VoicePCM.base64ToInt16(chunk)
  }

  // MARK: exact slicing

  @Test
  func emitsNothingBelowThreshold() {
    var acc = VoiceChunkAccumulator(chunkSamples: 2400)
    let chunks = acc.append(Array(repeating: 1, count: 2399))
    #expect(chunks.isEmpty)
  }

  @Test
  func emitsExactlyOneChunkAtThreshold() {
    var acc = VoiceChunkAccumulator(chunkSamples: 2400)
    let chunks = acc.append(Array(repeating: 7, count: 2400))
    #expect(chunks.count == 1)
    // Each Int16 encodes to 2 bytes → 2400 samples per chunk.
    #expect(decode(chunks[0]).count == 2400)
    #expect(decode(chunks[0]).allSatisfy { $0 == 7 })
  }

  // MARK: remainder carry

  @Test
  func carriesRemainderAcrossAppends() {
    var acc = VoiceChunkAccumulator(chunkSamples: 2400)
    // 1500 + 1500 = 3000 → one chunk of 2400, 600 carried.
    #expect(acc.append(Array(repeating: 1, count: 1500)).isEmpty)
    let chunks = acc.append(Array(repeating: 2, count: 1500))
    #expect(chunks.count == 1)
    #expect(decode(chunks[0]).count == 2400)
    // The chunk is the first 2400 samples: 1500 ones then 900 twos.
    let samples = decode(chunks[0])
    #expect(samples.prefix(1500).allSatisfy { $0 == 1 })
    #expect(samples.suffix(900).allSatisfy { $0 == 2 })
    // 600 twos remain buffered — proven by needing only 1800 more to emit again.
    #expect(acc.append(Array(repeating: 3, count: 1799)).isEmpty)
    #expect(acc.append([3]).count == 1)
  }

  // MARK: multiple chunks from one append

  @Test
  func emitsMultipleChunksFromOneLargeAppend() {
    var acc = VoiceChunkAccumulator(chunkSamples: 2400)
    // 5000 = 2 whole chunks (4800) + 200 carried.
    let chunks = acc.append(Array(repeating: 9, count: 5000))
    #expect(chunks.count == 2)
    #expect(chunks.allSatisfy { decode($0).count == 2400 })
    // 200 remain → 2200 more completes the third chunk.
    #expect(acc.append(Array(repeating: 9, count: 2199)).isEmpty)
    #expect(acc.append([9]).count == 1)
  }

  // MARK: edge cases

  @Test
  func emptyAppendEmitsNothingAndKeepsBuffer() {
    var acc = VoiceChunkAccumulator(chunkSamples: 2400)
    #expect(acc.append(Array(repeating: 1, count: 1000)).isEmpty)
    #expect(acc.append([]).isEmpty)
    // The earlier 1000 are still buffered: 1400 more emits one chunk.
    #expect(acc.append(Array(repeating: 1, count: 1400)).count == 1)
  }

  @Test
  func sampleRateInitDerivesHundredMillisecondChunk() {
    // 24 kHz × 0.1 s = 2400 samples.
    #expect(VoiceChunkAccumulator(sampleRate: 24000).chunkSamples == 2400)
    // 16 kHz × 0.1 s = 1600.
    #expect(VoiceChunkAccumulator(sampleRate: 16000).chunkSamples == 1600)
  }
}
