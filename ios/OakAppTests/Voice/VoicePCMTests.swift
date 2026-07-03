import Foundation
import Testing

@testable import OakApp

/// Unit tests for `VoicePCM` — pure sample-rate + PCM conversion math ported
/// from `web/src/lib/voice/voice-protocol.ts`.
struct VoicePCMTests {

  // MARK: round-trip

  @Test
  func float32ToInt16ToBase64ToInt16ToFloat32RoundTripsWithinTolerance() {
    let original: [Float] = [0.0, 0.5, -0.5, 1.0, -1.0, 0.25, -0.75, 0.999, -0.999]

    let int16 = VoicePCM.float32ToInt16(original)
    let base64 = VoicePCM.int16ToBase64(int16)
    let decodedInt16 = VoicePCM.base64ToInt16(base64)
    let roundTripped = VoicePCM.int16ToFloat32(decodedInt16)

    #expect(decodedInt16 == int16)
    #expect(roundTripped.count == original.count)
    for (a, b) in zip(original, roundTripped) {
      // 16-bit quantization tolerance: ~1/32768.
      #expect(abs(a - b) < 0.001)
    }
  }

  // MARK: little-endian byte order

  @Test
  func int16ToBase64EncodesLittleEndian() {
    // Int16(1) → bytes [0x01, 0x00] (little-endian) → base64 "AQA=".
    #expect(VoicePCM.int16ToBase64([1]) == "AQA=")
    // Int16(256) → bytes [0x00, 0x01] → base64 "AAE=".
    #expect(VoicePCM.int16ToBase64([256]) == "AAE=")
  }

  @Test
  func base64ToInt16DecodesLittleEndian() {
    #expect(VoicePCM.base64ToInt16("AQA=") == [1])
    #expect(VoicePCM.base64ToInt16("AAE=") == [256])
  }

  // MARK: clamping

  @Test
  func float32ToInt16ClampsOutOfRangeSamples() {
    let clamped = VoicePCM.float32ToInt16([2.0, -2.0])
    #expect(clamped == [32767, -32768])
  }

  // MARK: nearestSupportedRate

  @Test(
    arguments: [
      (47999.0, 48000),
      (44100.0, 44100),
      (48000.0, 48000),
      (12000.0, 8000),  // tie between 8000/16000 → first (lowest) candidate wins
      (20000.0, 22050),  // strictly closer to 22050 than 16000
      (8000.0, 8000),
      (100000.0, 48000),
    ]
  )
  func nearestSupportedRateSnapsAsExpected(_ input: Double, _ expected: Int) {
    #expect(VoicePCM.nearestSupportedRate(input) == expected)
  }

  // MARK: invalid input

  @Test
  func base64ToInt16OnInvalidInputReturnsEmpty() {
    #expect(VoicePCM.base64ToInt16("not valid base64!!!") == [])
    #expect(VoicePCM.base64ToInt16("a") == [])
    #expect(VoicePCM.base64ToInt16("") == [])
  }

  @Test
  func base64ToInt16DropsOddTrailingByte() {
    // 3 raw bytes → base64 "AQID" decodes to [0x01, 0x02, 0x03]; the trailing
    // odd byte (0x03) is dropped, leaving one Int16 sample.
    let decoded = VoicePCM.base64ToInt16("AQID")
    #expect(decoded.count == 1)
    #expect(decoded[0] == 0x0201)
  }
}
