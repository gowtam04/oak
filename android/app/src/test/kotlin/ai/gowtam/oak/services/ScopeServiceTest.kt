package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class ScopeServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var service: LiveScopeService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val apiClient = OakApiClient(
            baseUrl = server.url("/"),
            tokenStore = TokenStore(InMemoryTokenPreferences()),
            client = OkHttpClient(),
        )
        service = LiveScopeService(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun currentGetsPublicRegulationMeta() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"format":"champions","regulation":"Regulation M-C","chipLabel":"Champions · Reg M-C","hint":"Current Champions regulation: Regulation M-C"}""",
            ),
        )
        val meta = service.current()
        assertEquals(Format.Champions, meta?.format)
        assertEquals("Regulation M-C", meta?.regulation)
        assertEquals("Champions · Reg M-C", meta?.chipLabel)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/api/scope", recorded.path)
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun currentFoldsHttpFailureToNull() = runTest {
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"error":"boom"}"""))
        assertNull(service.current())
    }
}
