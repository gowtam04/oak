import Foundation
import UIKit

/// Pure `UIImage` → validated ``ChatImage`` encoder for the chat vision path
/// (chat-experience.md M-CHAT-US-5; api-design.md "Image caps"; component-design.md
/// "Services layer"). It is the **client-side mirror** of the backend's
/// `@/server/image-upload` guard: it enforces the same caps BEFORE the stream opens
/// so a bad attachment is a fast, local rejection rather than a wasted round-trip.
///
/// What it enforces (and why each matters, mirroring the server):
///  - **Count** ≤ ``maxImages`` — bounds the per-turn token + payload cost.
///  - **Per-image decoded bytes** ≤ ``maxImageBytes`` (~3.75 MiB) — the tool loop
///    re-sends every image on each iteration, so oversized uploads are rejected up
///    front. "Decoded bytes" = the re-encoded file bytes (what base64 decodes to on
///    the server), i.e. the `Data` length here — the same number the server checks.
///  - **Total decoded bytes** ≤ ``maxTotalBytes`` (10 MiB) across the turn.
///  - **Type** — every image is RE-ENCODED to one of the four types every provider
///    accepts (JPEG, or PNG when the source carries alpha). This also transcodes
///    HEIC/other library formats into a supported type, which the server requires
///    (it sniffs magic bytes and rejects anything else, notably HEIC).
///
/// **Downscaling** is the key to getting real photos under the per-image cap: a full
/// resolution 12–48 MP camera photo re-encodes to well over 3.75 MiB, which used to
/// make every such attachment a client-side `.perImageTooLarge` rejection. So each
/// image is first scaled so its longest edge is ≤ ``maxDimension`` (1568 px — the
/// point past which the vision providers downsample anyway, so anything larger only
/// wastes bytes and tokens). If a downscaled image still exceeds the byte cap (a
/// dense screenshot, an unusually small cap), a bounded fit-to-cap pass steps the
/// JPEG quality — then the dimensions — down until it fits.
///
/// The emitted ``ChatImage/data`` is **RAW base64 with no `data:` prefix** — exactly
/// the wire shape `POST /api/chat` expects.
///
/// Pure + `Sendable`: no I/O, no shared state. The caps are injectable so the cap
/// logic is unit-testable with tiny thresholds; production uses the defaults, which
/// match the server's constants byte-for-byte.
struct ImageEncoder: Sendable {
  /// Max images per turn (matches the server's `MAX_IMAGES`).
  static let defaultMaxImages = 4
  /// Per-image decoded-byte cap (~3.75 MiB; matches `MAX_IMAGE_BYTES`).
  static let defaultMaxImageBytes = 3_932_160
  /// Combined decoded-byte cap across the turn (10 MiB; matches `MAX_TOTAL_IMAGE_BYTES`).
  static let defaultMaxTotalBytes = 10_485_760
  /// Longest-edge pixel cap applied before re-encoding. 1568 px is the resolution
  /// past which Anthropic (and, in practice, the other providers) downsample, so a
  /// larger image carries no vision benefit — only more bytes/tokens.
  static let defaultMaxDimension = 1568

  /// JPEG re-encode qualities, tried in descending order by ``bestJpeg(_:maxBytes:)``:
  /// the highest quality whose bytes fit the cap wins; if none fit, the smallest
  /// (last) is kept so the dimension-shrink pass can take over.
  private static let jpegQualitySteps: [CGFloat] = [0.8, 0.6, 0.45, 0.3]
  /// How many times ``reencode(_:)`` may shrink the dimensions while trying to fit
  /// the per-image byte cap. A bound so a pathological cap can't loop forever; the
  /// smallest result produced is returned regardless, and the caller's guard maps an
  /// over-cap result to `.perImageTooLarge` (the pre-downscale behavior).
  private static let maxFitAttempts = 4
  /// Per-attempt dimension shrink factor used by the fit-to-cap pass.
  private static let shrinkFactor: CGFloat = 0.8

  let maxImages: Int
  let maxImageBytes: Int
  let maxTotalBytes: Int
  let maxDimension: Int

  init(
    maxImages: Int = ImageEncoder.defaultMaxImages,
    maxImageBytes: Int = ImageEncoder.defaultMaxImageBytes,
    maxTotalBytes: Int = ImageEncoder.defaultMaxTotalBytes,
    maxDimension: Int = ImageEncoder.defaultMaxDimension
  ) {
    self.maxImages = maxImages
    self.maxImageBytes = maxImageBytes
    self.maxTotalBytes = maxTotalBytes
    self.maxDimension = maxDimension
  }

  /// Re-encodes and validates `images` into wire ``ChatImage``s.
  ///
  /// An empty input is the text-only path → `[]` (no throw). On any cap/type
  /// violation it throws ``OakError/imageRejected(reason:)`` with the specific
  /// ``ImageRejectReason`` so the UI can explain exactly what went wrong.
  func encode(_ images: [UIImage]) throws -> [ChatImage] {
    guard !images.isEmpty else { return [] }
    guard images.count <= maxImages else {
      throw OakError.imageRejected(reason: .tooMany)
    }

    var encoded: [ChatImage] = []
    var total = 0
    for image in images {
      guard let payload = reencode(image) else {
        // Couldn't produce any supported encoding (e.g. an empty/invalid image).
        throw OakError.imageRejected(reason: .unsupportedType)
      }
      guard payload.bytes.count <= maxImageBytes else {
        throw OakError.imageRejected(reason: .perImageTooLarge)
      }
      total += payload.bytes.count
      guard total <= maxTotalBytes else {
        throw OakError.imageRejected(reason: .totalTooLarge)
      }
      // RAW base64, no `data:` prefix — the wire shape the server expects.
      encoded.append(
        ChatImage(mimeType: payload.mimeType, data: payload.bytes.base64EncodedString())
      )
    }
    return encoded
  }

  // MARK: Re-encoding

  /// Downscales `image` to the longest-edge cap, then re-encodes it into a supported
  /// type that fits the per-image byte cap: PNG when the (downscaled) image carries
  /// alpha and the PNG already fits (keeps transparency for screenshots/logos),
  /// otherwise JPEG with a bounded quality-then-dimension fit-to-cap pass. Returns
  /// `nil` when no encoding can be produced (an empty/backing-less image), which the
  /// caller maps to ``ImageRejectReason/unsupportedType``. May return bytes that
  /// still exceed the cap for a pathological threshold — the caller's guard reports
  /// that as `.perImageTooLarge`, exactly as before.
  private func reencode(_ image: UIImage) -> (mimeType: String, bytes: Data)? {
    var current = Self.downscaled(image, maxPixels: maxDimension)

    // Alpha + a PNG that already fits → keep PNG (lossless, preserves transparency).
    if Self.hasAlpha(current), let png = current.pngData(), png.count <= maxImageBytes {
      return ("image/png", png)
    }

    // JPEG with a bounded fit-to-cap loop: step quality down (inside `bestJpeg`),
    // then shrink dimensions and retry, until the bytes fit or we run out of
    // attempts. `smallest` tracks the smallest JPEG seen so a too-tight cap still
    // yields SOMETHING for the caller to reject.
    var smallest: Data?
    for attempt in 0..<Self.maxFitAttempts {
      if let jpeg = Self.bestJpeg(current, maxBytes: maxImageBytes) {
        if smallest == nil || jpeg.count < smallest!.count { smallest = jpeg }
        if jpeg.count <= maxImageBytes { return ("image/jpeg", jpeg) }
      }
      guard attempt < Self.maxFitAttempts - 1,
        let shrunk = Self.shrunk(current, factor: Self.shrinkFactor)
      else { break }
      current = shrunk
    }
    if let smallest { return ("image/jpeg", smallest) }

    // JPEG never encoded (no real bitmap) — last-ditch PNG, else give up.
    if let png = current.pngData() { return ("image/png", png) }
    return nil
  }

  /// Encodes `image` as JPEG, returning the highest-quality step whose bytes are
  /// ≤ `maxBytes`; when none fit, the smallest (lowest-quality) JPEG is returned so a
  /// caller can shrink dimensions and try again. `nil` only when the image cannot be
  /// JPEG-encoded at all (no backing bitmap).
  private static func bestJpeg(_ image: UIImage, maxBytes: Int) -> Data? {
    var smallest: Data?
    for quality in jpegQualitySteps {
      guard let data = image.jpegData(compressionQuality: quality) else { continue }
      if data.count <= maxBytes { return data }
      smallest = data  // qualities descend, so this keeps the smallest
    }
    return smallest
  }

  /// Returns `image` scaled so its longest PIXEL edge is ≤ `maxPixels`, preserving
  /// aspect ratio and baking in orientation (so a sideways camera photo comes out
  /// upright). A no-op — returning the input untouched — when the image is already
  /// within the cap or has no measurable size (e.g. an empty `UIImage`, which the
  /// re-encode path then maps to `.unsupportedType`).
  ///
  /// Measurement is in the image's DISPLAY space (`size × scale`), not the raw
  /// `cgImage`, so a 90°-oriented photo scales without distorting its aspect ratio.
  private static func downscaled(_ image: UIImage, maxPixels: Int) -> UIImage {
    let scale = image.scale
    let pixelWidth = image.size.width * scale
    let pixelHeight = image.size.height * scale
    let longest = max(pixelWidth, pixelHeight)
    guard longest > CGFloat(maxPixels) else { return image }

    let ratio = CGFloat(maxPixels) / longest
    let targetSize = CGSize(
      width: max(1, (pixelWidth * ratio).rounded()),
      height: max(1, (pixelHeight * ratio).rounded())
    )

    // `scale = 1` makes the renderer's point size equal its output PIXEL size, so
    // `targetSize` lands exactly on the longest-edge cap. `opaque` drops the alpha
    // channel for images that don't need it (smaller output, JPEG-friendly).
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = !hasAlpha(image)
    let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: targetSize))
    }
  }

  /// Returns `image` scaled down by `factor` (0 < factor < 1), or `nil` when it
  /// cannot be shrunk further (no backing bitmap, or already at the 1-px floor).
  private static func shrunk(_ image: UIImage, factor: CGFloat) -> UIImage? {
    guard let cg = image.cgImage else { return nil }
    let longest = max(cg.width, cg.height)
    let target = Int((CGFloat(longest) * factor).rounded())
    guard target >= 1, target < longest else { return nil }
    return downscaled(image, maxPixels: target)
  }

  /// Whether the image's underlying bitmap carries an alpha channel.
  private static func hasAlpha(_ image: UIImage) -> Bool {
    guard let alpha = image.cgImage?.alphaInfo else { return false }
    switch alpha {
    case .first, .last, .premultipliedFirst, .premultipliedLast:
      return true
    case .none, .noneSkipFirst, .noneSkipLast, .alphaOnly:
      return false
    @unknown default:
      return false
    }
  }
}
