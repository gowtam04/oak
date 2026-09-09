import Foundation
import Testing

@testable import OakApp

/// `AddToTeamViewModel` — picker + first-empty / replace / create-new.
/// Guest never sees the sheet (caller hides the verb; VM also refuses).
///
/// Place-on-team slot math is already locked in `PlaceOnTeamTests` (P5).
/// These tests cover the **sheet VM**: list, first empty write, full → replace
/// sheet, cancel-safe, create-new in conversation scope, guest not presented.
///
/// Expected API (`ios/OakApp/Features/Teams/AddToTeamSheet.swift` + VM):
///   `AddToTeamViewModel(teams:isSignedIn:conversationFormat:incoming:)`
///   `isPresented` — false for guests (AUTH-BR-1)
///   `load()`, `selectTeam(id:)`, `replaceSlot(_:)`, `cancelReplace()`,
///     `createNewTeam(name:)`
///   `replaceCandidates` non-nil iff the chosen team is full
///   `openedTeamId` + `focusedSlot` after a successful write (editor hop)
///
/// Requirement refs: ADD-US-1–4, ADD-AC-1.1–1.2, ADD-AC-2.1–2.4, ADD-AC-3.1–3.3,
/// ADD-BR-1, ADD-BR-5, ADD-BR-6, AUTH-BR-1.
@MainActor
struct AddToTeamSheetTests {

  private func speciesOnly(_ species: String) -> TeamMember {
    TeamMember(
      species: species,
      ability: nil,
      item: nil,
      moves: [],
      nature: nil,
      evs: StatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0),
      ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
      teraType: nil,
      level: 50,
      nickname: nil,
      gender: nil,
      shiny: nil
    )
  }

  private func incomingGarchomp() -> TeamMember {
    TeamMember(
      species: "garchomp",
      ability: "rough-skin",
      item: "life-orb",
      moves: ["earthquake"],
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

  private func team(
    id: String,
    name: String = "Team",
    format: Format = .champions,
    members: [TeamMember]
  ) -> Team {
    Team(id: id, name: name, format: format, members: members, createdAt: 1, updatedAt: 1)
  }

  private func makeVM(
    seed: [Team],
    signedIn: Bool = true,
    format: Format = .champions,
    incoming: TeamMember? = nil
  ) -> (AddToTeamViewModel, FakeTeamService) {
    let teams = FakeTeamService(seed: seed)
    let vm = AddToTeamViewModel(
      teams: teams,
      isSignedIn: signedIn,
      conversationFormat: format,
      incoming: incoming ?? incomingGarchomp()
    )
    return (vm, teams)
  }

  // MARK: AUTH-BR-1 / ADD-AC-1.2 — guest never shown

  @Test
  func guestPickerIsNotPresentedAndDoesNotListTeams() async {
    let (vm, fake) = makeVM(
      seed: [team(id: "t1", members: [speciesOnly("great-tusk")])],
      signedIn: false
    )

    #expect(vm.isPresented == false)
    #expect(vm.showsAddToTeam == false)

    await vm.load()

    #expect(fake.listCount == 0)
    #expect(vm.teams.isEmpty)
    #expect(vm.openedTeamId == nil)
  }

  @Test
  func signedInPickerOpensAndListsTeams() async {
    let (vm, fake) = makeVM(
      seed: [
        team(id: "rain", name: "Rain", members: [speciesOnly("barraskewda")]),
        team(id: "sun", name: "Sun", members: []),
      ]
    )

    #expect(vm.isPresented)
    #expect(vm.showsAddToTeam)
    await vm.load()

    #expect(fake.listCount == 1)
    #expect(Set(vm.teams.map(\.id)) == ["rain", "sun"])
    #expect(vm.canCreateNewTeam)
  }

  // MARK: ADD-AC-1.1 / ADD-BR-1 — first empty slot

  @Test
  func addingToATeamWithAnEmptySlotWritesTheFirstEmptyAndOpensTheEditor() async {
    let existing = [
      speciesOnly("great-tusk"),
      blankTeamMember(),
      speciesOnly("flutter-mane"),
    ]
    let (vm, fake) = makeVM(seed: [team(id: "t1", name: "Balance", members: existing)])
    await vm.load()

    await vm.selectTeam(id: "t1")

    #expect(vm.replaceCandidates == nil)
    #expect(fake.updateCount == 1)
    #expect(fake.lastUpdateId == "t1")
    #expect(fake.lastUpdateMembers?[1].species == "garchomp")
    #expect(fake.lastUpdateMembers?[1].item == "life-orb")
    #expect(vm.openedTeamId == "t1")
    #expect(vm.focusedSlot == 1)
  }

  @Test
  func emptyRosterWritesSlotZero() async {
    let (vm, fake) = makeVM(seed: [team(id: "t1", members: [])])
    await vm.load()

    await vm.selectTeam(id: "t1")

    #expect(fake.updateCount == 1)
    #expect(fake.lastUpdateMembers?.first?.species == "garchomp")
    #expect(vm.focusedSlot == 0)
    #expect(vm.replaceCandidates == nil)
  }

  // MARK: ADD-US-3 / ADD-AC-3.1–3.3 — full → replace

  @Test
  func aFullTeamOpensTheReplaceSheetAndDoesNotWriteYet() async {
    let full = (0..<6).map { speciesOnly("slot-\($0)") }
    let (vm, fake) = makeVM(seed: [team(id: "full", name: "Six", members: full)])
    await vm.load()

    await vm.selectTeam(id: "full")

    #expect(fake.updateCount == 0)
    #expect(vm.replaceCandidates?.count == 6)
    #expect(vm.openedTeamId == nil)
    #expect(vm.focusedSlot == nil)
  }

  @Test
  func confirmingAReplaceOverwritesThatSlotAndOpensTheEditor() async {
    let full = (0..<6).map { speciesOnly("slot-\($0)") }
    let (vm, fake) = makeVM(seed: [team(id: "full", members: full)])
    await vm.load()
    await vm.selectTeam(id: "full")

    await vm.replaceSlot(2)

    #expect(fake.updateCount == 1)
    #expect(fake.lastUpdateMembers?[2].species == "garchomp")
    #expect(fake.lastUpdateMembers?[0].species == "slot-0")
    #expect(vm.openedTeamId == "full")
    #expect(vm.focusedSlot == 2)
    #expect(vm.replaceCandidates == nil)
  }

  @Test
  func cancelingReplaceLeavesTheTeamUnchanged() async {
    let full = (0..<6).map { speciesOnly("slot-\($0)") }
    let (vm, fake) = makeVM(seed: [team(id: "full", members: full)])
    await vm.load()
    await vm.selectTeam(id: "full")

    vm.cancelReplace()

    #expect(fake.updateCount == 0)
    #expect(vm.replaceCandidates == nil)
    #expect(vm.openedTeamId == nil)
    #expect(fake.store.first { $0.id == "full" }?.members.map(\.species) == full.map(\.species))
  }

  // MARK: ADD-US-2 / ADD-AC-2.2–2.3 — create new

  @Test
  func createNewTeamUsesConversationScopeAndWritesSlotZero() async {
    let (vm, fake) = makeVM(seed: [], format: .gen5)
    await vm.load()

    await vm.createNewTeam(name: "Gen 5 sand")

    #expect(fake.createCount == 1)
    #expect(fake.lastCreateFormat == .champions)
    #expect(fake.lastCreateName == "Gen 5 sand")
    #expect(fake.lastCreateMembers?.first?.species == "garchomp")
    #expect(vm.openedTeamId != nil)
    #expect(vm.focusedSlot == 0)
  }

  @Test
  func zeroSavedTeamsStillOffersCreateNew() async {
    let (vm, _) = makeVM(seed: [])
    await vm.load()

    #expect(vm.teams.isEmpty)
    #expect(vm.canCreateNewTeam)
    #expect(vm.isPresented)
  }

  @Test
  func dismissWithoutChoosingWritesNothing() async {
    let (vm, fake) = makeVM(seed: [team(id: "t1", members: [])])
    await vm.load()

    vm.dismiss()

    #expect(fake.updateCount == 0)
    #expect(fake.createCount == 0)
    #expect(vm.openedTeamId == nil)
    #expect(vm.isPresented == false)
  }

  @Test
  func aFailedWriteDoesNotNavigateToTheEditor() async {
    let (vm, fake) = makeVM(seed: [team(id: "t1", members: [])])
    fake.updateError = .transport(underlying: "URLError.-1009")
    await vm.load()

    await vm.selectTeam(id: "t1")

    #expect(vm.openedTeamId == nil)
    #expect(vm.errorMessage != nil)
  }
}
