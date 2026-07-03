package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Exercises [LiveArtifactService] over a real [MockWebServer] (implementation-plan.md
 * P4 acceptance check 1): route→query mapping and the never-throw policy — a 500 or a
 * garbage body folds to `null` rather than propagating an [ai.gowtam.oak.networking.OakError].
 */
class ArtifactServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var service: LiveArtifactService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveArtifactService(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun entitySendsKindQueryFormatAndDecodesOk() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"status":"not_found","kind":"pokemon","format":"champions","query":"garchmp","suggestions":["garchomp"]}""",
            ),
        )
        val result = service.entity(EntityKind.POKEMON, "garchmp", Format.Champions)
        assertTrue(result is EntityArtifact.NotFound)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertTrue(recorded.path?.startsWith("/api/entity?") == true)
        assertTrue(recorded.path?.contains("kind=pokemon") == true)
        assertTrue(recorded.path?.contains("q=garchmp") == true)
        assertTrue(recorded.path?.contains("format=champions") == true)
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun entityFoldsServerErrorToNull() = runTest {
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"code":"unknown","message":"boom"}"""))
        assertNull(service.entity(EntityKind.MOVE, "earthquake", Format.Champions))
    }

    @Test
    fun entityFoldsGarbageBodyToNull() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("not json"))
        assertNull(service.entity(EntityKind.MOVE, "earthquake", Format.Champions))
    }

    @Test
    fun entityFoldsTransportFailureToNull() = runTest {
        val deadServer = MockWebServer()
        deadServer.start()
        val deadUrl = deadServer.url("/")
        deadServer.shutdown()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        val deadClient = LiveArtifactService(OakApiClient(baseUrl = deadUrl, tokenStore = tokenStore, client = OkHttpClient()))
        assertNull(deadClient.entity(EntityKind.ITEM, "leftovers", Format.Champions))
    }

    @Test
    fun savedTeamFoldsUnauthorizedToNull() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        assertNull(service.savedTeam("t1"))
        assertEquals("/api/teams/t1", server.takeRequest().path)
    }

    @Test
    fun savedTeamReturnsTeamAndValidationOnSuccess() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"team":{"id":"t1","name":"T","format":"champions","members":[],"createdAt":1,"updatedAt":2},"validation":[]}""",
            ),
        )
        val result = service.savedTeam("t1")
        assertEquals("t1", result?.first?.id)
        assertTrue(result?.second?.isEmpty() == true)
    }
}
