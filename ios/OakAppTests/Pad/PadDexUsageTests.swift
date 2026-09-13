import Foundation
import Testing

@testable import OakApp

/// Pins Pad Dex + Usage contracts for Phase 8 (index | profile, Usage section
/// on a Pokémon profile, ladder | species, Usage as a first-class destination).
///
/// `PadDexChrome` / `PadUsageChrome` are small pure helpers the Phase 8
/// implementer **must add** under `ios/OakApp/Pad/Dex/` and
/// `ios/OakApp/Pad/Usage/` (`PadDexSplit.swift` / `PadUsageSplit.swift` or
/// siblings). Missing type / method is the red compile.
///
/// Expected API:
/// ```
/// enum PadDexChrome {
///   /// Pokémon profiles include a Usage section (P-DEX-AC-2.1, P-WF-AC-4.1).
///   static func showsUsageSectionOnPokemonProfile() -> Bool // true
///   /// Usage-down fail-softs; Dex fields stay (P-DEX-AC-2.2).
///   static func hidesDexFieldsWhenUsageUnavailable() -> Bool // false
/// }
/// enum PadUsageChrome {
///   /// Usage stays a sidebar destination, not a Dex section
///   /// (P-DEX-AC-2.3, P-USE-US-1, ADR-6).
///   static func isFirstClassDestination() -> Bool // true
/// }
/// ```
///
/// Profile selection is stored on `PadDestination.dex(DexEntityRoute?)`.
/// Species drill-in is stored on `PadDestination.usage(slug:)`.
/// `PadShellModel.select` is the chrome write path.
///
/// Usage-on-profile and the Usage destination share `UsageService.species`
/// (`PokemonUsageModel` / `UsageViewModel`) — not a second payload
/// (P-REF-BR-2). Doubles default and fail-soft already live on those VMs.
///
/// Not encoded here:
///   P-DEX-AC-1.2 same Dex fields as iPhone — `EntityDetailView`
///   P-DEX-AC-1.3 / P-USE-AC-1.3 portrait collapse — UI in the split views
///   P-DEX-AC-1.4 empty search / index unavailable — `DexViewModelTests`
///   Dex section chips, debounce, Champions-only format — `DexViewModelTests`
///   P-USE-AC-1.2 species lists / Dex hops from share rows — `UsageDexLinkTests`
///   P-USE-AC-1.4 destination-level unavailable copy — `UsageViewModelTests`
///   Compare picker / add-to-team panels — later host wiring
///   Context-chip `apply(to:)` mapping — `PadContextChipTests`
///
/// Requirement refs: P-DEX-US-1, P-DEX-US-2, P-DEX-AC-1.1, P-DEX-AC-1.5,
/// P-DEX-AC-2.1–2.3, P-USE-US-1, P-USE-AC-1.1, P-USE-AC-1.5, P-REF-BR-1,
/// P-REF-BR-2, P-WF-AC-4.1.
@MainActor
struct PadDexUsageTests {

  private func makeShell() -> PadShellModel {
    PadShellModel()
  }

  private func garchompRoute() -> DexEntityRoute {
    DexEntityRoute(kind: .pokemon, query: "garchomp")
  }

  private func foundSpecies() -> UsageSpeciesResponse {
    UsageSpeciesResponse(
      available: true,
      found: true,
      slug: "garchomp",
      season: "Current",
      fetchedAt: 1_700_000_000_000,
      attribution: "championsbattledata.com",
      error: nil,
      savedName: "Garchomp",
      moves: [UsageEntry(name: "Earthquake", pct: 90.3, rank: 1)],
      items: [UsageEntry(name: "Life Orb", pct: 41.5, rank: 1)],
      abilities: [UsageEntry(name: "Rough Skin", pct: 100, rank: 1)],
      natures: [UsageEntry(name: "Jolly", pct: 73.4, rank: 1)],
      spreads: [UsageEntry(name: "32/0/0/0/2/32", pct: 31, rank: 1)],
      teammates: [UsageEntry(name: "Farigiraf", pct: 28.6, rank: 1)]
    )
  }

  // MARK: Usage section on a Pokémon profile (P-DEX-US-2, P-DEX-AC-2.1, P-WF-AC-4.1)

  @Test
  func pokemonProfileShowsAUsageSection() {
    #expect(PadDexChrome.showsUsageSectionOnPokemonProfile() == true)
  }

  @Test
  func selectingGarchompFillsTheDexProfileAndKeepsAUsageSection() {
    let route = garchompRoute()
    let shell = makeShell()
    shell.select(.dex(route))

    #expect(shell.destination == .dex(route))
    #expect(shell.destination.sidebarTab == .dex)
    #expect(PadDexChrome.showsUsageSectionOnPokemonProfile())
  }

  // MARK: Usage-unavailable fail-soft (P-DEX-AC-2.2)

  @Test
  func usageUnavailableDoesNotHideDexFields() {
    #expect(PadDexChrome.hidesDexFieldsWhenUsageUnavailable() == false)
  }

  @Test
  func usageUnavailableOnProfileLeavesTheDexRouteAndFieldsPolicy() async {
    let fake = FakeUsageService()
    fake.speciesError = .transport(underlying: "offline")
    let profileUsage = PokemonUsageModel(slug: "garchomp", usage: fake)
    let route = garchompRoute()
    let shell = makeShell()
    shell.select(.dex(route))

    await profileUsage.load()

    #expect(profileUsage.detail?.available == false)
    #expect(PadDexChrome.hidesDexFieldsWhenUsageUnavailable() == false)
    #expect(PadDexChrome.showsUsageSectionOnPokemonProfile())
    #expect(shell.destination == .dex(route))
  }

  // MARK: Usage stays a destination (P-DEX-AC-2.3, P-USE-US-1, ADR-6)

  @Test
  func usageIsAFirstClassDestinationNotADexSection() {
    #expect(PadUsageChrome.isFirstClassDestination() == true)
    #expect(OakAppTab.allCases.contains(.usage))
    #expect(OakAppTab.usage.padDestination == .usage())
    #expect(PadDestination.usage().sidebarTab == .usage)
    #expect(!DexSection.allCases.map(\.rawValue).contains("usage"))
    #expect(DexSection.allCases.map(\.rawValue) == ["pokemon", "move", "ability", "item"])
  }

  @Test
  func usageOnAPokemonProfileDoesNotRemoveTheUsageDestination() {
    #expect(PadDexChrome.showsUsageSectionOnPokemonProfile())
    #expect(PadUsageChrome.isFirstClassDestination())

    let shell = makeShell()
    shell.select(.dex(garchompRoute()))
    shell.select(.usage(slug: "garchomp"))

    #expect(shell.destination == .usage(slug: "garchomp"))
    #expect(shell.destination.sidebarTab == .usage)
    #expect(PadDestination.usage(slug: "garchomp") != .dex(garchompRoute()))
  }

  // MARK: Dex index | profile (P-DEX-US-1, P-DEX-AC-1.1)

  @Test
  func dexWithNoProfileSelectedRoundTrips() {
    let dest = PadDestination.dex()
    #expect(dest == .dex(nil))
    guard case .dex(let route) = dest else {
      Issue.record("expected .dex")
      return
    }
    #expect(route == nil)
  }

  @Test
  func dexPokemonRouteRoundTrips() {
    let route = garchompRoute()
    let dest = PadDestination.dex(route)
    #expect(dest == .dex(route))
    guard case .dex(let stored) = dest else {
      Issue.record("expected .dex")
      return
    }
    #expect(stored == route)
    #expect(stored?.kind == .pokemon)
    #expect(stored?.query == "garchomp")
  }

  @Test
  func everyDexSectionKindRoundTripsOnTheProfileDestination() {
    let kinds: [EntityKind] = [.pokemon, .move, .ability, .item]
    for kind in kinds {
      let route = DexEntityRoute(kind: kind, query: "example")
      let dest = PadDestination.dex(route)
      #expect(dest == .dex(route))
      guard case .dex(let stored) = dest else {
        Issue.record("expected .dex for \(kind)")
        continue
      }
      #expect(stored == route)
    }
  }

  @Test
  func selectingAnIndexRowStoresTheProfileOnTheDexDestination() {
    let route = garchompRoute()
    let shell = makeShell()
    shell.select(.dex())
    shell.select(.dex(route))
    #expect(shell.destination == .dex(route))
    #expect(shell.destination.sidebarTab == .dex)
  }

  @Test
  func selectingAnotherIndexRowReplacesTheProfileInPlace() {
    let garchomp = garchompRoute()
    let kingambit = DexEntityRoute(kind: .pokemon, query: "kingambit")
    let shell = makeShell()
    shell.select(.dex(garchomp))
    shell.select(.dex(kingambit))
    #expect(shell.destination == .dex(kingambit))
    #expect(shell.destination.sidebarTab == .dex)
  }

  @Test
  func differentDexProfilesAreNotEqual() {
    #expect(PadDestination.dex(garchompRoute()) != .dex())
    #expect(
      PadDestination.dex(garchompRoute())
        != .dex(DexEntityRoute(kind: .pokemon, query: "kingambit"))
    )
    #expect(
      PadDestination.dex(garchompRoute())
        != .dex(DexEntityRoute(kind: .move, query: "earthquake"))
    )
  }

  // MARK: Open in Dex (P-DEX-AC-1.5)

  @Test
  func openInDexSwitchesToThatProfileAndLeavesCompanionOpen() {
    let route = garchompRoute()
    let shell = makeShell()
    shell.select(.teams())
    shell.revealCompanion()
    shell.setContextChip(.team(id: "t1", name: "Rain", liveShowdown: ""))
    #expect(shell.companionOpen == true)

    shell.select(.dex(route))

    #expect(shell.destination == .dex(route))
    #expect(shell.companionOpen == true)
  }

  @Test
  func openInDexFromChatLeavesCompanionClosed() {
    let shell = makeShell()
    #expect(shell.companionOpen == false)
    shell.select(.dex(garchompRoute()))
    #expect(shell.destination == .dex(garchompRoute()))
    #expect(shell.companionOpen == false)
  }

  @Test
  func openInDexFromUsageKeepsTheDexProfileSelected() {
    let move = DexEntityRoute(kind: .move, query: "Earthquake")
    let shell = makeShell()
    shell.select(.usage(slug: "garchomp"))
    shell.select(.dex(move))
    #expect(shell.destination == .dex(move))
    #expect(shell.destination.sidebarTab == .dex)
  }

  // MARK: Usage ladder | species (P-USE-US-1, P-USE-AC-1.1, P-USE-AC-1.5)

  @Test
  func usageWithNoSpeciesSelectedRoundTrips() {
    let dest = PadDestination.usage()
    #expect(dest == .usage(slug: nil))
    guard case .usage(let slug) = dest else {
      Issue.record("expected .usage")
      return
    }
    #expect(slug == nil)
  }

  @Test
  func usageSpeciesSlugRoundTrips() {
    let dest = PadDestination.usage(slug: "garchomp")
    #expect(dest == .usage(slug: "garchomp"))
    guard case .usage(let slug) = dest else {
      Issue.record("expected .usage")
      return
    }
    #expect(slug == "garchomp")
  }

  @Test
  func selectingALadderRowFillsSpeciesDetailInPlace() {
    let shell = makeShell()
    shell.select(.usage())
    shell.select(.usage(slug: "garchomp"))
    #expect(shell.destination == .usage(slug: "garchomp"))
    #expect(shell.destination.sidebarTab == .usage)
  }

  @Test
  func deepLinkOpensUsageWithThatSpeciesSelected() {
    let shell = makeShell()
    shell.select(.usage(slug: "garchomp"))
    #expect(shell.destination == .usage(slug: "garchomp"))
    #expect(PadUsageChrome.isFirstClassDestination())
  }

  @Test
  func differentUsageSpeciesAreNotEqual() {
    #expect(PadDestination.usage(slug: "garchomp") != .usage())
    #expect(PadDestination.usage(slug: "garchomp") != .usage(slug: "kingambit"))
  }

  // MARK: Public (P-REF-BR-1)

  @Test
  func dexAndUsageArePublicForGuests() {
    let usage = UsageViewModel(usage: FakeUsageService(), isSignedIn: false)
    #expect(usage.requiresSignIn == false)
    #expect(usage.isSignedIn == false)

    let shell = makeShell()
    shell.select(.dex(garchompRoute()))
    #expect(shell.destination == .dex(garchompRoute()))
    shell.select(.usage(slug: "garchomp"))
    #expect(shell.destination == .usage(slug: "garchomp"))
  }

  @Test
  func signedInUsesTheSamePublicDexAndUsageDestinations() {
    let usage = UsageViewModel(usage: FakeUsageService(), isSignedIn: true)
    #expect(usage.requiresSignIn == false)

    let shell = makeShell()
    shell.select(.dex())
    #expect(shell.destination.sidebarTab == .dex)
    shell.select(.usage())
    #expect(shell.destination.sidebarTab == .usage)
  }

  // MARK: Same live usage payload (P-REF-BR-2, P-DEX-AC-2.1)

  @Test
  func profileUsageAndUsageDestinationReadTheSameSpeciesPayload() async {
    let fake = FakeUsageService()
    fake.nextSpecies = foundSpecies()

    let profile = PokemonUsageModel(slug: "garchomp", usage: fake)
    await profile.load()

    let destination = UsageViewModel(usage: fake, isSignedIn: false)
    await destination.openSpecies("garchomp")

    #expect(fake.speciesCount == 2)
    #expect(fake.lastSpeciesSlug == "garchomp")
    #expect(fake.lastSpeciesLadder == .doubles)
    #expect(profile.ladder == .doubles)
    #expect(destination.ladder == .doubles)
    #expect(profile.detail == destination.speciesDetail)
    #expect(profile.detail?.savedName == "Garchomp")
    #expect(destination.speciesDetail?.savedName == "Garchomp")
  }

  // MARK: Companion chips on Dex / Usage (P-SHELL-AC-3.2, P-WF-AC-4.1)

  @Test
  func dexPokemonProfileCanBindThePokemonChip() {
    let shell = makeShell()
    shell.select(.dex(garchompRoute()))
    shell.revealCompanion()
    let chip = PadContextChip.pokemon(slug: "garchomp", name: "Garchomp")
    shell.setContextChip(chip)
    #expect(shell.companionOpen == true)
    #expect(shell.contextChip == chip)
    #expect(shell.destination == .dex(garchompRoute()))
  }

  @Test
  func usageSpeciesCanBindTheUsageChip() {
    let shell = makeShell()
    shell.select(.usage(slug: "garchomp"))
    shell.revealCompanion()
    let chip = PadContextChip.usageSpecies(slug: "garchomp", name: "Garchomp")
    shell.setContextChip(chip)
    #expect(shell.companionOpen == true)
    #expect(shell.contextChip == chip)
    #expect(shell.destination == .usage(slug: "garchomp"))
  }
}
