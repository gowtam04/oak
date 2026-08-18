import Foundation

/// One-tap Showdown paste for a proposed team (PASTE-US-1 / PASTE-BR-2).
/// Same dialect as the human-md Showdown section.
func proposedTeamToShowdownPaste(_ team: ProposedTeam) -> String {
  team.members.compactMap(serializeProposedShowdownSet).joined(separator: "\n\n")
}

private func serializeProposedShowdownSet(_ member: TeamMember) -> String? {
  guard let species = member.species?.trimmingCharacters(in: .whitespacesAndNewlines),
        !species.isEmpty
  else { return nil }

  var lines: [String] = []
  let speciesName = humanizeShowdownSlug(species)
  if let item = member.item?.trimmingCharacters(in: .whitespacesAndNewlines), !item.isEmpty {
    lines.append("\(speciesName) @ \(humanizeShowdownSlug(item))")
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
    lines.append("Ability: \(humanizeShowdownSlug(ability))")
  }
  lines.append("Level: \(member.level)")
  if let tera = member.teraType?.trimmingCharacters(in: .whitespacesAndNewlines), !tera.isEmpty {
    lines.append("Tera Type: \(humanizeShowdownSlug(tera))")
  }
  if let evLine = showdownSpreadLine(member.evs, omitZero: true) {
    lines.append("EVs: \(evLine)")
  }
  if let nature = member.nature?.trimmingCharacters(in: .whitespacesAndNewlines), !nature.isEmpty {
    lines.append("\(humanizeShowdownSlug(nature)) Nature")
  }
  if let ivLine = showdownSpreadLine(member.ivs, omitIfAll: 31) {
    lines.append("IVs: \(ivLine)")
  }
  for move in member.moves {
    let trimmed = move.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { lines.append("- \(humanizeShowdownSlug(trimmed))") }
  }
  return lines.joined(separator: "\n")
}

private func showdownSpreadLine(
  _ spread: StatSpread,
  omitZero: Bool = false,
  omitIfAll: Int? = nil
) -> String? {
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

private func humanizeShowdownSlug(_ slug: String) -> String {
  slug.split(separator: "-").map { part in
    guard let first = part.first else { return String(part) }
    return first.uppercased() + part.dropFirst()
  }.joined(separator: " ")
}
