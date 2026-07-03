package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.BuilderAnswer
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.OakJson
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable

/**
 * A pure, incremental SSE frame parser for the team-builder assistant stream — a
 * SIBLING of [SseParser] over the identical `event:`/`data:` framing (both share
 * [SseFrameAccumulator]), decoding the builder event union instead of the chat one. The
 * two differences that matter:
 *  - the terminal `answer` frame carries a [BuilderAnswer] (prose + optional
 *    `TeamPatch`), NOT an `OakAnswer`;
 *  - there is no `scope` event (`draft.format` is the turn's scope), so a stray `scope`
 *    frame — like any unknown event — is ignored (forward-compatible).
 *
 * Decoding policy matches [SseParser]: a recognized event whose `data:` JSON fails to
 * decode throws [OakError.Decoding]; unknown event names, comments, and incomplete
 * frames emit nothing.
 */
class BuilderSseParser : SseLineParser<BuilderSseEvent> {
    private val frames = SseFrameAccumulator()

    override fun consume(line: String): List<BuilderSseEvent> = dispatch(frames.consume(line))

    override fun finish(): List<BuilderSseEvent> = dispatch(frames.finish())

    private fun dispatch(frame: RawSseFrame?): List<BuilderSseEvent> {
        val (name, payload) = frame ?: return emptyList()
        return try {
            when (name) {
                "tool_activity" -> {
                    val data = OakJson.decodeFromString(ToolActivityData.serializer(), payload)
                    listOf(BuilderSseEvent.ToolActivity(tool = data.tool, label = data.label))
                }
                "answer_start" -> listOf(BuilderSseEvent.AnswerStart)
                "answer_delta" -> {
                    val data = OakJson.decodeFromString(AnswerDeltaData.serializer(), payload)
                    listOf(BuilderSseEvent.AnswerDelta(text = data.text))
                }
                "answer" -> {
                    val data = OakJson.decodeFromString(AnswerData.serializer(), payload)
                    listOf(BuilderSseEvent.Answer(data.answer))
                }
                "error" -> {
                    val data = OakJson.decodeFromString(ErrorData.serializer(), payload)
                    listOf(BuilderSseEvent.Error(code = data.code, message = data.message, status = data.status))
                }
                else -> emptyList() // unknown event name (incl. chat-only `scope`) → forward-compatible
            }
        } catch (e: SerializationException) {
            throw OakError.Decoding("BuilderSseEvent.$name")
        } catch (e: IllegalArgumentException) {
            throw OakError.Decoding("BuilderSseEvent.$name")
        }
    }

    @Serializable
    private data class ToolActivityData(val tool: String, val label: String)

    @Serializable
    private data class AnswerDeltaData(val text: String)

    @Serializable
    private data class AnswerData(val answer: BuilderAnswer)

    @Serializable
    private data class ErrorData(val code: String, val message: String, val status: Int? = null)
}
