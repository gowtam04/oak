import SwiftUI

/// `@` team autocomplete (MEN-US-1). Shown above the composer when the user
/// is mid-mention. Guests never see this (no saved teams).
struct MentionAutocomplete: View {
  let suggestions: [TeamSummary]
  let onPick: (TeamSummary) -> Void

  var body: some View {
    if !suggestions.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(suggestions.prefix(8)) { team in
          Button {
            onPick(team)
          } label: {
            HStack {
              Text(team.name)
                .font(Theme.body(.subheadline))
                .foregroundStyle(Theme.textStrong)
              Spacer()
              Text(team.format.shortLabel)
                .font(Theme.body(.caption))
                .foregroundStyle(Theme.textMuted)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Mention \(team.name)")
        }
      }
      .background(Theme.surface)
      .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
          .strokeBorder(Theme.separator, lineWidth: 1)
      }
      .oakShadow(.raised)
    }
  }
}
