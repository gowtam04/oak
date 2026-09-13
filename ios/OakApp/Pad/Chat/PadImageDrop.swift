import Foundation
import UIKit
import UniformTypeIdentifiers

/// Drop preflight for Pad composer image attach (P-CHAT-US-4, P-SHELL-AC-7.3–7.4).
/// `validate` nil = accept; the host still stages via ``ChatViewModel/attachImages``.
@MainActor
enum PadImageDrop {
  enum Rejection: Equatable {
    case tooMany
    case notImage
  }

  /// Fifth image / a drop that would exceed `maxAttached` → `.tooMany`.
  static func validate(
    incomingCount: Int,
    alreadyAttached: Int,
    maxAttached: Int = ChatViewModel.maxAttachedImages
  ) -> Rejection? {
    if incomingCount + alreadyAttached > maxAttached { return .tooMany }
    return nil
  }

  /// True when `uti` is `public.image` or conforms to it (jpeg/png/heic/…).
  nonisolated static func isImageType(uti: String) -> Bool {
    guard let type = UTType(uti) else { return false }
    return type.conforms(to: .image)
  }

  /// Existing attach-note / `OakError.imageRejected` copy for a drop rejection.
  static func message(for rejection: Rejection) -> String {
    switch rejection {
    case .tooMany:
      ChatViewModel.imageRejectedMessage(.tooMany)
    case .notImage:
      ChatViewModel.imageRejectedMessage(.unsupportedType)
    }
  }

  /// Whole-drop rule (P-SHELL-AC-7.4): every provider must yield an image.
  /// A partial load (mixed JPEG+PDF file URLs) is `.notImage` and must not
  /// attach the images that did load.
  static func rejectionAfterLoad(loadedCount: Int, providerCount: Int) -> Rejection? {
    if loadedCount != providerCount || loadedCount == 0 { return .notImage }
    return nil
  }

  /// Stages loaded images only when the drop is complete and under the cap.
  /// Returns a rejection and does **not** call ``ChatViewModel/attachImages``
  /// when any provider failed to load as an image.
  @discardableResult
  static func applyLoadedImages(
    _ images: [UIImage],
    providerCount: Int,
    to model: ChatViewModel
  ) -> Rejection? {
    if let rejection = rejectionAfterLoad(
      loadedCount: images.count, providerCount: providerCount
    ) {
      return rejection
    }
    if let rejection = validate(
      incomingCount: images.count, alreadyAttached: model.pendingImages.count
    ) {
      return rejection
    }
    _ = model.attachImages(images)
    return nil
  }

  /// True when the provider is a known non-image (PDF, plain text, …).
  /// File-URL-only providers are *not* known non-images — the host loads them.
  nonisolated static func isKnownNonImage(_ provider: NSItemProvider) -> Bool {
    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      return false
    }
    let skip: Set<String> = [
      UTType.fileURL.identifier,
      UTType.url.identifier,
      UTType.item.identifier,
      UTType.data.identifier,
      "public.content",
    ]
    let rest = provider.registeredTypeIdentifiers.filter { !skip.contains($0) }
    if rest.isEmpty { return false }
    return rest.allSatisfy { !isImageType(uti: $0) }
  }
}
