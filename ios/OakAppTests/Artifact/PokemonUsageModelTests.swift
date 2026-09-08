import Foundation
import Testing

@testable import OakApp

@MainActor
struct PokemonUsageModelTests {
  @Test
  func loadFetchesDoublesByDefault() async {
    let fake = FakeUsageService()
    fake.nextSpecies = foundSpecies()
    let model = PokemonUsageModel(slug: "garchomp", usage: fake)

    await model.load()

    #expect(fake.speciesCount == 1)
    #expect(fake.lastSpeciesSlug == "garchomp")
    #expect(fake.lastSpeciesLadder == .doubles)
    #expect(model.detail?.found == true)
    #expect(model.detail?.savedName == "Garchomp")
    #expect(model.isLoading == false)
  }

  @Test
  func selectSinglesRefetchesThatLadder() async {
    let fake = FakeUsageService()
    fake.nextSpecies = foundSpecies()
    let model = PokemonUsageModel(slug: "garchomp", usage: fake)
    await model.load()

    await model.selectLadder(.singles)

    #expect(model.ladder == .singles)
    #expect(fake.speciesCount == 2)
    #expect(fake.lastSpeciesLadder == .singles)
  }

  @Test
  func loadFoldsServiceErrorsToUnavailable() async {
    let fake = FakeUsageService()
    fake.speciesError = .transport(underlying: "offline")
    let model = PokemonUsageModel(slug: "garchomp", usage: fake)

    await model.load()

    #expect(model.detail?.available == false)
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
}
