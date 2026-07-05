import Foundation
import Testing

@testable import OakApp

/// `displayCitationSource` mirrors the web/Android display mapping exactly
/// (copy-tables.md §2) — internal machinery (`run_sql`, `get_meta_usage`) never
/// surfaces its wire form; entity sources render as a kind label + titleized slug.
/// Tap/parse behavior (``parseCitationSource``) is a separate, untouched contract.
struct CitationDisplayTests {

  @Test
  func entityKindsRenderAsLabelAndTitleizedSlug() {
    #expect(displayCitationSource("pokemon/garchomp") == "Pokémon — Garchomp")
    #expect(displayCitationSource("move/outrage") == "Move — Outrage")
    #expect(displayCitationSource("move/fake-out") == "Move — Fake Out")
    #expect(displayCitationSource("ability/intimidate") == "Ability — Intimidate")
    #expect(displayCitationSource("item/leftovers") == "Item — Leftovers")
    #expect(displayCitationSource("type/ground") == "Type — Ground")
  }

  @Test
  func learnsetRendersAsMovepoolAndStripsGenQualifier() {
    #expect(displayCitationSource("learnset/will-o-wisp (gen-9)") == "Movepool — Will O Wisp")
    #expect(displayCitationSource("learnset/trick-room") == "Movepool — Trick Room")
  }

  @Test
  func runSqlAlwaysRendersTheSameFriendlyName() {
    #expect(displayCitationSource("run_sql/natdex_species") == "Oak's game database")
    #expect(displayCitationSource("run_sql/anything_at_all") == "Oak's game database")
  }

  @Test
  func wikiRendersWithThePageAsIs() {
    #expect(displayCitationSource("wiki/Move Tutor") == "Community wiki — Move Tutor")
  }

  @Test
  func getMetaUsageDistinguishesGen9OuFromOtherVariants() {
    #expect(displayCitationSource("get_meta_usage/gen9ou") == "Competitive usage stats (Gen 9 OU)")
    #expect(displayCitationSource("get_meta_usage/gen8ou") == "Competitive usage stats")
  }

  @Test
  func unrecognizedSourcesPassThroughUnchanged() {
    #expect(displayCitationSource("PokéAPI") == "PokéAPI")
    #expect(displayCitationSource("Type chart") == "Type chart")
    #expect(displayCitationSource("/garchomp") == "/garchomp")
  }
}
