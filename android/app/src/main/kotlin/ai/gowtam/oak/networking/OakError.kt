package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.ApiErrorBody
import ai.gowtam.oak.wire.OakJson
import kotlinx.serialization.SerializationException
import okhttp3.Headers
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * The single typed error domain for the networking + service layers
 * (conventions.md "Error handling", api-usage.md "Error mapping").
 *
 * Everything that can fail a network call surfaces as one of these cases, so
 * view models have a single thing to `catch` and map to UI state. **In-domain
 * failures are NOT errors** — a non-`answered` `OakAnswer`, an entity
 * `not_found`/`unavailable`, and team `validation` warnings are normal
 * *values* returned and rendered, never thrown (mirrors the backend's "never
 * throw in-domain" stance; mirrors iOS `OakError`). Reserved for
 * transport/HTTP-level faults.
 */
sealed class OakError : Exception() {
    /**
     * No connection / an OkHttp (transport) failure with no usable HTTP
     * response. [underlying] is a short, non-sensitive diagnostic label
     * (never a payload, token, or message).
     */
    data class Transport(val underlying: String) : OakError()

    /**
     * A non-2xx response carrying the `{ code, message }` envelope (4xx/5xx
     * that is neither a 401 nor a per-minute 429). Spend-control daily-cap
     * refusals (`429` `daily_limit`) land here so banners can show the
     * server message instead of the per-minute rate-limit copy.
     */
    data class Http(val status: Int, val code: String, override val message: String) : OakError()

    /**
     * Per-minute `429 Too Many Requests` (`rate_limited`, or a 429 with no
     * envelope). [retryAfterSeconds] is parsed from the `Retry-After` header
     * when present (numeric delta-seconds, or an HTTP-date converted to a
     * delta). A `429` whose body `code` is `daily_limit` is [Http], not this.
     */
    data class RateLimited(val retryAfterSeconds: Long?) : OakError()

    /**
     * `401 Unauthorized` on a call that carried (or required) a Bearer
     * token — the client drops the token, returns to guest, and prompts
     * re-sign-in.
     */
    object Unauthorized : OakError()

    /**
     * A DTO mismatch decoding a 2xx body. Should be impossible if the
     * Kotlin DTOs mirror the wire (guarded by the P1 fixture-decode tests).
     * [typeName] is the offending serial name, never the payload.
     */
    data class Decoding(val typeName: String) : OakError()

    /** An attached image failed the client-side caps before the request opened. */
    data class ImageRejected(val reason: ImageRejectReason) : OakError()

    companion object {
        /**
         * Maps a completed HTTP response to either the success body or an
         * [OakError] (api-usage.md "Error mapping"):
         *   * `2xx`                            → success(body)
         *   * `401`                            → [Unauthorized]
         *   * `429` `daily_limit`              → [Http] (spend-controls
         *     SC-AC-5.4 / SC-BR-14 — must not collapse into [RateLimited])
         *   * other `429` (+ optional `Retry-After`) → [RateLimited]
         *   * any other non-2xx                → [Http] from the
         *     `{ code, message }` envelope
         *
         * Transport faults never reach here (there is no HTTP response); the
         * caller wraps a thrown [java.io.IOException] via [transportFailure].
         */
        fun validate(status: Int, headers: Headers, body: ByteArray): Result<ByteArray> = when (status) {
            in 200..299 -> Result.success(body)
            401 -> Result.failure(Unauthorized)
            429 -> Result.failure(map429(headers, body))
            else -> Result.failure(httpError(status, body))
        }

        /**
         * Wraps a thrown transport/OkHttp error into [Transport]. The label
         * is a stable, non-sensitive identifier (the exception's type name)
         * — never the request body or any user data.
         */
        fun transportFailure(error: Throwable): Transport =
            Transport(error::class.simpleName ?: "unknown")

        /**
         * Denylist (`account_denied`) and daily-cap (`daily_limit`) refusals —
         * banners show the server message and hide Retry (SC-AC-5.4 / SC-BR-14).
         * The per-minute `rate_limited` code is not this.
         */
        fun isSpendControlRefusal(code: String): Boolean =
            code == "account_denied" || code == "daily_limit"

        /**
         * A 429 is the per-minute limiter ([RateLimited]) unless the body
         * envelope is `daily_limit`, which must surface as [Http] so the
         * banner can show the server reset copy and hide Retry.
         */
        private fun map429(headers: Headers, body: ByteArray): OakError {
            val envelope = decodeEnvelope(body)
            return if (envelope?.code == "daily_limit") {
                Http(429, envelope.code, envelope.message)
            } else {
                RateLimited(retryAfterSeconds(headers))
            }
        }

        /**
         * Builds an [Http] error from a non-2xx (non-401 / non-per-minute-429)
         * body, decoding the shared `{ code, message }` envelope when present.
         */
        private fun httpError(status: Int, body: ByteArray): OakError {
            val envelope = decodeEnvelope(body)
            return if (envelope != null) {
                Http(status, envelope.code, envelope.message)
            } else {
                Http(status, "unknown", "")
            }
        }

        private fun decodeEnvelope(body: ByteArray): ApiErrorBody? = try {
            OakJson.decodeFromString(ApiErrorBody.serializer(), body.decodeToString())
        } catch (e: SerializationException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }

        /**
         * Parses the `Retry-After` header into seconds. Accepts a numeric
         * delta-seconds value (the form the backend sends) and falls back to
         * an HTTP-date, converting it to a delta from now.
         */
        private fun retryAfterSeconds(headers: Headers): Long? {
            val raw = headers["Retry-After"]?.trim() ?: return null
            raw.toLongOrNull()?.let { return it }
            return try {
                val date = ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME)
                maxOf(0L, Duration.between(Instant.now(), date.toInstant()).seconds)
            } catch (e: DateTimeParseException) {
                null
            }
        }
    }
}

/**
 * Why the client rejected an attached image before sending (mirrors the
 * server's `@/server/image-upload` caps so the user gets a fast, local
 * reason).
 */
enum class ImageRejectReason {
    /** More than 4 images attached. */
    TooMany,

    /** A single image exceeds the per-image decoded-byte cap. */
    PerImageTooLarge,

    /** The images together exceed the total decoded-byte cap. */
    TotalTooLarge,

    /** The image is not one of the accepted types (JPEG/PNG/GIF/WebP). */
    UnsupportedType,
}
