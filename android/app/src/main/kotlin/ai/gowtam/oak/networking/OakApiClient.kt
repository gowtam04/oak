package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.OakJson
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.ExperimentalSerializationApi
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
            client.newCall(request).await()
        } catch (e: IOException) {
            throw OakError.transportFailure(e)
        }
        if (response.isSuccessful) return response
        val body = response.body?.bytes() ?: ByteArray(0)
        response.close()
        val mapped = OakError.validate(response.code, response.headers, body).exceptionOrNull()
        throw (mapped as? OakError) ?: OakError.Transport("unexpected_status_${response.code}")
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

        val builder = Request.Builder().url(url).header("Accept", accept)
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
