package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Wire DTOs for `POST /api/chat` — the request body and the SSE event stream.
 * Faithful mirror of `web/src/lib/sse/sse-types.ts` (data-model.md "Wire DTOs").
 *
 * Saved teams are referenced **by name in chat** (resolved server-side via
 * `list_teams`/`get_team`), so there is no team id on this body; there is also
 * no `champions_mode` — the deprecated boolean is a server-side no-op below the
 * sticky scope and champions is the default, so Android never sends it (parity
 * with iOS `ChatWire.swift`).
 */
@Serializable
data class ChatRequest(
    /** Client UUID for the thread; equals the conversation id on resume. */
    @SerialName("session_id") val sessionId: String,
    /** 0–2000 chars; may be empty when one or more [images] are present. */
    val message: String,
    /** Images attached to this turn (≤ 4). `null` ⇒ a text-only turn. */
    val images: List<ChatImage>? = null,
    /**
     * An explicit scope pick from the header scope chip, applied as this turn's
     * seed. `null` ⇒ no pick, so the server falls through to the conversation's
     * sticky scope, else the champions default.
     */
    @SerialName("scope_seed") val scopeSeed: Format? = null,
)

/**
 * One image attached to a chat message (wire shape). `data` is RAW base64 with
 * no `data:` prefix; the server re-sniffs the bytes by magic number for the
 * canonical MIME type, so [mimeType] is only the client's best-effort declaration.
 */
@Serializable
data class ChatImage(
    /** Best-effort MIME type, e.g. `"image/jpeg"`. Intentionally camelCase on the wire. */
    val mimeType: String,
    /** RAW base64-encoded image bytes (no `data:` prefix). */
    val data: String,
)

/**
 * One decoded server-sent event from the chat stream (mirrors `SseEventName` in
 * `sse-types.ts`). Emission order: `scope` (once, first) → `tool_activity`* →
 * `answer_start` (zero or more) / `answer_delta` (zero or more) → exactly one
 * terminal `answer`. An [Error]
 * event is reserved for transport/API faults ONLY — every in-domain failure
 * rides a normal [Answer] event whose `OakAnswer.status` carries it. Decoding a
 * frame's `data:` JSON into one of these variants is the `SseParser`'s job (P3);
 * this type only models the event shapes.
 */
sealed interface SseEvent {
    /** `scope` — the server-resolved game scope for this turn, emitted once, first. */
    data class Scope(val format: Format, val source: ScopeSource) : SseEvent

    /** `tool_activity` — one per tool call, shown as progress while the loop runs. */
    data class ToolActivity(val tool: String, val label: String) : SseEvent

    /** `answer_start` — reset signal: the client clears its in-flight markdown buffer. */
    data object AnswerStart : SseEvent

    /** `answer_delta` — one incremental chunk of `answer_markdown`. */
    data class AnswerDelta(val text: String) : SseEvent

    /** `answer` — the single terminal, authoritative answer for the turn. */
    data class Answer(val answer: OakAnswer) : SseEvent

    /** `error` — transport/API fault only (never an in-domain failure). */
    data class Error(val code: String, val message: String, val status: Int?) : SseEvent
}

/**
 * How the server resolved a turn's scope — the `source` field of the `scope`
 * SSE event (`ScopeEvent.source` in `sse-types.ts`):
 *  - [Message] — an explicit in-message signal ("in gen 7, …");
 *  - [Seed] — the client's `scope_seed` chip pick (or a legacy `champions_mode`);
 *  - [Conversation] — the conversation's sticky scope;
 *  - [Default] — the champions default (no signal/seed/sticky).
 *
 * **Tolerant decoding** mirrors [Format]: the server can add a resolution
 * source independently of when this app ships, so an unrecognized value
 * degrades to [Unknown] rather than failing the frame's decode.
 */
@Serializable(with = ScopeSourceSerializer::class)
sealed interface ScopeSource {
    data object Message : ScopeSource
    data object Conversation : ScopeSource
    data object Seed : ScopeSource
    data object Default : ScopeSource

    /** A source string outside the known four — preserves the original wire value. */
    data class Unknown(val raw: String) : ScopeSource

    val rawValue: String
        get() = when (this) {
            Message -> "message"
            Conversation -> "conversation"
            Seed -> "seed"
            Default -> "default"
            is Unknown -> raw
        }

    companion object {
        fun fromRaw(raw: String): ScopeSource = when (raw) {
            "message" -> Message
            "conversation" -> Conversation
            "seed" -> Seed
            "default" -> Default
            else -> Unknown(raw)
        }
    }
}

object ScopeSourceSerializer : KSerializer<ScopeSource> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.ScopeSource", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: ScopeSource) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): ScopeSource {
        return ScopeSource.fromRaw(decoder.decodeString())
    }
}
