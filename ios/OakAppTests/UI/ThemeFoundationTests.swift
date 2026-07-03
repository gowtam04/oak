import SwiftUI
import Testing

@testable import OakApp

/// Compile-and-contract guards for the Phase-1 design foundation (Theme
/// elevation/motion/gradient tokens plus the shared UI components). SwiftUI view
/// bodies can't be introspected without a third-party package (ADR-5 forbids
/// one), so these are deliberately structural: they pin the **public API surface
/// and token values** that five later phases were briefed against, not rendered
/// pixels. If a token is renamed or a signature drifts, this fails to compile.
///
/// `@MainActor` because constructing SwiftUI views is main-actor work.
@MainActor
struct ThemeFoundationTests {

  // MARK: Motion

  @Test
  func staggeredDelaysBaseByStepTimesIndex() {
    // staggered(index) == base delayed by step·index (index 0 == a zero delay).
    #expect(Theme.Motion.staggered(0) == Theme.Motion.smooth.delay(0))
    #expect(Theme.Motion.staggered(3) == Theme.Motion.smooth.delay(0.04 * 3))
    #expect(
      Theme.Motion.staggered(2, base: Theme.Motion.snappy, step: 0.1)
        == Theme.Motion.snappy.delay(0.1 * 2)
    )
  }

  @Test
  func motionSpringsAreDistinct() {
    #expect(Theme.Motion.snappy != Theme.Motion.smooth)
  }

  // MARK: Elevation

  @Test
  func shadowTokensCarryTheSpecifiedOffsets() {
    #expect(Theme.Shadow.card.key.y == 1)
    #expect(Theme.Shadow.card.ambient.y == 8)
    #expect(Theme.Shadow.raised.key.y == 2)
    #expect(Theme.Shadow.raised.ambient.y == 12)
  }

  @Test
  func glowIsASingleTintedLayerAtOffsetTwo() {
    let glow = Theme.Shadow.glow(Theme.accent)
    #expect(glow.key.y == 2)
    #expect(glow.ambient.y == 2)
  }

  // MARK: Type gradients

  @Test
  func typeGradientBuildsForSingleAndDualType() {
    // Non-optional returns — construction that doesn't trap is the guard.
    _ = Theme.typeGradient("fire")
    _ = Theme.typeGradient("fire", in: .dark)
    _ = Theme.typeGradient(primary: "dragon", secondary: "ground")
    _ = Theme.typeGradient(primary: "dragon", secondary: nil)
    #expect(Bool(true))
  }

  // MARK: Component construction (signatures compile with their defaults)

  @Test
  func foundationComponentsConstructWithDefaults() {
    _ = OakSpinner()
    _ = OakSpinner(size: 32)
    _ = OakBrandMark()
    _ = OakBrandMark(size: 64)
    _ = SkeletonBlock()
    _ = SkeletonBlock(width: 120, height: 14)
    _ = SkeletonListRow()
    #expect(Bool(true))
  }

  @Test
  func viewModifiersAndButtonStyleCompile() {
    _ = Color.clear.oakCard()
    _ = Color.clear.oakCard(radius: Theme.Radius.md, tint: Theme.type("water"))
    _ = Color.clear.oakShadow(.card)
    _ = Color.clear.shimmer()
    _ = Color.clear.shimmer(active: false)
    _ = OakPressableButtonStyle()
    #expect(Bool(true))
  }
}
