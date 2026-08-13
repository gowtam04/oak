import SwiftUI
import UIKit

/// Oak's brand expression over iOS.
///
/// Colors are sourced from the web design system (`web/src/app/globals.css`) and
/// re-expressed natively. Brand/semantic colors adapt to light & dark via a
/// dynamic `UIColor` provider. Surfaces use a **cool neutral ramp** — a field
/// instrument identity (`canvas` #EEF0F1 / #101214, `surface` #F9FAFA / #16191B,
/// `surfaceSunken` #E3E6E8 / #0B0D0E) reconciled 1:1 with the web tokens.
///
/// Text and separator use the web's **neutral ink ramp** (adaptive themed
/// colors, e.g. `textPrimary` #24282B / #DDE1E3, `separator` #D3D7DA / #2A2E32)
/// rather than Apple's cool-gray system semantics — the temperature match is
/// part of "feels like Oak." Contrast was designed into the ramp; Dynamic Type
/// still scales via the custom-font `relativeTo:` anchors (M-AC-UI1.2–1.4).
///
/// Typography is the loudest brand carrier: `display()` is **Space Grotesk**,
/// `body()` is **Inter**, `mono()`/`instrument()` are **JetBrains Mono**,
/// each `Font.custom(_:size:relativeTo:)` so Dynamic Type keeps scaling. Custom
/// fonts don't synthesize weights reliably, so the weight-aware overloads switch
/// the PostScript face per weight rather than calling `.weight()`.
///
/// Color is never the sole carrier of meaning (M-AC-UI9.3) — that pairing with
/// text/icon is the calling view's responsibility; `Theme` only supplies the
/// palette and type ramp.
enum Theme {
  // MARK: Brand

  /// Pokédex red — the primary brand/accent color (mirrored by `AccentColor`).
  static let accent = adaptive(light: 0xE3350D, dark: 0xFF4A22)
  static let accentHover = adaptive(light: 0xC92E0B, dark: 0xFF5F3C)
  static let accentActive = adaptive(light: 0xB02A0A, dark: 0xE8431E)
  /// Info/focus blue — interaction states, links, focus rings.
  static let azure = adaptive(light: 0x2B7DD1, dark: 0x55A0E8)

  // MARK: Semantic

  static let success = adaptive(light: 0x1F9D61, dark: 0x34C27F)
  static let warning = adaptive(light: 0xE08700, dark: 0xF0A030)
  static let danger = adaptive(light: 0xD6303F, dark: 0xF04A58)
  static let info = adaptive(light: 0x2B7DD1, dark: 0x55A0E8)

  // MARK: Soft tints (faint fills for chips, callouts, selection washes)

  /// Faint accent fill — empty-state chip press, red callouts.
  static let accentSoft = adaptive(light: 0xFBE9E4, dark: 0x33170F)
  /// Faint azure fill — interaction focus glow, in-thread chip press, links.
  static let azureSoft = adaptive(light: 0xE5F0FA, dark: 0x142433)
  static let successSoft = adaptive(light: 0xE4F4EC, dark: 0x0E2B1D)
  static let warningSoft = adaptive(light: 0xFBF0DC, dark: 0x33260F)
  static let dangerSoft = adaptive(light: 0xFAE7E9, dark: 0x331417)

  /// The user chat bubble's sunken-note fill — a cool, quiet note rather than a
  /// warm pink-tinted paper. Paired with an accent-tinted corner pip and
  /// `textPrimary` ink (§4.3).
  static let userBubble = adaptive(light: 0xE9EBED, dark: 0x1A1E21)

  // MARK: Surfaces (cool neutral ramp — field instrument identity)

  /// The screen/chat canvas — the base layer every screen sits on.
  /// Light: #EEF0F1 (cool paper); dark: #101214 (cool near-black).
  static let canvas = adaptive(light: 0xEEF0F1, dark: 0x101214)

  /// Legacy alias for `canvas` — kept so existing call sites resolve without edits.
  /// Prefer `canvas` for new call sites.
  static let background = canvas

  /// Card / modal surface — lifts one level above `canvas`.
  /// Light: #F9FAFA; dark: #16191B.
  static let surface = adaptive(light: 0xF9FAFA, dark: 0x16191B)

  /// Floating / tooltip surface — lifts above `surface`.
  /// Light: #FFFFFF; dark: #1D2124.
  static let surfaceRaised = adaptive(light: 0xFFFFFF, dark: 0x1D2124)

  /// Recessed well — inputs, search bars, inner wells.
  /// Light: #E3E6E8; dark: #0B0D0E.
  static let surfaceSunken = adaptive(light: 0xE3E6E8, dark: 0x0B0D0E)

  // MARK: Text & separator (cool ink ramp — mirrors the web tokens)

  /// Hairline dividers, card borders. Web `--border`.
  static let separator = adaptive(light: 0xD3D7DA, dark: 0x2A2E32)
  /// Alias of `separator` for call sites that read a "border" role.
  static let border = separator
  /// A stronger hairline — button/composer outlines, emphasized edges.
  static let borderStrong = adaptive(light: 0xB9BEC3, dark: 0x3A3F44)

  /// Emphasized ink — headings, wordmark, verdict. Web `--text-strong`.
  static let textStrong = adaptive(light: 0x131517, dark: 0xF2F4F5)
  /// Default body ink. Web `--text`.
  static let textPrimary = adaptive(light: 0x24282B, dark: 0xDDE1E3)
  /// Secondary rows / captions. Web `--text-muted`.
  static let textSecondary = adaptive(light: 0x5F656C, dark: 0x9BA1A7)
  /// Faint labels / disabled ink. Web `--text-faint`.
  static let textMuted = adaptive(light: 0x8A9096, dark: 0x6E747A)

  /// Overlay scrim behind sheets/dialogs — neutral ink, semi-opaque.
  static let scrim = Color(
    uiColor: UIColor { traits in
      traits.userInterfaceStyle == .dark
        ? UIColor(red: 0, green: 0, blue: 0, alpha: 0.6)
        : UIColor(red: 19 / 255, green: 21 / 255, blue: 23 / 255, alpha: 0.4)
    }
  )

  // MARK: Corner radii (brand favors generous rounding)

  enum Radius {
    static let sm: CGFloat = 5
    static let md: CGFloat = 9
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
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

  /// Display face — **Space Grotesk SemiBold** for the instrument chrome:
  /// wordmark, screen titles, markdown headings, entity names.
  static func display(_ style: Font.TextStyle = .title) -> Font {
    .custom("SpaceGrotesk-SemiBold", size: pointSize(for: style), relativeTo: style)
  }

  /// Display face at an explicit weight — medium / semibold / bold — since
  /// custom fonts don't take `.weight()`.
  static func display(_ style: Font.TextStyle, weight: Weight) -> Font {
    let face: String
    switch weight {
    case .regular, .medium: face = "SpaceGrotesk-Medium"
    case .semibold: face = "SpaceGrotesk-SemiBold"
    case .bold: face = "SpaceGrotesk-Bold"
    }
    return .custom(face, size: pointSize(for: style), relativeTo: style)
  }

  /// Body face — **Inter**. `weight` switches the static face (regular /
  /// medium / semibold / bold) since custom fonts don't take `.weight()`.
  static func body(_ style: Font.TextStyle = .body, weight: Weight = .regular) -> Font {
    .custom(interFace(weight), size: pointSize(for: style), relativeTo: style)
  }

  /// Monospaced face — **JetBrains Mono** for "precise data" (stats, dex
  /// numbers, damage rolls). `weight` switches Medium ↔ SemiBold.
  static func mono(_ style: Font.TextStyle = .body, weight: Weight = .medium) -> Font {
    let face = (weight == .semibold || weight == .bold)
      ? "JetBrainsMono-SemiBold" : "JetBrainsMono-Medium"
    return .custom(face, size: pointSize(for: style), relativeTo: style)
  }

  /// Answer-lead role — the verdict at the top of every answer card.
  /// **Space Grotesk SemiBold 22** relative to `.title3`, so it scales with
  /// Dynamic Type. It is the largest text in any conversation — the editorial
  /// masthead.
  static func answerLead() -> Font {
    .custom("SpaceGrotesk-SemiBold", size: 22, relativeTo: .title3)
  }

  /// Instrument voice — **JetBrains Mono SemiBold**, typically `.caption2`
  /// (11 pt base). Uppercase with 0.8pt tracking (see `instrumentLabel` View
  /// extension) for scope tags (`CHAMPIONS · REG M-B`), tool-trail labels
  /// (`GET_POKEMON · GARCHOMP`), section heads (`BASE STATS`, `SOURCES · 1`),
  /// and dex-number captions. Pass a wider `style` for more breathing room.
  static func instrument(_ style: Font.TextStyle = .caption2) -> Font {
    .custom("JetBrainsMono-SemiBold", size: pointSize(for: style), relativeTo: style)
  }

  /// Inter PostScript face for a `Weight`.
  private static func interFace(_ weight: Weight) -> String {
    switch weight {
    case .regular: "Inter-Regular"
    case .medium: "Inter-Medium"
    case .semibold: "Inter-SemiBold"
    case .bold: "Inter-Bold"
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
  /// `type(_:)` fill (e.g. `TypeBadge`'s solid capsule). White for the darker
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
  static let uiCanvas = uiAdaptive(light: 0xEEF0F1, dark: 0x101214)
  static let uiSeparator = uiAdaptive(light: 0xD3D7DA, dark: 0x2A2E32)
  static let uiAccent = uiAdaptive(light: 0xE3350D, dark: 0xFF4A22)
  static let uiTextSecondary = uiAdaptive(light: 0x5F656C, dark: 0x9BA1A7)
  static let uiTextStrong = uiAdaptive(light: 0x131517, dark: 0xF2F4F5)

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

    /// Resting card elevation (key y=1 blur=2 @ black 5%; ambient y=6 blur=14 @ black 7%).
    /// Cooler and tighter than the prior warm-paper recipe — a field instrument
    /// reads as precision-milled, not soft-shadowed.
    static let card = Shadow(
      key: Layer(color: .black.opacity(0.05), radius: 2, y: 1),
      ambient: Layer(color: .black.opacity(0.07), radius: 14, y: 6)
    )

    /// Lifted elevation for pressed/floating surfaces (key y=2 blur=3 @ 6%; ambient y=10 blur=18 @ 9%).
    static let raised = Shadow(
      key: Layer(color: .black.opacity(0.06), radius: 3, y: 2),
      ambient: Layer(color: .black.opacity(0.09), radius: 18, y: 10)
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
    /// One subject, 1–2 types: primary wash + secondary edge/radial.
    case typed(primary: String, secondary: String?)
    /// Multiple subjects: neutral-ish plate + light multi accent (don't fight
    /// dual washes).
    case multi
    /// No subjects (mechanics/rules): sunken paper, stronger border, no type wash.
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

  /// Mix ratios for type → surface plate wash (soul.md): light ~8–14%, dark
  /// ~18–28% so the wash still reads on dark paper.
  enum PlateWashMix {
    /// Primary type into the plate fill.
    static func primary(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.22 : 0.11
    }
    /// Secondary type into the plate fill / second radial.
    static func secondary(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.16 : 0.07
    }
    /// Primary type into the plate border edge.
    static func border(scheme: ColorScheme) -> Double {
      scheme == .dark ? 0.32 : 0.28
    }
    /// Radial glow behind a sprite well (stronger than the plate wash).
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
  /// Wraps content in Oak's specimen-plate shell: type wash / multi / ink plate
  /// fill, hairline edge, and raised shadow (soul.md answer plate).
  func oakSpecimenPlate(_ atmosphere: Theme.PlateAtmosphere) -> some View {
    modifier(OakSpecimenPlateModifier(atmosphere: atmosphere))
  }
}

/// Specimen plate background + border. Light mode elevates with shadow; dark
/// mode keeps a stronger stroke (same elevation grammar as `oakCard`).
private struct OakSpecimenPlateModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let atmosphere: Theme.PlateAtmosphere

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
    let isDark = colorScheme == .dark
    content
      .background {
        ZStack {
          plateFill(isDark: isDark)
          plateRadials(isDark: isDark)
        }
        .clipShape(shape)
      }
      .overlay {
        shape.strokeBorder(borderColor(isDark: isDark), lineWidth: atmosphere == .mechanics ? 1.5 : 1)
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

  @ViewBuilder
  private func plateFill(isDark: Bool) -> some View {
    switch atmosphere {
    case .mechanics:
      // Ink plate: sunken → surface vertical gradient, no type wash.
      LinearGradient(
        colors: [Theme.surfaceSunken, Theme.surface],
        startPoint: .top,
        endPoint: .bottom
      )
    case .multi:
      // Neutral-ish + faint multi accent (flying-ish cool wash, low %).
      ZStack {
        Theme.surface
        LinearGradient(
          colors: [
            Theme.type("flying").opacity(isDark ? 0.10 : 0.05),
            .clear,
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
    case let .typed(primary, secondary):
      let p = Theme.PlateWashMix.primary(scheme: colorScheme)
      let s = Theme.PlateWashMix.secondary(scheme: colorScheme)
      ZStack {
        Theme.surface
        LinearGradient(
          colors: [
            Theme.type(primary).opacity(p),
            Theme.type(secondary ?? primary).opacity(s * 0.85),
            .clear,
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
    }
  }

  @ViewBuilder
  private func plateRadials(isDark: Bool) -> some View {
    switch atmosphere {
    case let .typed(primary, secondary):
      let p = Theme.PlateWashMix.primary(scheme: colorScheme) + 0.05
      let s = Theme.PlateWashMix.secondary(scheme: colorScheme) + 0.04
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

/// Radial type glow + primary/secondary edge rings behind sprite artwork.
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
          shape.fill(Theme.type(primary).opacity(isDark ? 0.14 : 0.10))
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
      }
      .overlay {
        shape.strokeBorder(
          Theme.type(primary).opacity(isDark ? 0.28 : 0.22),
          lineWidth: 1
        )
      }
      .overlay {
        if let secondary, !secondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          shape
            .strokeBorder(Theme.type(secondary).opacity(0.15), lineWidth: 1)
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
      .overlay {
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
      }
      .overlay {
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
