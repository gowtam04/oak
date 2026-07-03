import Foundation

/// Pure PCM/sample-rate math for voice mode — a faithful Swift port of
/// `web/src/lib/voice/voice-protocol.ts`'s conversion helpers. No Foundation
/// audio types (`AVFoundation`) are touched here; this is byte/sample math
/// only, so it is unit-testable without a simulator audio stack and reusable
/// verbatim by a future watchOS/other client.
///
/// PCM is 16-bit signed, little-endian, mono — the format xAI's realtime API
/// accepts/emits (mirrors the web comment in `voice-protocol.ts`).
enum VoicePCM {
  /// PCM sample rates xAI accepts (`SUPPORTED_SAMPLE_RATES` in the web source).
  static let supportedSampleRates: [Int] = [8000, 16000, 22050, 24000, 32000, 44100, 48000]

  /// Snap a device's native sample rate to the nearest xAI-supported rate.
  /// Ties resolve to the FIRST (lowest) candidate at that distance, matching
  /// the web implementation's strict `<` comparison.
  static func nearestSupportedRate(_ rate: Double) -> Int {
    var best = supportedSampleRates[0]
    var bestDelta = abs(rate - Double(best))
    for candidate in supportedSampleRates {
      let delta = abs(rate - Double(candidate))
      if delta < bestDelta {
        best = candidate
        bestDelta = delta
      }
    }
    return best
  }

  /// Convert normalized Float32 audio in `[-1, 1]` to 16-bit PCM (clamped).
  /// Matches the web's `s < 0 ? s * 0x8000 : s * 0x7fff` scaling, including
  /// JS's truncate-toward-zero semantics when narrowing to an integer.
  static func float32ToInt16(_ samples: [Float]) -> [Int16] {
    samples.map { sample in
      let s = max(-1.0, min(1.0, Double(sample)))
      let scaled = s < 0 ? s * 0x8000 : s * 0x7fff
      return Int16(scaled.rounded(.towardZero))
    }
  }

  /// Convert 16-bit PCM back to normalized Float32 audio `[-1, 1]` for playback.
  static func int16ToFloat32(_ pcm: [Int16]) -> [Float] {
    pcm.map { Float($0) / Float(0x8000) }
  }

  /// Encode 16-bit PCM samples to base64, little-endian byte order (xAI's wire
  /// format for `input_audio_buffer.append` / audio deltas).
  static func int16ToBase64(_ pcm: [Int16]) -> String {
    var bytes = [UInt8]()
    bytes.reserveCapacity(pcm.count * 2)
    for sample in pcm {
      let bits = UInt16(bitPattern: sample)
      bytes.append(UInt8(bits & 0xff))
      bytes.append(UInt8((bits >> 8) & 0xff))
    }
    return Data(bytes).base64EncodedString()
  }

  /// Decode base64 PCM16 (little-endian) back into 16-bit samples. An odd
  /// trailing byte is dropped (mirrors the web's `usable = length - length%2`);
  /// invalid base64 returns an empty array rather than throwing.
  static func base64ToInt16(_ b64: String) -> [Int16] {
    guard let data = Data(base64Encoded: b64) else { return [] }
    let usableCount = data.count - (data.count % 2)
    guard usableCount > 0 else { return [] }

    var result = [Int16]()
    result.reserveCapacity(usableCount / 2)
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      var i = 0
      while i < usableCount {
        let low = UInt16(raw[i])
        let high = UInt16(raw[i + 1])
        result.append(Int16(bitPattern: low | (high << 8)))
        i += 2
      }
    }
    return result
  }
}
