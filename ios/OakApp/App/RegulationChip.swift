import SwiftUI

/// Display-only current Champions regulation pill (CF-UI-US-2). Not a
/// National Dex / Gens 1–8 / Scarlet-Violet picker — tap does not open a
/// game menu. Label comes from ``AppState`` (`GET /api/scope`).
struct RegulationChip: View {
  @Environment(AppState.self) private var appState

  var body: some View {
    Text(appState.regulationChipLabel)
      .font(Theme.body(.caption, weight: .medium))
      .foregroundStyle(Theme.onRed)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(Theme.onRed.opacity(0.16), in: Capsule())
      .overlay(Capsule().strokeBorder(Theme.onRed.opacity(0.45), lineWidth: 1))
      .accessibilityLabel(appState.regulationHint)
      .accessibilityAddTraits(.isStaticText)
  }
}
