import SwiftUI

/// Modest hop-chip row under an assistant card (CHIP-US-1). Hidden when empty.
struct FollowUpChipRow: View {
  let chips: [FollowUpChip]
  let onTap: (FollowUpChip) -> Void

  var body: some View {
    if !chips.isEmpty {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: Theme.Spacing.sm) {
          ForEach(chips) { chip in
            Button {
              onTap(chip)
            } label: {
              Text(chip.label)
                .font(Theme.body(.caption, weight: .medium))
                .foregroundStyle(Theme.textStrong)
                .padding(.horizontal, Theme.Spacing.sm)
                .padding(.vertical, 6)
                .background(Theme.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.separator, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(chip.label)
          }
        }
      }
    }
  }
}
