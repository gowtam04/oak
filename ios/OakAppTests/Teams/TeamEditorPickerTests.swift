import Foundation
import Testing

@testable import OakApp

/// `TeamEditorViewModel` against `FakeDexLookupService` (Phase 4 — team editor entity
/// pickers): typeahead search proxying, batch sprite resolution, per-species learnset
/// fetch, ability/move picker option derivation, and the Mega required-item auto-force.
/// `@MainActor`.
@MainActor
struct TeamEditorPickerTests {

  private func swampertMegaRef(requiredItem: String? = "swampertite") -> DexSpriteRef {
    DexSpriteRef(
      displayName: "Swampert (Mega)",
      spriteUrl: "https://example.com/swampert-mega.png",
      dexNumber: 260,
      types: ["water", "ground"],
      requiredItem: requiredItem,
      abilities: ["swift-swim"],
      baseStats: BaseStats(hp: 100, atk: 150, def: 110, spa: 95, spd: 110, spe: 70)
    )
  }

  // MARK: Search

  @Test
  func searchEntitiesProxiesToDexLookupAndMapsResults() async {
    let dex = FakeDexLookupService()
    dex.searchResults["pokemon:swam"] = [
      SearchMatch(slug: "swampert", displayName: "Swampert", kind: .pokemon),
      SearchMatch(slug: "swampert-mega", displayName: "Swampert (Mega)", kind: .pokemon),
    ]
    let vm = TeamEditorViewModel(
      teamService: FakeTeamService(), dexLookup: dex, format: .champions
    )

    let options = await vm.searchEntities(kind: .pokemon, query: "swam")

    #expect(options.map(\.slug) == ["swampert", "swampert-mega"])
    #expect(options.map(\.displayName) == ["Swampert", "Swampert (Mega)"])
    #expect(dex.searchCalls.count == 1)
    #expect(dex.searchCalls.first?.kind == .pokemon)
    #expect(dex.searchCalls.first?.query == "swam")
    #expect(dex.searchCalls.first?.format == .champions)
  }

  // MARK: Sprites

  @Test
  func refreshSpritesSkipsTheNetworkWhenNoSpeciesAreFilled() async {
    let dex = FakeDexLookupService()
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)

    await vm.refreshSprites()

    #expect(dex.spriteCalls.isEmpty)
    #expect(vm.spriteRefsBySpecies.isEmpty)
  }

  @Test
  func refreshSpritesPopulatesRefsForEveryFilledSlot() async {
    let dex = FakeDexLookupService()
    dex.spriteResults["swampert-mega"] = ["swampert-mega": swampertMegaRef()]
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)
    vm.members[0].species = "swampert-mega"

    await vm.refreshSprites()

    #expect(vm.spriteRef(for: "swampert-mega")?.displayName == "Swampert (Mega)")
    #expect(dex.spriteCalls.first?.names == ["swampert-mega"])
  }

  @Test
  func spriteRefForUnresolvedOrEmptySpeciesIsNil() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)

    #expect(vm.spriteRef(for: "") == nil)
    #expect(vm.spriteRef(for: "unresolved-species") == nil)
  }

  // MARK: Mega required-item auto-force

  @Test
  func refreshSpritesForcesAMegasRequiredItemOntoTheHeldItem() async {
    let dex = FakeDexLookupService()
    dex.spriteResults["swampert-mega"] = ["swampert-mega": swampertMegaRef(requiredItem: "swampertite")]
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)
    vm.members[0].species = "swampert-mega"
    vm.members[0].item = "leftovers"  // wrong item pre-resolution

    await vm.refreshSprites()

    #expect(vm.members[0].item == "swampertite")
  }

  @Test
  func refreshSpritesLeavesItemAloneWhenSpeciesHasNoRequiredItem() async {
    let dex = FakeDexLookupService()
    dex.spriteResults["garchomp"] = [
      "garchomp": DexSpriteRef(
        displayName: "Garchomp",
        spriteUrl: "https://example.com/garchomp.png",
        dexNumber: 445,
        types: ["dragon", "ground"],
        requiredItem: nil,
        abilities: ["sand-veil", "rough-skin"],
        baseStats: BaseStats(hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102)
      )
    ]
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)
    vm.members[0].species = "garchomp"
    vm.members[0].item = "leftovers"

    await vm.refreshSprites()

    #expect(vm.members[0].item == "leftovers")
  }

  // MARK: Ability options (derived from the resolved sprite ref)

  @Test
  func abilityOptionsAreEmptyBeforeResolutionAndPopulatedAfter() async {
    let dex = FakeDexLookupService()
    dex.spriteResults["swampert-mega"] = ["swampert-mega": swampertMegaRef()]
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)
    vm.members[0].species = "swampert-mega"

    #expect(vm.abilityOptions(for: "swampert-mega").isEmpty)

    await vm.refreshSprites()

    let options = vm.abilityOptions(for: "swampert-mega")
    #expect(options.map(\.slug) == ["swift-swim"])
    #expect(options.map(\.displayName) == ["Swift Swim"])
  }

  // MARK: Learnset / movepool

  @Test
  func refreshMovepoolPopulatesTheMemberKeyedCacheSortedByName() async {
    let dex = FakeDexLookupService()
    dex.learnsetResults["swampert-mega"] = [
      LearnsetMove(slug: "earthquake", displayName: "Earthquake", type: "ground", damageClass: .physical, power: 100),
      LearnsetMove(slug: "protect", displayName: "Protect", type: "normal", damageClass: .status, power: nil),
    ]
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)
    vm.members[0].species = "swampert-mega"

    await vm.refreshMovepool(for: vm.members[0].id)

    let options = vm.movepoolOptions(for: vm.members[0].id)
    #expect(options.map(\.slug) == ["earthquake", "protect"])  // alphabetical by display name
    #expect(options.first?.hint == "Ground · Physical · 100 power")
    #expect(options.last?.hint == "Normal · Status")
    #expect(dex.learnsetCalls.first?.pokemon == "swampert-mega")
    #expect(dex.learnsetCalls.first?.format == .champions)
  }

  @Test
  func refreshMovepoolClearsTheCacheForAnEmptySpecies() async {
    let dex = FakeDexLookupService()
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)

    await vm.refreshMovepool(for: vm.members[0].id)

    #expect(vm.movepoolOptions(for: vm.members[0].id).isEmpty)
    #expect(dex.learnsetCalls.isEmpty)  // never fetched for an unset species
  }

  @Test
  func refreshAllMovepoolsFetchesEveryFilledSlotOnly() async {
    let dex = FakeDexLookupService()
    dex.learnsetResults["garchomp"] = [
      LearnsetMove(slug: "earthquake", displayName: "Earthquake", type: "ground", damageClass: .physical, power: 100)
    ]
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), dexLookup: dex, format: .champions)
    vm.members[0].species = "garchomp"
    vm.addMember()  // second slot stays empty

    await vm.refreshAllMovepools()

    #expect(dex.learnsetCalls.count == 1)
    #expect(vm.movepoolOptions(for: vm.members[0].id).map(\.slug) == ["earthquake"])
    #expect(vm.movepoolOptions(for: vm.members[1].id).isEmpty)
  }
}
