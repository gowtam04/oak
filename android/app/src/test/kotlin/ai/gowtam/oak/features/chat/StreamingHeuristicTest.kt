package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Client-only streaming plate wash heuristic (soul.md Phase 2). */
class StreamingHeuristicTest {

    @Test
    fun `finds type names in tool labels`() {
        val types = heuristicTypesFromActivities(
            listOf(
                ToolActivity(tool = "type_matchup", label = "Dragon vs Steel"),
                ToolActivity(tool = "get_pokemon", label = "Looking up Garchomp"),
            ),
        )
        assertEquals(listOf("dragon", "steel"), types)
    }

    @Test
    fun `empty activities yields no types`() {
        assertTrue(heuristicTypesFromActivities(emptyList()).isEmpty())
    }

    @Test
    fun `does not invent types from non-type words`() {
        val types = heuristicTypesFromActivities(
            listOf(ToolActivity(tool = "get_pokemon", label = "Looking up Garchomp")),
        )
        assertTrue(types.isEmpty())
    }

    @Test
    fun `caps at two types`() {
        val types = heuristicTypesFromActivities(
            listOf(
                ToolActivity(
                    tool = "type_matchup",
                    label = "fire water grass electric",
                ),
            ),
        )
        assertEquals(2, types.size)
        assertEquals(listOf("grass", "fire"), types)
    }
}
