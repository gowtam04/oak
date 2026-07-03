package ai.gowtam.oak.networking

import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.Fixtures
import ai.gowtam.oak.wire.SseEvent
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
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
 * Exercises [SseClient] end-to-end over a real [MockWebServer] (implementation-plan.md
 * P3 acceptance check 4): a full event sequence assembled from throttled (forcibly
 * chunked) body reads, a pre-stream HTTP failure surfacing before any event, and
 * cancellation of the collector tearing down the underlying call promptly.
 */
class SseClientTest {

    private lateinit var server: MockWebServer
    private lateinit var apiClient: OakApiClient
    private lateinit var sseClient: SseClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        sseClient = SseClient(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun chatRequest() = ChatRequest(sessionId = "session-1", message = "hello")

    @Test
    fun streamYieldsFullEventSequenceEvenWhenTheBodyArrivesInThrottledChunks() = runBlocking {
        val body = Fixtures.string("chat_answered_full.sse")
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "text/event-stream")
                .setBody(body)
                // Force the body across many small reads so ByteLineSplitter must
                // reassemble lines across chunk boundaries, like a real network
                // stream — not deliver the whole body in one read() call.
                .throttleBody(16, 1, TimeUnit.MILLISECONDS),
        )

        val events = withTimeout(15_000) { sseClient.stream(chatRequest()).toList() }

        assertEquals(6, events.size)
        assertEquals(SseEvent.ToolActivity("resolve_entity", "Resolving \"Garchomp\""), events[0])
        assertEquals(SseEvent.ToolActivity("get_pokemon", "Looking up Garchomp"), events[1])
        assertEquals(SseEvent.AnswerStart, events[2])
        assertTrue(events[3] is SseEvent.AnswerDelta)
        assertTrue(events[4] is SseEvent.AnswerDelta)
        assertTrue(events[5] is SseEvent.Answer)
    }

    @Test
    fun preStreamRateLimitThrowsBeforeAnyEvent() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(429).addHeader("Retry-After", "5"))

        try {
            sseClient.stream(chatRequest()).toList()
            fail("expected OakError.RateLimited")
        } catch (e: OakError.RateLimited) {
            assertEquals(5L, e.retryAfterSeconds)
        }
    }

    @Test
    fun preStreamServerErrorThrowsBeforeAnyEvent() = runBlocking {
        server.enqueue(
            MockResponse().setResponseCode(503)
                .setBody("""{"code":"model_unavailable","message":"Down"}"""),
        )

        try {
            sseClient.stream(chatRequest()).toList()
            fail("expected OakError.Http")
        } catch (e: OakError.Http) {
            assertEquals(503, e.status)
            assertEquals("model_unavailable", e.code)
        }
    }

    @Test
    fun collectorCancellationClosesTheUnderlyingCallPromptly() = runBlocking {
        val body = Fixtures.string("chat_answered_full.sse")
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "text/event-stream")
                .setBody(body)
                // Slow enough that the full body would take seconds to drain —
                // long enough to prove cancellation stops the read rather than
                // just outracing it.
                .throttleBody(8, 100, TimeUnit.MILLISECONDS),
        )

        val firstEvent = CompletableDeferred<SseEvent>()
        val job = launch(Dispatchers.Default) {
            sseClient.stream(chatRequest()).collect { event -> firstEvent.complete(event) }
        }

        withTimeout(10_000) { firstEvent.await() }

        job.cancel()
        // If cancellation didn't actually close the response/call, the collector
        // would stay blocked in a real socket read until the throttled body fully
        // drains (several seconds) — this bounded join is the assertion.
        withTimeout(3_000) { job.join() }
        assertTrue(job.isCancelled)
    }
}
