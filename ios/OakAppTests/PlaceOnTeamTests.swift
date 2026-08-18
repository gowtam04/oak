import Foundation
import Testing

@testable import OakApp

/// Phase 5 lockstep oracle — portable `placeSpeciesOnTeam`.
///
/// Clones the TS helper in `web/src/data/teams/place-on-team.ts` (api-design.md).
/// Fails to compile until `PlaceOnTeam.swift` exists
/// (`ios/OakApp/Features/Teams/PlaceOnTeam.swift`).
///
/// Expected API (web `placeSpeciesOnTeam`):
///   `placeSpeciesOnTeam(_ members: [TeamMember], incoming: TeamMember, target: PlaceOnTeamTarget) -> PlaceOnTeamResult`
///   `PlaceOnTeamTarget.firstEmpty | .replace(index: Int)`  // index 0…5
///   `PlaceOnTeamResult.ok(members: [TeamMember], slotIndex: Int) | .full`
///
/// First empty = lowest index `0…5` whose `species` is nil/empty. A members
/// array shorter than 6 treats the next append index as empty. Full (six
/// named species) → `.full` so the client opens the replace sheet. Do not
/// auto-replace. Incoming is already species + copied named fields; the rest
/// is `blankTeamMember()` (ADD-BR-2). Pure — does not mutate `members`.
///
/// Requirement refs: ADD-BR-1, ADD-BR-2, ADD-US-3 / ADD-AC-3.1.
struct PlaceOnTeamTests {

  private func speciesOnly(_ species: String) -> TeamMember {
    var incoming = blankTeamMember()
    incoming = TeamMember(
      species: species,
      ability: incoming.ability,
      item: incoming.item,
      moves: incoming.moves,
      nature: incoming.nature,
      evs: incoming.evs,
      ivs: incoming.ivs,
      teraType: incoming.teraType,
      level: incoming.level,
      nickname: incoming.nickname,
      gender: incoming.gender,
      shiny: incoming.shiny
    )
    return incoming
  }

  private func namedIncoming() -> TeamMember {
    TeamMember(
      species: "garchomp",
      ability: "rough-skin",
      item: "life-orb",
      moves: ["earthquake", "dragon-claw"],
      nature: "jolly",
      evs: StatSpread(hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252),
      ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
      teraType: "ground",
      level: 50,
      nickname: nil,
      gender: nil,
      shiny: nil
    )
  }

  // MARK: ADD-BR-1 — first empty 0…5

  @Test
  func placesIntoTheLowestEmptySlot() {
    let members = [speciesOnly("great-tusk"), blankTeamMember(), speciesOnly("flutter-mane")]
    let incoming = speciesOnly("garchomp")
    let result = placeSpeciesOnTeam(members, incoming: incoming, target: .firstEmpty)
    guard case .ok(let next, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 1)
    #expect(next.count == 3)
    #expect(next[1] == incoming)
    #expect(next[0].species == "great-tusk")
    #expect(next[2].species == "flutter-mane")
  }

  @Test
  func treatsNilAndEmptySpeciesAsEmpty() {
    let members = [
      speciesOnly("great-tusk"),
      TeamMember(
        species: "",
        ability: nil,
        item: nil,
        moves: [],
        nature: nil,
        evs: blankTeamMember().evs,
        ivs: blankTeamMember().ivs,
        teraType: nil,
        level: 50,
        nickname: nil,
        gender: nil,
        shiny: nil
      ),
    ]
    let result = placeSpeciesOnTeam(members, incoming: speciesOnly("garchomp"), target: .firstEmpty)
    guard case .ok(_, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 1)
  }

  @Test
  func appendsWhenEveryExistingMemberHasASpecies() {
    let members = [speciesOnly("great-tusk"), speciesOnly("flutter-mane")]
    let incoming = speciesOnly("garchomp")
    let result = placeSpeciesOnTeam(members, incoming: incoming, target: .firstEmpty)
    guard case .ok(let next, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 2)
    #expect(next.map(\.species) == ["great-tusk", "flutter-mane", "garchomp"])
  }

  @Test
  func placesIntoSlotZeroOnAnEmptyTeam() {
    let incoming = speciesOnly("garchomp")
    let result = placeSpeciesOnTeam([], incoming: incoming, target: .firstEmpty)
    guard case .ok(let next, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 0)
    #expect(next == [incoming])
  }

  @Test
  func fillsTheLastSlotWhenFiveAreOccupied() {
    let members = (0..<5).map { speciesOnly("slot-\($0)") }
    let result = placeSpeciesOnTeam(members, incoming: speciesOnly("garchomp"), target: .firstEmpty)
    guard case .ok(let next, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 5)
    #expect(next.count == 6)
    #expect(next[5].species == "garchomp")
  }

  // MARK: ADD-BR-1 / ADD-US-3 — full does not auto-replace

  @Test
  func returnsFullWhenAllSixSlotsHaveASpecies() {
    let members = (0..<6).map { speciesOnly("slot-\($0)") }
    let result = placeSpeciesOnTeam(members, incoming: speciesOnly("garchomp"), target: .firstEmpty)
    #expect(result == .full)
    if case .ok = result {
      Issue.record("full team must not auto-replace (ADD-BR-1)")
    }
  }

  @Test
  func doesNotMutateTheInputOnFull() {
    let members = (0..<6).map { speciesOnly("slot-\($0)") }
    let snapshot = members
    _ = placeSpeciesOnTeam(members, incoming: speciesOnly("garchomp"), target: .firstEmpty)
    #expect(members == snapshot)
  }

  // MARK: replace index

  @Test
  func replaceOverwritesTheNamedIndexOnly() {
    let members = (0..<6).map { speciesOnly("slot-\($0)") }
    let incoming = speciesOnly("garchomp")
    let result = placeSpeciesOnTeam(members, incoming: incoming, target: .replace(index: 3))
    guard case .ok(let next, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 3)
    #expect(next.count == 6)
    #expect(next[3] == incoming)
    #expect(next[2].species == "slot-2")
    #expect(next[4].species == "slot-4")
    #expect(next.map(\.species).contains("slot-3") == false)
  }

  // MARK: ADD-BR-2 — copy species + named fields only

  @Test
  func speciesOnlyIncomingKeepsBlankMemberDefaults() {
    let incoming = speciesOnly("garchomp")
    let result = placeSpeciesOnTeam([], incoming: incoming, target: .firstEmpty)
    guard case .ok(let next, _) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    let placed = next[0]
    #expect(placed.species == "garchomp")
    #expect(placed.ability == blankTeamMember().ability)
    #expect(placed.item == blankTeamMember().item)
    #expect(placed.moves == blankTeamMember().moves)
    #expect(placed.nature == blankTeamMember().nature)
    #expect(placed.evs == blankTeamMember().evs)
    #expect(placed.ivs == blankTeamMember().ivs)
    #expect(placed.teraType == blankTeamMember().teraType)
    #expect(placed.level == blankTeamMember().level)
    #expect(placed.moves.isEmpty)
    #expect(placed.item == nil)
  }

  @Test
  func copiesNamedFieldsAndDoesNotInventTheRest() {
    let incoming = namedIncoming()
    let result = placeSpeciesOnTeam([blankTeamMember()], incoming: incoming, target: .firstEmpty)
    guard case .ok(let next, let slotIndex) = result else {
      Issue.record("expected ok, got \(result)")
      return
    }
    #expect(slotIndex == 0)
    #expect(next[0] == incoming)
    #expect(next[0].ability == "rough-skin")
    #expect(next[0].item == "life-orb")
    #expect(next[0].moves == ["earthquake", "dragon-claw"])
    #expect(next[0].nature == "jolly")
    #expect(next[0].teraType == "ground")
    #expect(next[0].nickname == nil)
    #expect(next[0].gender == nil)
    #expect(next[0].shiny == nil)
  }

  @Test
  func isPureTheInputArrayIsUnchanged() {
    let members = [speciesOnly("great-tusk")]
    let snapshot = members
    _ = placeSpeciesOnTeam(members, incoming: speciesOnly("garchomp"), target: .firstEmpty)
    #expect(members == snapshot)
  }
}
