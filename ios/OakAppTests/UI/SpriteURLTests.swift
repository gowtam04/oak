import Foundation
import Testing

@testable import OakApp

/// Pins the slug → Showdown spriteid guess (parity with
/// `web/src/lib/sprites.test.ts`) and the Dex-list `SearchMatch` resolver
/// (server `sprite_url` wins; otherwise guess against the API origin).
struct SpriteURLTests {
  private let origin = "https://oak.gowtam.ai"

  // MARK: guessShowdownSpriteId

  @Test
  func plainBaseSpeciesIsUntouched() {
    #expect(SpriteURL.guessShowdownSpriteId("garchomp") == "garchomp")
  }

  @Test
  func singleTokenFormeKeepsTheHyphen() {
    #expect(SpriteURL.guessShowdownSpriteId("absol-mega") == "absol-mega")
  }

  @Test
  func multiTokenFormeCollapsesInternalHyphens() {
    #expect(SpriteURL.guessShowdownSpriteId("charizard-mega-x") == "charizard-megax")
    #expect(SpriteURL.guessShowdownSpriteId("charizard-mega-y") == "charizard-megay")
  }

  @Test
  func hyphenatedBaseWithNoFormeSuffixIsOneToken() {
    #expect(SpriteURL.guessShowdownSpriteId("tapu-koko") == "tapukoko")
  }

  @Test
  func longerSuffixWinsOverAShorterContainedOne() {
    #expect(SpriteURL.guessShowdownSpriteId("darmanitan-galar-zen") == "darmanitan-galarzen")
  }

  // MARK: guessOakMedia

  @Test
  func guessOakMediaUsesTheApiOriginNotTheShowdownCdn() {
    #expect(
      SpriteURL.guessOakMedia(slug: "garchomp", origin: origin)
        == "\(origin)/api/media/sprite/garchomp"
    )
    #expect(
      SpriteURL.guessOakMedia(slug: "charizard-mega-x", origin: origin)
        == "\(origin)/api/media/sprite/charizard-megax"
    )
    #expect(
      SpriteURL.guessOakMedia(slug: "tapu-koko", origin: origin)
        == "\(origin)/api/media/sprite/tapukoko"
    )
    #expect(
      SpriteURL.guessOakMedia(slug: "darmanitan-galar-zen", origin: origin)
        == "\(origin)/api/media/sprite/darmanitan-galarzen"
    )
  }

  @Test
  func guessOakMediaStripsATrailingSlashOnOrigin() {
    #expect(
      SpriteURL.guessOakMedia(slug: "garchomp", origin: "https://oak.gowtam.ai/")
        == "https://oak.gowtam.ai/api/media/sprite/garchomp"
    )
  }

  // MARK: SearchMatch.resolvedSpriteURL

  @Test
  func resolvedURLPrefersANonEmptyServerSpriteUrl() {
    let match = SearchMatch(
      slug: "garchomp",
      displayName: "Garchomp",
      kind: .pokemon,
      spriteUrl: "https://example.test/garchomp.gif"
    )
    #expect(match.resolvedSpriteURL(origin: origin) == "https://example.test/garchomp.gif")
  }

  @Test
  func resolvedURLGuessesWhenSpriteUrlIsMissing() {
    let match = SearchMatch(slug: "garchomp", displayName: "Garchomp", kind: .pokemon)
    #expect(
      match.resolvedSpriteURL(origin: origin)
        == "\(origin)/api/media/sprite/garchomp"
    )
  }

  @Test
  func resolvedURLGuessesWhenSpriteUrlIsBlank() {
    let match = SearchMatch(
      slug: "charizard-mega-x",
      displayName: "Charizard-Mega-X",
      kind: .pokemon,
      spriteUrl: "  "
    )
    #expect(
      match.resolvedSpriteURL(origin: origin)
        == "\(origin)/api/media/sprite/charizard-megax"
    )
  }

  @Test
  func resolvedURLIsNilForNonPokemon() {
    let match = SearchMatch(
      slug: "earthquake",
      displayName: "Earthquake",
      kind: .move,
      spriteUrl: "https://example.test/should-not-use.gif"
    )
    #expect(match.resolvedSpriteURL(origin: origin) == nil)
  }
}
