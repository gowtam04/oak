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
