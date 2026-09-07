import Foundation
import Testing

@testable import OakApp

/// `TeamsListViewModel` against `FakeTeamService` (history-and-teams.md
/// M-TEAM-US-4/6): loading, living vs archived (Champions-first ADR-3), the library
/// mutations (create / duplicate / delete), applying an agent-proposed team, and
/// importing a Showdown paste. The view model is `@MainActor`, so the suite is too.
///
/// Expected P7 API additions:
///   `archivedTeams: [TeamSummary]`
///   `reloadArchived()` — GET `/api/teams?archived=1`
///   `canEdit` / `canDuplicate` / `canApplySet` false for archived; `canDelete` true
///   create/import always persist `champions` (format argument ignored)
@MainActor
struct TeamsListViewModelTests {

  // MARK: Helpers

  private func member(species: String?, moves: [String] = []) -> TeamMember {
    TeamMember(
      species: species,
      ability: nil,
      item: nil,
      moves: moves,
      nature: nil,
      evs: .zero,
      ivs: .zero,
      teraType: nil,
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
    members: [TeamMember] = []
  ) -> Team {
    Team(id: id, name: name, format: format, members: members, createdAt: 1, updatedAt: 1)
  }

  private func makeVM(
    seed: [Team] = []
  ) -> (TeamsListViewModel, FakeTeamService) {
    let teamService = FakeTeamService(seed: seed)
    let vm = TeamsListViewModel(teamService: teamService)
    return (vm, teamService)
  }

  private func makeVM(
    seed: [Team],
    dex: FakeDexLookupService
  ) -> (TeamsListViewModel, FakeTeamService) {
    let teamService = FakeTeamService(seed: seed)
    let vm = TeamsListViewModel(teamService: teamService, dexLookup: dex)
    return (vm, teamService)
  }

  /// Decodes the `swampert-mega` ref from `Fixtures/sprites_response.json` (the shared
  /// sprite-batch fixture) for the hydration tests.
  private func swampertRef() throws -> DexSpriteRef {
    let envelope = try Fixtures.decode(SpritesFixtureEnvelope.self, from: "sprites_response.json")
    return envelope.refs["swampert-mega"]!
  }

  // MARK: Loading

  @Test
  func reloadPopulatesTeams() async {
    let (vm, _) = makeVM(seed: [team(id: "a"), team(id: "b")])

    await vm.reload()

    #expect(Set(vm.teams.map(\.id)) == ["a", "b"])
    #expect(vm.errorMessage == nil)
    #expect(vm.isLoading == false)
  }

  @Test
  func reloadSurfacesErrorAndKeepsPriorList() async {
    let (vm, fake) = makeVM(seed: [team(id: "a")])
    await vm.reload()

    fake.listError = .transport(underlying: "URLError.-1009")
    await vm.reload()

    #expect(vm.teams.map(\.id) == ["a"])  // prior list preserved
    #expect(vm.errorMessage == TeamsListViewModel.connectionMessage)
  }

  @Test
  func setFormatFilterReloadsWithFormat() async {
    // Champions-first: there is no format picker. Kept as a trampoline so a
    // leftover call cannot reopen a gen-N living list (CF-TEAM-AC-1.7).
    let (vm, fake) = makeVM(seed: [
      team(id: "sv", format: .scarletViolet),
      team(id: "ch", format: .champions),
      team(id: "g7", format: .gen7),
    ])

    await vm.reload()

    #expect(Set(vm.teams.map(\.id)) == ["ch"])
    #expect(vm.teams.allSatisfy(\.isLiving))
    #expect(fake.lastListArchived == false || fake.lastListFormat == .champions)
  }

  // MARK: Sprite hydration

  @Test
  func reloadHydratesSpriteRefs() async throws {
    let ref = try swampertRef()
    let dex = FakeDexLookupService()
    // Keyed by the sorted, comma-joined name batch (FakeDexLookupService's convention).
    dex.spriteResults["swampert-mega"] = ["swampert-mega": ref]
    let (vm, _) = makeVM(
      seed: [team(id: "a", format: .champions, members: [member(species: "swampert-mega")])],
      dex: dex)

    await vm.reload()

    #expect(vm.spriteRef(for: "swampert-mega") == ref)
    #expect(dex.spriteCalls.last?.format == .champions)
  }

  @Test
  func reloadDegradesToEmptyRefsOnFetchFailure() async throws {
    // The fake returns `[:]` for any unseeded batch — mirrors the live service folding a
    // transport/decode fault to an empty map (never throwing). The list still loads.
    let dex = FakeDexLookupService()
    let (vm, _) = makeVM(
      seed: [team(id: "a", format: .champions, members: [member(species: "swampert-mega")])],
      dex: dex)

    await vm.reload()

    #expect(vm.teams.map(\.id) == ["a"])  // list unaffected
    #expect(vm.errorMessage == nil)
    #expect(vm.spriteRef(for: "swampert-mega") == nil)  // fell back — dot in the row
  }

  @Test
  func reloadLeavesUnresolvedSpeciesWithoutARef() async throws {
    let ref = try swampertRef()
    let dex = FakeDexLookupService()
    // The batch response only carries one of the two requested species.
    dex.spriteResults[["pikachu", "swampert-mega"].sorted().joined(separator: ",")] = [
      "swampert-mega": ref
    ]
    let (vm, _) = makeVM(
      seed: [
        team(
          id: "a", format: .champions,
          members: [member(species: "swampert-mega"), member(species: "pikachu")])
      ],
      dex: dex)

    await vm.reload()

    #expect(vm.spriteRef(for: "swampert-mega") == ref)
    #expect(vm.spriteRef(for: "pikachu") == nil)  // absent from the response → no ref
  }

  // MARK: Create / duplicate / delete

  @Test
  func createTeamInsertsSummaryAtTop() async {
    let (vm, fake) = makeVM(seed: [team(id: "old")])
    await vm.reload()

    let created = await vm.createTeam(format: .champions, name: "Fresh")

    #expect(created != nil)
    #expect(fake.createCount == 1)
    #expect(fake.lastCreateFormat == .champions)
    #expect(fake.lastCreateName == "Fresh")
    #expect(vm.teams.first?.name == "Fresh")
  }

  @Test
  func createTeamIgnoresOtherFormatsAndAlwaysStoresChampions() async {
    let (vm, fake) = makeVM()

    let created = await vm.createTeam(format: .gen7, name: "Alola")

    #expect(created != nil)
    #expect(fake.lastCreateFormat == .champions)
    #expect(created?.format == .champions)
  }

  @Test
  func duplicateInsertsCopy() async {
    let (vm, fake) = makeVM(seed: [team(id: "src", name: "Original")])
    await vm.reload()

    let copy = await vm.duplicate(vm.teams[0])

    #expect(copy?.name == "Original copy")
    #expect(fake.duplicateCount == 1)
    #expect(vm.teams.first?.name == "Original copy")
  }

  @Test
  func deleteRemovesOptimistically() async {
    let (vm, _) = makeVM(seed: [team(id: "a"), team(id: "b")])
    await vm.reload()
    let target = vm.teams.first { $0.id == "a" }!

    await vm.delete(target)

    #expect(vm.teams.map(\.id) == ["b"])
    #expect(vm.errorMessage == nil)
  }

  @Test
  func deleteTreats404AsSuccess() async {
    let (vm, fake) = makeVM(seed: [team(id: "a")])
    await vm.reload()
    fake.deleteError = .http(status: 404, code: "not_found", message: "gone")

    await vm.delete(vm.teams[0])

    #expect(vm.teams.isEmpty)  // stays removed (idempotent)
    #expect(vm.errorMessage == nil)
  }

  @Test
  func deleteRevertsOnRealFailure() async {
    let (vm, fake) = makeVM(seed: [team(id: "a")])
    await vm.reload()
    fake.deleteError = .transport(underlying: "URLError.-1009")

    await vm.delete(vm.teams[0])

    #expect(vm.teams.map(\.id) == ["a"])  // restored
    #expect(vm.errorMessage == TeamsListViewModel.connectionMessage)
  }

  // MARK: Apply proposed (agent-assisted)

  @Test
  func applyProposedCreatesSavedTeam() async {
    let (vm, fake) = makeVM()
    let members = [member(species: "great-tusk", moves: ["close-combat"])]
    let proposed = ProposedTeam(name: "Sun Offense", format: .champions, members: members)

    let saved = await vm.applyProposed(proposed)

    #expect(saved != nil)
    #expect(fake.createCount == 1)
    #expect(fake.lastCreateFormat == .champions)
    #expect(fake.lastCreateName == "Sun Offense")
    #expect(fake.lastCreateMembers == members)
    #expect(vm.teams.first?.name == "Sun Offense")
    #expect(fake.store.contains { $0.name == "Sun Offense" })
  }

  // MARK: Import

  @Test
  func importPasteInsertsTeamAndReturnsNotes() async {
    let (vm, fake) = makeVM()
    fake.nextNotes = [
      ImportNote(slot: 0, kind: .move, raw: "Hyperspace Fury", resolvedTo: nil, message: "Dropped.")
    ]

    let result = await vm.importPaste("Garchomp\n", format: .scarletViolet)

    #expect(result != nil)
    #expect(result?.notes.count == 1)
    #expect(fake.importCount == 1)
    #expect(fake.lastImportFormat == .champions)
    #expect(result?.team.format == .champions)
    #expect(vm.teams.contains { $0.id == result?.team.id })
  }

  // MARK: Living vs archived (CF-TEAM-US-5, CF-UI-US-4, ADR-3)

  @Test
  func reloadLoadsLivingChampionsOnly() async {
    let (vm, fake) = makeVM(seed: [
      team(id: "sv", format: .scarletViolet),
      team(id: "ch", format: .champions),
      team(id: "g7", format: .gen7),
      team(id: "nd", format: .nationalDex),
    ])

    await vm.reload()

    #expect(vm.teams.map(\.id) == ["ch"])
    #expect(vm.teams.allSatisfy { $0.format == .champions })
    #expect(vm.teams.allSatisfy(\.isLiving))
    #expect(fake.lastListArchived == false)
  }

  @Test
  func archivedSectionListsNonChampionsTeams() async {
    let (vm, fake) = makeVM(seed: [
      team(id: "sv", name: "SV core", format: .scarletViolet),
      team(id: "ch", name: "Rain", format: .champions),
      team(id: "g7", name: "Alola rain", format: .gen7),
    ])

    await vm.reload()
    await vm.reloadArchived()

    #expect(Set(vm.archivedTeams.map(\.id)) == ["sv", "g7"])
    #expect(vm.archivedTeams.allSatisfy(\.isArchived))
    #expect(vm.archivedTeams.allSatisfy { $0.format != .champions })
    #expect(fake.lastListArchived == true)
    #expect(vm.teams.map(\.id) == ["ch"])
  }

  @Test
  func archivedRowIsViewAndDeleteOnly() async {
    let (vm, fake) = makeVM(seed: [
      team(id: "g7", name: "Alola rain", format: .gen7),
      team(id: "ch", format: .champions),
    ])
    await vm.reload()
    await vm.reloadArchived()
    let archived = vm.archivedTeams.first { $0.id == "g7" }!

    #expect(vm.canEdit(archived) == false)
    #expect(vm.canDuplicate(archived) == false)
    #expect(vm.canApplySet(archived) == false)
    #expect(vm.canDelete(archived))

    let copy = await vm.duplicate(archived)
    #expect(copy == nil)
    #expect(fake.duplicateCount == 0)

    await vm.delete(archived)
    #expect(vm.archivedTeams.map(\.id).contains("g7") == false)
    #expect(fake.deleteCount == 1)
  }

  @Test
  func emptyArchiveDoesNotError() async {
    let (vm, _) = makeVM(seed: [team(id: "ch", format: .champions)])
    await vm.reload()
    await vm.reloadArchived()

    #expect(vm.archivedTeams.isEmpty)
    #expect(vm.errorMessage == nil)
  }
}

// MARK: - Test fixtures

extension StatSpread {
  /// An all-zero spread for terse member fixtures.
  static let zero = StatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0)
}

/// `GET /api/sprites` → `{ refs: { [name]: DexSpriteRef } }`, for decoding the shared
/// `sprites_response.json` fixture into `DexSpriteRef`s the hydration tests script.
private struct SpritesFixtureEnvelope: Decodable {
  let refs: [String: DexSpriteRef]
}
