package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.OakJson
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonArray
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
 * Exercises [LiveHistoryService] over a real [MockWebServer] (implementation-plan.md
 * P4 acceptance check 1): route→method/path/query mapping, the guest short-circuit on
 * [HistoryService.list] (no token ⇒ zero network requests), and the hand-rolled
 * `turns` JSON on [HistoryService.importGuestThread] (the wire `ChatTurn` type is
 * decode-only, so the service must encode it manually).
 */
class HistoryServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var tokenStore: TokenStore
    private lateinit var service: LiveHistoryService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        tokenStore = TokenStore(InMemoryTokenPreferences())
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveHistoryService(apiClient, tokenStore)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun listReturnsEmptyForGuestWithNoNetworkRequest() = runTest {
        // No token stored — must short-circuit before touching the network.
        val result = service.list(query = null, format = null)
        assertEquals(emptyList<Any>(), result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun listSendsQueryAndFormatWhenSignedIn() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"conversations":[]}"""))

        service.list(query = "  garchomp  ", format = Format.Gen7)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertTrue(recorded.path?.startsWith("/api/conversations?") == true)
        assertTrue(recorded.path?.contains("q=garchomp") == true)
        assertTrue(recorded.path?.contains("format=gen-7") == true)
        assertEquals("Bearer secret-token", recorded.getHeader("Authorization"))
    }

    @Test
    fun listOmitsBlankQuery() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"conversations":[]}"""))
        service.list(query = "   ", format = null)

        val recorded = server.takeRequest()
        assertEquals("/api/conversations", recorded.path)
    }

    @Test
    fun getFetchesOneConversation() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"id":"c1","title":"T","format":"champions","pinned":false,"turns":[]}""",
            ),
        )
        val detail = service.get("c1")
        assertEquals("c1", detail.id)

        val recorded = server.takeRequest()
        assertEquals("/api/conversations/c1", recorded.path)
    }

    @Test
    fun getThrowsUnauthorizedForGuest() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        try {
            service.get("c1")
            fail("expected OakError.Unauthorized")
        } catch (e: OakError.Unauthorized) {
            // expected
        }
    }

    @Test
    fun renameSendsTitleBody() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.rename("c1", "New Title")

        val recorded = server.takeRequest()
        assertEquals("PATCH", recorded.method)
        assertEquals("/api/conversations/c1", recorded.path)
        assertEquals("""{"title":"New Title"}""", recorded.body.readUtf8())
    }

    @Test
    fun setPinnedSendsPinnedBody() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.setPinned("c1", true)

        val recorded = server.takeRequest()
        assertEquals("PATCH", recorded.method)
        assertEquals("""{"pinned":true}""", recorded.body.readUtf8())
    }

    @Test
    fun deleteSendsDeleteRequest() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.delete("c1")

        val recorded = server.takeRequest()
        assertEquals("DELETE", recorded.method)
        assertEquals("/api/conversations/c1", recorded.path)
    }

    @Test
    fun importGuestThreadEncodesUserAndAssistantTurns() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"id":"new-conv"}"""))

        val answer = OakAnswer(
            status = OakAnswer.Status.Answered,
            answerMarkdown = "**Hi**",
            reasoningMarkdown = "",
            citations = emptyList(),
            inferences = emptyList(),
            generationBasis = OakJson.decodeFromString(
                ai.gowtam.oak.wire.GenerationBasis.serializer(),
                """{"generation":"gen9","fallback":false}""",
            ),
        )
        val turns = listOf(
            ChatTurn.User(id = "u1", content = "hello"),
            ChatTurn.Assistant(id = "a1", answer = answer),
        )

        val id = service.importGuestThread(sessionId = "sess-1", format = Format.Champions, turns = turns)
        assertEquals("new-conv", id)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/conversations/import", recorded.path)
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("sess-1", body["session_id"]?.jsonPrimitive?.content)
        assertEquals("champions", body["format"]?.jsonPrimitive?.content)

        val jsonTurns = body["turns"]?.jsonArray
        assertEquals(2, jsonTurns?.size)
        val userTurn = jsonTurns!![0].jsonObject
        assertEquals("u1", userTurn["id"]?.jsonPrimitive?.content)
        assertEquals("user", userTurn["role"]?.jsonPrimitive?.content)
        assertEquals("hello", userTurn["content"]?.jsonPrimitive?.content)
        assertNull(userTurn["answer"])

        val assistantTurn = jsonTurns[1].jsonObject
        assertEquals("a1", assistantTurn["id"]?.jsonPrimitive?.content)
        assertEquals("assistant", assistantTurn["role"]?.jsonPrimitive?.content)
        assertNull(assistantTurn["content"])
        assertEquals("**Hi**", assistantTurn["answer"]?.jsonObject?.get("answer_markdown")?.jsonPrimitive?.content)
    }

    @Test
    fun importGuestThreadReturnsNullForEmptyImport() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"id":null}"""))
        val id = service.importGuestThread(sessionId = "sess-1", format = Format.Champions, turns = emptyList())
        assertNull(id)
    }
}
