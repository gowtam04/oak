package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.MeResponse
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Exercises [OakApiClient] end-to-end against a real [MockWebServer]
 * (api-usage.md "Error mapping"; component-design.md "Networking layer"):
 * 2xx decode, 401/429 (both `Retry-After` forms)/other non-2xx mapping,
 * Bearer injection (present iff `requiresAuth` + a token exists), and a
 * transport failure. There is no iOS `OakAPIClientTest` equivalent (iOS only
 * unit-tests `OakError.validate` directly) — this suite is the Android-side
 * addition the implementation plan calls for.
 */
class OakApiClientTest {

    private lateinit var server: MockWebServer
    private lateinit var tokenStore: TokenStore
    private lateinit var client: OakApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        tokenStore = TokenStore(InMemoryTokenPreferences())
        client = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun decodesTwoHundredBody() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody("""{"signedIn":true,"email":"a@b.com"}"""),
        )
        val result = client.send(
            Endpoint(Endpoint.Method.GET, "/api/auth/me", requiresAuth = false),
            MeResponse.serializer(),
        )
        assertEquals(true, result.signedIn)
        assertEquals("a@b.com", result.email)
    }

    @Test
    fun sendNoContentIgnoresBody() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        // Must not throw even though the caller never asked to decode the body.
        client.sendNoContent(Endpoint(Endpoint.Method.POST, "/api/auth/signout", requiresAuth = false))
    }

    @Test
    fun decodeFailureMapsToDecoding() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("not json"))
        try {
            client.send(
                Endpoint(Endpoint.Method.GET, "/api/auth/me", requiresAuth = false),
                MeResponse.serializer(),
            )
            fail("expected OakError.Decoding")
        } catch (e: OakError.Decoding) {
            assertTrue(e.typeName.isNotBlank())
        }
    }

    @Test
    fun unauthorizedThrows() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        try {
            client.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/conversations", requiresAuth = true))
            fail("expected OakError.Unauthorized")
        } catch (e: OakError.Unauthorized) {
            // expected
        }
    }

    @Test
    fun rateLimitedParsesNumericRetryAfter() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).addHeader("Retry-After", "12"))
        try {
            client.sendNoContent(Endpoint(Endpoint.Method.POST, "/api/chat", requiresAuth = false))
            fail("expected OakError.RateLimited")
        } catch (e: OakError.RateLimited) {
            assertEquals(12L, e.retryAfterSeconds)
        }
    }

    @Test
    fun rateLimitedParsesHttpDateRetryAfter() = runTest {
        val future = ZonedDateTime.now(ZoneOffset.UTC).plusSeconds(90)
        val formatted = future.format(DateTimeFormatter.RFC_1123_DATE_TIME)
        server.enqueue(MockResponse().setResponseCode(429).addHeader("Retry-After", formatted))
        try {
            client.sendNoContent(Endpoint(Endpoint.Method.POST, "/api/chat", requiresAuth = false))
            fail("expected OakError.RateLimited")
        } catch (e: OakError.RateLimited) {
            assertTrue((e.retryAfterSeconds ?: -1) in 60..120)
        }
    }

    @Test
    fun serverErrorDecodesEnvelopeBody() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(503)
                .setBody("""{"code":"model_unavailable","message":"Down"}"""),
        )
        try {
            client.sendNoContent(Endpoint(Endpoint.Method.POST, "/api/chat", requiresAuth = false))
            fail("expected OakError.Http")
        } catch (e: OakError.Http) {
            assertEquals(503, e.status)
            assertEquals("model_unavailable", e.code)
            assertEquals("Down", e.message)
        }
    }

    @Test
    fun serverErrorWithNonEnvelopeBodyFallsBackToUnknown() = runTest {
        server.enqueue(MockResponse().setResponseCode(500).setBody("internal error, not json"))
        try {
            client.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/x", requiresAuth = false))
            fail("expected OakError.Http")
        } catch (e: OakError.Http) {
            assertEquals(500, e.status)
            assertEquals("unknown", e.code)
        }
    }

    @Test
    fun bearerAttachedWhenRequiredAndTokenPresent() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/conversations", requiresAuth = true))
        val recorded = server.takeRequest()
        assertEquals("Bearer secret-token", recorded.getHeader("Authorization"))
    }

    @Test
    fun sendsOakClientPlatformHeader() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/auth/me", requiresAuth = false))
        val recorded = server.takeRequest()
        assertEquals("android", recorded.getHeader("X-Oak-Client"))
    }

    @Test
    fun bearerAbsentWhenEndpointDoesNotRequireAuth() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/entity", requiresAuth = false))
        val recorded = server.takeRequest()
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun bearerAbsentWhenRequiredButNoTokenStored() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/conversations", requiresAuth = true))
        val recorded = server.takeRequest()
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun jsonBodyIsSentWithContentType() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        client.sendNoContent(
            Endpoint(
                Endpoint.Method.POST,
                "/api/auth/request-code",
                body = """{"email":"a@b.com"}""",
                requiresAuth = false,
            ),
        )
        val recorded = server.takeRequest()
        assertEquals("""{"email":"a@b.com"}""", recorded.body.readUtf8())
        assertTrue(recorded.getHeader("Content-Type")?.startsWith("application/json") == true)
    }

    @Test
    fun transportFailureMapsToTransport() = runTest {
        val deadServer = MockWebServer()
        deadServer.start()
        val deadUrl = deadServer.url("/")
        deadServer.shutdown()
        val deadClient = OakApiClient(baseUrl = deadUrl, tokenStore = tokenStore, client = OkHttpClient())
        try {
            deadClient.sendNoContent(Endpoint(Endpoint.Method.GET, "/api/health", requiresAuth = false))
            fail("expected OakError.Transport")
        } catch (e: OakError.Transport) {
            assertTrue(e.underlying.isNotBlank())
        }
    }

    // -------------------------------------------------------------------
    // SSE streaming client timeouts (background-turns/design.md §6.3)
    // -------------------------------------------------------------------

    @Test
    fun streamingClientDisablesReadAndCallTimeouts() {
        // A default OkHttpClient has a 10s read timeout — shorter than the server's
        // 15s SSE heartbeat, so a quiet-but-live turn would be aborted. The streaming
        // client must disable the read + call timeouts entirely.
        val streaming = OakApiClient.streamingClientFrom(OkHttpClient())
        assertEquals(0, streaming.readTimeoutMillis)
        assertEquals(0, streaming.callTimeoutMillis)
    }

    @Test
    fun streamingClientKeepsABoundedConnectTimeout() {
        // The connect timeout stays bounded — a stream that never opens should still
        // fail fast rather than hang forever.
        val streaming = OakApiClient.streamingClientFrom(OkHttpClient())
        assertTrue(streaming.connectTimeoutMillis > 0)
    }
}
