package ai.gowtam.oak.services

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.SseClient
import ai.gowtam.oak.wire.ChatImage
import ai.gowtam.oak.wire.ChatRecovery
import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.SseEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * One chat turn → a live [SseEvent] stream (component-design.md "Services layer";
 * mirrors iOS `ChatService`). View models depend on this **interface** (never
 * `LiveChatService`) so they unit-test against a fake.
 *
 * [send] is synchronous and returns the [Flow] immediately: image encoding runs
 * eagerly, in the caller's context, BEFORE the stream opens. A cap/type violation
 * surfaces as a thrown [OakError.ImageRejected] the moment the returned flow is
 * collected — before any event is emitted. Pre-stream HTTP failures (rate limit,
 * 413, 503, …) surface the same way; an in-band SSE `error` event arrives as
 * [SseEvent.Error]. Every in-domain failure rides a normal [SseEvent.Answer] whose
 * `OakAnswer.status` carries the failure — never the `error` channel.
 */
interface ChatService {
    /**
     * Opens the chat stream for one turn (`POST /api/chat`), encoding [images] via
     * [ImageEncoder] before the request is sent.
     *
     * - [sessionId]: the client thread UUID (equals the conversation id on resume).
     * - [message]: 0–2000 chars; MAY be empty when [images] are attached.
     * - [images]: attached photos (≤4), encoded to raw base64 with the client-side
     *   caps enforced by [ImageEncoder]. A cap/type violation finishes the returned
     *   flow by throwing [OakError.ImageRejected].
     * - [scopeSeed]: an explicit scope pick from the header chip, sent as
     *   `scope_seed`; `null` ⇒ no pick (server precedence resolves the scope). Scope
     *   is otherwise server-controlled — the model never sees it as a tool input.
     *
     * Saved teams are referenced **by name in chat** (resolved server-side), so the
     * body carries no team id.
     */
    fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
    ): Flow<SseEvent>

    /**
     * Same as [send] plus chat-qol recovery / mention fields. Default
     * implementation drops the extras so existing test doubles keep compiling.
     */
    fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
        recovery: ChatRecovery?,
        mentionedTeamIds: List<String>?,
    ): Flow<SseEvent> = send(sessionId, message, images, scopeSeed)

    /**
     * Text-only convenience: opens the stream for an already-built [request] with no
     * image encode step (e.g. a resend/retry that carries no new attachments).
     */
    fun send(request: ChatRequest): Flow<SseEvent>

    /**
     * Reattaches to a durable turn's live stream
     * (`GET /api/chat/turns/:id/stream`; background-turns/design.md §4). The stream
     * replays the turn's buffered events (the client rebuilds its in-flight UI on the
     * `turn` frame) then tails live until a terminal [SseEvent]; a turn that is
     * already terminal replays through its terminal event and closes. An unknown or
     * expired turn is a pre-stream `404` → [OakError.Http] thrown before any event
     * (the caller treats it as a dead turn).
     *
     * - [turnId]: the server-minted turn id captured from the `turn` event / the
     *   conversation's `active_turn`.
     * - [sessionId]: the conversation id, the guest ownership proof (ignored for a
     *   signed-in caller, identified by the Bearer token).
     */
    fun resume(turnId: String, sessionId: String): Flow<SseEvent>

    /**
     * Explicitly stops a durable turn (`POST /api/chat/turns/:id/stop`; BT-4): the
     * server aborts generation and discards it (nothing persisted). Stopping an
     * unknown or already-terminal turn is a no-op. A failure surfaces as an
     * [OakError]; callers tear down their local stream regardless.
     */
    suspend fun stop(turnId: String, sessionId: String)
}

/**
 * Production [ChatService] over [SseClient] (which borrows `OakApiClient` for the
 * Bearer header + base URL).
 */
class LiveChatService(
    private val sseClient: SseClient,
    private val imageEncoder: ImageEncoder = ImageEncoder(),
) : ChatService {

    override fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
    ): Flow<SseEvent> {
        // Encode + validate the attached images BEFORE opening the stream. `encode`
        // is synchronous and runs in the caller's context. A client cap/type
        // violation surfaces as a thrown OakError.ImageRejected from the returned
        // flow — never as a partially-attached turn.
        val encodedImages: List<ChatImage> = try {
            imageEncoder.encode(images)
        } catch (e: OakError) {
            return flow { throw e }
        }

        return send(
            ChatRequest(
                sessionId = sessionId,
                message = message,
                images = encodedImages.ifEmpty { null },
                scopeSeed = scopeSeed,
            ),
        )
    }

    override fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
        recovery: ChatRecovery?,
        mentionedTeamIds: List<String>?,
    ): Flow<SseEvent> {
        val encodedImages: List<ChatImage> = try {
            imageEncoder.encode(images)
        } catch (e: OakError) {
            return flow { throw e }
        }
        return send(
            ChatRequest(
                sessionId = sessionId,
                message = message,
                images = encodedImages.ifEmpty { null },
                scopeSeed = scopeSeed,
                recovery = recovery,
                mentionedTeamIds = mentionedTeamIds?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    override fun send(request: ChatRequest): Flow<SseEvent> = sseClient.stream(request)

    override fun resume(turnId: String, sessionId: String): Flow<SseEvent> =
        sseClient.resume(turnId, sessionId)

    override suspend fun stop(turnId: String, sessionId: String) = sseClient.stop(turnId, sessionId)
}
