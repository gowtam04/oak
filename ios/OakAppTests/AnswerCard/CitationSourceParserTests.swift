import Foundation
import Testing

@testable import OakApp

/// `parseCitationSource` mirrors `web/src/components/artifact/parse-citation.ts`
/// exactly — same case matrix, same edge cases (no slash, leading slash, empty
/// slug, parenthetical qualifier stripping, `learnset` → `move` mapping).
struct CitationSourceParserTests {

  @Test
  func parsesEachOfTheFiveEntityKinds() {
    #expect(parseCitationSource("pokemon/garchomp")?.kind == .pokemon)
    #expect(parseCitationSource("pokemon/garchomp")?.query == "garchomp")

    #expect(parseCitationSource("move/outrage")?.kind == .move)
    #expect(parseCitationSource("move/outrage")?.query == "outrage")

    #expect(parseCitationSource("ability/intimidate")?.kind == .ability)
    #expect(parseCitationSource("ability/intimidate")?.query == "intimidate")

    #expect(parseCitationSource("item/leftovers")?.kind == .item)
    #expect(parseCitationSource("item/leftovers")?.query == "leftovers")

    #expect(parseCitationSource("type/ground")?.kind == .type)
    #expect(parseCitationSource("type/ground")?.query == "ground")
  }

  @Test
  func mapsLearnsetPrefixToMoveAndStripsParenthetical() {
    let parsed = parseCitationSource("learnset/trick-room (gen-9)")
    #expect(parsed?.kind == .move)
    #expect(parsed?.query == "trick-room")
  }

  @Test
  func stripsAParentheticalQualifierOnAnyKind() {
    let parsed = parseCitationSource("move/earthquake (physical)")
    #expect(parsed?.kind == .move)
    #expect(parsed?.query == "earthquake")
  }

  @Test
  func unknownPrefixReturnsNil() {
    #expect(parseCitationSource("run_sql/natdex_species") == nil)
  }

  @Test
  func noSlashReturnsNil() {
    #expect(parseCitationSource("PokéAPI") == nil)
  }

  @Test
  func leadingSlashReturnsNil() {
    #expect(parseCitationSource("/garchomp") == nil)
  }

  @Test
  func emptySlugReturnsNil() {
    #expect(parseCitationSource("move/") == nil)
  }

  @Test
  func emptySlugBeforeParentheticalReturnsNil() {
    #expect(parseCitationSource("move/ (gen-9)") == nil)
  }
}
