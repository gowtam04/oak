import SwiftUI
import Testing
import UIKit

@testable import OakApp

/// Contract guards for ``SpriteImage``'s still/decorative list-thumb API.
/// View bodies can't be introspected without a third-party package, so these
/// pin the helper that list thumbs use (`stillImage(from:)`) plus the init
/// surface Wave 2 will call.
@MainActor
struct SpriteImageTests {

  @Test
  func stillImageFromStillReturnsThatImage() {
    let image = solidImage(.systemRed)
    let result = SpriteImage.stillImage(from: .still(image))
    #expect(result === image)
  }

  @Test
  func stillImageFromAnimatedReturnsFirstFrameNotTheAnimatedImage() {
    let first = solidImage(.systemRed)
    let animated = solidImage(.systemBlue)
    let animation = SpriteDecoder.Animation(
      image: animated,
      firstFrame: first,
      frameCount: 3,
      duration: 0.3
    )
    let result = SpriteImage.stillImage(from: .animated(animation))
    #expect(result === first)
    #expect(result !== animated)
  }

  @Test
  func constructsWithDefaultsAndStillDecorative() {
    _ = SpriteImage(url: nil, name: "Garchomp")
    _ = SpriteImage(urlString: nil, name: "Garchomp")
    _ = SpriteImage(url: nil, name: "Garchomp", animated: false, decorative: true)
    _ = SpriteImage(
      urlString: nil,
      name: "Garchomp",
      size: 32,
      animated: false,
      decorative: true
    )
    #expect(Bool(true))
  }

  private func solidImage(_ color: UIColor, side: Int = 4) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    return renderer.image { context in
      color.setFill()
      context.fill(CGRect(x: 0, y: 0, width: side, height: side))
    }
  }
}
