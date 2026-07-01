import Foundation
import Testing
import UIKit

@testable import OakApp

/// `ImageEncoder` cap + re-encode logic (implementation-plan.md P8 test focus;
/// chat-experience.md M-CHAT-US-5 / M-AC-5.2/5.4/5.5). The encoder is the client-side
/// mirror of the backend's `@/server/image-upload` guard, so each cap maps to a
/// specific ``ImageRejectReason``. The caps are injectable, which lets the byte-cap
/// rules be exercised with tiny thresholds against a real (small) rendered image —
/// no multi-megabyte fixtures needed.
///
/// `@MainActor` because the helper renders `UIImage`s via UIKit.
@MainActor
struct ImageEncoderTests {

  // MARK: Helpers

  /// A small, real, non-trivial image (so JPEG/PNG re-encoding succeeds and the
  /// encoded bytes are comfortably larger than the tiny test thresholds).
  private func sampleImage(side: CGFloat = 12, color: UIColor = .systemRed) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    return renderer.image { context in
      color.setFill()
      context.fill(CGRect(x: 0, y: 0, width: side, height: side))
    }
  }

  /// A large image at EXACT pixel dimensions (`format.scale = 1`), with some structure
  /// so it doesn't compress to nothing — the stand-in for a full-resolution camera
  /// photo / screenshot that used to blow past the per-image cap before downscaling.
  private func largeImage(width: CGFloat = 4000, height: CGFloat = 3000) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(
      size: CGSize(width: width, height: height), format: format)
    return renderer.image { context in
      let colors: [UIColor] = [.systemRed, .systemBlue, .systemGreen, .systemOrange]
      let stripe = width / CGFloat(colors.count)
      for (index, color) in colors.enumerated() {
        color.setFill()
        context.fill(CGRect(x: CGFloat(index) * stripe, y: 0, width: stripe, height: height))
      }
    }
  }

  // MARK: Count cap → .tooMany

  @Test
  func moreThanFourImagesIsRejectedAsTooMany() {
    let encoder = ImageEncoder()
    let images = (0..<5).map { _ in sampleImage() }
    #expect(throws: OakError.imageRejected(reason: .tooMany)) {
      try encoder.encode(images)
    }
  }

  @Test
  func exactlyFourImagesIsWithinTheCountCap() throws {
    let encoder = ImageEncoder()
    let encoded = try encoder.encode((0..<4).map { _ in sampleImage() })
    #expect(encoded.count == 4)
  }

  // MARK: Per-image byte cap → .perImageTooLarge

  @Test
  func oversizedSingleImageIsRejectedAsPerImageTooLarge() {
    // A 1-byte per-image cap (total cap generous) isolates the per-image check.
    let encoder = ImageEncoder(maxImageBytes: 1, maxTotalBytes: .max)
    #expect(throws: OakError.imageRejected(reason: .perImageTooLarge)) {
      try encoder.encode([sampleImage()])
    }
  }

  // MARK: Total byte cap → .totalTooLarge

  @Test
  func oversizedTotalIsRejectedAsTotalTooLarge() {
    // A generous per-image cap but a 1-byte total cap isolates the total check.
    let encoder = ImageEncoder(maxImageBytes: .max, maxTotalBytes: 1)
    #expect(throws: OakError.imageRejected(reason: .totalTooLarge)) {
      try encoder.encode([sampleImage()])
    }
  }

  @Test
  func secondImageTrippingTheTotalCapReportsTotalTooLarge() throws {
    // Size one image, then set the total cap so the first fits but two do not.
    let probe = try ImageEncoder().encode([sampleImage()])
    let oneSize = Data(base64Encoded: probe[0].data)?.count ?? 0
    #expect(oneSize > 0)

    let encoder = ImageEncoder(maxImageBytes: .max, maxTotalBytes: oneSize + 1)
    #expect(throws: OakError.imageRejected(reason: .totalTooLarge)) {
      try encoder.encode([sampleImage(), sampleImage()])
    }
  }

  // MARK: Type → .unsupportedType

  @Test
  func unencodableImageIsRejectedAsUnsupportedType() {
    // An empty `UIImage` has no backing bitmap, so neither JPEG nor PNG can be
    // produced — the encoder maps that to `.unsupportedType`.
    let encoder = ImageEncoder()
    #expect(throws: OakError.imageRejected(reason: .unsupportedType)) {
      try encoder.encode([UIImage()])
    }
  }

  // MARK: Downscaling — the "images never send" regression guard

  @Test
  func largeImageIsDownscaledUnderTheCaps() throws {
    // The bug: a full-resolution photo re-encoded at native dimensions blew the
    // per-image byte cap, so `encode` threw `.perImageTooLarge` and the turn failed
    // with a generic banner. With downscaling, it must encode SUCCESSFULLY — under
    // both the longest-edge cap and the per-image byte cap.
    let encoder = ImageEncoder()
    let encoded = try encoder.encode([largeImage()])
    let attachment = try #require(encoded.first)

    let bytes = try #require(Data(base64Encoded: attachment.data))
    #expect(bytes.count <= ImageEncoder.defaultMaxImageBytes)

    // The decoded pixels are capped at the longest-edge limit — the content-agnostic
    // proof that the downscale ran (a flat image would slip under the byte cap even
    // un-scaled, so the byte check alone wouldn't catch a regression).
    let decoded = try #require(UIImage(data: bytes)?.cgImage)
    #expect(max(decoded.width, decoded.height) <= ImageEncoder.defaultMaxDimension)
  }

  @Test
  func multipleLargeImagesStayUnderTheTotalCap() throws {
    // Four full-resolution photos (the max per turn) must fit the 10 MiB total after
    // downscaling — otherwise a normal multi-image turn would `.totalTooLarge`.
    let encoder = ImageEncoder()
    let encoded = try encoder.encode((0..<4).map { _ in largeImage() })
    #expect(encoded.count == 4)
    let total = encoded.reduce(0) { $0 + (Data(base64Encoded: $1.data)?.count ?? 0) }
    #expect(total <= ImageEncoder.defaultMaxTotalBytes)
  }

  // MARK: Output shape — raw base64, supported MIME, no prefix

  @Test
  func encodesToRawBase64WithNoDataPrefix() throws {
    let encoder = ImageEncoder()
    let encoded = try encoder.encode([sampleImage()])

    #expect(encoded.count == 1)
    let image = try #require(encoded.first)
    // RAW base64 — never a `data:` URL (the wire shape the server expects).
    #expect(!image.data.hasPrefix("data:"))
    // It is well-formed base64 that decodes to non-empty bytes.
    let decoded = try #require(Data(base64Encoded: image.data))
    #expect(!decoded.isEmpty)
    // Re-encoded to a provider-accepted type.
    #expect(["image/jpeg", "image/png"].contains(image.mimeType))
  }

  // MARK: Empty / image-only turns

  @Test
  func emptyInputIsTheTextOnlyPath() throws {
    // No attachments → no images, no throw (a plain text turn).
    let encoded = try ImageEncoder().encode([])
    #expect(encoded.isEmpty)
  }

  @Test
  func imageOnlyTurnProducesAttachments() throws {
    // An image-only turn (empty text on the composer) is valid: encoding a single
    // image with no accompanying text still yields one wire attachment (M-AC-5.4).
    let encoded = try ImageEncoder().encode([sampleImage()])
    #expect(encoded.count == 1)
  }

  @Test
  func multipleImagesWithinCapsAllEncode() throws {
    let encoder = ImageEncoder()
    let encoded = try encoder.encode([sampleImage(), sampleImage(), sampleImage()])
    #expect(encoded.count == 3)
    for image in encoded {
      #expect(!image.data.hasPrefix("data:"))
      #expect(Data(base64Encoded: image.data) != nil)
    }
  }
}
