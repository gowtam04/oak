package ai.gowtam.oak.chat

import ai.gowtam.oak.features.chat.answercard.displayCitationSource
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

    // -------------------------------------------------------------------
    // displayCitationSource — copy-tables.md §2 case matrix
    // -------------------------------------------------------------------

    @Test
    fun displaysPokemonSourceAsTitleizedEntity() {
        assertEquals("Pokémon — Garchomp", displayCitationSource("pokemon/garchomp"))
    }

    @Test
    fun displaysMoveSourceAsTitleizedEntity() {
        assertEquals("Move — Fake Out", displayCitationSource("move/fake-out"))
    }

    @Test
    fun displaysAbilitySourceAsTitleizedEntity() {
        assertEquals("Ability — Armor Tail", displayCitationSource("ability/armor-tail"))
    }

    @Test
    fun displaysItemSourceAsTitleizedEntity() {
        assertEquals("Item — Leftovers", displayCitationSource("item/leftovers"))
    }

    @Test
    fun displaysTypeSourceAsTitleizedEntity() {
        assertEquals("Type — Ground", displayCitationSource("type/ground"))
    }

    @Test
    fun displaysLearnsetSourceAsMovepoolWithGenQualifierStripped() {
        assertEquals("Movepool — Trick Room", displayCitationSource("learnset/trick-room (gen-9)"))
    }

    @Test
    fun displaysRunSqlSourceAsGameDatabase() {
        assertEquals("Oak's game database", displayCitationSource("run_sql/natdex_species"))
    }

    @Test
    fun displaysWikiSourceAsCommunityWikiWithPageAsIs() {
        assertEquals("Community wiki — Mt. Coronet", displayCitationSource("wiki/Mt. Coronet"))
    }

    @Test
    fun displaysMetaUsageGen9ouWithFormatLabel() {
        assertEquals("Competitive usage stats (Gen 9 OU)", displayCitationSource("get_meta_usage/gen9ou"))
    }

    @Test
    fun displaysOtherMetaUsageWithoutFormatLabel() {
        assertEquals("Competitive usage stats", displayCitationSource("get_meta_usage/gen8ou"))
    }

    @Test
    fun displaysUnrecognizedSourceVerbatim() {
        assertEquals("PokéAPI", displayCitationSource("PokéAPI"))
    }
}
