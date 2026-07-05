package ai.gowtam.oak.features.more

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins [MoreDestination]'s shape (mirrors iOS `MoreDestinationTests`): Account is the
 * first and, for now, only destination, with the title and icon the More list row
 * displays.
 */
class MoreDestinationTest {

    @Test
    fun accountIsTheFirstDestination() {
        assertEquals(MoreDestination.Account, MoreDestination.entries.first())
    }

    @Test
    fun accountTitleIsAccount() {
        assertEquals("Account", MoreDestination.Account.title)
    }

    @Test
    fun accountIconIsAccountCircle() {
        assertEquals(Icons.Filled.AccountCircle, MoreDestination.Account.icon())
    }
}
