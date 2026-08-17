import SwiftUI

/// Oak's shared button system, mirroring the web `.tm-btn` family (§4.5). One
/// pill grammar, four intents:
///
/// - **primary** — red fill, white Inter 700, a subtle red-tinted shadow. The
///   page's main action (send-to-teams, sign in, retry).
/// - **secondary** — `surface` fill with a `borderStrong` hairline; an azure
///   press tint (interaction = azure). The default for supporting actions.
/// - **ghost** — text only, `textSecondary`. Low-emphasis actions.
/// - **danger** — `dangerSoft` fill + danger ink. Destructive confirmations.
///
/// All are pills with a 44pt min touch target and a snappy 0.97 press scale that
/// drops under Reduce Motion (feedback stays as an opacity dim). Replaces every
/// Apple `.bordered`/`.borderedProminent` call site so no system button chrome
/// leaks through (diagnosis §1, tell #3).
struct OakButtonStyle: ButtonStyle {
  enum Kind { case primary, secondary, ghost, danger }

  var kind: Kind

  func makeBody(configuration: Configuration) -> some View {
    OakButtonLabel(kind: kind, configuration: configuration)
  }

  /// A `View` (not the raw `ButtonStyle`) so it can read `accessibilityReduceMotion`
  /// and `isEnabled` from the environment for the press scale + disabled dim.
  private struct OakButtonLabel: View {
    let kind: Kind
    let configuration: Configuration
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
      let pressed = configuration.isPressed
      configuration.label
        .font(Theme.body(.subheadline, weight: kind == .ghost ? .semibold : .bold))
        .foregroundStyle(foreground(pressed: pressed))
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .background(background(pressed: pressed), in: Capsule())
        .overlay {
          if kind == .secondary {
            Capsule().strokeBorder(Theme.borderStrong, lineWidth: 1)
          }
        }
        .contentShape(Capsule())
        // A subtle red-tinted shadow lifts the primary action off the paper.
        .shadow(
          color: kind == .primary && isEnabled ? Theme.accent.opacity(0.25) : .clear,
          radius: 5, y: 2
        )
        .scaleEffect(pressed && !reduceMotion ? 0.97 : 1)
        .opacity(isEnabled ? 1 : 0.5)
        .animation(Theme.Motion.snappy, value: pressed)
    }

    private func foreground(pressed: Bool) -> Color {
      switch kind {
      case .primary: return .white
      case .secondary: return pressed ? Theme.azure : Theme.textPrimary
      case .ghost: return pressed ? Theme.textPrimary : Theme.textSecondary
      case .danger: return Theme.danger
      }
    }

    private func background(pressed: Bool) -> Color {
      switch kind {
      case .primary: return pressed ? Theme.accentActive : Theme.accent
      case .secondary: return pressed ? Theme.azureSoft : Theme.surface
      case .ghost: return pressed ? Theme.surfaceSunken : .clear
      case .danger: return Theme.dangerSoft
      }
    }
  }
}

/// Oak's suggestion/example **chip** grammar (§4.6): a `surface` pill with a
/// `borderStrong` hairline and Inter 600 label. On press it tints — **red-soft**
/// for empty-state chips (brand), **azure-soft** for in-thread chips
/// (interaction) — and scales 0.97 snappy (dropped under Reduce Motion). Lighter
/// than `OakButtonStyle`; used where a cloud of tappable prompts reads as chips,
/// not buttons.
struct OakChipStyle: ButtonStyle {
  /// The press tint: `.accent` (empty-state / brand) or `.azure` (in-thread).
  enum Tone { case accent, azure }

  var tone: Tone

  func makeBody(configuration: Configuration) -> some View {
    OakChipLabel(tone: tone, configuration: configuration)
  }

  private struct OakChipLabel: View {
    let tone: Tone
    let configuration: Configuration
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var pressTint: Color { tone == .accent ? Theme.accent : Theme.azure }
    private var pressFill: Color { tone == .accent ? Theme.accentSoft : Theme.azureSoft }

    var body: some View {
      let pressed = configuration.isPressed
      configuration.label
        .font(Theme.body(.subheadline, weight: .semibold))
        .foregroundStyle(pressed ? pressTint : Theme.textPrimary)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(pressed ? pressFill : Theme.surface, in: Capsule())
        .overlay {
          Capsule().strokeBorder(pressed ? pressTint : Theme.borderStrong, lineWidth: 1)
        }
        .contentShape(Capsule())
        .scaleEffect(pressed && !reduceMotion ? 0.97 : 1)
        .animation(Theme.Motion.snappy, value: pressed)
    }
  }
}

extension ButtonStyle where Self == OakChipStyle {
  /// A suggestion/example chip. `tone` picks the press tint — `.accent` for
  /// empty-state (brand), `.azure` for in-thread (interaction).
  static func oakChip(_ tone: OakChipStyle.Tone) -> OakChipStyle { OakChipStyle(tone: tone) }
}

extension ButtonStyle where Self == OakButtonStyle {
  /// Red-fill primary pill — the page's main action.
  static var oakPrimary: OakButtonStyle { OakButtonStyle(kind: .primary) }
  /// Surface + hairline pill with an azure press tint — supporting actions.
  static var oakSecondary: OakButtonStyle { OakButtonStyle(kind: .secondary) }
  /// Text-only low-emphasis pill.
  static var oakGhost: OakButtonStyle { OakButtonStyle(kind: .ghost) }
  /// Soft-danger destructive pill.
  static var oakDanger: OakButtonStyle { OakButtonStyle(kind: .danger) }
}

#if DEBUG
#Preview("Oak buttons") {
  VStack(spacing: 16) {
    Button("Primary action") {}.buttonStyle(.oakPrimary)
    Button("Secondary action") {}.buttonStyle(.oakSecondary)
    Button("Ghost action") {}.buttonStyle(.oakGhost)
    Button("Delete") {}.buttonStyle(.oakDanger)
    Button("Disabled") {}.buttonStyle(.oakPrimary).disabled(true)
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.canvas)
}
#endif
