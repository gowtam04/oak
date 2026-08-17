package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Incoming-plate streaming copy: red verb + mute rest, never raw tool ids. */
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
    fun `tools split is Looking up plus unique friendly nouns`() {
        val copy = streamingStatusCopy(
            phase = StreamingPhase.USING_TOOLS,
            activities = listOf(
                ToolActivity(tool = "resolve_entity", label = "GET_RESOLVE_ENTITY"),
                ToolActivity(tool = "get_pokemon", label = "GET_POKEMON"),
                ToolActivity(tool = "get_pokemon", label = "GET_POKEMON"),
            ),
            reconnecting = false,
        )
        assertEquals("Looking up", copy.verb)
        assertEquals("Dex lookup, Pokémon", copy.rest)
        assertEquals("Looking up Dex lookup, Pokémon", copy.sentence)
        assertFalse(copy.sentence.contains("GET_"))
        assertFalse(copy.sentence.contains("get_pokemon"))
    }

    @Test
    fun `thinking splits into red Thinking plus mute rest`() {
        val copy = streamingStatusCopy(StreamingPhase.THINKING, emptyList(), reconnecting = false)
        assertEquals("Thinking", copy.verb)
        assertEquals("through your question", copy.rest)
        assertEquals("Thinking through your question", copy.sentence)
    }

    @Test
    fun `tools with no nouns uses Looking things up`() {
        val copy = streamingStatusCopy(StreamingPhase.USING_TOOLS, emptyList(), reconnecting = false)
        assertEquals("Looking", copy.verb)
        assertEquals("things up", copy.rest)
        assertEquals("Looking things up", streamingStatusSentence(StreamingPhase.USING_TOOLS, emptyList(), false))
    }

    @Test
    fun `reconnecting wins over activity and has no rest`() {
        val copy = streamingStatusCopy(
            StreamingPhase.USING_TOOLS,
            listOf(ToolActivity(tool = "get_pokemon", label = "Garchomp")),
            reconnecting = true,
        )
        assertEquals("Reconnecting", copy.verb)
        assertEquals("", copy.rest)
        assertEquals("Reconnecting", copy.sentence)
    }
}
