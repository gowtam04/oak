package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Reconstructs the exact [BuilderSseEvent] sequence from the recorded team-builder
 * fixture (implementation-plan.md P3 acceptance check 3), and confirms the
 * builder-specific decoding policy: a stray `scope` frame (a chat-only event) is
 * ignored like any other unknown event.
 */
class BuilderSseParserTest {

    private fun parseFixture(name: String): List<BuilderSseEvent> = parseText(Fixtures.string(name))

    private fun parseText(text: String): List<BuilderSseEvent> {
        val splitter = ByteLineSplitter()
        val parser = BuilderSseParser()
        val events = mutableListOf<BuilderSseEvent>()
        for (line in splitter.consume(text.toByteArray(Charsets.UTF_8))) {
            events += parser.consume(line)
        }
        splitter.finish()?.let { events += parser.consume(it) }
        events += parser.finish()
        return events
    }

    @Test
    fun teamsAssistantPatchReconstructsExactEventSequence() {
        val events = parseFixture("teams_assistant_patch.sse")

        // The fixture opens with a `: keep-alive` comment, which must not produce
        // an event.
        assertEquals(5, events.size)
        assertEquals(
            BuilderSseEvent.ToolActivity("get_learnset", "📖 Checking Great Tusk's learnset…"),
            events[0],
        )
        assertEquals(BuilderSseEvent.AnswerStart, events[1])
        assertEquals(BuilderSseEvent.AnswerDelta("Slot 3 is bare. I'd run "), events[2])
        assertEquals(BuilderSseEvent.AnswerDelta("**Great Tusk** for hazard control."), events[3])
        val answer = events[4]
        assertTrue(answer is BuilderSseEvent.Answer)
        val builderAnswer = (answer as BuilderSseEvent.Answer).answer
        assertTrue(builderAnswer.answerMarkdown.contains("Great Tusk"))
        val patch = builderAnswer.teamPatch
        assertNotNull(patch)
        assertEquals(1, patch!!.slots.size)
        assertEquals(2, patch.slots.single().slot)
        assertEquals("great-tusk", patch.slots.single().member?.species)
    }

    @Test
    fun aStrayScopeFrameIsIgnored() {
        val events = parseText(
            "event: scope\ndata: {\"format\":\"gen-7\",\"source\":\"message\"}\n\n" +
                "event: answer_start\ndata: {}\n\n",
        )
        assertEquals(listOf(BuilderSseEvent.AnswerStart), events)
    }

    @Test
    fun unknownEventNameIsASilentNoOp() {
        val events = parseText("event: some_future_event\ndata: {\"whatever\":true}\n\n")
        assertEquals(emptyList<BuilderSseEvent>(), events)
    }

    @Test
    fun aRecognizedEventWithMalformedDataJsonThrowsDecoding() {
        try {
            parseText("event: answer_delta\ndata: not-json\n\n")
            fail("expected OakError.Decoding")
        } catch (e: OakError.Decoding) {
            assertTrue(e.typeName.contains("answer_delta"))
        }
    }
}
