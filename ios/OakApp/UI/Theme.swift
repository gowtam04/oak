import SwiftUI
import UIKit

/// Oak's brand expression over iOS.
///
/// Colors are sourced from the web design system (`web/src/app/globals.css`) and
/// re-expressed natively. Brand/semantic colors adapt to light & dark via a
/// dynamic `UIColor` provider. Surfaces use the **warm neutral ramp** — a brand
/// paper identity (`canvas` #FBF9F7 / #171412, `surface` #FFFFFF / #211D1A,
/// `surfaceSunken` #F4F0EC / #121009) — rather than raw system semantics, so
/// light mode carries Oak's paper warmth and dark mode avoids the temperature
/// seam that appeared when the warm header band sat against a pure-black canvas.
/// Text and separator remain on system semantics so they continue to inherit
/// Dynamic Type contrast, increased-contrast, and dark-mode behaviour
/// automatically (M-AC-UI1.2, M-AC-UI1.3, M-AC-UI1.4).
///
/// Color is never the sole carrier of meaning (M-AC-UI9.3) — that pairing with
/// text/icon is the calling view's responsibility; `Theme` only supplies the
/// palette and type ramp.
enum Theme {
  // MARK: Brand

  /// Pokédex red — the primary brand/accent color (mirrored by `AccentColor`).
  static let accent = adaptive(light: 0xEE5A5A, dark: 0xFF6B6B)
  static let accentHover = adaptive(light: 0xE04545, dark: 0xFF7E7E)
  static let accentActive = adaptive(light: 0xC93B3B, dark: 0xF25C5C)
  static let sunflower = adaptive(light: 0xF5A524, dark: 0xF8B73E)
  static let azure = adaptive(light: 0x3AA0E3, dark: 0x5BB4EF)

  // MARK: Semantic

  static let success = adaptive(light: 0x2FB573, dark: 0x46C98A)
  static let warning = adaptive(light: 0xF08C00, dark: 0xFBA53B)
  static let danger = adaptive(light: 0xE0394A, dark: 0xFF5C6B)
  static let info = adaptive(light: 0x3AA0E3, dark: 0x5BB4EF)

  // MARK: Surfaces (warm neutral ramp — brand paper identity)

  /// The screen/chat canvas — the base layer every screen sits on.
  /// Light: #FBF9F7 (warm paper); dark: #171412 (warm near-black).
  static let canvas = adaptive(light: 0xFBF9F7, dark: 0x171412)

  /// Legacy alias for `canvas` — kept so existing call sites resolve without edits.
  /// Prefer `canvas` for new call sites.
  static let background = canvas

  /// Card / modal surface — lifts one level above `canvas`.
  /// Light: #FFFFFF; dark: #211D1A.
  static let surface = adaptive(light: 0xFFFFFF, dark: 0x211D1A)

  /// Floating / tooltip surface — lifts above `surface`.
  /// Light: #FFFFFF; dark: #26211D.
  static let surfaceRaised = adaptive(light: 0xFFFFFF, dark: 0x26211D)

  /// Recessed well — inputs, search bars, inner wells.
  /// Light: #F4F0EC; dark: #121009.
  static let surfaceSunken = adaptive(light: 0xF4F0EC, dark: 0x121009)

  // MARK: Text & separator (system semantics — Dynamic Type & contrast for free)

  static let separator = Color(uiColor: .separator)
  static let textPrimary = Color(uiColor: .label)
  static let textSecondary = Color(uiColor: .secondaryLabel)
  static let textMuted = Color(uiColor: .tertiaryLabel)

  // MARK: Corner radii (brand favors generous rounding)

  enum Radius {
    static let sm: CGFloat = 6
    static let md: CGFloat = 10
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let pill: CGFloat = 999
  }

  // MARK: Spacing scale

  /// A six-stop spacing scale. Adopt these tokens as magic padding/gap literals
  /// are touched — never add new raw literals.
  ///
  /// | Token | pt | Typical use |
  /// |-------|----|-------------|
  /// | `xs`  |  4 | Icon–label gap, tight chip padding |
  /// | `sm`  |  8 | Row internal gap, compact cell padding |
  /// | `md`  | 12 | Card internal padding (dense), banner padding |
  /// | `lg`  | 16 | Standard screen gutter, card padding |
  /// | `xl`  | 24 | Section gap between card groups |
  /// | `xxl` | 32 | Hero / large-section spacing |
  enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16   // standard screen gutter & card padding
    static let xl: CGFloat = 24   // section gap
    static let xxl: CGFloat = 32
  }

  // MARK: Typography (Dynamic Type styles only — no fixed point sizes)

  /// Display face — rounded + semibold to echo Oak's "playful chrome".
  static func display(_ style: Font.TextStyle = .title) -> Font {
    .system(style, design: .rounded).weight(.semibold)
  }

  /// Body face — the system default at the given text style.
  static func body(_ style: Font.TextStyle = .body) -> Font {
    .system(style)
  }

  /// Monospaced face — for "precise data" (stats, dex numbers, damage rolls).
  static func mono(_ style: Font.TextStyle = .body) -> Font {
    .system(style, design: .monospaced)
  }

  /// Answer-lead role — the verdict at the top of every answer card.
  /// SF Pro semibold `.title3` (20 pt base, scales with Dynamic Type).
  /// Apply to the first paragraph of Oak's answer — it is the largest text
  /// element in any conversation and should land as the editorial masthead.
  static func answerLead() -> Font {
    .system(.title3).weight(.semibold)
  }

  /// Instrument voice — mono semibold, typically `.caption2` (11 pt base).
  /// Uppercase with 0.8pt tracking (see `instrumentLabel` View extension) for
  /// scope tags (`CHAMPIONS · REG M-B`), tool-trail labels (`GET_POKEMON ·
  /// GARCHOMP`), section heads (`BASE STATS`, `SOURCES · 1`), and dex-number
  /// captions. Pass a wider `style` when the context needs more breathing room.
  static func instrument(_ style: Font.TextStyle = .caption2) -> Font {
    .system(style, design: .monospaced).weight(.semibold)
  }

  // MARK: Pokémon type colors (theme-stable, mirrors the 18 web type solids)

  /// The brand color for a Pokémon type name (e.g. "fire"). Unknown names fall
  /// back to the Normal-type solid. Pair with the type's text label — never use
  /// color alone to convey the type (M-AC-UI9.3).
  static func type(_ name: String) -> Color {
    typeColors[name.lowercased()] ?? typeColors["normal"]!
  }

  private static let typeColors: [String: Color] = [
    "normal": solid(0xA8A77A),
    "fire": solid(0xEE8130),
    "water": solid(0x6390F0),
    "electric": solid(0xF7D02C),
    "grass": solid(0x7AC74C),
    "ice": solid(0x96D9D6),
    "fighting": solid(0xC22E28),
    "poison": solid(0xA33EA1),
    "ground": solid(0xE2BF65),
    "flying": solid(0xA98FF3),
    "psychic": solid(0xF95587),
    "bug": solid(0xA6B91A),
    "rock": solid(0xB6A136),
    "ghost": solid(0x735797),
    "dragon": solid(0x6F35FC),
    "dark": solid(0x705746),
    "steel": solid(0xB7B7CE),
    "fairy": solid(0xD685AD),
  ]

  // MARK: Pokémon type display order (mirrors web TYPE_DISPLAY_ORDER — schemas.ts)

  /// Champions display order for the 18 types — same permutation the web uses to
  /// cluster same-type moves in the movepool. Unknown/"" sorts last.
  private static let typeDisplayOrder: [String] = [
    "normal", "grass", "fire", "water", "electric", "bug", "flying", "rock",
    "poison", "ground", "ice", "fighting", "psychic", "ghost", "dragon", "dark",
    "steel", "fairy",
  ]

  private static let typeDisplayRank: [String: Int] = Dictionary(
    uniqueKeysWithValues: typeDisplayOrder.enumerated().map { ($1, $0) }
  )

  /// Sort index for a type slug in display order; unknown/"" sorts last
  /// (mirrors `typeDisplayIndex` in schemas.ts).
  static func typeDisplayIndex(_ type: String) -> Int {
    typeDisplayRank[type.lowercased()] ?? Int.max
  }

  // MARK: Helpers

  /// A color that resolves to `light`/`dark` 0xRRGGBB values per the active
  /// interface style, updating automatically when the user toggles appearance.
  private static func adaptive(light: UInt32, dark: UInt32) -> Color {
    Color(
      uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
          ? UIColor(rgb: dark)
          : UIColor(rgb: light)
      }
    )
  }

  /// A theme-stable color from a 0xRRGGBB value.
  private static func solid(_ rgb: UInt32) -> Color {
    Color(uiColor: UIColor(rgb: rgb))
  }
}

private extension UIColor {
  /// Builds an opaque color from a packed 0xRRGGBB integer.
  convenience init(rgb: UInt32) {
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}

// MARK: - Elevation (Theme.Shadow)

extension Theme {
  /// A two-layer drop shadow — a tight, dark **key** layer plus a soft, wide
  /// **ambient** layer — the recipe first-class iOS surfaces use to read as
  /// physically raised rather than outlined. Apply with `View.oakShadow(_:)`
  /// (see `OakCard.swift`); the `oakCard` modifier folds the `card` token in
  /// automatically and drops it entirely in dark mode (constraint 6 — dark keeps
  /// a stroke instead).
  ///
  /// Radii are the SwiftUI blur radius (≈ the CSS blur value halved), so the
  /// tokens read the same as the web design system while landing at the right
  /// visual weight natively. Shadow is decorative only — it never carries
  /// meaning, so there is no accessibility concern (M-AC-UI9.3).
  struct Shadow {
    /// One shadow pass: a color (pre-multiplied opacity), a blur radius, and an
    /// offset. `x` defaults to 0 — Oak's elevation is straight-down light.
    struct Layer {
      var color: Color
      var radius: CGFloat
      var x: CGFloat = 0
      var y: CGFloat
    }

    /// The tight, near-opaque contact shadow.
    var key: Layer
    /// The soft, wide cast shadow.
    var ambient: Layer

    /// Resting card elevation (key y=1 blur=2 @ black 8%; ambient y=8 blur=24 @ black 6%).
    static let card = Shadow(
      key: Layer(color: .black.opacity(0.08), radius: 1, y: 1),
      ambient: Layer(color: .black.opacity(0.06), radius: 12, y: 8)
    )

    /// Lifted elevation for pressed/floating surfaces (key y=2 blur=6 @ 10%; ambient y=12 blur=32 @ 8%).
    static let raised = Shadow(
      key: Layer(color: .black.opacity(0.10), radius: 3, y: 2),
      ambient: Layer(color: .black.opacity(0.08), radius: 16, y: 12)
    )

    /// A single-layer accent-tinted glow (y=2 blur=8 @ 25% of `color`) — for
    /// emphasis moments like the user's own chat bubble. Both layers share the
    /// same tinted pass so `oakShadow` renders one soft colored halo.
    static func glow(_ color: Color) -> Shadow {
      let layer = Layer(color: color.opacity(0.25), radius: 4, y: 2)
      return Shadow(key: layer, ambient: layer)
    }
  }
}

// MARK: - Motion (Theme.Motion)

extension Theme {
  /// The shared animation vocabulary. Two springs cover almost everything —
  /// `snappy` for direct-manipulation feedback (presses, focus, toggles) and
  /// `smooth` for content settling in (bubbles, cards, list reflow) — plus a
  /// `staggered` helper for cascade-in sequences.
  ///
  /// Callers gate every use behind `@Environment(\.accessibilityReduceMotion)`
  /// (constraint 2): with Reduce Motion on, movement/scale becomes an opacity
  /// crossfade or is dropped. These tokens are the *what*; the *whether* stays
  /// the calling view's decision.
  enum Motion {
    /// Direct-feedback spring — fast, lightly damped. Presses, focus, toggles.
    static let snappy: Animation = .spring(response: 0.28, dampingFraction: 0.8)

    /// Content-settling spring — slower, well damped. Bubbles, cards, reflow.
    static let smooth: Animation = .spring(response: 0.45, dampingFraction: 0.85)

    /// `base` delayed by `step × index` — the per-item offset that turns a batch
    /// appearance into a cascade. Index 0 plays immediately.
    static func staggered(_ index: Int, base: Animation = smooth, step: Double = 0.04) -> Animation {
      base.delay(step * Double(index))
    }
  }
}

// MARK: - Type gradients

extension Theme {
  /// A diagonal (top-leading → bottom-trailing) wash of a Pokémon type's brand
  /// color, faint enough (12% → 4%; dark 18% → 6%) to tint a hero header or
  /// subject card without competing with its text. Pair with the type's label —
  /// the gradient is enhancement, never the sole carrier of the type (M-AC-UI9.3).
  ///
  /// Pass `scheme` to bake in a fixed appearance; omit it (`nil`) for a wash that
  /// re-resolves live as the system toggles light/dark.
  static func typeGradient(_ name: String, in scheme: ColorScheme? = nil) -> LinearGradient {
    let base = type(name)
    return LinearGradient(
      colors: [
        washColor(base, light: 0.12, dark: 0.18, scheme: scheme),
        washColor(base, light: 0.04, dark: 0.06, scheme: scheme),
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  /// A two-type diagonal wash — `primary` anchored at the top-leading corner,
  /// `secondary` at the bottom-trailing — for dual-type subjects. Falls back to
  /// the single-type wash when `secondary` is nil/blank. The washes track the
  /// active appearance automatically.
  static func typeGradient(primary: String, secondary: String?) -> LinearGradient {
    guard let secondary, !secondary.trimmingCharacters(in: .whitespaces).isEmpty else {
      return typeGradient(primary)
    }
    return LinearGradient(
      colors: [
        washColor(type(primary), light: 0.12, dark: 0.18, scheme: nil),
        washColor(type(secondary), light: 0.08, dark: 0.12, scheme: nil),
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  /// `base` at a scheme-dependent opacity. With an explicit `scheme` the alpha is
  /// baked; with `nil` it returns a dynamic color that re-resolves per trait
  /// collection so a single gradient value adapts to appearance changes.
  private static func washColor(
    _ base: Color, light: Double, dark: Double, scheme: ColorScheme?
  ) -> Color {
    if let scheme {
      return base.opacity(scheme == .dark ? dark : light)
    }
    return Color(
      uiColor: UIColor { traits in
        let alpha = traits.userInterfaceStyle == .dark ? dark : light
        return UIColor(base).resolvedColor(with: traits).withAlphaComponent(alpha)
      }
    )
  }
}

// MARK: - Instrument voice (View extension)

extension View {
  /// Applies the "instrument" typographic voice: `Theme.instrument(style)` +
  /// 0.8 pt letter-spacing + uppercase transform.
  ///
  /// Use for scope tags (`CHAMPIONS · REG M-B`), tool-trail labels
  /// (`GET_POKEMON · GARCHOMP`), section heads (`BASE STATS`, `SOURCES · 1`),
  /// and dex-number captions. The mono + caps + tight tracking combination
  /// reads as engraved instrument output, tying data labels across every surface
  /// into one recognisable voice.
  ///
  /// - Parameter style: The Dynamic Type style to pass through to
  ///   `Theme.instrument`. Defaults to `.caption2` (11 pt base).
  func instrumentLabel(_ style: Font.TextStyle = .caption2) -> some View {
    self
      .font(Theme.instrument(style))
      .tracking(0.8)
      .textCase(.uppercase)
  }
}
