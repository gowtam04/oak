import SwiftUI
import UIKit

/// Oak's brand expression over iOS.
///
/// Colors are sourced from Enamel & Paper (`docs/design/enamel-paper.md`)
/// and re-expressed natively. Brand/semantic colors adapt to light & dark
/// via a dynamic `UIColor` provider. Surfaces use a **warm taupe ramp**
/// (`canvas` #FBF7F4 / #161311, `surface` #FFFFFF / #231F1C, `surfaceSunken`
/// #F7F1EB / #1C1916). The enamel lid is coral `#EE5A5A` / dark `#C44545`.
/// Typefaces: **Fredoka** / **Nunito Sans** / **JetBrains Mono**.
///
/// Not Signal. Not Liquid Glass.
///
/// Contrast was designed into the ramp; Dynamic Type still scales via the
/// custom-font `relativeTo:` anchors (M-AC-UI1.2–1.4). Custom fonts don't
/// synthesize weights reliably, so the weight-aware overloads switch the
/// PostScript face per weight rather than calling `.weight()`.
///
/// Color is never the sole carrier of meaning (M-AC-UI9.3) — that pairing with
/// text/icon is the calling view's responsibility; `Theme` only supplies the
/// palette and type ramp.
enum Theme {
  // MARK: Brand

  /// Enamel coral — lid, primary fills (mirrored by `AccentColor` / `uiPokeRed`).
  static let accent = adaptive(light: 0xEE5A5A, dark: 0xC44545)
  static let accentHover = adaptive(light: 0xE04545, dark: 0xD45656)
  static let accentActive = adaptive(light: 0xC93B3B, dark: 0xB33A3A)
  /// Info/focus blue — links, inference. Not the brand focus (composer uses red).
  static let azure = adaptive(light: 0x3AA0E3, dark: 0x5BB4EF)
  /// Estimate / energy tag.
  static let sunflower = adaptive(light: 0xF5A524, dark: 0xF8B73E)

  // MARK: Semantic

  static let success = adaptive(light: 0x2FB573, dark: 0x46C98A)
  static let warning = adaptive(light: 0xF08C00, dark: 0xFBA53B)
  static let danger = adaptive(light: 0xE0394A, dark: 0xFF5C6B)
  static let info = azure

  // MARK: Soft tints (faint fills for chips, callouts, selection washes)

  /// Faint accent fill — chip hover, user-bubble mix, selected scope row.
  static let accentSoft = adaptive(light: 0xFCEBEB, dark: 0x3A1E1E)
  /// Faint azure fill — inference callout.
  static let azureSoft = adaptive(light: 0xE6F2FB, dark: 0x16263A)
  static let sunflowerSoft = adaptive(light: 0xFDF1DC, dark: 0x3A2E14)
  static let successSoft = adaptive(light: 0xE3F6EC, dark: 0x10301F)
  static let warningSoft = adaptive(light: 0xFDEFD9, dark: 0x3A2A0F)
  static let dangerSoft = adaptive(light: 0xFCE8EA, dark: 0x3A1518)

  /// User chat bubble — `accentSoft` mixed 55% over `surface` (not `surfaceSunken`).
  /// Signal forbade the red bubble; Enamel restores it. The `UserMessageView`
  /// restyle is PR3 — token only here.
  static let userBubble = Color(
    uiColor: UIColor { traits in
      let isDark = traits.userInterfaceStyle == .dark
      return UIColor.mix(
        rgb: isDark ? 0x3A1E1E : 0xFCEBEB,
        over: isDark ? 0x231F1C : 0xFFFFFF,
        amount: 0.55
      )
    }
  )

  /// Text/icon on a solid enamel fill. White in both themes — not Signal's
  /// near-black `#1B1410` (dark lid `#C44545` is AA with white).
  static let onRed = adaptive(light: 0xFFFFFF, dark: 0xFFFFFF)

  // MARK: Surfaces (warm taupe ramp — Enamel & Paper)

  /// The screen/chat canvas — rag paper under the enamel lid.
  /// Light: #FBF7F4; dark: #161311.
  static let canvas = adaptive(light: 0xFBF7F4, dark: 0x161311)

  /// Legacy alias for `canvas` — kept so existing call sites resolve without edits.
  /// Prefer `canvas` for new call sites.
  static let background = canvas

  /// Card / modal surface — lifts one level above `canvas`.
  /// Light: #FFFFFF; dark: #231F1C.
  static let surface = adaptive(light: 0xFFFFFF, dark: 0x231F1C)

  /// Floating / tooltip surface — lifts above `surface`.
  /// Light: #FFFFFF; dark: #332D29.
  static let surfaceRaised = adaptive(light: 0xFFFFFF, dark: 0x332D29)

  /// Recessed well — inputs, search bars, inner wells.
  /// Light: #F7F1EB; dark: #1C1916.
  static let surfaceSunken = adaptive(light: 0xF7F1EB, dark: 0x1C1916)

  // MARK: Text & separator (warm ink ramp — Enamel tokens)

  /// Hairline dividers, card borders.
  static let separator = adaptive(light: 0xE9E0D8, dark: 0x3A332E)
  /// Alias of `separator` for call sites that read a "border" role.
  static let border = separator
  /// A stronger hairline — button/composer outlines, emphasized edges.
  static let borderStrong = adaptive(light: 0xD8CCC1, dark: 0x4E453F)

  /// Emphasized ink — headings, wordmark, verdict.
  static let textStrong = adaptive(light: 0x2A2521, dark: 0xF5EFE9)
  /// Default body ink.
  static let textPrimary = adaptive(light: 0x3D362F, dark: 0xE4DAD0)
  /// Secondary rows / captions.
  static let textSecondary = adaptive(light: 0x6E625A, dark: 0xB7A99C)
  /// Faint labels / disabled ink.
  static let textMuted = adaptive(light: 0x94867A, dark: 0x8A7D72)

  /// Overlay scrim behind sheets/dialogs — warm umber, not cool ink.
  static let scrim = Color(
    uiColor: UIColor { traits in
      traits.userInterfaceStyle == .dark
        ? UIColor(red: 0, green: 0, blue: 0, alpha: 0.60)
        : UIColor(red: 74 / 255, green: 53 / 255, blue: 42 / 255, alpha: 0.45)
    }
  )

  // MARK: Corner radii (Enamel: 6 / 10 / 16 / 24 / pill)

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

  // MARK: Typography (brand faces via Font.custom; Dynamic Type via relativeTo)

  /// A body/mono weight, resolved to a concrete PostScript face. Custom fonts
  /// don't synthesize `.weight()` reliably, so weight is a *face switch*.
  enum Weight {
    case regular, medium, semibold, bold
  }

  /// The point size iOS assigns each Dynamic Type text style at the standard
  /// content size — used as the `Font.custom` base so `relativeTo:` scales from
  /// the correct anchor.
  static func pointSize(for style: Font.TextStyle) -> CGFloat {
    switch style {
    case .largeTitle: 34
    case .title: 28
    case .title2: 22
    case .title3: 20
    case .headline: 17
    case .body: 17
    case .callout: 16
    case .subheadline: 15
    case .footnote: 13
    case .caption: 12
    case .caption2: 11
    @unknown default: 17
    }
  }

  /// Display face — **Fredoka SemiBold** for chrome: wordmark, screen
  /// titles, card/section chrome titles. Fredoka is reserved for the
  /// wordmark and chrome titles; headings *inside* answer markdown stay
  /// Nunito Sans.
  static func display(_ style: Font.TextStyle = .title) -> Font {
    .custom("Fredoka-SemiBold", size: pointSize(for: style), relativeTo: style)
  }

  /// Display face at an explicit weight. Regular/medium → Fredoka-Medium;
  /// semibold/bold → Fredoka-SemiBold. Fredoka 700 is not bundled.
  static func display(_ style: Font.TextStyle, weight: Weight) -> Font {
    .custom(fredokaFace(weight), size: pointSize(for: style), relativeTo: style)
  }

  /// Body face — **Nunito Sans**. `weight` switches the static face
  /// (regular / medium / semibold / bold) since custom fonts don't take
  /// `.weight()`.
  static func body(_ style: Font.TextStyle = .body, weight: Weight = .regular) -> Font {
    .custom(nunitoFace(weight), size: pointSize(for: style), relativeTo: style)
  }

  /// Monospaced face — **JetBrains Mono** for fact tables, damage
  /// breakdowns, and source keys only. Default/regular/medium → Medium;
  /// semibold/bold → SemiBold.
  static func mono(_ style: Font.TextStyle = .body, weight: Weight = .medium) -> Font {
    let face = (weight == .semibold || weight == .bold)
      ? "JetBrainsMono-SemiBold" : "JetBrainsMono-Medium"
    return .custom(face, size: pointSize(for: style), relativeTo: style)
  }

  /// Answer-lead role — the verdict at the top of every answer card.
  /// **Fredoka SemiBold 22** relative to `.title3` (a chrome title).
  static func answerLead() -> Font {
    .custom("Fredoka-SemiBold", size: 22, relativeTo: .title3)
  }

  /// Meta / caption voice — **Nunito Sans Medium**, typically `.caption2`
  /// (11 pt base). Mono is reserved for fact tables. See `instrumentLabel`
  /// for the leftover uppercase + tracking wrapper.
  static func instrument(_ style: Font.TextStyle = .caption2) -> Font {
    .custom("NunitoSans-Medium", size: pointSize(for: style), relativeTo: style)
  }

  /// Fredoka PostScript face for a `Weight`. Regular/medium → Medium;
  /// bold maps to SemiBold (700 is not bundled).
  private static func fredokaFace(_ weight: Weight) -> String {
    switch weight {
    case .regular, .medium: "Fredoka-Medium"
    case .semibold, .bold: "Fredoka-SemiBold"
    }
  }

  /// Nunito Sans PostScript face for a `Weight`.
  private static func nunitoFace(_ weight: Weight) -> String {
    switch weight {
    case .regular: "NunitoSans-Regular"
    case .medium: "NunitoSans-Medium"
    case .semibold: "NunitoSans-SemiBold"
    case .bold: "NunitoSans-Bold"
    }
  }

  // MARK: Pokémon type colors (theme-stable, mirrors the 18 web type solids)

  /// The brand color for a Pokémon type name (e.g. "fire"). Unknown names fall
  /// back to the Normal-type solid. Pair with the type's text label — never use
  /// color alone to convey the type (M-AC-UI9.3).
  static func type(_ name: String) -> Color {
    typeColors[name.lowercased()] ?? typeColors["normal"]!
  }

  /// The legible ink color for text/labels set directly on a full-chroma
  /// `type(_:)` fill (e.g. `TypeBadge`'s solid 8pt chip). White for the darker
  /// type solids, near-black for the lighter ones — a fixed per-type contrast
  /// table rather than a computed luminance check, so it's theme-stable.
  static func typeInk(_ name: String) -> Color {
    typeInkColors[name.lowercased()] ?? typeInkColors["normal"]!
  }

  private static let typeInkWhite = solid(0xFFFFFF)
  private static let typeInkDark = solid(0x16181A)

  private static let typeInkColors: [String: Color] = [
    "normal": typeInkDark,
    "fire": typeInkDark,
    "water": typeInkDark,
    "electric": typeInkDark,
    "grass": typeInkDark,
    "ice": typeInkDark,
    "fighting": typeInkWhite,
    "poison": typeInkWhite,
    "ground": typeInkDark,
    "flying": typeInkDark,
    "psychic": typeInkDark,
    "bug": typeInkDark,
    "rock": typeInkDark,
    "ghost": typeInkWhite,
    "dragon": typeInkWhite,
    "dark": typeInkWhite,
    "steel": typeInkDark,
    "fairy": typeInkDark,
  ]

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

  // MARK: UIKit bridges (for UIBarAppearance — nav/tab bars)

  /// Dynamic `UIColor` versions of the tokens the UIKit bar appearance needs
  /// (`configureWithOpaqueBackground` takes `UIColor`, not SwiftUI `Color`).
  /// Kept in lock-step with the SwiftUI tokens above.
  static let uiCanvas = uiAdaptive(light: 0xFBF7F4, dark: 0x161311)
  static let uiSurface = uiAdaptive(light: 0xFFFFFF, dark: 0x231F1C)
  static let uiSeparator = uiAdaptive(light: 0xE9E0D8, dark: 0x3A332E)
  static let uiAccent = uiAdaptive(light: 0xEE5A5A, dark: 0xC44545)
  static let uiPokeRed = uiAdaptive(light: 0xEE5A5A, dark: 0xC44545)
  static let uiOnRed = uiAdaptive(light: 0xFFFFFF, dark: 0xFFFFFF)
  static let uiTextSecondary = uiAdaptive(light: 0x6E625A, dark: 0xB7A99C)
  static let uiTextStrong = uiAdaptive(light: 0x2A2521, dark: 0xF5EFE9)

  private static func uiAdaptive(light: UInt32, dark: UInt32) -> UIColor {
    UIColor { traits in
      traits.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
    }
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

  /// sRGB `color-mix`: `amount` of `a` over `b`.
  static func mix(rgb a: UInt32, over b: UInt32, amount: CGFloat) -> UIColor {
    func channel(_ value: UInt32, shift: UInt32) -> CGFloat {
      CGFloat((value >> shift) & 0xFF) / 255
    }
    let t = amount
    let u = 1 - amount
    return UIColor(
      red: channel(a, shift: 16) * t + channel(b, shift: 16) * u,
      green: channel(a, shift: 8) * t + channel(b, shift: 8) * u,
      blue: channel(a, shift: 0) * t + channel(b, shift: 0) * u,
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

    /// Warm umber (`rgba(74, 53, 42, …)`) for light-mode elevation. Dark
    /// mode `oakCard` already drops the shadow (stroke instead).
    private static let umber = Color(
      red: 74 / 255,
      green: 53 / 255,
      blue: 42 / 255
    )

    /// Resting card elevation (key y=1 blur=2 @ umber 5%; ambient y=6 blur=14 @ umber 7%).
    static let card = Shadow(
      key: Layer(color: umber.opacity(0.05), radius: 2, y: 1),
      ambient: Layer(color: umber.opacity(0.07), radius: 14, y: 6)
    )

    /// Lifted elevation for pressed/floating surfaces (key y=2 blur=3 @ 6%; ambient y=10 blur=18 @ 9%).
    static let raised = Shadow(
      key: Layer(color: umber.opacity(0.06), radius: 3, y: 2),
      ambient: Layer(color: umber.opacity(0.09), radius: 18, y: 10)
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
  /// The shared animation vocabulary — Enamel ease
  /// (`cubic-bezier(0.2, 0.8, 0.2, 1)`): `snappy` for direct-manipulation
  /// feedback (presses, focus, toggles), `smooth`/`enter` for content
  /// settling in (answer plate rise, bubbles, cards, list reflow), plus a
  /// `staggered` helper for cascade-in sequences. `spring` is reserved for
  /// chips / send / sprite hover (call sites land later).
  ///
  /// Callers gate every use behind `@Environment(\.accessibilityReduceMotion)`
  /// (constraint 2): with Reduce Motion on, movement/scale becomes an opacity
  /// crossfade or is dropped. These tokens are the *what*; the *whether* stays
  /// the calling view's decision.
  enum Motion {
    /// Direct-feedback curve — 140ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`.
    static let snappy: Animation = .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.14)

    /// Content-settling curve — 220ms, same bezier. Distinct from `snappy`
    /// (ThemeFoundationTests).
    static let smooth: Animation = .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.22)

    /// Answer-plate rise — 220ms, same curve as `smooth`.
    static let enter: Animation = .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.22)

    /// Overshoot spring — 260ms, `cubic-bezier(0.34, 1.56, 0.64, 1)`.
    /// Used only at chips / send / sprite hover. Gate behind Reduce Motion
    /// at the call site.
    static let spring: Animation = .timingCurve(0.34, 1.56, 0.64, 1, duration: 0.26)

    /// `base` delayed by `step × index` — the per-item offset that turns a batch
    /// appearance into a cascade. Index 0 plays immediately. `step` defaults to
    /// 60ms (the instrument ticker's cascade stagger).
    static func staggered(_ index: Int, base: Animation = smooth, step: Double = 0.06) -> Animation {
      base.delay(step * Double(index))
    }

    /// The one-shot "reading latches" finalize moment (soul.md §3 Motion
    /// signature moment): the masthead status glyph red→green and the plate's
    /// type edge+glow fade-in, 300ms on the same mechanical curve. Nothing else
    /// on screen animates at this moment.
    static let latch: Animation = .timingCurve(0.2, 0, 0, 1, duration: 0.3)
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

  /// The Phase-2 plate-glow language applied to entity header bands: a flat
  /// neutral band (`surfaceRaised`) lit by a single radial glow of the type
  /// color, anchored top-trailing — replaces the flat diagonal type wash
  /// (`typeGradient`) so entity chrome reads as chassis + light, the same
  /// register as the answer plate's own radial (`oakSpecimenPlate`), not a
  /// painted gradient. Secondary type is deliberately omitted — the band stays
  /// single-source; dual typing still reads via the sprite well's edge rings.
  static func typeGlowBand(_ name: String) -> RadialGradient {
    let base = type(name)
    return RadialGradient(
      colors: [
        washColor(base, light: 0.16, dark: 0.26, scheme: nil),
        surfaceRaised,
      ],
      center: .topTrailing,
      startRadius: 4,
      endRadius: 240
    )
  }

  /// `base` at a scheme-dependent opacity. With an explicit `scheme` the alpha is
  /// baked; with `nil` it returns a dynamic color that re-resolves per trait
  /// collection so a single gradient value adapts to appearance changes.
  fileprivate static func washColor(
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

// MARK: - Specimen plate wash (soul.md plate wash rules)

extension Theme {
  /// Atmosphere for a finalized answer plate — type-reactive shell from
  /// `subjects[].types`, multi-subject neutral, or mechanics ink plate.
  /// See `docs/design/soul.md` "Plate wash rules".
  enum PlateAtmosphere: Equatable {
    /// One subject, 1–2 types: primary radial glow + leading-edge light
    /// (secondary type gets a weaker radial + the edge's lower 40% segment).
    case typed(primary: String, secondary: String?)
    /// Multiple subjects: neutral raised plate + a faint neutral dual-segment
    /// edge (don't fight dual glows with no dominant type to key off).
    case multi
    /// No subjects (mechanics/rules): sunken ink plate (inset well), stronger
    /// border, no type light.
    case mechanics

    /// Resolve from the answer's subject type arrays (outer = subjects, inner =
    /// that subject's types). Empty → mechanics; >1 subject → multi; else typed.
    static func resolve(subjectTypes: [[String]]) -> PlateAtmosphere {
      let cleaned = subjectTypes.map { types in
        types
          .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
          .filter { !$0.isEmpty }
      }
      .filter { !$0.isEmpty }
      guard !cleaned.isEmpty else { return .mechanics }
      if cleaned.count > 1 { return .multi }
      let types = cleaned[0]
      let primary = types[0]
      let secondary = types.count > 1 ? types[1] : nil
      return .typed(primary: primary, secondary: secondary)
    }

    /// Primary type slug for glow/edge accents; `nil` for multi/mechanics.
    var primaryType: String? {
      if case let .typed(primary, _) = self { return primary }
      return nil
    }

    /// Secondary type slug when dual-typed; otherwise `nil`.
    var secondaryType: String? {
      if case let .typed(_, secondary) = self { return secondary }
      return nil
    }
  }

  /// Type-light intensities (soul.md "type-light" — replaces the old plate-wash
  /// mix table). The plate itself is a flat neutral fill; these tune the RADIAL
  /// GLOW anchored top-trailing and the LEADING-EDGE LIGHT strip instead of a
  /// diagonal wash across the whole surface.
  enum PlateWashMix {
    /// Primary-type radial glow behind the plate (soul.md: light ~0.12, dark ~0.22).
    static func primary(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.22 : 0.12
    }
    /// Secondary-type radial glow — weaker than primary, same anchor family.
    static func secondary(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.14 : 0.07
    }
    /// Primary type into the plate border edge.
    static func border(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.32 : 0.28
    }
    /// Leading-edge light strip intensity (primary segment; the secondary
    /// segment, when present, mixes at ~75% of this).
    static func edgeLight(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.85 : 0.75
    }
    /// Radial glow behind a sprite well — the well IS the light source, so this
    /// stays the strongest mix in the table.
    static func spriteGlow(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.34 : 0.28
    }
  }

  /// Type color mixed into `surface` for plate chrome. Prefer the layered
  /// gradients in ``oakSpecimenPlate(_:)``; this is for simple solid mixes.
  static func plateWash(
    primary: String,
    secondary: String? = nil,
    scheme: ColorScheme
  ) -> Color {
    // Approximate color-mix(type p%, surface) via opacity over surface — callers
    // that need full dual radials should use `oakSpecimenPlate`.
    let p = PlateWashMix.primary(scheme: scheme)
    return type(primary).opacity(p)
  }

  /// Border color for a typed plate: primary type mixed into `border`.
  static func plateBorder(
    primary: String?,
    atmosphere: PlateAtmosphere,
    scheme: ColorScheme
  ) -> Color {
    switch atmosphere {
    case .mechanics:
      return borderStrong
    case .multi:
      return border
    case .typed(let primary, _):
      // Approximate color-mix(primary 28%, border) as a translucent type stroke
      // over the plate's own edge — the overlay stroke uses this color.
      return type(primary).opacity(PlateWashMix.border(scheme: scheme))
    }
  }
}

// MARK: - Specimen plate chrome (View)

extension View {
  /// Wraps content in Oak's specimen-plate shell: neutral fill / ink-plate well,
  /// hairline edge, and raised shadow (soul.md answer plate).
  ///
  /// - Parameter revealed: Gates the opacity of the type radial glow + leading-
  ///   edge light (not the flat fill/border, which are always visible). Defaults
  ///   to `true` (always shown); the answer card's one-shot "reading latches"
  ///   finalize moment (soul.md §3) passes a `@State` flag here and animates it
  ///   0→1 so the type-light fades in once the turn finalizes.
  /// - Parameter showsLeadingEdge: When `false`, skip the 3pt type-color leading
  ///   capsule (full-page Dex/artifact profiles). Fill, radial glow, and border stay.
  func oakSpecimenPlate(
    _ atmosphere: Theme.PlateAtmosphere,
    revealed: Bool = true,
    showsLeadingEdge: Bool = true
  ) -> some View {
    modifier(
      OakSpecimenPlateModifier(
        atmosphere: atmosphere,
        revealed: revealed,
        showsLeadingEdge: showsLeadingEdge
      )
    )
  }
}

/// Specimen plate background + border. Light mode elevates with shadow; dark
/// mode keeps a stronger stroke (same elevation grammar as `oakCard`).
private struct OakSpecimenPlateModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let atmosphere: Theme.PlateAtmosphere
  var revealed: Bool = true
  var showsLeadingEdge: Bool = true

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
    let isDark = colorScheme == .dark
    switch atmosphere {
    case .mechanics:
      // Ink plate: sunken well treatment (surfaceSunken fill + inner-shadow
      // illusion), a stronger border, and no type light (soul.md).
      content
        .oakInsetWell(cornerRadius: Theme.Radius.xl)
        .overlay {
          shape.strokeBorder(Theme.borderStrong, lineWidth: 1.5)
        }
        .shadow(
          color: isDark ? .clear : Theme.Shadow.raised.ambient.color,
          radius: Theme.Shadow.raised.ambient.radius,
          y: Theme.Shadow.raised.ambient.y
        )
        .shadow(
          color: isDark ? .clear : Theme.Shadow.raised.key.color,
          radius: Theme.Shadow.raised.key.radius,
          y: Theme.Shadow.raised.key.y
        )
    case .multi, .typed:
      content
        .background {
          ZStack {
            // Flat neutral fill — the content carries the color, not the frame.
            Theme.surfaceRaised
            // The glow is the part that "reveals" — the flat fill/border stay
            // always visible so only the light fades in (reading-latches moment).
            plateRadials(isDark: isDark)
              .opacity(revealed ? 1 : 0)
          }
          .clipShape(shape)
        }
        .overlay(alignment: .leading) {
          if showsLeadingEdge {
            plateEdgeLight(isDark: isDark)
              .opacity(revealed ? 1 : 0)
          }
        }
        .overlay {
          shape.strokeBorder(borderColor(isDark: isDark), lineWidth: 1)
        }
        .clipShape(shape)
        .shadow(
          color: isDark ? .clear : Theme.Shadow.raised.ambient.color,
          radius: Theme.Shadow.raised.ambient.radius,
          y: Theme.Shadow.raised.ambient.y
        )
        .shadow(
          color: isDark ? .clear : Theme.Shadow.raised.key.color,
          radius: Theme.Shadow.raised.key.radius,
          y: Theme.Shadow.raised.key.y
        )
    }
  }

  /// The plate's single radial glow, anchored top-trailing (where SubjectsView
  /// places the subject's sprite well) — the light source for a typed plate. A
  /// dual-typed subject adds a second, weaker radial anchored bottom-leading so
  /// both types read as light without fighting. `multi`/`mechanics` have no
  /// single dominant type to key off, so no radial.
  @ViewBuilder
  private func plateRadials(isDark: Bool) -> some View {
    switch atmosphere {
    case let .typed(primary, secondary):
      let p = Theme.PlateWashMix.primary(scheme: colorScheme)
      let s = Theme.PlateWashMix.secondary(scheme: colorScheme)
      RadialGradient(
        colors: [Theme.type(primary).opacity(p), .clear],
        center: UnitPoint(x: 0.88, y: 0.18),
        startRadius: 4,
        endRadius: 180
      )
      if let secondary {
        RadialGradient(
          colors: [Theme.type(secondary).opacity(s), .clear],
          center: UnitPoint(x: 0.12, y: 0.90),
          startRadius: 4,
          endRadius: 140
        )
      }
    case .multi, .mechanics:
      EmptyView()
    }
  }

  /// The 3pt leading-edge light — a vertical capsule strip inset along the
  /// plate's leading edge. A typed plate splits it 60/40 primary/secondary when
  /// dual-typed; `multi` gets a faint neutral two-segment edge (no single type
  /// to key off); `mechanics` gets none (the ink plate stays quiet).
  @ViewBuilder
  private func plateEdgeLight(isDark: Bool) -> some View {
    switch atmosphere {
    case .mechanics:
      EmptyView()
    case .multi:
      edgeLightStrip(
        primary: Theme.borderStrong.opacity(isDark ? 0.55 : 0.45),
        secondary: Theme.border.opacity(isDark ? 0.4 : 0.3)
      )
    case let .typed(primary, secondary):
      let intensity = Theme.PlateWashMix.edgeLight(scheme: colorScheme)
      edgeLightStrip(
        primary: Theme.type(primary).opacity(intensity),
        secondary: secondary.map { Theme.type($0).opacity(intensity * 0.75) }
      )
    }
  }

  /// A 3pt vertical capsule inset along the leading edge — full-height
  /// `primary`, or a hard-edged two-tone gradient (top 60% primary, bottom 40%
  /// `secondary`) when a second color is present.
  private func edgeLightStrip(primary: Color, secondary: Color?) -> some View {
    let fill: LinearGradient
    if let secondary {
      fill = LinearGradient(
        stops: [
          .init(color: primary, location: 0),
          .init(color: primary, location: 0.58),
          .init(color: secondary, location: 0.62),
          .init(color: secondary, location: 1),
        ],
        startPoint: .top,
        endPoint: .bottom
      )
    } else {
      fill = LinearGradient(colors: [primary, primary], startPoint: .top, endPoint: .bottom)
    }
    return Capsule()
      .fill(fill)
      .frame(width: 3)
      .padding(.vertical, 10)
  }

  private func borderColor(isDark: Bool) -> Color {
    Theme.plateBorder(
      primary: atmosphere.primaryType,
      atmosphere: atmosphere,
      scheme: colorScheme
    )
  }
}

// MARK: - Type-glow specimen well (View)

extension View {
  /// Type-glow specimen well chrome (soul.md Phase 1–2): radial primary glow +
  /// dual-type edge rings around sprite/artwork. Matches SubjectsView quality so
  /// artifact heroes and party slots share one instrument language.
  ///
  /// - Parameters:
  ///   - primary: Primary type slug (falls back to normal solid if unknown).
  ///   - secondary: Optional dual-type slug for the inset ring.
  ///   - cornerRadius: Well corner radius (`.lg` for cards, slightly tighter for
  ///     roster slots).
  ///   - glowEndRadius: Radial glow extent; pass sprite size × ~0.85 for scale.
  func oakTypeGlowWell(
    primary: String,
    secondary: String? = nil,
    cornerRadius: CGFloat = Theme.Radius.lg,
    glowEndRadius: CGFloat = 60
  ) -> some View {
    modifier(
      OakTypeGlowWellModifier(
        primary: primary,
        secondary: secondary,
        cornerRadius: cornerRadius,
        glowEndRadius: glowEndRadius
      )
    )
  }
}

/// Radial type glow + primary/secondary edge rings behind sprite artwork. The
/// well is now INSET — sunken fill + the shared inner-shadow illusion — with
/// the glow reading as the well's own light source, plus a 1px border tinted by
/// the primary type (soul.md "type-light" — replaces the old flat-tint well).
private struct OakTypeGlowWellModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let primary: String
  let secondary: String?
  let cornerRadius: CGFloat
  let glowEndRadius: CGFloat

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    let isDark = colorScheme == .dark
    content
      .background {
        ZStack {
          // Sunken well base — the light sits IN the chassis, not on a flat tint.
          shape.fill(Theme.surfaceSunken)
          RadialGradient(
            colors: [
              Theme.type(primary).opacity(Theme.PlateWashMix.spriteGlow(scheme: colorScheme)),
              .clear,
            ],
            center: UnitPoint(x: 0.5, y: 0.45),
            startRadius: 2,
            endRadius: glowEndRadius
          )
        }
        .clipShape(shape)
      }
      .overlay { oakInsetWellIllusion(shape: shape, isDark: isDark) }
      .overlay {
        shape.strokeBorder(
          Theme.type(primary).opacity(isDark ? 0.42 : 0.34),
          lineWidth: 1
        )
      }
      .overlay {
        if let secondary, !secondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          shape
            .strokeBorder(Theme.type(secondary).opacity(0.18), lineWidth: 1)
            .padding(1)
        }
      }
  }
}

// MARK: - Streaming wash heuristic

extension Theme {
  /// Client-side heuristic: when a streaming tool label names a single known
  /// Pokémon type, return that slug for a mild skeleton wash. Returns `nil`
  /// when ambiguous or absent — never invents types (soul.md Phase 2.3).
  static func streamingWashType(from labels: [String]) -> String? {
    let known = Set(typeDisplayOrder)
    var found: Set<String> = []
    for label in labels {
      let tokens = label.lowercased().split { !$0.isLetter }
      for token in tokens {
        let t = String(token)
        if known.contains(t) { found.insert(t) }
      }
    }
    return found.count == 1 ? found.first : nil
  }
}

// MARK: - Inset well (Phase 2 groundwork)

extension View {
  /// A recessed "instrument well" surface: `surfaceSunken` fill plus a faint
  /// inner-shadow illusion (a dark hairline hugging the top edge, a light
  /// hairline hugging the bottom) so the content reads as sunken into the
  /// panel rather than sitting on a flat tint. Cheap — two strokes, no blur
  /// passes. Phase 2 wires this into search bars, inputs, and inner wells.
  func oakInsetWell(cornerRadius: CGFloat = Theme.Radius.md) -> some View {
    modifier(OakInsetWellModifier(cornerRadius: cornerRadius))
  }
}

private struct OakInsetWellModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let cornerRadius: CGFloat

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    let isDark = colorScheme == .dark
    content
      .background(Theme.surfaceSunken, in: shape)
      .overlay { oakInsetWellIllusion(shape: shape, isDark: isDark) }
  }
}

/// The inner-shadow illusion shared by every inset well (search bars, inputs,
/// the mechanics ink plate, and the type-glow sprite well): a dark hairline
/// hugging the top edge, a light hairline hugging the bottom — two strokes, one
/// blur pass, no offscreen shadow render — so every "machined into the chassis"
/// surface reads as the same physical recess.
@ViewBuilder
private func oakInsetWellIllusion(shape: RoundedRectangle, isDark: Bool) -> some View {
  shape
    .inset(by: 0.5)
    .stroke(Color.black.opacity(isDark ? 0.22 : 0.10), lineWidth: 1)
    .blur(radius: 0.5)
    .mask(
      LinearGradient(
        colors: [.black, .black.opacity(0.35), .clear],
        startPoint: .top,
        endPoint: .bottom
      )
    )
  shape
    .inset(by: 0.5)
    .stroke((isDark ? Color.clear : Color.white).opacity(0.6), lineWidth: 1)
    .mask(
      LinearGradient(
        colors: [.clear, .black.opacity(0.3), .black],
        startPoint: .top,
        endPoint: .bottom
      )
    )
}

// MARK: - Instrument voice (View extension)

extension View {
  /// Applies the leftover "instrument" typographic voice: `Theme.instrument(style)`
  /// (Nunito Sans Medium) + 0.8 pt letter-spacing + uppercase transform.
  ///
  /// Use for scope tags, tool-trail labels, section heads, and dex-number
  /// captions. Tracking and case are unchanged this phase.
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
