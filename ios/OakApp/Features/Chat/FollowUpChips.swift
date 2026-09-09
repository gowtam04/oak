import Foundation

/// One hop-target chip derived from a finalized ``OakAnswer`` + turn context
/// (CHIP-US-1 / ADR-9). Caps: ≤1 scope, ≤3 Dex, ≤1 team.
struct FollowUpChip: Equatable, Sendable, Identifiable {
  enum Kind: Equatable, Sendable {
    case scope
    case dex
    case team
  }

  var id: String { "\(kind)-\(target)" }
  let kind: Kind
  let label: String
  /// Format id, subject name, or team id.
  let target: String
}

/// Derive follow-up chips from a finalized OakAnswer + turn context.
///
/// Pure: no fetch, no mutation of the answer. Never invents calc / compare /
/// add-to-team / "tell me more".
enum FollowUpChips {
  /// A signed-in bound / @mentioned team. Wins over `answer.savedTeam`.
  struct MentionedTeam: Equatable, Sendable {
    let id: String
    let name: String
  }

  private static let dexCap = 3

  /// Project hop-targets. Empty when there is nothing to hop to (no filler chips).
  static func derive(
    answer: OakAnswer,
    impliedFormat: Format? = nil,
    mentionedTeam: MentionedTeam? = nil
  ) -> [FollowUpChip] {
    var chips: [FollowUpChip] = []

    _ = impliedFormat
    // Champions-first: never offer a "Switch to <format>" chip (CF-UI-AC-1.1).

    if let subjects = answer.subjects, !subjects.isEmpty {
      for subject in subjects.prefix(dexCap) {
        chips.append(
          FollowUpChip(
            kind: .dex,
            label: "Open \(subject.name) in Dex",
            target: subject.name
          )
        )
      }
    }

    if let team = mentionedTeam ?? savedTeamRef(answer) {
      chips.append(
        FollowUpChip(
          kind: .team,
          label: "Open \(team.name)",
          target: team.id
        )
      )
    }

    return chips
  }

  private static func savedTeamRef(_ answer: OakAnswer) -> MentionedTeam? {
    guard let saved = answer.savedTeam else { return nil }
    return MentionedTeam(id: saved.id, name: saved.name)
  }
}
