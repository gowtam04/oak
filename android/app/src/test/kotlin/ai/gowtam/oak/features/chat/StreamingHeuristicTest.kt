package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** Incoming-plate thinking-trace copy: never raw tool ids. */
class StreamingHeuristicTest {

    @Test
    fun `instrumentToken matches the cross-platform copy table`() {
        assertEquals("Dex lookup", instrumentToken("resolve_entity"))
        assertEquals("Pokémon", instrumentToken("get_pokemon"))
        assertEquals("Move", instrumentToken("get_move"))
        assertEquals("Game data", instrumentToken("run_sql"))
        assertEquals("Wiki", instrumentToken("search_wiki"))
        assertEquals("Usage", instrumentToken("get_meta_usage"))
        assertEquals("Teams", instrumentToken("submit_builder_answer"))
        assertEquals("Lookup", instrumentToken("totally_unknown"))
    }

    @Test
    fun `trace rows use friendly nouns and subjects`() {
        val rows = traceRows(
            activities = listOf(
                ToolActivity(tool = "resolve_entity", label = "🔍 Resolving “Farigiraf”…"),
                ToolActivity(tool = "get_pokemon", label = "📇 Looking up Garchomp…"),
                ToolActivity(tool = "submit_answer", label = "✍️ Composing the answer…"),
            ),
            settled = false,
        )
        assertEquals(2, rows.size)
        assertEquals("Dex lookup", rows[0].primary)
        assertEquals("Farigiraf", rows[0].secondary)
        assertFalse(rows[0].active)
        assertEquals("Pokémon", rows[1].primary)
        assertEquals("Garchomp", rows[1].secondary)
        assertEquals(true, rows[1].active)
        assertFalse(rows.any { it.tool == "submit_answer" })
        assertFalse(rows.any { it.primary.contains("get_") })
    }

    @Test
    fun `thinking header is live until settled`() {
        assertEquals(
            ThinkingHeader(live = true, text = "Thinking"),
            thinkingHeader(reconnecting = false, settled = false, elapsedSeconds = 3),
        )
        assertEquals(
            ThinkingHeader(live = false, text = "Thought for 4 seconds"),
            thinkingHeader(reconnecting = false, settled = true, elapsedSeconds = 4),
        )
        assertEquals("Thought for 1 second", thoughtFor(1))
        assertEquals("Thought for a moment", thoughtFor(0))
        assertEquals(
            ThinkingHeader(live = true, text = "Reconnecting"),
            thinkingHeader(reconnecting = true, settled = false, elapsedSeconds = 2),
        )
    }

    @Test
    fun `subjectFromLabel pulls quoted and capitalised runs`() {
        assertEquals("garchom", subjectFromLabel("Resolving “garchom”…"))
        assertEquals("Fake Out", subjectFromLabel("Looking up Fake Out"))
        assertNull(subjectFromLabel("Resolving name"))
    }

    @Test
    fun `legacy streamingStatusCopy follows the new header`() {
        val thinking = streamingStatusCopy(StreamingPhase.THINKING, emptyList(), reconnecting = false)
        assertEquals("Thinking", thinking.verb)
        assertEquals("", thinking.rest)
        val writing = streamingStatusCopy(StreamingPhase.ANSWERING, emptyList(), reconnecting = false)
        assertEquals("Thought for a moment", writing.sentence)
        val reconnect = streamingStatusCopy(
            StreamingPhase.USING_TOOLS,
            listOf(ToolActivity(tool = "get_pokemon", label = "Garchomp")),
            reconnecting = true,
        )
        assertEquals("Reconnecting", reconnect.sentence)
    }
}
