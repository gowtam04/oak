package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Signal streaming copy: friendly nouns, never raw tool ids. */
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
    fun `sentence uses unique friendly nouns, never raw GET ids`() {
        val sentence = streamingStatusSentence(
            phase = StreamingPhase.USING_TOOLS,
            activities = listOf(
                ToolActivity(tool = "resolve_entity", label = "GET_RESOLVE_ENTITY"),
                ToolActivity(tool = "get_pokemon", label = "GET_POKEMON"),
                ToolActivity(tool = "get_pokemon", label = "GET_POKEMON"),
            ),
            reconnecting = false,
        )
        assertEquals("Looking up Dex lookup, Pokémon", sentence)
        assertFalse(sentence.contains("GET_"))
        assertFalse(sentence.contains("get_pokemon"))
    }

    @Test
    fun `thinking with no tools uses the mute thinking line`() {
        assertEquals(
            "Thinking through your question…",
            streamingStatusSentence(StreamingPhase.THINKING, emptyList(), reconnecting = false),
        )
    }

    @Test
    fun `reconnecting wins over activity`() {
        assertEquals(
            "Reconnecting…",
            streamingStatusSentence(
                StreamingPhase.USING_TOOLS,
                listOf(ToolActivity(tool = "get_pokemon", label = "Garchomp")),
                reconnecting = true,
            ),
        )
    }
}
