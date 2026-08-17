import SwiftUI

/// A labeled Pokémon type chip — color **and** text, never color-only.
///
/// Full-chroma recipe (soul.md — "color comes from content, not chrome"): a
/// **solid** `Theme.type(_:)` fill with legible ink from `Theme.typeInk(_:)`
/// (white on the darker type solids, near-black on the lighter ones) — not a
/// faint tinted pill. The palette is sourced from `Theme.type(_:)` (the single
/// source of the 18 type solids), so the same slug renders consistently
/// everywhere it appears.
///
/// The type's name is always shown as text, so color is not the sole carrier of
/// meaning (M-AC-UI9.3). Typography is Figtree 600 / 11 (`Theme.body` caption2
/// semibold) — a Dynamic Type text style, so the chip grows with the user's
/// preferred size instead of clipping (M-AC-UI9.2).
struct TypeBadge: View {
  /// The lowercase type slug, e.g. `"fire"` (one of the 18 `TYPE_NAMES`).
  let type: String

  /// The user-facing label, capitalized from the slug (`"fire"` → `"Fire"`).
  private var label: String {
    type.capitalized
  }

  var body: some View {
    let color = Theme.type(type)
    Text(label)
      .font(Theme.body(.caption2, weight: .semibold))
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 2)
      .foregroundStyle(Theme.typeInk(type))
      .background(
        color,
        in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
      )
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(label) type")
  }
}

#Preview("Type badges") {
  let types = [
    "normal", "fire", "water", "electric", "grass", "ice",
    "fighting", "poison", "ground", "flying", "psychic", "bug",
    "rock", "ghost", "dragon", "dark", "steel", "fairy",
  ]
  return ScrollView {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
      ForEach(types, id: \.self) { TypeBadge(type: $0) }
    }
    .padding()
  }
}
