package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.OakJson
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
private val EMPTY_JSON_BODY: RequestBody = "{}".toRequestBody(JSON_MEDIA_TYPE)

/**
 * The single owner of the app's [OkHttpClient], base URL, and JSON coder, and
 * the only place that turns an [Endpoint] into a live request
 * (component-design.md "Networking layer"; conventions.md "Module
 * boundaries" — only `networking` constructs OkHttp `Request`s). Services
 * depend on this type to make typed requests; `SseClient` (P3) borrows it for
 * the chat/assistant byte streams so the Bearer header and base URL are
 * attached identically.
 *
 * OkHttp is thread-safe, so — unlike iOS's `actor OakAPIClient` — this is a
 * plain class shared across coroutines; no extra synchronization is needed.
 *
 * [baseUrl] is trusted as-is: HTTPS enforcement for the app's real backend
 * lives in [BaseUrl] (the only place production code resolves its base URL),
 * which keeps this client free to point at a plain-http `MockWebServer` in
 * tests. `OkHttpClient` has no `CookieJar` configured here by default —
 * callers that need one pass a client without one (Android never uses
 * cookies, DADR-2).
 */
class OakApiClient(
    private val baseUrl: HttpUrl,
    private val tokenStore: TokenStore,
    private val client: OkHttpClient = OkHttpClient(),
) {
    /**
     * A dedicated client for the long-lived SSE byte streams (chat / assistant /
     * turn resume). Derived from [client] so it inherits any test configuration
     * (e.g. a plain-http `MockWebServer` client), but with the read/call timeouts
     * DISABLED: an SSE stream is quiet for long stretches (the agent thinking or
     * running tools) with only a `: keep-alive` comment every 15s, so OkHttp's
     * default 10s read timeout — shorter than that heartbeat — would abort a live
     * turn (background-turns/design.md §6.3, the latent-timeout fix). The connect
     * timeout stays bounded (a stream that never opens should still fail fast).
     * Non-streaming JSON calls keep [client]'s normal timeouts.
     */
    private val streamingClient: OkHttpClient = streamingClientFrom(client)
    /** Performs [endpoint] and decodes its 2xx body with [deserializer]. */
    @OptIn(ExperimentalSerializationApi::class)
    suspend fun <T> send(endpoint: Endpoint, deserializer: DeserializationStrategy<T>): T {
        val bytes = perform(endpoint)
        return try {
            OakJson.decodeFromString(deserializer, bytes.decodeToString())
        } catch (e: SerializationException) {
            throw OakError.Decoding(deserializer.descriptor.serialName)
        } catch (e: IllegalArgumentException) {
            throw OakError.Decoding(deserializer.descriptor.serialName)
        }
    }

    /** Performs [endpoint] and discards its 2xx body (e.g. `{ ok: true }`). */
    suspend fun sendNoContent(endpoint: Endpoint) {
        perform(endpoint)
    }

    /** Performs [endpoint] and returns the raw 2xx body (exports, attachments). */
    suspend fun sendBytes(endpoint: Endpoint): ByteArray = perform(endpoint)

    /**
     * Opens a streaming (SSE) connection for [endpoint] and returns the raw
     * [Response] once the status is 2xx — the body is left open (not
     * `.use`-closed) for `SseClient` to read as it streams in. Used for
     * `POST /api/chat` and `POST /api/teams/assistant`: it attaches the
     * Bearer header + base URL exactly like a normal request, then overrides
     * `Accept` to `text/event-stream`.
     *
     * A **pre-stream HTTP failure** (rate limit, 413, 503, …) is mapped here
     * and thrown as an [OakError]: the small `{ code, message }` body is read
     * off the response and run through [OakError.validate].
     */
    suspend fun openByteStream(endpoint: Endpoint): Response {
        val request = buildRequest(endpoint, accept = "text/event-stream")
        val response = try {
            streamingClient.newCall(request).await()
        } catch (e: IOException) {
            throw OakError.transportFailure(e)
        }
        if (response.isSuccessful) return response
        val body = response.body?.bytes() ?: ByteArray(0)
        val code = response.code
        response.close()
        // A `409 turn_in_progress` carries the running turn's id so the client can
        // reattach instead of erroring (background-turns/design.md §4 / BT-5).
        if (code == 409) {
            decodeTurnInProgress(body)?.let { throw TurnInProgressSignal(it) }
        }
        val mapped = OakError.validate(code, response.headers, body).exceptionOrNull()
        throw (mapped as? OakError) ?: OakError.Transport("unexpected_status_$code")
    }

    /**
     * Runs a non-streaming request and returns the validated 2xx body bytes,
     * mapping every failure to [OakError].
     */
    private suspend fun perform(endpoint: Endpoint): ByteArray {
        val request = buildRequest(endpoint, accept = "application/json")
        val response = try {
            client.newCall(request).await()
        } catch (e: IOException) {
            throw OakError.transportFailure(e)
        }
        response.use {
            val body = it.body?.bytes() ?: ByteArray(0)
            return OakError.validate(it.code, it.headers, body).getOrThrow()
        }
    }

    /**
     * Resolves the token (when the endpoint wants auth) and assembles the
     * request.
     */
    private fun buildRequest(endpoint: Endpoint, accept: String): Request {
        val token = if (endpoint.requiresAuth) tokenStore.token() else null
        val url = resolveUrl(endpoint)
        val requestBody = endpoint.body?.toRequestBody(JSON_MEDIA_TYPE)

        val builder = Request.Builder()
            .url(url)
            .header("Accept", accept)
            // First-party platform identity for admin turn_record.client.
            .header("X-Oak-Client", "android")
        if (endpoint.requiresAuth && token != null) {
            builder.header("Authorization", "Bearer $token")
        }
        when (endpoint.method) {
            Endpoint.Method.GET -> builder.get()
            Endpoint.Method.DELETE -> if (requestBody != null) builder.delete(requestBody) else builder.delete()
            Endpoint.Method.POST -> builder.post(requestBody ?: EMPTY_JSON_BODY)
            Endpoint.Method.PUT -> builder.put(requestBody ?: EMPTY_JSON_BODY)
            Endpoint.Method.PATCH -> builder.patch(requestBody ?: EMPTY_JSON_BODY)
        }
        if (requestBody != null) {
            builder.header("Content-Type", "application/json")
        }
        return builder.build()
    }

    /** Builds the final URL: [baseUrl] + [Endpoint.path] (absolute-path resolve) + query items. */
    private fun resolveUrl(endpoint: Endpoint): HttpUrl {
        val resolved = baseUrl.resolve(endpoint.path) ?: throw OakError.Transport("invalid_url")
        if (endpoint.queryItems.isEmpty()) return resolved
        val builder = resolved.newBuilder()
        endpoint.queryItems.forEach { (name, value) -> builder.addQueryParameter(name, value) }
        return builder.build()
    }

    companion object {
        /**
         * Builds the SSE streaming client from [base]: read + call timeouts set to
         * 0 (disabled) so a long, heartbeat-punctuated turn is never aborted, while
         * the connect timeout stays bounded (default 10s if [base] didn't set one).
         * `internal` so the timeout policy is unit-testable directly.
         */
        internal fun streamingClientFrom(base: OkHttpClient): OkHttpClient =
            base.newBuilder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .callTimeout(0, TimeUnit.MILLISECONDS)
                .build()
    }
}

/**
 * A chat control signal (NOT an [OakError] — deliberately outside that sealed
 * hierarchy so it doesn't force an exhaustive-`when` branch on every generic
 * error-to-banner mapping): `POST /api/chat` answered `409 turn_in_progress`
 * because a durable turn is already generating for this conversation
 * (background-turns/design.md §4 / BT-5). [turnId] is the running turn's id; the
 * chat reducer catches this on the stream-consume path and reattaches to it
 * instead of surfacing an error. Any other consumer treats it as a generic drop.
 */
class TurnInProgressSignal(val turnId: String) : Exception()

/** The `409` body shape when a chat turn is already generating for the conversation
 * (`{ code, message, turn_id }`) — only the discriminating [code] and [turnId] matter. */
@Serializable
private data class TurnInProgressBody(
    val code: String,
    @SerialName("turn_id") val turnId: String? = null,
)

/**
 * Extracts the running turn's id from a `409` body iff it is the
 * `turn_in_progress` envelope carrying a `turn_id`; `null` for any other `409`
 * (which then falls through to the ordinary HTTP error mapping).
 */
private fun decodeTurnInProgress(body: ByteArray): String? = try {
    val decoded = OakJson.decodeFromString(TurnInProgressBody.serializer(), body.decodeToString())
    if (decoded.code == "turn_in_progress") decoded.turnId else null
} catch (e: SerializationException) {
    null
} catch (e: IllegalArgumentException) {
    null
}

/**
 * Suspends until the call completes, resuming with the [Response] or
 * throwing the underlying [IOException]. Cancelling the collecting coroutine
 * cancels the OkHttp [Call] (conventions.md "Concurrency").
 */
private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    enqueue(
        object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) cont.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                if (cont.isActive) cont.resume(response) else response.close()
            }
        },
    )
    cont.invokeOnCancellation {
        runCatching { cancel() }
    }
}
