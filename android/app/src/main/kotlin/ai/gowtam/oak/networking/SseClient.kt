package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.SseEvent
import ai.gowtam.oak.wire.TeamsAssistantRequest
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.Response
import okio.Buffer

/**
 * Opens the chat/team-builder byte streams and turns them into cold `Flow`s of decoded
 * events (component-design.md "Networking layer"). Borrows [OakApiClient] for the Bearer
 * header + base URL + the pre-stream error mapping in [OakApiClient.openByteStream],
 * splits the response bytes into lines via [ByteLineSplitter] (NOT a line reader that
 * drops the empty lines SSE needs to delimit frames — see [ByteLineSplitter]'s doc),
 * feeds each line through the endpoint's [SseLineParser], and emits decoded events.
 *
 * Error contract (api-usage.md "Error mapping"):
 *  - **Pre-stream HTTP failure** (rate limit, 413, 503, …): already mapped and thrown by
 *    [OakApiClient.openByteStream] before this class sees a response — so it surfaces
 *    before any event is emitted.
 *  - **Transport drop mid-stream**: a body-read `IOException` is caught and rethrown as
 *    [OakError.Transport].
 *  - **SSE `error` event**: yielded as [SseEvent.Error]/[BuilderSseEvent.Error], then the
 *    flow completes normally (transport faults ride this in-band event only when the
 *    server itself detected them; a raw connection drop is the case above).
 *
 * The returned `Flow` is cold (nothing runs until collected) and cancellable: cancelling
 * the collecting coroutine closes the underlying OkHttp response/call promptly, even
 * while a blocking body read is in flight, via a completion handler registered on the
 * upstream job (see [openEventStream]).
 */
class SseClient(private val apiClient: OakApiClient) {

    /** Opens the stream for one chat turn (`POST /api/chat`, guest or signed-in). */
    fun stream(request: ChatRequest): Flow<SseEvent> {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/chat",
            body = Endpoint.jsonBody(ChatRequest.serializer(), request),
            requiresAuth = true,
        )
        return openEventStream(endpoint) { SseParser() }
    }

    /**
     * Reattaches to a durable turn's live stream
     * (`GET /api/chat/turns/:id/stream?session_id=…`; background-turns/design.md §4).
     * The server replays the turn's full buffered event list from the start (the
     * client rebuilds its in-flight UI on the `turn` frame) then tails live until a
     * terminal event; a turn that is already terminal ends the replay with its
     * terminal event and closes — so reattach-mid-flight and reattach-after-completion
     * are one code path. An unknown/expired turn is a pre-stream `404` →
     * [OakError.Http] thrown before any event (the caller treats it as a dead turn).
     */
    fun resume(turnId: String, sessionId: String): Flow<SseEvent> {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/chat/turns/$turnId/stream",
            queryItems = listOf("session_id" to sessionId),
            requiresAuth = true,
        )
        return openEventStream(endpoint) { SseParser() }
    }

    /**
     * Explicitly stops a durable turn (`POST /api/chat/turns/:id/stop`;
     * background-turns/design.md §4 / BT-4): the server aborts generation, the turn
     * transitions to `stopped`, and nothing is persisted. A non-streaming JSON call
     * (borrows [OakApiClient] like the streams do): the Bearer header identifies a
     * signed-in owner; a guest is authorized by the `{ session_id }` body. Stopping
     * an unknown or already-terminal turn is a server-side no-op. Failures surface as
     * an [OakError] — the caller tears down its local stream regardless.
     */
    suspend fun stop(turnId: String, sessionId: String) {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/chat/turns/$turnId/stop",
            body = Endpoint.jsonBody(StopTurnBody.serializer(), StopTurnBody(sessionId)),
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    /**
     * Opens the stream for one team-builder assistant turn (`POST /api/teams/assistant`,
     * signed-in only — a guest's missing Bearer surfaces as a `401` →
     * [OakError.Unauthorized] thrown before any event).
     */
    fun streamBuilder(request: TeamsAssistantRequest): Flow<BuilderSseEvent> {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/teams/assistant",
            body = Endpoint.jsonBody(TeamsAssistantRequest.serializer(), request),
            requiresAuth = true,
        )
        return openEventStream(endpoint) { BuilderSseParser() }
    }

    /**
     * The shared SSE stream loop, generic over the frame parser. Opens the byte stream,
     * splits bytes into lines ourselves preserving empty lines, feeds each line through
     * `parser`, and emits decoded events; flushes a trailing unterminated line
     * ([ByteLineSplitter.finish]) and the parser's own end-of-stream flush
     * ([SseLineParser.finish]) once the body is exhausted.
     *
     * Runs on [Dispatchers.IO] since the body read is a blocking Okio call. A completion
     * handler on the upstream job closes the OkHttp [Response] the instant the flow is
     * cancelled — a plain `try/finally` alone would only close it once the blocking read
     * unblocks naturally (i.e. once the next chunk arrives), which could be never.
     */
    private fun <T> openEventStream(
        endpoint: Endpoint,
        makeParser: () -> SseLineParser<T>,
    ): Flow<T> = flow {
        val response = apiClient.openByteStream(endpoint)
        val closeOnCancel = currentCoroutineContext()[Job]?.invokeOnCompletion { response.close() }
        try {
            emitFrom(response, makeParser())
        } catch (e: IOException) {
            throw OakError.transportFailure(e)
        } finally {
            closeOnCancel?.dispose()
            response.close()
        }
    }.flowOn(Dispatchers.IO)

    private suspend fun <T> kotlinx.coroutines.flow.FlowCollector<T>.emitFrom(
        response: Response,
        parser: SseLineParser<T>,
    ) {
        val source = response.body?.source() ?: throw OakError.Transport("empty_body")
        val splitter = ByteLineSplitter()
        val readBuffer = Buffer()
        while (true) {
            val read = source.read(readBuffer, CHUNK_BYTES)
            if (read == -1L) break
            val chunk = readBuffer.readByteArray()
            for (line in splitter.consume(chunk)) {
                for (event in parser.consume(line)) emit(event)
            }
        }
        splitter.finish()?.let { line ->
            for (event in parser.consume(line)) emit(event)
        }
        for (event in parser.finish()) emit(event)
    }

    private companion object {
        const val CHUNK_BYTES = 8192L
    }
}

/** `POST /api/chat/turns/:id/stop` body — the guest ownership proof (ignored for a
 * signed-in caller, who is identified by the Bearer token). */
@Serializable
private data class StopTurnBody(@SerialName("session_id") val sessionId: String)
