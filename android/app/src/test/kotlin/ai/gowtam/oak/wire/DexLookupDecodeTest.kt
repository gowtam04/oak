package ai.gowtam.oak.wire

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@Serializable
private data class SearchEnvelope(val matches: List<SearchMatch>)

@Serializable
private data class LearnsetEnvelope(val moves: List<LearnsetMove>)

@Serializable
private data class SpritesEnvelope(val refs: Map<String, DexSpriteRef>)

/** Decode coverage for the three public dex-lookup routes (`/search`, `/learnset`, `/sprites`). */
class DexLookupDecodeTest {

    @Test
    fun searchDecodesTwoMatches() {
        val envelope = OakJson.decodeFromString<SearchEnvelope>(Fixtures.string("search_response.json"))
        assertEquals(2, envelope.matches.size)
        assertEquals("swampert-mega", envelope.matches[1].slug)
        assertEquals(EntityKind.POKEMON, envelope.matches[1].kind)
        assertNull(envelope.matches[0].spriteUrl)
    }

    @Test
    fun searchDecodesOptionalSpriteUrl() {
        val envelope = OakJson.decodeFromString<SearchEnvelope>(
            """{"matches":[{"slug":"garchomp","display_name":"Garchomp","kind":"pokemon","sprite_url":"https://example.test/garchomp.gif"}]}""",
        )
        assertEquals("https://example.test/garchomp.gif", envelope.matches[0].spriteUrl)
    }

    @Test
    fun learnsetToleratesMissingF1Metadata() {
        val envelope = OakJson.decodeFromString<LearnsetEnvelope>(Fixtures.string("learnset_response.json"))
        assertEquals(3, envelope.moves.size)
        assertEquals(LearnsetMove.DamageClass.PHYSICAL, envelope.moves[0].damageClass)
        assertNull(envelope.moves[1].power)
        // "stealth-rock" carries no type/damage_class/power at all.
        val bare = envelope.moves[2]
        assertNull(bare.type)
        assertNull(bare.damageClass)
        assertNull(bare.power)
    }

    @Test
    fun spritesDecodesMegaAutoForceFields() {
        val envelope = OakJson.decodeFromString<SpritesEnvelope>(Fixtures.string("sprites_response.json"))
        val ref = envelope.refs.getValue("swampert-mega")
        assertEquals("swampertite", ref.requiredItem)
        assertEquals(listOf("swift-swim"), ref.abilities)
        assertEquals(150, ref.baseStats.atk)
        assertEquals(260, ref.dexNumber)
    }
}
