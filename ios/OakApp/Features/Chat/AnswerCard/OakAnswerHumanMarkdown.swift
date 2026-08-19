import Foundation

/// Distill a finalized ``OakAnswer`` into human-readable markdown for Discord /
/// Notes / Reddit ("Copy as human text" — COPY-US-1 / ADR-9).
///
/// Pure: no UIKit, no clipboard, no mutation. Distinct from ``OakAnswerAgentMarkdown``.
enum OakAnswerHumanMarkdown {
  /// Fixed display order for the six base stats (HP, Attack, Defense, SpA, SpD, Speed).
  private static let statLabels: [(key: String, label: String)] = [
    ("hp", "HP"),
    ("attack", "Attack"),
    ("defense", "Defense"),
    ("special_attack", "SpA"),
    ("special_defense", "SpD"),
    ("speed", "Speed"),
  ]

  private static func statValue(_ stats: BaseStats, key: String) -> Int {
    switch key {
    case "hp": return stats.hp
    case "attack": return stats.atk
    case "defense": return stats.def
    case "special_attack": return stats.spa
    case "special_defense": return stats.spd
    case "speed": return stats.spe
    default: return 0
    }
  }

  /// Render a Discord/Notes-friendly paste: prose + optional fact table +
  /// user-facing caveats + Showdown paste. Omits agent headings, citations,
  /// reasoning, and internal field names.
  static func build(_ answer: OakAnswer) -> String {
    var sections: [String] = []

    let prose = MarkdownBlocks.stripHtmlComments(answer.answerMarkdown)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !prose.isEmpty { sections.append(prose) }

    if let table = formatCandidateTable(answer) { sections.append(table) }
    if let caveats = formatCaveats(answer) { sections.append(caveats) }
    if let paste = formatProposedTeam(answer) { sections.append(paste) }

    return sections.joined(separator: "\n\n")
  }

  // MARK: - Candidates

  private static func formatCandidateTable(_ answer: OakAnswer) -> String? {
    guard let shown = answer.candidates?.shown, !shown.isEmpty else { return nil }

    let hasBase = shown.contains { $0.baseStats != nil }
    let keyStatKeys = collectKeyStatKeys(shown)
    let hasKeyStats = !hasBase && !keyStatKeys.isEmpty

    var headers = ["Name", "Types"]
    if hasBase {
      headers.append(contentsOf: statLabels.map(\.label))
    } else if hasKeyStats {
      headers.append(contentsOf: keyStatKeys.map(statHeader))
    }

    let body: [[String]] = shown.map { row in
      var cells = [row.name, row.types.joined(separator: "/")]
      if hasBase {
        if let stats = row.baseStats {
          cells.append(contentsOf: statLabels.map { String(statValue(stats, key: $0.key)) })
        } else {
          cells.append(contentsOf: statLabels.map { _ in "" })
        }
      } else if hasKeyStats {
        for key in keyStatKeys {
          if let value = row.keyStats?[key] {
            cells.append(value.displayString)
          } else {
            cells.append("")
          }
        }
      }
      return cells
    }
    return toGfm(headers: headers, rows: body)
  }

  private static func collectKeyStatKeys(_ rows: [CandidateRow]) -> [String] {
    var keys: [String] = []
    var seen = Set<String>()
    for row in rows {
      guard let stats = row.keyStats else { continue }
      for key in stats.keys {
        if seen.insert(key).inserted { keys.append(key) }
      }
    }
    return keys
  }

  // MARK: - Caveats

  private static func formatCaveats(_ answer: OakAnswer) -> String? {
    var lines: [String] = []
    let basis = answer.generationBasis
    if basis.fallback {
      if let note = basis.note?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
        lines.append(note)
      } else {
        lines.append("Based on \(basis.generation) data — this Pokémon is not in Gen 9.")
      }
    }
    for flag in answer.uncertaintyFlags ?? [] {
      lines.append(UncertaintyFlagLabels.label(for: flag))
    }
    if lines.isEmpty { return nil }
    return lines.joined(separator: "\n")
  }

  // MARK: - Proposed team

  private static func formatProposedTeam(_ answer: OakAnswer) -> String? {
    guard let team = answer.proposedTeam else { return nil }
    let paste = team.members.compactMap(serializeShowdownSet).joined(separator: "\n\n")
    if team.name.isEmpty && paste.isEmpty { return nil }
    if paste.isEmpty { return team.name }
    if team.name.isEmpty { return paste }
    return "\(team.name)\n\n\(paste)"
  }

  /// A compact Showdown-style set. Display names are humanized slugs so the
  /// paste matches web's `@pkmn` exporter well enough for lockstep fixtures.
  private static func serializeShowdownSet(_ member: TeamMember) -> String? {
    guard let species = member.species?.trimmingCharacters(in: .whitespacesAndNewlines),
          !species.isEmpty
    else { return nil }

    var lines: [String] = []
    let speciesName = humanize(species)
    if let item = member.item?.trimmingCharacters(in: .whitespacesAndNewlines), !item.isEmpty {
      lines.append("\(speciesName) @ \(humanize(item))")
    } else if let nickname = member.nickname?.trimmingCharacters(in: .whitespacesAndNewlines),
              !nickname.isEmpty
    {
      lines.append("\(nickname) (\(speciesName))")
    } else {
      lines.append(speciesName)
    }

    if let ability = member.ability?.trimmingCharacters(in: .whitespacesAndNewlines),
       !ability.isEmpty
    {
      lines.append("Ability: \(humanize(ability))")
    }
    lines.append("Level: \(member.level)")
    if let tera = member.teraType?.trimmingCharacters(in: .whitespacesAndNewlines), !tera.isEmpty {
      lines.append("Tera Type: \(humanize(tera))")
    }
    if let evLine = spreadLine(member.evs, omitZero: true) {
      lines.append("EVs: \(evLine)")
    }
    if let nature = member.nature?.trimmingCharacters(in: .whitespacesAndNewlines), !nature.isEmpty {
      lines.append("\(humanize(nature)) Nature")
    }
    if let ivLine = spreadLine(member.ivs, omitIfAll: 31) {
      lines.append("IVs: \(ivLine)")
    }
    for move in member.moves {
      let trimmed = move.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { lines.append("- \(humanize(trimmed))") }
    }
    return lines.joined(separator: "\n")
  }

  private static func spreadLine(_ spread: StatSpread, omitZero: Bool = false, omitIfAll: Int? = nil)
    -> String?
  {
    let pairs: [(label: String, value: Int)] = [
      ("HP", spread.hp),
      ("Atk", spread.atk),
      ("Def", spread.def),
      ("SpA", spread.spa),
      ("SpD", spread.spd),
      ("Spe", spread.spe),
    ]
    if let omitIfAll, pairs.allSatisfy({ $0.value == omitIfAll }) { return nil }
    let parts = pairs.compactMap { pair -> String? in
      if omitZero, pair.value == 0 { return nil }
      return "\(pair.value) \(pair.label)"
    }
    return parts.isEmpty ? nil : parts.joined(separator: " / ")
  }

  // MARK: - Helpers

  private static func toGfm(headers: [String], rows: [[String]]) -> String {
    let head = "| \(headers.joined(separator: " | ")) |"
    let sep = "| \(headers.map { _ in "---" }.joined(separator: " | ")) |"
    let body = rows.map { "| \($0.joined(separator: " | ")) |" }
    return ([head, sep] + body).joined(separator: "\n")
  }

  private static func statHeader(_ key: String) -> String {
    if key == "hp" { return "HP" }
    return humanize(key)
  }

  private static func humanize(_ slug: String) -> String {
    slug.split(separator: "-").map { part in
      guard let first = part.first else { return String(part) }
      return String(first).uppercased() + part.dropFirst()
    }.joined(separator: " ")
  }
}

extension JSONScalar {
  /// Display form for a fact-table cell (ints stay integers).
  var displayString: String {
    switch self {
    case let .string(value): return value
    case let .int(value): return String(value)
    case let .double(value):
      if value.rounded() == value { return String(Int(value)) }
      return String(value)
    case let .bool(value): return value ? "true" : "false"
    case .null: return ""
    }
  }
}
