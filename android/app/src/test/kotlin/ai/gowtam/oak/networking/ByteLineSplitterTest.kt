package ai.gowtam.oak.networking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Exercises [ByteLineSplitter] in isolation (implementation-plan.md P3 acceptance check
 * 1): empty-line preservation (the piece SSE needs to delimit frames), UTF-8-safe
 * splitting across `0x0A`, CRLF tolerance, and the `finish()` flush of a trailing
 * unterminated line.
 */
class ByteLineSplitterTest {

    @Test
    fun splitsSimpleLines() {
        val splitter = ByteLineSplitter()
        val lines = splitter.consume("line one\nline two\n".toByteArray(Charsets.UTF_8))
        assertEquals(listOf("line one", "line two"), lines)
    }

    @Test
    fun emitsEmptyStringForBlankLine() {
        val splitter = ByteLineSplitter()
        val lines = splitter.consume("event: x\n\ndata: y\n\n".toByteArray(Charsets.UTF_8))
        assertEquals(listOf("event: x", "", "data: y", ""), lines)
    }

    @Test
    fun leavesTrailingCarriageReturnForTheParserToStrip() {
        val splitter = ByteLineSplitter()
        val lines = splitter.consume("event: x\r\ndata: y\r\n\r\n".toByteArray(Charsets.UTF_8))
        // The blank CRLF-terminated line ("\r\n") splits to a lone "\r" — still
        // left for the parser to strip, same as every other line here.
        assertEquals(listOf("event: x\r", "data: y\r", "\r"), lines)
    }

    @Test
    fun flushesTrailingUnterminatedLineOnFinish() {
        val splitter = ByteLineSplitter()
        val lines = splitter.consume("data: partial".toByteArray(Charsets.UTF_8))
        assertEquals(emptyList<String>(), lines)
        assertEquals("data: partial", splitter.finish())
    }

    @Test
    fun finishReturnsNullWhenNothingIsBuffered() {
        val splitter = ByteLineSplitter()
        splitter.consume("data: x\n".toByteArray(Charsets.UTF_8))
        assertNull(splitter.finish())
    }

    @Test
    fun finishReturnsNullOnAFreshSplitter() {
        assertNull(ByteLineSplitter().finish())
    }

    @Test
    fun accumulatesALineSplitAcrossMultipleConsumeCalls() {
        val splitter = ByteLineSplitter()
        val first = splitter.consume("event: sc".toByteArray(Charsets.UTF_8))
        assertEquals(emptyList<String>(), first)
        val second = splitter.consume("ope\ndata: {}\n".toByteArray(Charsets.UTF_8))
        assertEquals(listOf("event: scope", "data: {}"), second)
    }

    @Test
    fun multiByteUtf8CharacterSplitAcrossAChunkBoundaryDecodesWhole() {
        val splitter = ByteLineSplitter()
        // "café is déjà vu" — é and è UTF-8-encode as two-byte sequences
        // (0xC3 0xA9 / 0xC3 0xA8), so this line is guaranteed to contain a
        // continuation byte (top two bits `10`) partway through.
        val fullLine = "café is déjà vu\n".toByteArray(Charsets.UTF_8)
        val splitIndex = fullLine.indexOfFirst { (it.toInt() and 0xC0) == 0x80 }
        check(splitIndex > 0) { "fixture must contain a multi-byte UTF-8 continuation byte" }

        // Simulate the network delivering this line's bytes in two chunks, with
        // the boundary landing INSIDE the multi-byte character.
        val chunk1 = fullLine.copyOfRange(0, splitIndex)
        val chunk2 = fullLine.copyOfRange(splitIndex, fullLine.size)

        val fromFirstChunk = splitter.consume(chunk1)
        assertEquals("no line should complete mid-character", emptyList<String>(), fromFirstChunk)

        val fromSecondChunk = splitter.consume(chunk2)
        assertEquals(listOf("café is déjà vu"), fromSecondChunk)
    }

    @Test
    fun multiByteCharacterSplitAcrossThreeChunksStillDecodesWhole() {
        val splitter = ByteLineSplitter()
        val fullLine = "emoji: 😀 done\n".toByteArray(Charsets.UTF_8) // grinning face, 4-byte UTF-8
        val third = fullLine.size / 3
        val chunk1 = fullLine.copyOfRange(0, third)
        val chunk2 = fullLine.copyOfRange(third, third * 2)
        val chunk3 = fullLine.copyOfRange(third * 2, fullLine.size)

        val collected = mutableListOf<String>()
        collected += splitter.consume(chunk1)
        collected += splitter.consume(chunk2)
        collected += splitter.consume(chunk3)

        assertEquals(listOf("emoji: 😀 done"), collected)
    }
}
