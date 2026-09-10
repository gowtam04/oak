import Foundation
import Testing

@testable import OakApp

/// `TeamEditorViewModel` against `FakeTeamService` (history-and-teams.md M-TEAM-US-1/3):
/// the full-set editor's load, the create-vs-update save path, the **warn-but-allow**
/// guarantee (warnings render but never block save, M-AC-T3.1), member add/remove, the
/// editable↔wire conversion, and export. `@MainActor`.
///
/// Champions-first P7 expected API (parity with Android P8 names):
///   `showsTeraField` / `showsIVKnobs` / `showsLevelKnob` — false on living
///   `showsStatPoints` — true; `statPointBudget` 66 / `statPointStatCap` 32
///   `isReadOnly` / `canSave` — archived is view-only
@MainActor
struct TeamEditorViewModelTests {

  // MARK: Helpers

  private func member(
    species: String?,
    moves: [String] = [],
    evs: StatSpread = .zero,
    ivs: StatSpread = .zero
  ) -> TeamMember {
    TeamMember(
      species: species,
      ability: nil,
      item: nil,
      moves: moves,
      nature: nil,
      evs: evs,
      ivs: ivs,
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

  // MARK: New editor

  @Test
  func newEditorSeedsOneEmptyMember() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .scarletViolet)

    #expect(vm.teamId == nil)
    #expect(vm.members.count == 1)
    #expect(vm.members[0].species.isEmpty)
    #expect(vm.format == .champions)
  }

  // MARK: Save (create / update)

  @Test
  func saveCreatesWhenNew() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions, name: "My Team")
    vm.members[0].species = "garchomp"

    let saved = await vm.save()

    #expect(saved != nil)
    #expect(fake.createCount == 1)
    #expect(fake.lastCreateFormat == .champions)
    #expect(fake.lastCreateName == "My Team")
    #expect(fake.lastCreateMembers?.first?.species == "garchomp")
    #expect(vm.teamId == saved?.id)
    #expect(vm.savedTeam?.id == saved?.id)
  }

  @Test
  func saveUpdatesWhenExisting() async {
    let existing = team(id: "t1", name: "Old", members: [member(species: "garchomp")])
    let fake = FakeTeamService(seed: [existing])
    let vm = TeamEditorViewModel(teamService: fake, team: existing)
    vm.name = "New name"

    let saved = await vm.save()

    #expect(saved != nil)
    #expect(fake.updateCount == 1)
    #expect(fake.lastUpdateId == "t1")
    #expect(fake.lastUpdateName == "New name")
    #expect(vm.savedTeam?.name == "New name")
  }

  // MARK: Warn-but-allow — warnings NEVER block save (M-AC-T3.1)

  @Test
  func warningsRenderButNeverBlockSave() async {
    let fake = FakeTeamService()
    fake.nextWarnings = [
      TeamWarning(
        code: .evTotalExceeded,
        message: "EV total is over 508.",
        slot: 0,
        field: "evs"
      ),
      TeamWarning(
        code: .moveNotInLearnset,
        message: "Garchomp can't learn Moonblast.",
        slot: 0,
        field: "moves[0]"
      ),
    ]
    let vm = TeamEditorViewModel(teamService: fake, format: .scarletViolet, name: "Illegal")
    vm.members[0].species = "garchomp"
    vm.members[0].moves[0] = "moonblast"
    vm.members[0].evs = EditableStatSpread(hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0)

    let saved = await vm.save()

    #expect(saved != nil)  // saved despite the warnings
    #expect(fake.createCount == 1)
    #expect(vm.warnings.count == 2)
    #expect(vm.warnings(forSlot: 0).count == 2)
    #expect(vm.errorMessage == nil)
  }

  @Test
  func saveSurfacesTransportError() async {
    let fake = FakeTeamService()
    fake.createError = .transport(underlying: "URLError.-1009")
    let vm = TeamEditorViewModel(teamService: fake, format: .scarletViolet)

    let saved = await vm.save()

    #expect(saved == nil)
    #expect(vm.errorMessage == TeamEditorViewModel.connectionMessage)
  }

  // MARK: Load

  @Test
  func loadFetchesMembersAndWarnings() async {
    let existing = team(
      id: "t1",
      name: "Loaded",
      members: [member(species: "garchomp", moves: ["earthquake"])]
    )
    let fake = FakeTeamService(seed: [existing])
    fake.nextWarnings = [
      TeamWarning(code: .incomplete, message: "2 of 6 Pokémon.", slot: nil, field: nil)
    ]
    let vm = TeamEditorViewModel(teamService: fake, summary: TeamSummary(team: existing))

    await vm.load()

    #expect(vm.teamId == "t1")
    #expect(vm.members.count == 1)
    #expect(vm.members[0].species == "garchomp")
    #expect(vm.warnings.count == 1)
    #expect(vm.teamLevelWarnings.count == 1)
  }

  // MARK: Member add / remove

  @Test
  func addMemberRespectsSixCap() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .scarletViolet)
    // Starts with one seeded slot; add until full, then it must no-op.
    for _ in 0..<10 { vm.addMember() }

    #expect(vm.members.count == 6)
    #expect(vm.canAddMember == false)
  }

  @Test
  func removeMemberDropsSlot() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .scarletViolet)
    vm.addMember()
    vm.members[0].species = "first"
    vm.members[1].species = "second"

    vm.removeMember(at: 0)

    #expect(vm.members.count == 1)
    #expect(vm.members[0].species == "second")
  }

  @Test
  func moveMemberInsertsAtDestinationAndPreservesIdentity() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)
    vm.addMember()
    vm.addMember()
    vm.addMember()
    vm.members[0].species = "a"
    vm.members[1].species = "b"
    vm.members[2].species = "c"
    vm.members[3].species = "d"
    let idA = vm.members[0].id

    vm.moveMember(from: 0, to: 3)

    #expect(vm.members.map(\.species) == ["b", "c", "d", "a"])
    #expect(vm.members[3].id == idA)
  }

  @Test
  func moveMemberShiftsForwardTowardTheFront() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)
    vm.addMember()
    vm.addMember()
    vm.addMember()
    vm.members[0].species = "a"
    vm.members[1].species = "b"
    vm.members[2].species = "c"
    vm.members[3].species = "d"
    let idD = vm.members[3].id

    vm.moveMember(from: 3, to: 0)

    #expect(vm.members.map(\.species) == ["d", "a", "b", "c"])
    #expect(vm.members[0].id == idD)
  }

  @Test
  func moveMemberNoopsWhenReadOnlyOrOutOfBounds() {
    let existing = team(
      id: "t1",
      format: .scarletViolet,
      members: [member(species: "a"), member(species: "b")]
    )
    let archived = TeamEditorViewModel(teamService: FakeTeamService(), team: existing)
    #expect(archived.isReadOnly)
    archived.moveMember(from: 0, to: 1)
    #expect(archived.members.map(\.species) == ["a", "b"])

    let living = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)
    living.members[0].species = "only"
    living.moveMember(from: 0, to: 5)
    living.moveMember(from: 0, to: 0)
    #expect(living.members.map(\.species) == ["only"])
  }

  // MARK: Editable ↔ wire conversion

  @Test
  func conversionDropsBlanksAndCompactsMoves() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .scarletViolet)
    vm.members[0].species = "   "  // blank → nil
    vm.members[0].moves = ["earthquake", "", "  ", "dragon-claw"]

    _ = await vm.save()

    let saved = fake.lastCreateMembers?.first
    #expect(saved?.species == nil)
    #expect(saved?.moves == ["earthquake", "dragon-claw"])
  }

  // MARK: Export

  @Test
  func exportRequiresSavedTeam() async {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .scarletViolet)

    let paste = await vm.exportPaste()

    #expect(paste == nil)
    #expect(vm.errorMessage != nil)
  }

  @Test
  func exportReturnsPasteForSavedTeam() async {
    let existing = team(id: "t1", members: [member(species: "garchomp", moves: ["earthquake"])])
    let fake = FakeTeamService(seed: [existing])
    let vm = TeamEditorViewModel(teamService: fake, team: existing)

    let paste = await vm.exportPaste()

    #expect(paste != nil)
    #expect(fake.exportCount == 1)
    #expect(fake.lastExportId == "t1")
  }

  // MARK: Team analysis (draft coverage — debounced, generation-guarded, #9)

  /// A decoded `ok` analysis carrying a distinguishing `note`, so two results compare unequal.
  private func analysisOk(note: String, format: Format = .scarletViolet) -> TeamAnalysis {
    let json = """
      {"status":"ok","format":"\(format.rawValue)","members":[],"defense":[],\
      "offense":{"covered":[],"uncovered":[]},"speed_tiers":[],"notes":["\(note)"]}
      """
    return try! JSONDecoder().decode(TeamAnalysis.self, from: Data(json.utf8))
  }

  /// Spins the cooperative executor until `condition` holds (or a generous bound), so a test can
  /// wait on the fake's gated analyze parking without a real sleep.
  private func settle(until condition: @escaping () -> Bool, maxYields: Int = 5000) async {
    var yields = 0
    while !condition(), yields < maxYields {
      await Task.yield()
      yields += 1
    }
  }

  /// A burst of rapid schedules coalesces into ONE analyze call, carrying the latest draft.
  @Test
  func analysisDebounceCoalescesRapidSchedules() async {
    let fake = FakeTeamService()
    let expected = analysisOk(note: "coalesced", format: .champions)
    fake.analyzeResult = expected
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    vm.analysisDebounce = .zero

    vm.members[0].species = "a"
    vm.scheduleAnalysis()
    vm.members[0].species = "b"
    vm.scheduleAnalysis()
    vm.members[0].species = "garchomp"
    vm.scheduleAnalysis()
    await vm.awaitAnalysis()

    #expect(fake.analyzeCalls == 1)
    #expect(fake.lastAnalyzeFormat == .champions)
    #expect(fake.lastAnalyzeMembers?.first?.species == "garchomp")
    #expect(vm.analysis == expected)
  }

  /// An all-empty draft makes NO request and clears the result.
  @Test
  func analysisEmptyDraftMakesNoCall() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .scarletViolet)
    vm.analysisDebounce = .zero
    // The seeded slot has a blank species.

    vm.scheduleAnalysis()
    await vm.awaitAnalysis()

    #expect(fake.analyzeCalls == 0)
    #expect(vm.analysis == nil)
    #expect(vm.isAnalyzing == false)
  }

  /// A failed analysis retains the last good result and surfaces an error for Retry.
  @Test
  func analysisErrorRetainsPreviousResult() async {
    let fake = FakeTeamService()
    let good = analysisOk(note: "good")
    fake.analyzeResult = good
    let vm = TeamEditorViewModel(teamService: fake, format: .scarletViolet)
    vm.analysisDebounce = .zero
    vm.members[0].species = "garchomp"
    vm.scheduleAnalysis()
    await vm.awaitAnalysis()
    #expect(vm.analysis == good)
    #expect(vm.analysisError == nil)

    fake.analyzeError = .transport(underlying: "URLError.-1009")
    vm.members[0].species = "landorus"
    vm.scheduleAnalysis()
    await vm.awaitAnalysis()

    #expect(vm.analysis == good)  // last good result retained
    #expect(vm.analysisError == TeamEditorViewModel.connectionMessage)
  }

  /// A superseded (stale) in-flight analysis is discarded — the latest schedule wins.
  @Test
  func analysisStaleResultIsDiscarded() async {
    let fake = FakeTeamService()
    fake.holdsAnalyze = true
    let first = analysisOk(note: "first")
    let second = analysisOk(note: "second")
    // Result is keyed to the request so it's stable no matter which parked call resumes first:
    // the gen-1 call carries "garchomp", the gen-2 call carries "landorus".
    fake.analyzeHandler = { _, members in
      members.first?.species == "landorus" ? second : first
    }
    let vm = TeamEditorViewModel(teamService: fake, format: .scarletViolet)
    vm.analysisDebounce = .zero

    vm.members[0].species = "garchomp"
    vm.scheduleAnalysis()  // gen 1 — parks in analyze
    await settle(until: { fake.pendingAnalyzeCount == 1 })

    vm.members[0].species = "landorus"
    vm.scheduleAnalysis()  // gen 2 — supersedes gen 1
    await settle(until: { fake.pendingAnalyzeCount == 2 })

    fake.releaseAnalyze()  // both complete; the stale gen-1 result must not win
    await vm.awaitAnalysis()

    #expect(fake.analyzeCalls == 2)
    #expect(vm.analysis == second)
  }

  // MARK: Champions-first editor (CF-TEAM-AC-1.2, CF-UI-US-4, ADR-7)

  @Test
  func livingEditorHidesTeraIVsAndLevelAndShowsStatPoints() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)

    #expect(vm.format == .champions)
    #expect(vm.isReadOnly == false)
    #expect(vm.showsTeraField == false)
    #expect(vm.showsIVKnobs == false)
    #expect(vm.showsLevelKnob == false)
    #expect(vm.showsStatPoints)
    #expect(vm.statPointBudget == 66)
    #expect(vm.statPointStatCap == 32)
    vm.members[0].evs = EditableStatSpread(hp: 4, atk: 30, def: 0, spa: 0, spd: 0, spe: 32)
    #expect(vm.members[0].evs.total == 66)
  }

  @Test
  func leftoverFormatArgumentStillOpensAChampionsEditor() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .gen7)
    #expect(vm.format == .champions)
    #expect(vm.showsTeraField == false)
  }

  @Test
  func saveStripsTeraForcesLevel50AndKeepsStatPointsInEVs() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions, name: "Rain")
    vm.members[0].species = "garchomp"
    vm.members[0].teraType = "steel"
    vm.members[0].level = 100
    vm.members[0].ivs = EditableStatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0)
    vm.members[0].evs = EditableStatSpread(hp: 4, atk: 30, def: 0, spa: 0, spd: 0, spe: 32)

    let saved = await vm.save()

    #expect(saved != nil)
    #expect(fake.lastCreateFormat == .champions)
    #expect(fake.lastCreateMembers?.first?.teraType == nil)
    #expect(fake.lastCreateMembers?.first?.level == 50)
    #expect(fake.lastCreateMembers?.first?.evs.spe == 32)
    #expect(fake.lastCreateMembers?.first?.ivs.hp == 31)
  }

  @Test
  func archivedEditorIsReadOnly() {
    let archived = team(id: "g7", name: "Alola rain", format: .gen7, members: [
      member(species: "tapu-koko", moves: ["thunderbolt"]),
    ])
    let vm = TeamEditorViewModel(teamService: FakeTeamService(seed: [archived]), team: archived)

    #expect(vm.isReadOnly)
    #expect(vm.format == .gen7)
    #expect(vm.canSave == false)
  }

  // MARK: Autosave

  @Test
  func autosaveDebounceCoalescesRapidEditsIntoOneCreate() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    vm.saveDebounce = .milliseconds(50)

    vm.members[0].species = "a"
    vm.scheduleSave()
    vm.members[0].species = "b"
    vm.scheduleSave()
    vm.members[0].species = "garchomp"
    vm.scheduleSave()
    await vm.awaitSave()

    #expect(fake.createCount == 1)
    #expect(fake.updateCount == 0)
    #expect(fake.lastCreateMembers?.first?.species == "garchomp")
    #expect(vm.teamId != nil)
  }

  @Test
  func autosaveCreateThenUpdate() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions, name: "Core")
    vm.members[0].species = "garchomp"
    await vm.flushSave()

    #expect(fake.createCount == 1)
    #expect(fake.updateCount == 0)

    vm.name = "Ladder Core"
    await vm.flushSave()

    #expect(fake.createCount == 1)
    #expect(fake.updateCount == 1)
    #expect(fake.lastUpdateName == "Ladder Core")
  }

  @Test
  func autosaveDoesNotIssueASecondCreateWhileTheFirstIsInFlight() async {
    let fake = FakeTeamService()
    fake.holdsCreate = true
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    vm.saveDebounce = .zero

    vm.members[0].species = "a"
    vm.scheduleSave()
    await settle(until: { fake.createCount == 1 && fake.pendingCreateCount == 1 })

    vm.members[0].species = "garchomp"
    vm.scheduleSave()
    #expect(fake.createCount == 1)
    #expect(fake.updateCount == 0)

    fake.releaseCreate()
    await vm.awaitSave()

    #expect(fake.createCount == 1)
    #expect(fake.updateCount == 1)
    #expect(fake.lastUpdateMembers?.first?.species == "garchomp")
  }

  @Test
  func autosavePreservesMemberIdentity() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    let id = vm.members[0].id
    vm.members[0].species = "garchomp"
    await vm.flushSave()

    #expect(vm.members[0].id == id)
    #expect(vm.members[0].species == "garchomp")
  }

  @Test
  func flushSaveOfAnUnchangedNewTeamDoesNotCreate() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    await vm.flushSave()

    #expect(fake.createCount == 0)
    #expect(vm.teamId == nil)
  }

  @Test
  func flushSaveOfAnUnchangedExistingTeamDoesNotUpdate() async {
    let existing = team(id: "t1", name: "Old", members: [member(species: "garchomp")])
    let fake = FakeTeamService(seed: [existing])
    let vm = TeamEditorViewModel(teamService: fake, team: existing)
    await vm.flushSave()

    #expect(fake.updateCount == 0)
    #expect(fake.createCount == 0)
  }

  @Test
  func archivedEditorNeverAutosaves() async {
    let archived = team(id: "g7", format: .gen7, members: [member(species: "tapu-koko")])
    let fake = FakeTeamService(seed: [archived])
    let vm = TeamEditorViewModel(teamService: fake, team: archived)
    vm.members[0].species = "pikachu"
    vm.scheduleSave()
    await vm.flushSave()

    #expect(fake.createCount == 0)
    #expect(fake.updateCount == 0)
  }

  @Test
  func flushSaveWritesWithoutWaitingForTheDebounce() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    vm.saveDebounce = .seconds(30)
    vm.members[0].species = "garchomp"
    vm.scheduleSave()
    await vm.flushSave()

    #expect(fake.createCount == 1)
  }

  @Test
  func exportFlushesADirtyNewTeamThenExports() async {
    let fake = FakeTeamService()
    let vm = TeamEditorViewModel(teamService: fake, format: .champions)
    vm.members[0].species = "garchomp"

    let paste = await vm.exportPaste()

    #expect(paste != nil)
    #expect(fake.createCount == 1)
    #expect(fake.exportCount == 1)
    #expect(fake.lastExportId == vm.teamId)
  }
}
