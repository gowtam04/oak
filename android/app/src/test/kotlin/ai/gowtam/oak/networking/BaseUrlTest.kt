package ai.gowtam.oak.networking

import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

/**
 * Verifies [BaseUrl]'s HTTPS enforcement (api-usage.md "Base URL";
 * conventions.md — client-side backstop to the platform Network Security
 * Config). This is the "a non-HTTPS base URL fails fast as
 * `Transport("insecure_scheme")`" acceptance check; it's exercised here
 * directly (no MockWebServer) rather than inside `OakApiClient`, which
 * itself trusts the [okhttp3.HttpUrl] it's constructed with so that
 * `OakApiClientTest` can point at a plain-http `MockWebServer`.
 */
class BaseUrlTest {

    @Test
    fun resolvesValidHttpsUrl() {
        val url = BaseUrl.resolve("https://oak.gowtam.ai")
        assertEquals("https", url.scheme)
        assertEquals("oak.gowtam.ai", url.host)
    }

    @Test
    fun rejectsNonHttpsScheme() {
        try {
            BaseUrl.resolve("http://oak.gowtam.ai")
            fail("expected OakError.Transport")
        } catch (e: OakError.Transport) {
            assertEquals("insecure_scheme", e.underlying)
        }
    }

    @Test
    fun rejectsMalformedUrl() {
        try {
            BaseUrl.resolve("not a url")
            fail("expected OakError.Transport")
        } catch (e: OakError.Transport) {
            assertEquals("invalid_base_url", e.underlying)
        }
    }

    @Test
    fun buildConfigBaseUrlIsHttps() {
        assertEquals("https", BaseUrl.current.scheme)
    }
}
