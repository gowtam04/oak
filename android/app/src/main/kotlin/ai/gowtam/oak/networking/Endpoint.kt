package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.OakJson
import kotlinx.serialization.SerializationStrategy

/**
 * A declarative description of one REST request, turned into an OkHttp
 * `Request` by [OakApiClient] (conventions.md "Module boundaries" — only
 * `networking` constructs `Request`s; mirrors iOS `Endpoint`).
 *
 * An `Endpoint` is a pure value: path, method, query items, an optional
 * pre-encoded JSON body, and a [requiresAuth] flag. It does not know the base
 * URL, the client, or the token — those belong to [OakApiClient].
 *
 * [requiresAuth] means "attach the Bearer token when one is available": guest
 * turns simply send no `Authorization` header (the server treats the absence
 * as a guest), while a required-but-absent identity surfaces later as a
 * `401` ([OakError.Unauthorized]). Truly public endpoints set it `false`.
 *
 * [body] is already-JSON-encoded text rather than a generic `Encodable` —
 * Kotlin generics erase at runtime, so encoding happens once at the call
 * site (via [jsonBody]) instead of being deferred into the client.
 */
data class Endpoint(
    val method: Method,
    val path: String,
    val queryItems: List<Pair<String, String>> = emptyList(),
    val body: String? = null,
    val requiresAuth: Boolean,
) {
    /** The HTTP verbs the Oak API uses. */
    enum class Method { GET, POST, PUT, PATCH, DELETE }

    companion object {
        /** Encodes [value] with [serializer] into the JSON text an [Endpoint] body expects. */
        fun <T> jsonBody(serializer: SerializationStrategy<T>, value: T): String =
            OakJson.encodeToString(serializer, value)
    }
}
