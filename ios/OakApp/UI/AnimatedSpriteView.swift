import SwiftUI
import UIKit

/// Plays a decoded animated sprite (a multi-frame ``SpriteDecoder/Animation``) by
/// wrapping a `UIImageView` — SwiftUI has no native animated-image view, and
/// `AsyncImage` shows only a GIF's first frame.
///
/// It mirrors ``SpriteImage``'s static rendering pixel-for-pixel: `scaleAspectFit`
/// inside the caller's square frame, and nearest-neighbor min/mag filtering so the
/// tiny pixel-art sprite stays crisp when upscaled (the UIKit equivalent of the
/// still path's `.interpolation(.none)`).
///
/// Accessibility: the image view is *not* an accessibility element — the surrounding
/// ``SpriteImage`` carries the single labelled element (the entity name), exactly as
/// the still path does.
struct AnimatedSpriteView: UIViewRepresentable {
  /// The animated `UIImage` produced by ``SpriteDecoder``.
  let image: UIImage

  func makeUIView(context: Context) -> UIImageView {
    let view = UIImageView()
    view.contentMode = .scaleAspectFit
    view.layer.magnificationFilter = .nearest
    view.layer.minificationFilter = .nearest
    view.isAccessibilityElement = false
    // Let SwiftUI's proposed frame drive the size rather than the sprite's own tiny
    // intrinsic pixel dimensions, so it fills the same box the still image would.
    view.setContentHuggingPriority(.defaultLow, for: .horizontal)
    view.setContentHuggingPriority(.defaultLow, for: .vertical)
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    view.image = image
    view.startAnimating()
    return view
  }

  func updateUIView(_ view: UIImageView, context: Context) {
    // Recycled row swapped to a different sprite: re-point and restart playback.
    if view.image !== image {
      view.image = image
      view.startAnimating()
    } else if !view.isAnimating {
      view.startAnimating()
    }
  }
}
