import SwiftUI

/// Oak's raised-surface treatment and the interactions that go with it.
///
/// The app's surfaces were flat fills with 1pt separator strokes; `oakCard`
/// replaces that with a scheme-aware elevation recipe (constraint 6):
///
/// - **Light mode**: a raised fill (optionally a faint type/accent gradient
///   wash), a two-layer `Theme.Shadow.card`, and **no stroke** — depth comes
///   from the shadow.
/// - **Dark mode**: the same fill/wash, a **subtle `Theme.separator` stroke**,
///   and no shadow — shadows nearly vanish on dark backgrounds, so a hairline
///   carries the separation instead.
///
/// The recipe is encapsulated here so callers never hand-roll the light/dark
/// split — they just say `.oakCard()`. Shadow and stroke are decorative; the
/// content a card wraps is what carries meaning (M-AC-UI9.3).
extension View {
  /// Wraps the view in Oak's raised card chrome (scheme-aware fill + elevation).
  ///
  /// - Parameters:
  ///   - radius: The corner radius (default `Theme.Radius.lg`).
  ///   - tint: When non-nil, a faint diagonal wash of this color layers over the
  ///     raised fill (12% → 4% light, 18% → 6% dark) — used to tint subject cards
  ///     by Pokémon type.
  func oakCard(radius: CGFloat = Theme.Radius.lg, tint: Color? = nil) -> some View {
    modifier(OakCardModifier(radius: radius, tint: tint))
  }

  /// Applies a two-layer `Theme.Shadow` (ambient then key). Exposed so views that
  /// want elevation without the full card chrome (e.g. a tinted glow under the
  /// user's chat bubble) can drop a shadow token directly.
  func oakShadow(_ shadow: Theme.Shadow) -> some View {
    self
      .shadow(
        color: shadow.ambient.color, radius: shadow.ambient.radius,
        x: shadow.ambient.x, y: shadow.ambient.y
      )
      .shadow(
        color: shadow.key.color, radius: shadow.key.radius,
        x: shadow.key.x, y: shadow.key.y
      )
  }
}

/// The `oakCard` implementation. Reads `colorScheme` dynamically so the same
/// modifier renders the light (shadow, no stroke) and dark (stroke, no shadow)
/// variants without the caller branching.
struct OakCardModifier: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let radius: CGFloat
  let tint: Color?

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    let isDark = colorScheme == .dark
    return
      content
      .background {
        ZStack {
          shape.fill(Theme.surfaceRaised)
          if let tint {
            shape.fill(
              LinearGradient(
                colors: [
                  tint.opacity(isDark ? 0.18 : 0.12),
                  tint.opacity(isDark ? 0.06 : 0.04),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
          }
        }
      }
      .overlay {
        // Dark mode leans on a hairline for separation; light mode omits it.
        if isDark {
          shape.strokeBorder(Theme.separator, lineWidth: 1)
        }
      }
      .clipShape(shape)
      // Light mode carries the elevation; dark mode nulls both passes to `.clear`
      // (keeps a stable view identity rather than conditionally dropping the modifier).
      .shadow(
        color: isDark ? .clear : Theme.Shadow.card.ambient.color,
        radius: Theme.Shadow.card.ambient.radius, y: Theme.Shadow.card.ambient.y
      )
      .shadow(
        color: isDark ? .clear : Theme.Shadow.card.key.color,
        radius: Theme.Shadow.card.key.radius, y: Theme.Shadow.card.key.y
      )
  }
}

/// A `ButtonStyle` that makes a tappable card/chip feel pressable: a subtle
/// scale-down (0.97) and dim (0.9) while held, springing with `Theme.Motion.snappy`.
///
/// Later phases apply `.buttonStyle(OakPressableButtonStyle())` to tap targets
/// that currently use `.plain`. Under Reduce Motion the scale is dropped and only
/// the opacity dim remains (constraint 2) — feedback without movement.
struct OakPressableButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    PressableLabel(configuration: configuration)
  }

  /// The label wrapper exists so the press feedback can read
  /// `accessibilityReduceMotion` — a `ButtonStyle` value doesn't receive the
  /// environment on its stored properties, but a `View` does.
  private struct PressableLabel: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      configuration.label
        .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
        .opacity(configuration.isPressed ? 0.9 : 1)
        .animation(Theme.Motion.snappy, value: configuration.isPressed)
    }
  }
}

#Preview("oakCard — light & dark") {
  @MainActor func demo(_ scheme: ColorScheme) -> some View {
    VStack(spacing: 16) {
      Text("Plain card")
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .oakCard()
      Text("Fire-tinted card")
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .oakCard(tint: Theme.type("fire"))
      Button {
      } label: {
        Text("Pressable card")
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding()
          .oakCard(radius: Theme.Radius.md)
      }
      .buttonStyle(OakPressableButtonStyle())
    }
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.background)
    .environment(\.colorScheme, scheme)
  }
  return HStack(spacing: 0) {
    demo(.light)
    demo(.dark)
  }
}
