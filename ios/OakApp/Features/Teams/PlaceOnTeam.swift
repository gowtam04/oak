import Foundation

/// Portable add-to-team slot write (ADR-5).
///
/// Clones `web/src/data/teams/place-on-team.ts`. First empty = lowest index
/// `0…5` whose `species` is nil/empty (ADD-BR-1). A members array shorter than
/// 6 treats the next append index as empty. A full roster is never
/// auto-replaced — the caller must name a slot (ADD-BR-6). Incoming is already
/// species + copied named fields; unnamed stay `blankTeamMember()` defaults
/// (ADD-BR-2). Pure — does not mutate `members`.

private let teamSize = 6

enum PlaceOnTeamTarget: Equatable, Sendable {
  case firstEmpty
  case replace(index: Int)
}

enum PlaceOnTeamResult: Equatable, Sendable {
  case ok(members: [TeamMember], slotIndex: Int)
  case full
}

/// Write `incoming` into the first empty slot, or replace a named index.
/// Full + `.firstEmpty` → `.full` (no auto-replace).
func placeSpeciesOnTeam(
  _ members: [TeamMember],
  incoming: TeamMember,
  target: PlaceOnTeamTarget
) -> PlaceOnTeamResult {
  switch target {
  case .replace(let index):
    var next = members
    while next.count <= index {
      next.append(blankTeamMember())
    }
    next[index] = incoming
    return .ok(members: next, slotIndex: index)

  case .firstEmpty:
    for index in 0..<teamSize {
      let occupant: TeamMember? = index < members.count ? members[index] : nil
      guard isEmptySlot(occupant) else { continue }
      var next = members
      if index < next.count {
        next[index] = incoming
      } else {
        next.append(incoming)
      }
      return .ok(members: next, slotIndex: index)
    }
    return .full
  }
}

private func isEmptySlot(_ member: TeamMember?) -> Bool {
  guard let member else { return true }
  return member.species == nil || member.species == ""
}
