package ai.gowtam.oak.features.dex

import ai.gowtam.oak.wire.EntityKind
import org.junit.Assert.assertEquals
import org.junit.Test

/** Pins the Dex section catalogue (mirrors iOS `DexSectionTests`). */
class DexSectionTest {

    @Test
    fun fourSectionsInWebOrder() {
        assertEquals(
            listOf(
                EntityKind.POKEMON,
                EntityKind.MOVE,
                EntityKind.ABILITY,
                EntityKind.ITEM,
            ),
            DexSection.entries.map { it.entityKind },
        )
    }

    @Test
    fun pokemonTitleUsesAccentedE() {
        assertEquals("Pokémon", DexSection.Pokemon.title)
    }
}
