package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SseEvent
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable

/**
 * The contract implemented by [SseParser] and [BuilderSseParser] (component-design.md
 * "Networking layer", mirrors iOS `SSELineParser`): feed one line at a time and get back
 * the events completed by that line (zero or one for a well-formed stream — a blank line
 * that closes a frame); [finish] flushes any buffered frame at end-of-stream (a
 * defensive backstop — well-formed streams end on a blank line, so the buffer is already
 * empty). [SseClient]'s stream loop is generic over this seam so the SAME byte/frame
 * plumbing serves the chat and team-builder event families with different event unions.
 */
interface SseLineParser<T> {
    /** Feeds one line (already newline-stripped by [ByteLineSplitter]). */
    fun consume(line: String): List<T>

    /** Flushes any buffered frame at end-of-stream. */
    fun finish(): List<T>
}

/**
 * One completed SSE frame's raw materials: the `event:` name and the joined `data:`
 * payload (each `data:` line joined by `\n` per the SSE spec).
 */
internal data class RawSseFrame(val name: String, val payload: String)

/**
 * Frame-accumulation logic shared by [SseParser] and [BuilderSseParser] so the
 * `event:`/`data:` line framing (identical for both event families) isn't duplicated —
 * only the per-event JSON decoding differs between the two. Pure and synchronous: no
 * I/O, no knowledge of any event schema.
 *
 * Accumulates field lines fed one at a time and completes a [RawSseFrame] on the blank
 * line that delimits an SSE event. Comment lines (a leading `:`, e.g. the `: keep-alive`
 * heartbeat sent every 15s) and unknown fields (`id`/`retry`) are ignored per the SSE
 * spec. A trailing `\r` left by [ByteLineSplitter] on CRLF input is stripped here.
 */
internal class SseFrameAccumulator {
    private var eventName: String? = null
    private val dataBuffer = StringBuilder()
    private var hasData = false

    /** Feeds one line. Returns the completed frame, or `null` if the frame isn't closed yet. */
    fun consume(rawLine: String): RawSseFrame? {
        val line = if (rawLine.endsWith("\r")) rawLine.dropLast(1) else rawLine

        if (line.isEmpty()) return dispatch()
        if (line.startsWith(":")) return null // comment / heartbeat

        val (field, value) = splitField(line)
        when (field) {
            "event" -> eventName = value
            "data" -> {
                if (hasData) dataBuffer.append('\n')
                dataBuffer.append(value)
                hasData = true
            }
            else -> Unit // id / retry / unknown field → ignored per SSE spec
        }
        return null
    }

    /** Flushes any buffered frame at end-of-stream. */
    fun finish(): RawSseFrame? = dispatch()

    private fun dispatch(): RawSseFrame? {
        val name = eventName
        val payload = dataBuffer.toString()
        val complete = hasData
        reset()
        if (name == null || !complete) return null // empty/incomplete frame (e.g. a trailing blank line)
        return RawSseFrame(name, payload)
    }

    private fun reset() {
        eventName = null
        dataBuffer.setLength(0)
        hasData = false
    }

    /**
     * Splits a `field: value` SSE line, stripping a single optional leading space from
     * the value (per the SSE spec). A line with no colon is a field with an empty value.
     */
    private fun splitField(line: String): Pair<String, String> {
        val colon = line.indexOf(':')
        if (colon < 0) return line to ""
        var valueStart = colon + 1
        if (valueStart < line.length && line[valueStart] == ' ') valueStart++
        return line.substring(0, colon) to line.substring(valueStart)
    }
}

/**
 * A pure, incremental Server-Sent-Events frame parser for the chat stream (mirrors iOS
 * `SSEParser`; component-design.md "Networking layer"). It delegates the `event:`/`data:`
 * line framing to [SseFrameAccumulator] and decodes each completed frame's `data:` JSON
 * into an [SseEvent].
 *
 * **No I/O** — the caller ([SseClient]) feeds it lines fed off [ByteLineSplitter] one at a
 * time; this keeps the parser trivially unit-testable against recorded `.sse` fixtures.
 *
 * Decoding policy:
 *  - a recognized event whose `data:` JSON fails to decode throws [OakError.Decoding] (a
 *    contract drift the consumer surfaces) — the only thing that fails the stream from
 *    inside the parser;
 *  - an **unknown** event name is ignored (forward-compatible with new events);
 *  - comment lines, unknown fields, and empty/incomplete frames emit nothing.
 */
class SseParser : SseLineParser<SseEvent> {
    private val frames = SseFrameAccumulator()

    override fun consume(line: String): List<SseEvent> = dispatch(frames.consume(line))

    override fun finish(): List<SseEvent> = dispatch(frames.finish())

    private fun dispatch(frame: RawSseFrame?): List<SseEvent> {
        val (name, payload) = frame ?: return emptyList()
        return try {
            when (name) {
                "scope" -> {
                    val data = OakJson.decodeFromString(ScopeData.serializer(), payload)
                    listOf(SseEvent.Scope(format = data.format, source = data.source))
                }
                "tool_activity" -> {
                    val data = OakJson.decodeFromString(ToolActivityData.serializer(), payload)
                    listOf(SseEvent.ToolActivity(tool = data.tool, label = data.label))
                }
                "answer_start" -> listOf(SseEvent.AnswerStart)
                "answer_delta" -> {
                    val data = OakJson.decodeFromString(AnswerDeltaData.serializer(), payload)
                    listOf(SseEvent.AnswerDelta(text = data.text))
                }
                "answer" -> {
                    val data = OakJson.decodeFromString(AnswerData.serializer(), payload)
                    listOf(SseEvent.Answer(data.answer))
                }
                "error" -> {
                    val data = OakJson.decodeFromString(ErrorData.serializer(), payload)
                    listOf(SseEvent.Error(code = data.code, message = data.message, status = data.status))
                }
                else -> emptyList() // unknown event name → forward-compatible no-op
            }
        } catch (e: SerializationException) {
            throw OakError.Decoding("SseEvent.$name")
        } catch (e: IllegalArgumentException) {
            throw OakError.Decoding("SseEvent.$name")
        }
    }

    @Serializable
    private data class ScopeData(val format: Format, val source: ScopeSource)

    @Serializable
    private data class ToolActivityData(val tool: String, val label: String)

    @Serializable
    private data class AnswerDeltaData(val text: String)

    @Serializable
    private data class AnswerData(val answer: OakAnswer)

    @Serializable
    private data class ErrorData(val code: String, val message: String, val status: Int? = null)
}
