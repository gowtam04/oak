import SwiftUI

/// Dismissible companion context chip (P-SHELL-US-3, P-SHELL-AC-3.1–3.3).
/// Stays visible until dismissed; send does not hide it.
struct PadContextChipView: View {
  var chip: PadContextChip
  var onDismiss: () -> Void

  var body: some View {
    HStack(spacing: Theme.Spacing.xs) {
      Text(chip.displayName)
        .font(Theme.body(.caption, weight: .medium))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
      Button(action: onDismiss) {
        Image(systemName: "xmark.circle.fill")
          .font(Theme.body(.body))
          .symbolRenderingMode(.palette)
          .foregroundStyle(Theme.textSecondary, Theme.surfaceSunken)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Dismiss \(chip.displayName)")
    }
    .padding(.leading, Theme.Spacing.md)
    .padding(.trailing, Theme.Spacing.xs)
    .background(Theme.surface, in: Capsule())
    .overlay {
      Capsule().strokeBorder(Theme.borderStrong, lineWidth: 1)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-context-chip")
  }
}
