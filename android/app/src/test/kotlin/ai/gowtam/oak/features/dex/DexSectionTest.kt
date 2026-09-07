package ai.gowtam.oak.features.dex

import ai.gowtam.oak.wire.EntityKind
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the Dex section catalogue (mirrors iOS `DexSectionTests`).
 * Champions-first P8 (ADR-6): Usage is a first-class Dex section, not a sixth tab.
 *
 * Requirement refs: CF-UI-AC-6.4, ADR-6.
 */
class DexSectionTest {

    @Test
    fun fiveSectionsPokemonMovesAbilitiesItemsUsage() {
        assertEquals(
            listOf("Pokémon", "Moves", "Abilities", "Items", "Usage"),
            DexSection.entries.map { it.title },
        )
        assertEquals(5, DexSection.entries.size)
        assertEquals("Usage", DexSection.entries.last().title)
    }

    @Test
    fun entityBrowseKindsStayInWebOrderBeforeUsage() {
        val browse = DexSection.entries.filter { it.title != "Usage" }
        assertEquals(
            listOf(
                EntityKind.POKEMON,
                EntityKind.MOVE,
                EntityKind.ABILITY,
                EntityKind.ITEM,
            ),
            browse.map { it.entityKind },
        )
    }

    @Test
    fun pokemonTitleUsesAccentedE() {
        assertEquals("Pokémon", DexSection.Pokemon.title)
    }
}
