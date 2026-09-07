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

  /// ADR-6: iOS Usage is a root tab, not a Dex section (Android puts Usage
  /// inside Dex). This catalogue stays Pokémon / Moves / Abilities / Items.
  @Test
  func usageIsNotADexSection() {
    #expect(!DexSection.allCases.map(\.rawValue).contains("usage"))
    #expect(!DexSection.allCases.map(\.rawValue).contains("meta"))
  }
}
