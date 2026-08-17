import Testing

@testable import OakApp

/// Pins the Dex-tab hop consume used when "Open X in Dex" lands on a lazily
/// created Dex tab (destination is already set before `onChange` can fire).
struct PendingDexHopTests {

  @Test
  func dexQueryYieldsPokemonRoute() {
    let hop = PendingDexHop.consume(.dex(query: "Dragapult"))
    #expect(hop?.query == "Dragapult")
    #expect(hop?.route?.kind == .pokemon)
    #expect(hop?.route?.query == "Dragapult")
  }

  @Test
  func dexQueryTrimsWhitespace() {
    let hop = PendingDexHop.consume(.dex(query: "  Garchomp  "))
    #expect(hop?.query == "Garchomp")
    #expect(hop?.route?.query == "Garchomp")
    #expect(hop?.route?.kind == .pokemon)
  }

  @Test
  func emptyOrNilQueryHasNoRoute() {
    #expect(PendingDexHop.consume(.dex(query: nil))?.route == nil)
    #expect(PendingDexHop.consume(.dex(query: "   "))?.route == nil)
    #expect(PendingDexHop.consume(.dex(query: ""))?.query == "")
  }

  @Test
  func otherDestinationsAreIgnored() {
    #expect(PendingDexHop.consume(.teams(query: "Dragapult")) == nil)
    #expect(PendingDexHop.consume(.team(id: "abc")) == nil)
    #expect(PendingDexHop.consume(nil) == nil)
  }

  @Test
  func pokemonPageFactoryMatchesConsume() {
    let route = DexEntityRoute.pokemonPage(named: "Dragapult")
    #expect(route == DexEntityRoute(kind: .pokemon, query: "Dragapult"))
    #expect(DexEntityRoute.pokemonPage(named: "  ") == nil)
  }
}
