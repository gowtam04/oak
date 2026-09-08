package ai.gowtam.oak.features.usage

import ai.gowtam.oak.wire.EntityKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UsageDexLinkTest {

    @Test
    fun movesItemsAbilitiesAndTeammatesOpenDex() {
        assertEquals(
            UsageDexTarget(EntityKind.MOVE, "Rock Slide"),
            UsageDexLink.route(UsageListKind.MOVES, "Rock Slide"),
        )
        assertEquals(
            UsageDexTarget(EntityKind.ITEM, "Life Orb"),
            UsageDexLink.route(UsageListKind.ITEMS, "Life Orb"),
        )
        assertEquals(
            UsageDexTarget(EntityKind.ABILITY, "Rough Skin"),
            UsageDexLink.route(UsageListKind.ABILITIES, "Rough Skin"),
        )
        assertEquals(
            UsageDexTarget(EntityKind.POKEMON, "Farigiraf"),
            UsageDexLink.route(UsageListKind.TEAMMATES, "Farigiraf"),
        )
    }

    @Test
    fun naturesAndSpreadsHaveNoDexPage() {
        assertNull(UsageDexLink.route(UsageListKind.NATURES, "Jolly"))
        assertNull(UsageDexLink.route(UsageListKind.SPREADS, "252/0/0/0/4/252"))
    }

    @Test
    fun blankNamesAreIgnored() {
        assertNull(UsageDexLink.route(UsageListKind.MOVES, "  "))
        assertNull(UsageDexLink.route(UsageListKind.MOVES, ""))
        assertNull(UsageDexLink.speciesRoute("   "))
    }

    @Test
    fun trimsDisplayNames() {
        assertEquals(
            UsageDexTarget(EntityKind.MOVE, "Earthquake"),
            UsageDexLink.route(UsageListKind.MOVES, "  Earthquake  "),
        )
    }

    @Test
    fun speciesHeaderOpensPokemonDex() {
        assertEquals(
            UsageDexTarget(EntityKind.POKEMON, "Garchomp"),
            UsageDexLink.speciesRoute("Garchomp"),
        )
        assertEquals(
            UsageDexTarget(EntityKind.POKEMON, "garchomp"),
            UsageDexLink.speciesRoute("  garchomp  "),
        )
    }
}
