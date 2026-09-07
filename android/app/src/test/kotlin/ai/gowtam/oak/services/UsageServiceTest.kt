package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboard
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Champions-first P8 — [LiveUsageService] over MockWebServer. Public GET
 * `/api/usage` (no Bearer). Doubles default; `?ladder=singles` for the other
 * view. 200 `{ available:false }` is an in-domain miss, never thrown.
 *
 * Fails to compile until P8 adds `services/UsageService.kt` + `LiveUsageService`.
 *
 * Requirement refs: CF-USAGE-AC-1.1, CF-USAGE-AC-1.2, CF-USAGE-AC-1.6, CF-AS-1,
 * ADR-5.
 */
class UsageServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var service: LiveUsageService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        tokenStore.set("secret-token")
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveUsageService(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun leaderboardDefaultsToDoublesAndIsPublic() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"available":true,"ladder":"doubles","season":"Current","fetched_at":1,"rows":[]}""",
            ),
        )
        val board = service.leaderboard()
        assertTrue(board.available)
        assertEquals(UsageLadder.Doubles, board.ladder)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertTrue(recorded.path!!.startsWith("/api/usage"))
        assertFalse(recorded.path!!.contains("format="))
        assertTrue(
            recorded.path == "/api/usage" ||
                recorded.path!!.contains("ladder=doubles") ||
                !recorded.path!!.contains("ladder="),
        )
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun leaderboardSinglesSendsTheLadderQuery() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"available":true,"ladder":"singles","season":"Current","fetched_at":1,"rows":[]}""",
            ),
        )
        val board = service.leaderboard(UsageLadder.Singles)
        assertEquals(UsageLadder.Singles, board.ladder)

        val recorded = server.takeRequest()
        assertTrue(recorded.path!!.contains("ladder=singles"))
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun unavailableIsAValueNotAThrownError() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"available":false,"ladder":"doubles","error":"upstream_unavailable","rows":[]}""",
            ),
        )
        val board: UsageLeaderboard = service.leaderboard(UsageLadder.Doubles)
        assertFalse(board.available)
        assertEquals("upstream_unavailable", board.error)
        assertTrue(board.rows.isEmpty())
        val body = OakJson.parseToJsonElement(
            """{"available":false,"ladder":"doubles","error":"upstream_unavailable","rows":[]}""",
        ).jsonObject
        assertEquals("upstream_unavailable", body["error"]?.jsonPrimitive?.content)
    }

    @Test
    fun speciesDrillInIsPublicAndNeverThrows() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"available":true,"found":true,"slug":"garchomp","season":"Current","fetched_at":1,"moves":[]}""",
            ),
        )
        val detail = service.species("garchomp")
        assertTrue(detail.available)
        assertEquals(true, detail.found)
        assertEquals("garchomp", detail.slug)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertTrue(recorded.path!!.startsWith("/api/usage/garchomp"))
        assertNull(recorded.getHeader("Authorization"))
    }
}
