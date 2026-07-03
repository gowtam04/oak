package ai.gowtam.oak.services

import ai.gowtam.oak.networking.InMemoryTokenPreferences
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TokenStore
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

/**
 * Exercises [LiveAuthService] end-to-end over a real [MockWebServer]
 * (implementation-plan.md P4 acceptance check 1): route→method/path/body mapping,
 * token persistence on [AuthService.verify], sign-out ALWAYS clearing the token
 * (even when the endpoint itself fails), and account deletion clearing on a
 * confirmed 2xx OR an already-orphaned 401 — but not on any other failure.
 */
class AuthServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var tokenStore: TokenStore
    private lateinit var service: LiveAuthService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        tokenStore = TokenStore(InMemoryTokenPreferences())
        val apiClient = OakApiClient(baseUrl = server.url("/"), tokenStore = tokenStore, client = OkHttpClient())
        service = LiveAuthService(apiClient, tokenStore)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun requestCodePostsEmailWithNoAuth() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.requestCode("a@b.com")

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/auth/request-code", recorded.path)
        assertEquals("""{"email":"a@b.com"}""", recorded.body.readUtf8())
        assertNull(recorded.getHeader("Authorization"))
    }

    @Test
    fun verifyPersistsTokenAndReturnsAccount() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"ok":true,"email":"a@b.com","created":true,"token":"secret-token","expiresAt":123}""",
            ),
        )
        val account = service.verify("a@b.com", "123456")

        assertEquals("a@b.com", account.email)
        assertEquals(true, account.created)
        assertEquals("secret-token", tokenStore.token())

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/auth/verify", recorded.path)
        assertEquals("""{"email":"a@b.com","code":"123456"}""", recorded.body.readUtf8())
    }

    @Test
    fun meMapsSignedInResponse() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"signedIn":true,"email":"a@b.com"}"""))
        val state = service.me()
        assertEquals(AuthState.SignedIn("a@b.com"), state)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/api/auth/me", recorded.path)
    }

    @Test
    fun meMapsGuestResponse() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"signedIn":false}"""))
        assertEquals(AuthState.Guest, service.me())
    }

    @Test
    fun signOutClearsTokenOnSuccess() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.signOut()

        assertNull(tokenStore.token())
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/auth/signout", recorded.path)
        assertEquals("Bearer secret-token", recorded.getHeader("Authorization"))
    }

    @Test
    fun signOutAlwaysClearsTokenEvenWhenEndpointFails() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"code":"unknown","message":"boom"}"""))
        // Must not throw: sign-out is best-effort server-side, always clears locally.
        service.signOut()

        assertNull(tokenStore.token())
    }

    @Test
    fun deleteAccountClearsTokenOnConfirmedSuccess() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        service.deleteAccount()

        assertNull(tokenStore.token())
        val recorded = server.takeRequest()
        assertEquals("DELETE", recorded.method)
        assertEquals("/api/auth/account", recorded.path)
    }

    @Test
    fun deleteAccountClearsTokenOnAlreadyOrphaned401() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(401))
        // Must not throw: a 401 means the token is already orphaned.
        service.deleteAccount()

        assertNull(tokenStore.token())
    }

    @Test
    fun deleteAccountKeepsTokenOnOtherFailures() = runTest {
        tokenStore.set("secret-token")
        server.enqueue(MockResponse().setResponseCode(500).setBody("""{"code":"unknown","message":"boom"}"""))
        try {
            service.deleteAccount()
            fail("expected OakError.Http to propagate")
        } catch (e: OakError.Http) {
            assertTrue(e.status == 500)
        }
        // The token must remain — deletion wasn't confirmed.
        assertEquals("secret-token", tokenStore.token())
    }
}
