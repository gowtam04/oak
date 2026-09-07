package ai.gowtam.oak.ui

import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.SearchMatch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins the slug → Showdown spriteid guess (parity with
 * `web/src/lib/sprites.test.ts`) and the Dex-list [SearchMatch] resolver
 * (server `sprite_url` wins; otherwise guess against the API origin).
 */
class SpriteUrlTest {
    private val origin = "https://oak.gowtam.ai"

    @Test
    fun plainBaseSpeciesIsUntouched() {
        assertEquals("garchomp", SpriteUrl.guessShowdownSpriteId("garchomp"))
    }

    @Test
    fun singleTokenFormeKeepsTheHyphen() {
        assertEquals("absol-mega", SpriteUrl.guessShowdownSpriteId("absol-mega"))
    }

    @Test
    fun multiTokenFormeCollapsesInternalHyphens() {
        assertEquals("charizard-megax", SpriteUrl.guessShowdownSpriteId("charizard-mega-x"))
        assertEquals("charizard-megay", SpriteUrl.guessShowdownSpriteId("charizard-mega-y"))
    }

    @Test
    fun hyphenatedBaseWithNoFormeSuffixIsOneToken() {
        assertEquals("tapukoko", SpriteUrl.guessShowdownSpriteId("tapu-koko"))
    }

    @Test
    fun longerSuffixWinsOverAShorterContainedOne() {
        assertEquals(
            "darmanitan-galarzen",
            SpriteUrl.guessShowdownSpriteId("darmanitan-galar-zen"),
        )
    }

    @Test
    fun guessOakMediaUsesTheApiOriginNotTheShowdownCdn() {
        assertEquals(
            "$origin/api/media/sprite/garchomp",
            SpriteUrl.guessOakMedia("garchomp", origin),
        )
        assertEquals(
            "$origin/api/media/sprite/charizard-megax",
            SpriteUrl.guessOakMedia("charizard-mega-x", origin),
        )
        assertEquals(
            "$origin/api/media/sprite/tapukoko",
            SpriteUrl.guessOakMedia("tapu-koko", origin),
        )
        assertEquals(
            "$origin/api/media/sprite/darmanitan-galarzen",
            SpriteUrl.guessOakMedia("darmanitan-galar-zen", origin),
        )
    }

    @Test
    fun guessOakMediaStripsATrailingSlashOnOrigin() {
        assertEquals(
            "https://oak.gowtam.ai/api/media/sprite/garchomp",
            SpriteUrl.guessOakMedia("garchomp", "https://oak.gowtam.ai/"),
        )
    }

    @Test
    fun resolvedUrlPrefersANonEmptyServerSpriteUrl() {
        val match = SearchMatch(
            slug = "garchomp",
            displayName = "Garchomp",
            kind = EntityKind.POKEMON,
            spriteUrl = "https://example.test/garchomp.gif",
        )
        assertEquals(
            "https://example.test/garchomp.gif",
            match.resolvedSpriteUrl(origin),
        )
    }

    @Test
    fun resolvedUrlGuessesWhenSpriteUrlIsMissing() {
        val match = SearchMatch(
            slug = "garchomp",
            displayName = "Garchomp",
            kind = EntityKind.POKEMON,
        )
        assertEquals("$origin/api/media/sprite/garchomp", match.resolvedSpriteUrl(origin))
    }

    @Test
    fun resolvedUrlGuessesWhenSpriteUrlIsBlank() {
        val match = SearchMatch(
            slug = "charizard-mega-x",
            displayName = "Charizard-Mega-X",
            kind = EntityKind.POKEMON,
            spriteUrl = "  ",
        )
        assertEquals(
            "$origin/api/media/sprite/charizard-megax",
            match.resolvedSpriteUrl(origin),
        )
    }

    @Test
    fun resolvedUrlIsNullForNonPokemon() {
        val match = SearchMatch(
            slug = "earthquake",
            displayName = "Earthquake",
            kind = EntityKind.MOVE,
            spriteUrl = "https://example.test/should-not-use.gif",
        )
        assertNull(match.resolvedSpriteUrl(origin))
    }
}
