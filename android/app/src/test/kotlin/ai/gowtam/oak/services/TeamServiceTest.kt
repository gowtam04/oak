package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.Format
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
import org.junit.Before
import org.junit.Test

private const val TEAM_JSON =
    """{"id":"t1","name":"My Team","format":"champions","members":[],"createdAt":1,"updatedAt":2}"""

/**
 * Exercises [LiveTeamService] over a real [MockWebServer] (implementation-plan.md P4
 * acceptance check 1): route→method/path/query/body mapping for every CRUD +
 * duplicate/import/export operation, and the `{ team, validation }`
 * ("flat `TeamWarning[]`") envelope decode.
 */
class TeamServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var service: LiveTeamService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        tokenStore.set("secret-token")
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveTeamService(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun listSendsFormatQuery() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"teams":[]}"""))
        service.list(Format.Gen5)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertTrue(recorded.path?.startsWith("/api/teams?") == true)
        assertTrue(recorded.path?.contains("format=gen-5") == true)
        assertEquals("Bearer secret-token", recorded.getHeader("Authorization"))
    }

    @Test
    fun listOmitsQueryWhenFormatIsNull() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"teams":[]}"""))
        service.list(null)
        assertEquals("/api/teams", server.takeRequest().path)
    }

    @Test
    fun getFetchesTeamAndValidation() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"team":$TEAM_JSON,"validation":[{"code":"incomplete","message":"m"}]}""",
            ),
        )
        val (team, warnings) = service.get("t1")
        assertEquals("t1", team.id)
        assertEquals(1, warnings.size)
        assertEquals("/api/teams/t1", server.takeRequest().path)
    }

    @Test
    fun createSendsFormatNameMembers() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"team":$TEAM_JSON,"validation":[]}"""))
        service.create(format = Format.Champions, name = "New", members = null)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/teams", recorded.path)
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("champions", body["format"]?.jsonPrimitive?.content)
        assertEquals("New", body["name"]?.jsonPrimitive?.content)
        assertNull(body["members"])
    }

    @Test
    fun updateSendsPutWithNameAndMembers() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"team":$TEAM_JSON,"validation":[]}"""))
        service.update(id = "t1", name = "Renamed", members = null)

        val recorded = server.takeRequest()
        assertEquals("PUT", recorded.method)
        assertEquals("/api/teams/t1", recorded.path)
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("Renamed", body["name"]?.jsonPrimitive?.content)
    }

    @Test
    fun deleteSendsDeleteRequest() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.delete("t1")
        val recorded = server.takeRequest()
        assertEquals("DELETE", recorded.method)
        assertEquals("/api/teams/t1", recorded.path)
    }

    @Test
    fun duplicatePostsToDuplicateRoute() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"team":$TEAM_JSON,"validation":[]}"""))
        service.duplicate("t1")
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/teams/t1/duplicate", recorded.path)
    }

    @Test
    fun importPasteSendsFormatAndPasteAndReturnsNotes() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"team":$TEAM_JSON,"validation":[],"notes":[{"slot":0,"kind":"move","raw":"Foo","message":"m"}]}""",
            ),
        )
        val (team, warnings, notes) = service.importPaste(Format.Champions, "paste text")
        assertEquals("t1", team.id)
        assertTrue(warnings.isEmpty())
        assertEquals(1, notes.size)

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/teams/import", recorded.path)
        val body = OakJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("paste text", body["paste"]?.jsonPrimitive?.content)
    }

    @Test
    fun exportPasteReturnsPasteText() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"paste":"Garchomp @ Life Orb"}"""))
        val paste = service.exportPaste("t1")
        assertEquals("Garchomp @ Life Orb", paste)
        assertEquals("/api/teams/t1/export", server.takeRequest().path)
    }
}
