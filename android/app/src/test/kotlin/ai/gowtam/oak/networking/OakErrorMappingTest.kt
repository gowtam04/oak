package ai.gowtam.oak.networking

import okhttp3.Headers
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
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
 * -> success, `401` -> [OakError.Unauthorized], `429 (+Retry-After)` ->
 * [OakError.RateLimited] (numeric and HTTP-date forms), other non-2xx with a
 * `{ code, message }` envelope -> [OakError.Http], and a transport failure ->
 * [OakError.Transport]. Mirrors iOS `OakErrorMappingTests`.
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
