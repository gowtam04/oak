package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.SseClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.TeamsAssistantDraft
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * Exercises [LiveTeamsAssistantService] over a real [MockWebServer]
 * (implementation-plan.md P4 acceptance check 2): the request carries `session_id` /
 * `message` / the live `draft` every turn, and a guest's missing Bearer (a 401)
 * surfaces [OakError.Unauthorized] from the flow before any event.
 *
 * Uses `runBlocking` — real socket I/O against MockWebServer (see the P3 gotcha).
 */
class TeamsAssistantServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var tokenStore: TokenStore
    private lateinit var service: LiveTeamsAssistantService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        tokenStore = TokenStore(InMemoryTokenPreferences())
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveTeamsAssistantService(SseClient(apiClient))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun draft() = TeamsAssistantDraft(name = "My Team", format = Format.Champions, members = emptyList())

    @Test
    fun sendPostsSessionIdMessageAndLiveDraft() = runBlocking {
        tokenStore.set("secret-token")
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "text/event-stream")
                .setBody("event: answer_start\ndata: {}\n\n"),
        )

        val events = service.send("sess-1", "make it faster", draft()).toList()
        assertEquals(listOf(BuilderSseEvent.AnswerStart), events)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/teams/assistant", recorded.path)
        assertEquals("Bearer secret-token", recorded.getHeader("Authorization"))

        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("sess-1", body["session_id"]?.jsonPrimitive?.content)
        assertEquals("make it faster", body["message"]?.jsonPrimitive?.content)
        assertEquals("My Team", body["draft"]?.jsonObject?.get("name")?.jsonPrimitive?.content)
        assertEquals("champions", body["draft"]?.jsonObject?.get("format")?.jsonPrimitive?.content)
    }

    @Test
    fun guestMissingBearerSurfacesUnauthorizedBeforeAnyEvent() = runBlocking {
        // No token stored — the server would 401; simulate that pre-stream response.
        server.enqueue(MockResponse().setResponseCode(401))
        try {
            service.send("sess-1", "hi", draft()).toList()
            fail("expected OakError.Unauthorized")
        } catch (e: OakError.Unauthorized) {
            // expected
        }
    }

    @Test
    fun rateLimitSurfacesBeforeAnyEvent() = runBlocking {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(429).addHeader("Retry-After", "10"))
        try {
            service.send("sess-1", "hi", draft()).toList()
            fail("expected OakError.RateLimited")
        } catch (e: OakError.RateLimited) {
            assertEquals(10L, e.retryAfterSeconds)
        }
    }
}
