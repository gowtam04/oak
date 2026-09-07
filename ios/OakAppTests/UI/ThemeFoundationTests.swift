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
    // step defaults to 0.06 (60ms) — the instrument ticker's cascade stagger.
    #expect(Theme.Motion.staggered(0) == Theme.Motion.smooth.delay(0))
    #expect(Theme.Motion.staggered(3) == Theme.Motion.smooth.delay(0.06 * 3))
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
    #expect(Theme.Shadow.card.ambient.y == 6)
    #expect(Theme.Shadow.raised.key.y == 2)
    #expect(Theme.Shadow.raised.ambient.y == 10)
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

  // MARK: Specimen plate + type-glow (Phase 1–2)

  @Test
  func plateAtmosphereResolveMatchesSubjectRules() {
    #expect(Theme.PlateAtmosphere.resolve(subjectTypes: []) == .mechanics)
    #expect(
      Theme.PlateAtmosphere.resolve(subjectTypes: [["dragon", "ground"]])
        == .typed(primary: "dragon", secondary: "ground")
    )
    #expect(
      Theme.PlateAtmosphere.resolve(subjectTypes: [["fire"], ["water"]]) == .multi
    )
  }

  @Test
  func typeGlowWellModifierCompiles() {
    _ = Color.clear.oakTypeGlowWell(primary: "dragon", secondary: "ground")
    #expect(Bool(true))
  }

  @Test
  func streamingWashTypeHeuristicIsConservative() {
    #expect(Theme.streamingWashType(from: []) == nil)
    #expect(Theme.streamingWashType(from: ["Looking up Garchomp"]) == nil)
    #expect(Theme.streamingWashType(from: ["Dragon type matchups"]) == "dragon")
    // Ambiguous multi-type mentions → no wash.
    #expect(
      Theme.streamingWashType(from: ["Fire vs Water matchup"]) == nil
    )
  }

  // MARK: Component construction (signatures compile with their defaults)

  @Test
  func foundationComponentsConstructWithDefaults() {
    _ = OakSpinner()
    _ = OakSpinner(size: 32)
    _ = OakBrandMark()
    _ = OakBrandMark(size: 64)
    _ = OakWordmarkLockup()
    _ = OakWordmarkLockup(showsWordmark: false)
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
    _ = Color.clear.oakEnamelNav()
    _ = Color.clear.oakInsetWell()
    _ = Color.clear.shimmer()
    _ = Color.clear.shimmer(active: false)
    _ = OakPressableButtonStyle()
    #expect(Bool(true))
  }

  @Test
  func typeBadgeChromeMixesConstruct() {
    _ = Theme.TypeBadgeChrome.fill("fire")
    _ = Theme.TypeBadgeChrome.ink("water")
    _ = Theme.TypeBadgeChrome.border("dragon")
    _ = TypeBadge(type: "grass")
    _ = Theme.userBubble
    _ = Theme.userBubbleBorder
    #expect(Bool(true))
  }

  // MARK: Warm neutral ramp (canvas + surfaceSunken)

  /// `canvas` and `background` are the same value (legacy alias).
  /// Structural check: both are non-nil Color instances that compile.
  @Test
  func canvasAndBackgroundAliasResolve() {
    // Construction must not trap; Color equality isn't available without
    // UIKit/UIColor introspection — the compile guard is the test.
    _ = Theme.canvas
    _ = Theme.background
    _ = Theme.surface
    _ = Theme.surfaceRaised
    _ = Theme.surfaceSunken
    _ = Theme.sunflower
    _ = Theme.uiSurface
    _ = Theme.uiOnRed
    _ = Theme.uiPokeRed
    _ = Theme.Motion.spring
    #expect(Bool(true))
  }

  // MARK: Spacing scale

  @Test
  func spacingScaleValuesMatchSpec() {
    #expect(Theme.Spacing.xs == 4)
    #expect(Theme.Spacing.sm == 8)
    #expect(Theme.Spacing.md == 12)
    #expect(Theme.Spacing.lg == 16)
    #expect(Theme.Spacing.xl == 24)
    #expect(Theme.Spacing.xxl == 32)
  }

  @Test
  func spacingScaleIsStrictlyAscending() {
    let stops: [CGFloat] = [
      Theme.Spacing.xs,
      Theme.Spacing.sm,
      Theme.Spacing.md,
      Theme.Spacing.lg,
      Theme.Spacing.xl,
      Theme.Spacing.xxl,
    ]
    for i in stops.indices.dropLast() {
      #expect(stops[i] < stops[i + 1])
    }
  }

  // MARK: Typography roles

  @Test
  func answerLeadFontConstructsWithNoArgs() {
    // Non-optional return; compilation + non-trap is the contract.
    _ = Theme.answerLead()
    #expect(Bool(true))
  }

  @Test
  func instrumentFontConstructsWithDefaultAndExplicitStyle() {
    _ = Theme.instrument()
    _ = Theme.instrument(.caption)
    _ = Theme.instrument(.footnote)
    #expect(Bool(true))
  }

  // MARK: Instrument label View extension

  @Test
  func instrumentLabelModifierCompiles() {
    // The `.instrumentLabel()` modifier must apply without error.
    _ = Text("CHAMPIONS · REG M-B").instrumentLabel()
    _ = Text("SOURCES · 1").instrumentLabel(.caption)
    #expect(Bool(true))
  }

  // MARK: ErrorBanner component

  @Test
  func errorBannerConstructsWithAllCombinations() {
    // All four parameter combinations must construct without trapping.
    _ = ErrorBanner(message: "Something went wrong.")
    _ = ErrorBanner(message: "Something went wrong.", onDismiss: {})
    _ = ErrorBanner(
      message: "Something went wrong.",
      retryTitle: "Retry",
      onRetry: {}
    )
    _ = ErrorBanner(
      message: "Something went wrong.",
      retryTitle: "Try again",
      onRetry: {},
      onDismiss: {}
    )
    #expect(Bool(true))
  }
}
