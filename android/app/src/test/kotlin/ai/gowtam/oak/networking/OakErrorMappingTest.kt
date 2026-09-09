package ai.gowtam.oak.networking

import okhttp3.Headers
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Verifies the `(status, Headers, body) -> success | OakError` mapping
 * ([OakError.validate]) and the transport-error wrapper
 * ([OakError.transportFailure]) against api-usage.md "Error mapping": `2xx`
 * -> success, `401` -> [OakError.Unauthorized], `429` `rate_limited`
 * (+Retry-After) -> [OakError.RateLimited] (numeric and HTTP-date forms),
 * `429` `daily_limit` / other non-2xx with a `{ code, message }` envelope ->
 * [OakError.Http] (spend-controls SC-AC-5.4 / SC-AC-6.5 / SC-BR-14 — a 429
 * must not collapse `daily_limit` into [OakError.RateLimited]), and a
 * transport failure -> [OakError.Transport]. Mirrors iOS `OakErrorMappingTests`.
 */
class OakErrorMappingTest {

    private fun headers(vararg pairs: Pair<String, String>): Headers =
        Headers.Builder().apply { pairs.forEach { (name, value) -> add(name, value) } }.build()

    @Test
    fun twoHundredReturnsBody() {
        val body = "{\"ok\":true}".toByteArray()
        val result = OakError.validate(200, headers(), body)
        assertTrue(result.isSuccess)
        assertArrayEquals(body, result.getOrNull())
    }

    @Test
    fun twoOhFourReturnsEmptyBody() {
        val result = OakError.validate(204, headers(), ByteArray(0))
        assertTrue(result.isSuccess)
    }

    @Test
    fun unauthorizedMapsToUnauthorized() {
        val result = OakError.validate(401, headers(), ByteArray(0))
        assertEquals(OakError.Unauthorized, result.exceptionOrNull())
    }

    @Test
    fun rateLimitedParsesNumericRetryAfter() {
        val result = OakError.validate(429, headers("Retry-After" to "30"), ByteArray(0))
        assertEquals(OakError.RateLimited(30), result.exceptionOrNull())
    }

    @Test
    fun rateLimitedWithoutRetryAfterHasNullDelta() {
        val result = OakError.validate(429, headers(), ByteArray(0))
        assertEquals(OakError.RateLimited(null), result.exceptionOrNull())
    }

    @Test
    fun rateLimitedParsesHttpDateRetryAfter() {
        val future = ZonedDateTime.now(ZoneOffset.UTC).plusSeconds(120)
        val formatted = future.format(DateTimeFormatter.RFC_1123_DATE_TIME)
        val result = OakError.validate(429, headers("Retry-After" to formatted), ByteArray(0))
        val err = result.exceptionOrNull() as OakError.RateLimited
        assertNotNull(err.retryAfterSeconds)
        // Allow a little slack for wall-clock skew between formatting and validating.
        assertTrue(err.retryAfterSeconds!! in 100..140)
    }

    @Test
    fun rateLimitedWithGarbageRetryAfterHasNullDelta() {
        val result = OakError.validate(429, headers("Retry-After" to "not-a-date"), ByteArray(0))
        assertEquals(OakError.RateLimited(null), result.exceptionOrNull())
    }

    @Test
    fun rateLimitedEnvelopeOn429StaysRateLimited() {
        // Per-minute limiter (SC-BR-7): 429 `rate_limited` is still RateLimited
        // even when the body carries the shared `{ code, message }` envelope.
        val body = "{\"code\":\"rate_limited\",\"message\":\"Too many requests\"}".toByteArray()
        val result = OakError.validate(429, headers("Retry-After" to "20"), body)
        assertEquals(OakError.RateLimited(20), result.exceptionOrNull())
    }

    @Test
    fun dailyLimit429IsHttpNotRateLimited() {
        // Daily cap (SC-AC-5.4 / SC-BR-14): 429 `daily_limit` ships Retry-After
        // like the per-minute limiter, but must surface as Http so the banner
        // can show the server message and hide Retry. Collapsing it into
        // RateLimited is the pre-Phase-4 bug.
        val message = "Daily limit reached. Try again tomorrow (resets at 2026-09-07T00:00:00.000Z UTC)."
        val body = ("{\"code\":\"daily_limit\",\"message\":\"$message\"," +
            "\"reset_at\":\"2026-09-07T00:00:00.000Z\"}").toByteArray()
        val result = OakError.validate(429, headers("Retry-After" to "45"), body)
        val err = result.exceptionOrNull()
        assertFalse("429 daily_limit must not be RateLimited", err is OakError.RateLimited)
        assertEquals(OakError.Http(429, "daily_limit", message), err)
    }

    @Test
    fun dailyLimit429WithoutRetryAfterIsStillHttp() {
        val message = "Daily limit reached. Try again tomorrow (resets at 2026-09-07T00:00:00.000Z UTC)."
        val body = "{\"code\":\"daily_limit\",\"message\":\"$message\"}".toByteArray()
        val result = OakError.validate(429, headers(), body)
        val err = result.exceptionOrNull()
        assertFalse("429 daily_limit must not be RateLimited", err is OakError.RateLimited)
        assertEquals(OakError.Http(429, "daily_limit", message), err)
    }

    @Test
    fun accountDenied403IsHttpWithCodeAndMessage() {
        val message = "This account can't use chat."
        val body = "{\"code\":\"account_denied\",\"message\":\"$message\"}".toByteArray()
        val result = OakError.validate(403, headers(), body)
        assertEquals(OakError.Http(403, "account_denied", message), result.exceptionOrNull())
    }

    @Test
    fun clientErrorDecodesCodeMessageEnvelope() {
        val body = "{\"code\":\"invalid_request\",\"message\":\"Bad body\"}".toByteArray()
        val result = OakError.validate(400, headers(), body)
        assertEquals(OakError.Http(400, "invalid_request", "Bad body"), result.exceptionOrNull())
    }

    @Test
    fun serverErrorDecodesCodeMessageEnvelope() {
        val body = "{\"code\":\"model_unavailable\",\"message\":\"Down\"}".toByteArray()
        val result = OakError.validate(503, headers(), body)
        assertEquals(OakError.Http(503, "model_unavailable", "Down"), result.exceptionOrNull())
    }

    @Test
    fun nonEnvelopeBodyFallsBackToUnknownCode() {
        val result = OakError.validate(500, headers(), "not json".toByteArray())
        assertEquals(OakError.Http(500, "unknown", ""), result.exceptionOrNull())
    }

    @Test
    fun transportFailureWrapsIOException() {
        val mapped = OakError.transportFailure(IOException("boom"))
        assertEquals("IOException", mapped.underlying)
    }

    @Test
    fun transportFailureWrapsArbitraryThrowable() {
        class Boom : Exception()
        val mapped = OakError.transportFailure(Boom())
        assertTrue(mapped.underlying.isNotBlank())
    }
}
