package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Exercises [LiveDexLookupService] over a real [MockWebServer] (implementation-plan.md
 * P4 acceptance check 1): route→query mapping for the three public dex routes, the
 * never-throw fold-to-empty policy on a 500/garbage body, and the `sprites` empty-input
 * short-circuit (no request at all).
 */
class DexLookupServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var service: LiveDexLookupService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val tokenStore = TokenStore(InMemoryTokenPreferences())
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveDexLookupService(apiClient)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun searchSendsKindQueryFormat() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"matches":[{"slug":"garchomp","display_name":"Garchomp","kind":"pokemon"}]}""",
            ),
        )
        val matches = service.search(EntityKind.POKEMON, "garch", Format.Champions)
        assertEquals(1, matches.size)
        assertEquals("garchomp", matches.first().slug)

        val recorded = server.takeRequest()
        assertTrue(recorded.path?.contains("kind=pokemon") == true)
        assertTrue(recorded.path?.contains("q=garch") == true)
        assertTrue(recorded.path?.contains("format=champions") == true)
    }

    @Test
    fun searchFoldsServerErrorToEmptyList() = runTest {
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"code":"unknown","message":"boom"}"""))
        assertEquals(emptyList<Any>(), service.search(EntityKind.MOVE, "e", Format.Champions))
    }

    @Test
    fun searchFoldsGarbageBodyToEmptyList() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("not json"))
        assertEquals(emptyList<Any>(), service.search(EntityKind.MOVE, "e", Format.Champions))
    }

    @Test
    fun learnsetSendsPokemonAndFormat() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"moves":[{"slug":"earthquake","display_name":"Earthquake"}]}""",
            ),
        )
        val moves = service.learnset("garchomp", Format.Champions)
        assertEquals(1, moves.size)

        val recorded = server.takeRequest()
        assertTrue(recorded.path?.contains("pokemon=garchomp") == true)
        assertTrue(recorded.path?.contains("format=champions") == true)
    }

    @Test
    fun learnsetFoldsFaultToEmptyList() = runTest {
        server.enqueue(MockResponse().setResponseCode(503))
        assertEquals(emptyList<Any>(), service.learnset("garchomp", Format.Champions))
    }

    @Test
    fun spritesJoinsNamesWithCommaAndDecodesRefs() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"refs":{"garchomp":{"display_name":"Garchomp","sprite_url":"u","dex_number":445,"types":["dragon","ground"],"base_stats":{"hp":1,"attack":2,"defense":3,"special_attack":4,"special_defense":5,"speed":6}}}}""",
            ),
        )
        val refs = service.sprites(listOf("garchomp", "gible"), Format.Champions)
        assertEquals(1, refs.size)
        assertEquals("Garchomp", refs["garchomp"]?.displayName)

        val recorded = server.takeRequest()
        assertTrue(recorded.path?.contains("names=garchomp%2Cgible") == true || recorded.path?.contains("names=garchomp,gible") == true)
    }

    @Test
    fun spritesShortCircuitsOnEmptyNamesWithNoRequest() = runTest {
        val refs = service.sprites(emptyList(), Format.Champions)
        assertEquals(emptyMap<String, Any>(), refs)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun spritesFoldsFaultToEmptyMap() = runTest {
        server.enqueue(MockResponse().setResponseCode(500).setBody("garbage"))
        assertEquals(emptyMap<String, Any>(), service.sprites(listOf("garchomp"), Format.Champions))
    }
}
