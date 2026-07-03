package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.SseClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.SseEvent
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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

/**
 * Exercises [LiveChatService] over a real [MockWebServer] (implementation-plan.md P4
 * acceptance check 2): the text-only path forwards a `ChatRequest` verbatim, the
 * image path encodes via [ImageEncoder] BEFORE the stream opens, and a cap violation
 * surfaces [OakError.ImageRejected] with NO request ever reaching the server.
 *
 * Uses `runBlocking` (not `runTest`) — this suite does real socket I/O against
 * MockWebServer, and `runTest`'s virtual clock is known to misfire against real I/O
 * (see the P3 gotcha this phase inherited).
 */
class ChatServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var sseClient: SseClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        sseClient = SseClient(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueueMinimalStream() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "text/event-stream")
                .setBody("event: answer_start\ndata: {}\n\n"),
        )
    }

    @Test
    fun textOnlySendForwardsRequestVerbatim() = runBlocking {
        enqueueMinimalStream()
        val service = LiveChatService(sseClient)
        val request = ChatRequest(sessionId = "session-1", message = "hello", scopeSeed = Format.Gen7)

        val events = service.send(request).toList()
        assertEquals(listOf(SseEvent.AnswerStart), events)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/chat", recorded.path)
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("session-1", body["session_id"]?.jsonPrimitive?.content)
        assertEquals("hello", body["message"]?.jsonPrimitive?.content)
        assertEquals("gen-7", body["scope_seed"]?.jsonPrimitive?.content)
        assertNull(body["images"])
    }

    @Test
    fun sendWithNoImagesSendsNullImagesField() = runBlocking {
        enqueueMinimalStream()
        val service = LiveChatService(sseClient)

        service.send(sessionId = "session-1", message = "hi", images = emptyList(), scopeSeed = null).toList()

        val recorded = server.takeRequest()
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertNull(body["images"])
        assertNull(body["scope_seed"])
    }

    @Test
    fun sendWithImagesEncodesBeforeOpeningTheStream() = runBlocking {
        // A single opaque source that the fake bitmap ops can encode successfully.
        val source = object : SourceImage {}
        val bitmapOps = object : BitmapOps {
            override fun decodeBounds(source: SourceImage) = ImageBounds(widthPx = 100, heightPx = 100, hasAlpha = false)
            override fun scale(source: SourceImage, maxDimension: Int): DecodedHandle = object : DecodedHandle {}
            override fun shrink(handle: DecodedHandle, factor: Double): DecodedHandle? = null
            override fun compress(handle: DecodedHandle, format: CompressFormat, quality: Int): ByteArray? =
                if (format == CompressFormat.JPEG) byteArrayOf(1, 2, 3) else null
        }
        val encoder = ImageEncoder(bitmapOps = bitmapOps)
        val service = LiveChatService(sseClient, imageEncoder = encoder)
        enqueueMinimalStream()

        service.send(sessionId = "session-1", message = "", images = listOf(source), scopeSeed = null).toList()

        val recorded = server.takeRequest()
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        val images = body["images"]?.let { OakJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(ai.gowtam.oak.wire.ChatImage.serializer()), it) }
        assertEquals(1, images?.size)
        assertEquals("image/jpeg", images?.first()?.mimeType)
        // Raw base64 of [1,2,3] — no `data:` prefix.
        assertEquals("AQID", images?.first()?.data)
    }

    @Test
    fun imageCapViolationThrowsBeforeAnyRequestReachesTheServer() = runBlocking {
        val service = LiveChatService(sseClient)
        val fiveImages = List(5) { object : SourceImage {} }

        try {
            service.send(sessionId = "session-1", message = "", images = fiveImages, scopeSeed = null).toList()
            fail("expected OakError.ImageRejected")
        } catch (e: OakError.ImageRejected) {
            assertTrue(e.reason == ai.gowtam.oak.networking.ImageRejectReason.TooMany)
        }

        assertEquals(0, server.requestCount)
    }
}
