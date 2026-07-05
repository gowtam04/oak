package ai.gowtam.oak.chat

import ai.gowtam.oak.features.chat.answercard.parseCitationSource
import ai.gowtam.oak.wire.EntityKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * [parseCitationSource] case matrix — mirrors `web/src/components/artifact/parse-citation.ts`'s
 * test cases exactly, so a citation `source` opens the same entity on Android as it does on web.
 */
class CitationSourceTest {

    @Test
    fun pokemonPrefixParses() {
        assertEquals(EntityKind.POKEMON to "garchomp", parseCitationSource("pokemon/garchomp"))
    }

    @Test
    fun movePrefixParses() {
        assertEquals(EntityKind.MOVE to "outrage", parseCitationSource("move/outrage"))
    }

    @Test
    fun abilityPrefixParses() {
        assertEquals(EntityKind.ABILITY to "armor-tail", parseCitationSource("ability/armor-tail"))
    }

    @Test
    fun itemPrefixParses() {
        assertEquals(EntityKind.ITEM to "leftovers", parseCitationSource("item/leftovers"))
    }

    @Test
    fun typePrefixParses() {
        assertEquals(EntityKind.TYPE to "ground", parseCitationSource("type/ground"))
    }

    @Test
    fun learnsetPrefixMapsToMove() {
        assertEquals(EntityKind.MOVE to "trick-room", parseCitationSource("learnset/trick-room (gen-9)"))
    }

    @Test
    fun parentheticalQualifierIsStripped() {
        assertEquals(EntityKind.MOVE to "will-o-wisp", parseCitationSource("learnset/will-o-wisp (gen-9)"))
    }

    @Test
    fun unknownPrefixReturnsNull() {
        assertNull(parseCitationSource("run_sql/natdex_species"))
    }

    @Test
    fun noSlashReturnsNull() {
        assertNull(parseCitationSource("PokéAPI"))
    }

    @Test
    fun leadingSlashReturnsNull() {
        assertNull(parseCitationSource("/garchomp"))
    }

    @Test
    fun emptySlugReturnsNull() {
        assertNull(parseCitationSource("move/"))
    }

    @Test
    fun emptySlugAfterStrippingParentheticalReturnsNull() {
        assertNull(parseCitationSource("move/ (gen-9)"))
    }
}
