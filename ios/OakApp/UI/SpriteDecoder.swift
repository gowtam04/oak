import ImageIO
import UIKit

/// Decodes raw sprite bytes into either a still image or a playable animation,
/// using only ImageIO (no third-party GIF library).
///
/// Oak's backend serves alternate formes (Megas, Primals, regionals) as animated
/// Pokémon Showdown GIFs and base forms as static PokeAPI PNGs. `SwiftUI.AsyncImage`
/// renders only a GIF's first frame, so Mega sprites looked frozen. This splits the
/// two: a multi-frame GIF becomes an animated `UIImage` (played by ``AnimatedSpriteView``),
/// everything else — PNG, JPEG, single-frame GIF — becomes a plain still `UIImage`
/// rendered exactly as before.
///
/// The decode is a pure, `nonisolated` function over `Data`, so ``SpriteImage`` can run
/// it off the main actor and publish the ``Decoded`` result back on `@MainActor`.
enum SpriteDecoder {
  /// The outcome of decoding sprite bytes.
  enum Decoded: Sendable {
    /// A single still image (PNG, JPEG, or a single-frame GIF).
    case still(UIImage)
    /// A multi-frame animation ready to hand to a `UIImageView`.
    case animated(Animation)
  }

  /// A decoded multi-frame animation.
  struct Animation: Sendable {
    /// The animated `UIImage` (built via `UIImage.animatedImage(with:duration:)`) that a
    /// `UIImageView` plays when it is set as `.image` and `startAnimating()` is called.
    let image: UIImage
    /// The static first frame — shown instead of `image` when Reduce Motion is on.
    let firstFrame: UIImage
    /// The number of source frames in the GIF (pre-expansion; see ``SpriteDecoder/expand``).
    let frameCount: Int
    /// The total loop duration in seconds (the sum of the clamped per-frame delays).
    let duration: TimeInterval
  }

  /// Decodes `data`. Returns `nil` only when the bytes are not a decodable image at
  /// all — the caller maps that to its placeholder. Any decodable single image comes
  /// back as ``Decoded/still(_:)``; a multi-frame GIF as ``Decoded/animated(_:)``.
  ///
  /// Runs entirely off ImageIO and touches no shared state, so it is safe to call from
  /// a detached (background) task.
  static func decode(_ data: Data) -> Decoded? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let count = CGImageSourceGetCount(source)
    guard count > 0 else { return nil }

    // Not a multi-frame source (PNG/JPEG/single-frame GIF): a plain still image.
    guard count > 1 else {
      guard let cg = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
      return .still(UIImage(cgImage: cg))
    }

    // Multi-frame GIF: pull every frame with its per-frame delay.
    var frames: [UIImage] = []
    var delays: [TimeInterval] = []
    frames.reserveCapacity(count)
    delays.reserveCapacity(count)
    for index in 0..<count {
      guard let cg = CGImageSourceCreateImageAtIndex(source, index, nil) else { continue }
      frames.append(UIImage(cgImage: cg))
      delays.append(frameDelay(source: source, index: index))
    }

    // Fewer than two frames actually decoded → fall back to a still.
    guard frames.count > 1 else {
      return frames.first.map { .still($0) }
    }

    let (expanded, duration) = expand(frames: frames, delays: delays)
    guard let animated = UIImage.animatedImage(with: expanded, duration: duration) else {
      return frames.first.map { .still($0) }
    }
    return .animated(
      Animation(
        image: animated,
        firstFrame: frames[0],
        frameCount: frames.count,
        duration: duration
      )
    )
  }

  // MARK: - Frame timing

  /// The on-screen delay for one GIF frame, in seconds.
  ///
  /// Prefers `kCGImagePropertyGIFUnclampedDelayTime` (the GIF's true value) over
  /// `kCGImagePropertyGIFDelayTime` (which browsers/ImageIO floor for very small
  /// values), then applies the standard browser convention: a delay under ~0.02s is
  /// treated as 0.1s, so Showdown GIFs authored with tiny/zero delays play at the
  /// intended speed rather than a blur.
  private static func frameDelay(source: CGImageSource, index: Int) -> TimeInterval {
    let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
    let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
    let unclamped = gif?[kCGImagePropertyGIFUnclampedDelayTime] as? Double
    let clamped = gif?[kCGImagePropertyGIFDelayTime] as? Double

    let delay: TimeInterval
    if let unclamped, unclamped > 0 {
      delay = unclamped
    } else if let clamped, clamped > 0 {
      delay = clamped
    } else {
      delay = 0.1
    }
    return delay < 0.02 ? 0.1 : delay
  }

  /// Expands frames so that `UIImage.animatedImage(with:duration:)` — which plays every
  /// frame for the *same* slice of `duration` — reproduces the GIF's differing per-frame
  /// delays.
  ///
  /// Each delay is quantized to centiseconds (a GIF's native unit); every frame is then
  /// repeated `delay / gcd(delays)` times. With `duration` set to the summed delays, each
  /// repeated slot lasts exactly one gcd-unit, so a frame occupies its own delay's worth
  /// of time. The gcd keeps the expanded array as small as possible (a uniform-delay GIF
  /// expands 1:1 to its original frames).
  private static func expand(
    frames: [UIImage], delays: [TimeInterval]
  ) -> (frames: [UIImage], duration: TimeInterval) {
    let centiseconds = delays.map { max(1, Int(($0 * 100).rounded())) }
    let unit = centiseconds.dropFirst().reduce(centiseconds[0]) { gcd($0, $1) }

    var expanded: [UIImage] = []
    for (frame, cs) in zip(frames, centiseconds) {
      for _ in 0..<max(1, cs / unit) { expanded.append(frame) }
    }
    let duration = TimeInterval(centiseconds.reduce(0, +)) / 100.0
    return (expanded, duration)
  }

  private static func gcd(_ a: Int, _ b: Int) -> Int {
    var (a, b) = (a, b)
    while b != 0 { (a, b) = (b, a % b) }
    return a
  }
}
