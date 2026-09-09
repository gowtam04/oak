import SwiftUI

/// Composer `/` picker (SD-US-1). Shown above the composer in the same
/// neighborhood as ``MentionAutocomplete``. Tap inserts; Send still hops.
struct SlashAutocomplete: View {
  var commands: [SlashCommandRow] = []
  var names: [DexNameRow] = []
  var teams: [TeamSummary] = []
  var empty: String? = nil
  var isGuest: Bool = false
  var onPickCommand: (String) -> Void = { _ in }
  var onPickName: (DexNameRow) -> Void = { _ in }
  var onPickTeam: (TeamSummary) -> Void = { _ in }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(SlashPicker.pickerCaption)
        .font(Theme.body(.caption))
        .foregroundStyle(Theme.textMuted)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.top, Theme.Spacing.sm)
        .padding(.bottom, Theme.Spacing.xs)

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          if !commands.isEmpty {
            ForEach(commands, id: \.token) { row in
              commandRow(row)
            }
          } else if !names.isEmpty {
            ForEach(names) { row in
              nameRow(row)
            }
          } else if !teams.isEmpty {
            ForEach(teams) { team in
              teamRow(team)
            }
          } else if let empty {
            Text(empty)
              .font(Theme.body(.subheadline))
              .foregroundStyle(Theme.textMuted)
              .padding(.horizontal, Theme.Spacing.md)
              .padding(.vertical, Theme.Spacing.sm)
          }
        }
      }
      .frame(maxHeight: 240)
    }
    .background(Theme.surface)
    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
        .strokeBorder(Theme.separator, lineWidth: 1)
    }
    .oakShadow(.raised)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Slash commands")
  }

  @ViewBuilder
  private func commandRow(_ row: SlashCommandRow) -> some View {
    let hint = isGuest ? (row.hintGuest ?? row.hint) : row.hint
    Button {
      onPickCommand(row.token)
    } label: {
      HStack {
        Text(row.token)
          .font(Theme.body(.subheadline, weight: .semibold))
          .foregroundStyle(Theme.textStrong)
        Spacer()
        Text(hint)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textMuted)
          .multilineTextAlignment(.trailing)
      }
      .padding(.horizontal, Theme.Spacing.md)
      .padding(.vertical, Theme.Spacing.sm)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(row.token), \(hint)")
  }

  @ViewBuilder
  private func nameRow(_ row: DexNameRow) -> some View {
    Button {
      onPickName(row)
    } label: {
      HStack {
        Text(row.displayName)
          .font(Theme.body(.subheadline))
          .foregroundStyle(Theme.textStrong)
        Spacer()
        Text(row.kind.label)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textMuted)
      }
      .padding(.horizontal, Theme.Spacing.md)
      .padding(.vertical, Theme.Spacing.sm)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(row.displayName), \(row.kind.label)")
  }

  @ViewBuilder
  private func teamRow(_ team: TeamSummary) -> some View {
    Button {
      onPickTeam(team)
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
    .accessibilityLabel(team.name)
  }
}
