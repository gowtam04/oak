import SwiftUI

/// Display-only current Champions regulation pill (CF-UI-US-2). Not a
/// National Dex / Gens 1–8 / Scarlet-Violet picker — tap does not open a
/// game menu.
struct RegulationChip: View {
  var compact: Bool = true

  private var shortLabel: String { "Champions · Reg M-B" }
  private var hint: String { "Current Champions regulation: Regulation M-B" }

  var body: some View {
    Text(compact ? shortLabel : Format.champions.displayLabel)
      .font(Theme.body(.caption, weight: .medium))
      .foregroundStyle(Theme.onRed)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(Theme.onRed.opacity(0.16), in: Capsule())
      .overlay(Capsule().strokeBorder(Theme.onRed.opacity(0.45), lineWidth: 1))
      .accessibilityLabel(hint)
      .accessibilityAddTraits(.isStaticText)
  }
}
