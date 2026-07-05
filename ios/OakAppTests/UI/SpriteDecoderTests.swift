import ImageIO
import Testing
import UIKit
import UniformTypeIdentifiers

@testable import OakApp

/// `SpriteDecoder` — the ImageIO GIF/PNG split that lets Mega-forme Showdown GIFs
/// animate on iOS while static PNG sprites keep rendering exactly as before.
///
/// The test image bytes are built in-process with `CGImageDestination` (a small
/// multi-frame GIF with known delays, a PNG), so there are no committed binary
/// fixtures. `@MainActor` because the builders render via `UIGraphicsImageRenderer`.
@MainActor
struct SpriteDecoderTests {

  // MARK: - Byte builders

  /// A tiny solid-color `CGImage` used as a GIF frame.
  private func frame(_ color: UIColor, side: Int = 4) -> CGImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    let image = renderer.image { context in
      color.setFill()
      context.fill(CGRect(x: 0, y: 0, width: side, height: side))
    }
    return image.cgImage!
  }

  /// Encodes a GIF with one `(color, delay-seconds)` pair per frame.
  private func gifData(_ frames: [(color: UIColor, delay: Double)]) -> Data {
    let data = NSMutableData()
    let destination = CGImageDestinationCreateWithData(
      data, UTType.gif.identifier as CFString, frames.count, nil)!
    CGImageDestinationSetProperties(
      destination,
      [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
    for entry in frames {
      let frameProperties: [CFString: Any] = [
        kCGImagePropertyGIFDictionary: [
          kCGImagePropertyGIFDelayTime: entry.delay,
          kCGImagePropertyGIFUnclampedDelayTime: entry.delay,
        ]
      ]
      CGImageDestinationAddImage(destination, frame(entry.color), frameProperties as CFDictionary)
    }
    #expect(CGImageDestinationFinalize(destination))
    return data as Data
  }

  /// Encodes a single-frame PNG.
  private func pngData(_ color: UIColor = .systemRed, side: Int = 4) -> Data {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    return renderer.pngData { context in
      color.setFill()
      context.fill(CGRect(x: 0, y: 0, width: side, height: side))
    }
  }

  // MARK: - Multi-frame GIF → animated

  @Test
  func multiFrameGifDecodesAsAnimated() throws {
    let data = gifData([
      (.systemRed, 0.1), (.systemGreen, 0.1), (.systemBlue, 0.1),
    ])
    let decoded = try #require(SpriteDecoder.decode(data))
    guard case .animated(let animation) = decoded else {
      Issue.record("expected .animated, got \(decoded)")
      return
    }
    #expect(animation.frameCount == 3)
    // Total loop duration is the sum of the (clamped) per-frame delays.
    #expect(abs(animation.duration - 0.3) < 0.001)
    // The animated image is a genuine multi-frame UIImage the UIImageView can play.
    #expect((animation.image.images?.count ?? 0) >= 3)
  }

  @Test
  func differingDelaysSumIntoTheDuration() throws {
    let data = gifData([
      (.systemRed, 0.1), (.systemGreen, 0.2), (.systemBlue, 0.3),
    ])
    let decoded = try #require(SpriteDecoder.decode(data))
    guard case .animated(let animation) = decoded else {
      Issue.record("expected .animated, got \(decoded)")
      return
    }
    #expect(animation.frameCount == 3)
    #expect(abs(animation.duration - 0.6) < 0.001)
    // Frames are expanded proportionally to their delays (0.1 : 0.2 : 0.3 = 1 : 2 : 3),
    // so the uniform-per-slot player reproduces the real timing.
    #expect(animation.image.images?.count == 6)
  }

  @Test
  func tinyDelaysAreClampedToTheBrowserDefault() throws {
    // A GIF authored with ~0s delays must not play as a blur: each sub-0.02s delay is
    // treated as 0.1s, so three frames total 0.3s rather than ~0s.
    let data = gifData([
      (.systemRed, 0.01), (.systemGreen, 0.01), (.systemBlue, 0.01),
    ])
    let decoded = try #require(SpriteDecoder.decode(data))
    guard case .animated(let animation) = decoded else {
      Issue.record("expected .animated, got \(decoded)")
      return
    }
    #expect(abs(animation.duration - 0.3) < 0.001)
  }

  // MARK: - Static sources → still

  @Test
  func singleFrameGifDecodesAsStill() throws {
    let data = gifData([(.systemRed, 0.1)])
    let decoded = try #require(SpriteDecoder.decode(data))
    guard case .still = decoded else {
      Issue.record("expected .still, got \(decoded)")
      return
    }
  }

  @Test
  func pngDecodesAsStill() throws {
    let decoded = try #require(SpriteDecoder.decode(pngData()))
    guard case .still(let image) = decoded else {
      Issue.record("expected .still, got \(decoded)")
      return
    }
    // A still PNG is a plain, non-animated UIImage.
    #expect(image.images == nil)
  }

  // MARK: - Undecodable bytes → nil

  @Test
  func garbageBytesDecodeToNil() {
    #expect(SpriteDecoder.decode(Data([0xDE, 0xAD, 0xBE, 0xEF])) == nil)
  }

  @Test
  func emptyDataDecodesToNil() {
    #expect(SpriteDecoder.decode(Data()) == nil)
  }
}
