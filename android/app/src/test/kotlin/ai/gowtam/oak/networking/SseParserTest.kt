package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.Fixtures
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SseEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Reconstructs the exact [SseEvent] sequence from recorded `.sse` fixtures
 * (implementation-plan.md P3 acceptance checks 2–3), driving [SseParser] through the
 * SAME [ByteLineSplitter] plumbing [SseClient] uses so the byte→line→frame pipeline is
 * exercised end-to-end, not just the parser in isolation.
 */
class SseParserTest {

    private fun parseFixture(name: String): List<SseEvent> = parseText(Fixtures.string(name))

    private fun parseText(text: String): List<SseEvent> {
        val splitter = ByteLineSplitter()
        val parser = SseParser()
        val events = mutableListOf<SseEvent>()
        for (line in splitter.consume(text.toByteArray(Charsets.UTF_8))) {
            events += parser.consume(line)
        }
        splitter.finish()?.let { events += parser.consume(it) }
        events += parser.finish()
        return events
    }

    @Test
    fun answeredFullReconstructsExactEventSequence() {
        val events = parseFixture("chat_answered_full.sse")

        assertEquals(6, events.size)
        assertEquals(SseEvent.ToolActivity("resolve_entity", "Resolving \"Garchomp\""), events[0])
        assertEquals(SseEvent.ToolActivity("get_pokemon", "Looking up Garchomp"), events[1])
        assertEquals(SseEvent.AnswerStart, events[2])
        assertEquals(SseEvent.AnswerDelta("**Garchomp** is a Dragon/Ground "), events[3])
        assertEquals(
            SseEvent.AnswerDelta("pseudo-legendary with a base stat total of 600."),
            events[4],
        )
        val answer = (events[5] as SseEvent.Answer).answer
        assertEquals(OakAnswer.Status.ANSWERED, answer.status)
        assertEquals(1, answer.citations.size)
        assertEquals("Garchomp", answer.subjects?.single()?.name)
    }

    @Test
    fun singleDeltaGrokStreamDecodesFully() {
        // Grok delivers the whole answer_markdown in ONE answer_delta — the parser
        // (and the reducer built on top of it) must not assume many chunks.
        val events = parseFixture("chat_single_delta_grok.sse")

        assertEquals(3, events.size)
        assertEquals(SseEvent.AnswerStart, events[0])
        assertTrue(events[1] is SseEvent.AnswerDelta)
        assertTrue((events[1] as SseEvent.AnswerDelta).text.contains("Dragapult"))
        val answer = (events[2] as SseEvent.Answer).answer
        assertEquals(OakAnswer.Status.ANSWERED, answer.status)
    }

    @Test
    fun scopeGen7DecodesTheScopeEventFirst() {
        val events = parseFixture("chat_scope_gen7.sse")

        assertEquals(5, events.size)
        assertEquals(SseEvent.Scope(Format.Gen7, ScopeSource.Message), events[0])
        assertEquals(SseEvent.ToolActivity("resolve_entity", "Resolving \"Garchomp\""), events[1])
        assertEquals(SseEvent.AnswerStart, events[2])
        assertTrue(events[3] is SseEvent.AnswerDelta)
        assertTrue(events[4] is SseEvent.Answer)
    }

    @Test
    fun heartbeatCommentsAreIgnored() {
        val events = parseFixture("chat_heartbeat.sse")

        // The fixture interleaves `: keep-alive` comment lines between every real
        // frame; none of them should produce an event.
        assertEquals(4, events.size)
        assertEquals(SseEvent.ToolActivity("query_pokedex", "Searching the Pokédex"), events[0])
        assertEquals(SseEvent.AnswerStart, events[1])
        assertEquals(SseEvent.AnswerDelta("Here are the fastest Dragon-types."), events[2])
        assertTrue(events[3] is SseEvent.Answer)
    }

    @Test
    fun chatErrorDecodesToErrorEvent() {
        val events = parseFixture("chat_error.sse")

        assertEquals(2, events.size)
        assertTrue(events[0] is SseEvent.ToolActivity)
        assertEquals(
            SseEvent.Error(code = "model_unavailable", message = "The model provider is temporarily unavailable.", status = 503),
            events[1],
        )
    }

    @Test
    fun unknownEventNameIsASilentNoOp() {
        val events = parseText("event: some_future_event\ndata: {\"whatever\":true}\n\n")
        assertEquals(emptyList<SseEvent>(), events)
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

    @Test
    fun commentLinesBeforeAFrameAreIgnored() {
        val events = parseText(": keep-alive\nevent: answer_start\ndata: {}\n\n")
        assertEquals(listOf(SseEvent.AnswerStart), events)
    }
}
