import Testing

@testable import OakApp

struct UsageDexLinkTests {

  @Test
  func movesItemsAbilitiesAndTeammatesOpenDex() {
    #expect(UsageDexLink.route(kind: .moves, name: "Rock Slide")
      == DexEntityRoute(kind: .move, query: "Rock Slide"))
    #expect(UsageDexLink.route(kind: .items, name: "Life Orb")
      == DexEntityRoute(kind: .item, query: "Life Orb"))
    #expect(UsageDexLink.route(kind: .abilities, name: "Rough Skin")
      == DexEntityRoute(kind: .ability, query: "Rough Skin"))
    #expect(UsageDexLink.route(kind: .teammates, name: "Farigiraf")
      == DexEntityRoute(kind: .pokemon, query: "Farigiraf"))
  }

  @Test
  func naturesAndSpreadsHaveNoDexPage() {
    #expect(UsageDexLink.route(kind: .natures, name: "Jolly") == nil)
    #expect(UsageDexLink.route(kind: .spreads, name: "252/0/0/0/4/252") == nil)
  }

  @Test
  func blankNamesAreIgnored() {
    #expect(UsageDexLink.route(kind: .moves, name: "  ") == nil)
    #expect(UsageDexLink.route(kind: .moves, name: "") == nil)
    #expect(UsageDexLink.speciesRoute(nameOrSlug: "   ") == nil)
  }

  @Test
  func trimsDisplayNames() {
    #expect(UsageDexLink.route(kind: .moves, name: "  Earthquake  ")
      == DexEntityRoute(kind: .move, query: "Earthquake"))
  }

  @Test
  func speciesHeaderOpensPokemonDex() {
    #expect(UsageDexLink.speciesRoute(nameOrSlug: "Garchomp")
      == DexEntityRoute(kind: .pokemon, query: "Garchomp"))
    #expect(UsageDexLink.speciesRoute(nameOrSlug: "  garchomp  ")
      == DexEntityRoute(kind: .pokemon, query: "garchomp"))
  }
}
