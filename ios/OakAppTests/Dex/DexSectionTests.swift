import Testing

@testable import OakApp

/// Pins the Dex section catalogue (Chat / Teams / Dex / Account shell).
struct DexSectionTests {

  @Test
  func fourSectionsInWebOrder() {
    #expect(DexSection.allCases.map(\.rawValue) == ["pokemon", "move", "ability", "item"])
  }

  @Test
  func everySectionHasNonEmptyTitleAndEntityKind() {
    for section in DexSection.allCases {
      #expect(!section.title.isEmpty)
      #expect(!section.entityKind.rawValue.isEmpty)
    }
  }

  @Test
  func pokemonTitleUsesAccentedE() {
    #expect(DexSection.pokemon.title == "Pokémon")
  }
}
