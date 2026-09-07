import Foundation
import Testing

@testable import OakApp

/// `ArtifactViewModel` against `FakeArtifactService` (artifact-viewer.md M-ART-US-1/2/3,
/// M-BR-ART-1/4/5). Covers the browser-like back stack (push / back / dismiss), the
/// one-artifact-at-a-time rule, the nil-graceful entity fetch (a `not_found` / `unavailable` /
/// transport result must never break the sheet), and that a **proposed-team** artifact renders
/// from inline data with NO service fetch (M-AC-A4.1).
///
/// The view model is `@MainActor`, so the suite is too.
@MainActor
struct ArtifactViewModelTests {

  // MARK: Helpers

  private func makeVM(
    entityResult: EntityArtifact? = nil,
    savedTeamResult: (team: Team, validation: TeamValidationResult)? = nil,
    format: Format = .champions,
    signedIn: Bool = true,
    pins: FakeArtifactPinService = FakeArtifactPinService()
  ) -> (ArtifactViewModel, FakeArtifactService) {
    let service = FakeArtifactService(entityResult: entityResult, savedTeamResult: savedTeamResult)
    let vm = ArtifactViewModel(
      service: service,
      format: format,
      isSignedIn: signedIn,
      pins: pins
    )
    return (vm, service)
  }

  private func member(species: String?, moves: [String] = []) -> TeamMember {
    TeamMember(
      species: species, ability: nil, item: nil, moves: moves, nature: nil,
      evs: StatSpread(hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0),
      ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
      teraType: nil, level: 50, nickname: nil, gender: nil, shiny: nil
    )
  }

  private func entityOk(_ artifact: Artifact?) -> EntityArtifactOk? {
    guard case .entity(let ok)? = artifact?.content else { return nil }
    return ok
  }

  private func teamArtifact(_ artifact: Artifact?) -> TeamArtifact? {
    guard case .team(let team)? = artifact?.content else { return nil }
    return team
  }

  private func isEntityUnavailable(_ artifact: Artifact?) -> Bool {
    guard case .unavailable? = artifact?.content else { return false }
    return true
  }

  private func unavailableSuggestions(_ artifact: Artifact?) -> [String]? {
    guard case .unavailable(_, _, let suggestions)? = artifact?.content else { return nil }
    return suggestions
  }

  private func isTeamUnavailable(_ artifact: Artifact?) -> Bool {
    guard case .teamUnavailable? = artifact?.content else { return false }
    return true
  }

  private func comparisonSubjects(_ artifact: Artifact?) -> [Subject]? {
    guard case .comparison(let subjects)? = artifact?.content else { return nil }
    return subjects
  }

  private func damageCalc(_ artifact: Artifact?) -> DamageCalc? {
    guard case .damageCalc(let calc)? = artifact?.content else { return nil }
    return calc
  }

  private func subject(_ name: String) -> Subject {
    Subject(name: name, dexNumber: nil, spriteUrl: "", types: ["dragon"], isFallback: false, sourceGeneration: nil)
  }

  // MARK: Entity push

  @Test
  func openEntityFetchesAndShowsProfile() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, service) = makeVM(entityResult: ok, format: .scarletViolet)

    await vm.openEntity(kind: .pokemon, query: "Garchomp")

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(vm.canGoBack == false)
    #expect(entityOk(vm.current)?.resolved.displayName == "Garchomp")
    #expect(vm.current?.title == "Garchomp")
    // Champions-first: leftover format arguments still fetch Champions.
    #expect(service.entityCallCount == 1)
    #expect(service.lastEntityKind == .pokemon)
    #expect(service.lastEntityQuery == "Garchomp")
    #expect(service.lastEntityFormat == .champions)
  }

  @Test
  func openEntityPassesTheQueryVerbatim() async throws {
    // Names with a period + space (e.g. "Mr. Mime") must reach the service untouched —
    // no slugifying, trimming, or case-folding — with the viewer's fixed format.
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, service) = makeVM(entityResult: ok, format: .scarletViolet)

    await vm.openEntity(kind: .pokemon, query: "Mr. Mime")

    #expect(service.lastEntityQuery == "Mr. Mime")
    #expect(service.lastEntityKind == .pokemon)
    #expect(service.lastEntityFormat == .champions)
  }

  @Test
  func entityFetchUsesTheActiveFormat() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_move.json")
    let (vm, service) = makeVM(entityResult: ok, format: .champions)

    await vm.openEntity(kind: .move, query: "earthquake")

    #expect(service.lastEntityFormat == .champions)
  }

  // MARK: Back stack (one at a time, push / back / dismiss)

  @Test
  func backReturnsToThePreviousArtifact() async throws {
    let first = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let second = try Fixtures.decode(EntityArtifact.self, from: "entity_move.json")
    let (vm, service) = makeVM(entityResult: first)

    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    let firstId = vm.current?.id
    service.entityResult = second
    await vm.openEntity(kind: .move, query: "dragon-claw")

    // Two on the stack, but only one visible — the top (M-BR-ART-1).
    #expect(vm.stack.count == 2)
    #expect(vm.canGoBack)
    #expect(vm.current?.id != firstId)

    vm.back()

    #expect(vm.stack.count == 1)
    #expect(vm.canGoBack == false)
    #expect(vm.current?.id == firstId)
    #expect(entityOk(vm.current)?.resolved.displayName == "Garchomp")
  }

  @Test
  func oneArtifactIsVisibleAtATime() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, _) = makeVM(entityResult: ok)

    await vm.openEntity(kind: .pokemon, query: "A")
    let firstId = vm.current?.id
    await vm.openEntity(kind: .pokemon, query: "B")

    // `current` is always the single top of the stack.
    #expect(vm.stack.count == 2)
    #expect(vm.current?.id == vm.stack.last?.id)
    #expect(vm.current?.id != firstId)
  }

  @Test
  func dismissClearsTheStack() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, _) = makeVM(entityResult: ok)

    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    vm.dismiss()

    #expect(vm.stack.isEmpty)
    #expect(vm.isPresented == false)
    #expect(vm.current == nil)
  }

  @Test
  func backFromTheRootDismissesTheSheet() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, _) = makeVM(entityResult: ok)

    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    vm.back()

    #expect(vm.stack.isEmpty)
    #expect(vm.isPresented == false)
  }

  // MARK: nil-graceful entity fetch (the sheet must never break — M-BR-ART-5)

  @Test
  func entityTransportFaultResolvesToUnavailableNotABreak() async {
    // `nil` models a transport/HTTP fault — the sheet stays open on an honest miss.
    let (vm, _) = makeVM(entityResult: nil)

    await vm.openEntity(kind: .ability, query: "rough-skin")

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(isEntityUnavailable(vm.current))
    #expect(vm.current?.title == "rough-skin")
  }

  @Test
  func entityNotFoundResolvesToUnavailableNotABreak() async throws {
    let miss = try Fixtures.decode(EntityArtifact.self, from: "entity_not_found.json")
    let (vm, _) = makeVM(entityResult: miss)

    await vm.openEntity(kind: .pokemon, query: "garchom")

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(isEntityUnavailable(vm.current))
    // The server's populated close-name suggestions ride through for the tappable retries (#2).
    #expect(unavailableSuggestions(vm.current) == ["Garchomp"])
  }

  @Test
  func entityUnavailableResolvesToUnavailableNotABreak() async throws {
    let unavailable = try Fixtures.decode(EntityArtifact.self, from: "entity_unavailable.json")
    let (vm, _) = makeVM(entityResult: unavailable)

    await vm.openEntity(kind: .move, query: "splash")

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(isEntityUnavailable(vm.current))
  }

  // MARK: Team artifacts (proposed = inline/no fetch; saved = fetched)

  @Test
  func proposedTeamUsesInlineDataWithNoFetch() async {
    let (vm, service) = makeVM()
    let members = [member(species: "great-tusk", moves: ["earthquake"]), member(species: nil)]
    let proposed = ProposedTeam(name: "Sun Offense", format: .scarletViolet, members: members)
    let warnings = [TeamWarning(code: .incomplete, message: "1 of 6.", slot: nil, field: nil)]

    vm.openProposedTeam(proposed, warnings: warnings)

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    let team = teamArtifact(vm.current)
    #expect(team?.name == "Sun Offense")
    #expect(team?.members == members)
    #expect(team?.warnings == warnings)
    #expect(team?.savedId == nil)  // ephemeral proposed team
    // Inline data: NO service round-trip (M-AC-A4.1).
    #expect(service.entityCallCount == 0)
    #expect(service.savedTeamCallCount == 0)
  }

  @Test
  func savedTeamFetchesThroughTheService() async {
    let team = Team(
      id: "t1", name: "Saved Squad", format: .champions,
      members: [member(species: "miraidon")], createdAt: 1, updatedAt: 2
    )
    let validation = TeamValidationResult(warnings: [])
    let (vm, service) = makeVM(savedTeamResult: (team, validation))

    await vm.openSavedTeam(id: "t1", name: "Saved Squad")

    #expect(vm.stack.count == 1)
    #expect(service.savedTeamCallCount == 1)
    #expect(service.lastSavedTeamId == "t1")
    let artifact = teamArtifact(vm.current)
    #expect(artifact?.savedId == "t1")
    #expect(artifact?.members == team.members)
  }

  @Test
  func savedTeamFetchFailureResolvesToUnavailable() async {
    let (vm, service) = makeVM(savedTeamResult: nil)

    await vm.openSavedTeam(id: "gone", name: "Ghost Team")

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(isTeamUnavailable(vm.current))
    #expect(service.savedTeamCallCount == 1)
  }

  // MARK: Structured artifacts (comparison / damage-calc — inline, no fetch)

  @Test
  func openComparisonUsesInlineSubjectsWithNoFetch() {
    let (vm, service) = makeVM()
    let subjects = [subject("Garchomp"), subject("Dragapult")]

    vm.openComparison(subjects)

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(vm.current?.title == "Comparison")
    #expect(comparisonSubjects(vm.current) == subjects)
    // Inline data → NO service round-trip.
    #expect(service.entityCallCount == 0)
    #expect(service.savedTeamCallCount == 0)
  }

  @Test
  func openDamageCalcUsesInlinePayloadWithNoFetch() {
    let (vm, service) = makeVM()
    let calc = DamageCalc(
      assumptions: ["level": .int(50)],
      result: ["min_damage": .int(120), "max_damage": .int(142)],
      isEstimate: true,
      breakdown: nil
    )

    vm.openDamageCalc(calc)

    #expect(vm.stack.count == 1)
    #expect(vm.isPresented)
    #expect(vm.current?.title == "Damage calculation")
    #expect(damageCalc(vm.current) == calc)
    #expect(service.entityCallCount == 0)
  }

  @Test
  func structuredArtifactsPushOntoTheBackStack() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, _) = makeVM(entityResult: ok)

    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    vm.openComparison([subject("Garchomp"), subject("Dragapult")])

    #expect(vm.stack.count == 2)
    #expect(vm.canGoBack)
    #expect(comparisonSubjects(vm.current) != nil)

    vm.back()
    #expect(vm.stack.count == 1)
    #expect(entityOk(vm.current)?.resolved.displayName == "Garchomp")
  }

  // MARK: Open in Dex (DEX-US-1 / DEX-US-2) — four kinds, not type

  @Test
  func openInDexOnPokemonWritesTheArtifactFormatThenHops() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, _) = makeVM(entityResult: ok, format: .gen5)

    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    let hop = vm.openInDex()

    #expect(vm.canOpenInDex)
    #expect(hop?.kind == .pokemon)
    #expect(hop?.query == "Garchomp")
    #expect(hop?.format == .champions)
  }

  @Test
  func openInDexIsOfferedForMoveAbilityAndItem() async throws {
    for (kind, fixture) in [
      (EntityKind.move, "entity_move.json"),
      (.ability, "entity_ability.json"),
      (.item, "entity_item.json"),
    ] {
      let ok = try Fixtures.decode(EntityArtifact.self, from: fixture)
      let (vm, _) = makeVM(entityResult: ok, format: .champions)
      await vm.openEntity(kind: kind, query: "query")
      #expect(vm.canOpenInDex, "\(kind) should offer Open in Dex")
      #expect(vm.openInDex()?.format == .champions)
    }
  }

  @Test
  func openInDexIsNotOfferedOnATypeArtifact() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_type.json")
    let (vm, _) = makeVM(entityResult: ok)

    await vm.openEntity(kind: .type, query: "dragon")

    #expect(vm.canOpenInDex == false)
    #expect(vm.openInDex() == nil)
  }

  @Test
  func openInDexIsDisabledWhenTheArtifactFailedToLoad() async {
    let (vm, _) = makeVM(entityResult: nil)
    await vm.openEntity(kind: .pokemon, query: "garchom")

    #expect(vm.canOpenInDex == false)
    #expect(vm.openInDex() == nil)
  }

  // MARK: Compare with… (CMP-US-1 / CMP-BR-4)

  @Test
  func compareWithPushesATwoColumnComparisonAndDoesNotSendATurn() async throws {
    let first = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, service) = makeVM(entityResult: first)
    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    let before = service.entityCallCount

    await vm.compareWith(species: "Dragapult", format: .gen7)

    #expect(vm.canGoBack)
    #expect(comparisonSubjects(vm.current)?.count == 2)
    #expect(comparisonSubjects(vm.current)?.map(\.name).contains("Dragapult") == true)
    #expect(service.entityCallCount > before)
    #expect(service.lastEntityFormat == .champions)
  }

  @Test
  func unresolvedCompareSubjectLeavesTheCurrentArtifact() async throws {
    let first = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, service) = makeVM(entityResult: first)
    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    service.entityResult = nil

    await vm.compareWith(species: "not-a-species", format: nil)

    #expect(entityOk(vm.current)?.resolved.displayName == "Garchomp")
    #expect(comparisonSubjects(vm.current) == nil)
    #expect(vm.compareErrorMessage != nil)
  }

  // MARK: Pin — rich artifacts only (PIN-AC-1.1 / PIN-AC-1.2 / AUTH-BR-1)

  @Test
  func pinIsOfferedOnTeamComparisonAndCalcWhenSignedIn() {
    let (vm, _) = makeVM(signedIn: true)

    vm.openComparison([subject("Garchomp"), subject("Dragapult")])
    #expect(vm.canPin)

    vm.dismiss()
    vm.openDamageCalc(
      DamageCalc(assumptions: [:], result: [:], isEstimate: true, breakdown: nil)
    )
    #expect(vm.canPin)

    vm.dismiss()
    vm.openProposedTeam(
      ProposedTeam(name: "Sun", format: .scarletViolet, members: [member(species: "garchomp")]),
      warnings: []
    )
    #expect(vm.canPin)
  }

  @Test
  func pinIsNotOfferedOnEntityArtifacts() async throws {
    let ok = try Fixtures.decode(EntityArtifact.self, from: "entity_pokemon.json")
    let (vm, _) = makeVM(entityResult: ok, signedIn: true)
    await vm.openEntity(kind: .pokemon, query: "Garchomp")
    #expect(vm.canPin == false)

    let move = try Fixtures.decode(EntityArtifact.self, from: "entity_move.json")
    let (moveVM, _) = makeVM(entityResult: move, signedIn: true)
    await moveVM.openEntity(kind: .move, query: "earthquake")
    #expect(moveVM.canPin == false)
  }

  @Test
  func guestNeverSeesPinOnARichArtifact() {
    let (vm, _) = makeVM(signedIn: false)
    vm.openComparison([subject("Garchomp"), subject("Dragapult")])
    #expect(vm.canPin == false)
  }

  @Test
  func pinAtCapSurfacesAnExplanationAndLeavesTheStripUnchanged() async {
    let pins = FakeArtifactPinService(
      seed: (1...5).map {
        PinnedArtifactSummary(id: "p\($0)", kind: .calc, title: "c\($0)", createdAt: Int64($0))
      }
    )
    let (vm, _) = makeVM(signedIn: true, pins: pins)
    vm.openDamageCalc(
      DamageCalc(assumptions: [:], result: [:], isEstimate: true, breakdown: nil)
    )

    let result = await vm.pin()

    #expect(result == .failure(.pinCap(max: 5)))
    #expect(pins.store.count == 5)
    #expect(vm.pinErrorMessage != nil)
  }
}
