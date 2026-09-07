package ai.gowtam.oak.app

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.services.MeSnapshot
import ai.gowtam.oak.support.FakeAuthService
import ai.gowtam.oak.support.FakeHistoryService
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.OakAnswer
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Exercises [AppState]'s auth transitions and the guest→sign-in thread-import
 * handoff against [FakeAuthService]/[FakeHistoryService] (implementation-plan.md P4
 * acceptance check 4; mirrors iOS `AppStateTests`).
 */
class AppStateTest {

    private fun answer(text: String) = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = text,
        reasoningMarkdown = "",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "gen9", fallback = false),
    )

    @Test
    fun restoreSessionAdoptsTheServicesResult() = runTest {
        val state = AppState()
        val auth = FakeAuthService(
            meResult = MeSnapshot.signedIn("a@b.com", lastUsedScope = Format.Gen7),
        )
        state.restoreSession(auth)
        assertEquals(AuthState.SignedIn("a@b.com"), state.authState.value)
        assertEquals(Format.Gen7, state.lastUsedScope.value)
    }

    @Test
    fun restoreSessionStaysGuestOnFailure() = runTest {
        val state = AppState()
        val auth = FakeAuthService(meError = OakError.Transport("boom"))
        state.restoreSession(auth)
        assertEquals(AuthState.Guest, state.authState.value)
    }

    @Test
    fun completeSignInFlipsToSignedIn() {
        val state = AppState()
        state.completeSignIn("a@b.com")
        assertEquals(AuthState.SignedIn("a@b.com"), state.authState.value)
    }

    @Test
    fun onSignedInTriggersGuestThreadImportWhenAThreadExists() = runTest {
        val state = AppState()
        state.appendGuestTurn(GuestTurn(content = GuestTurn.Content.User("hello")))
        state.appendGuestTurn(GuestTurn(content = GuestTurn.Content.Assistant(answer("hi"))))
        state.setGuestThreadScope(Format.Gen7)

        val history = FakeHistoryService(importResult = "new-conv-id")
        val id = state.onSignedIn("a@b.com", history)

        assertEquals("new-conv-id", id)
        assertEquals(AuthState.SignedIn("a@b.com"), state.authState.value)
        assertEquals("new-conv-id", state.activeConversationId.value)
        assertEquals(1, history.importCalls.size)
        val (sessionId, format, turns) = history.importCalls.single()
        assertEquals(Format.Gen7, format)
        assertEquals(2, turns.size)
        assertTrue(turns[0] is ChatTurn.User)
        assertTrue(turns[1] is ChatTurn.Assistant)
        assertTrue(sessionId.isNotBlank())
    }

    @Test
    fun onSignedInSkipsImportWhenNoGuestThreadExists() = runTest {
        val state = AppState()
        val history = FakeHistoryService(importResult = "should-not-be-used")
        val id = state.onSignedIn("a@b.com", history)

        assertNull(id)
        assertEquals(0, history.importCalls.size)
        assertNull(state.activeConversationId.value)
    }

    @Test
    fun importGuestThreadFailureKeepsTheOnScreenThreadAndReturnsNull() = runTest {
        val state = AppState()
        state.appendGuestTurn(GuestTurn(content = GuestTurn.Content.User("hello")))
        val history = FakeHistoryService(importError = OakError.Transport("boom"))

        val id = state.importGuestThread(history)

        assertNull(id)
        assertNull(state.activeConversationId.value)
        // The on-screen thread survives the failed import.
        assertEquals(1, state.guestThread.value.size)
    }

    @Test
    fun importGuestThreadReusesTheActiveConversationIdAsTheSessionId() = runTest {
        val state = AppState()
        state.appendGuestTurn(GuestTurn(content = GuestTurn.Content.User("hello")))
        state.completeSignIn("a@b.com") // does not itself set activeConversationId
        val history = FakeHistoryService(importResult = "conv-1")

        state.importGuestThread(history)

        assertEquals("conv-1", state.activeConversationId.value)
    }

    @Test
    fun onSignedOutAlwaysReturnsToGuestEvenWhenTheServiceFails() = runTest {
        val state = AppState()
        state.completeSignIn("a@b.com")
        val auth = FakeAuthService(signOutError = OakError.Transport("boom"))

        state.onSignedOut(auth)

        assertEquals(AuthState.Guest, state.authState.value)
        assertNull(state.activeConversationId.value)
        assertEquals(1, auth.signOutCallCount)
    }

    @Test
    fun onUnauthorizedDropsToGuestAndKeepsTheOnScreenThread() = runTest {
        val state = AppState()
        state.completeSignIn("a@b.com")
        state.appendGuestTurn(GuestTurn(content = GuestTurn.Content.User("hello")))
        val auth = FakeAuthService()

        state.onUnauthorized(auth)

        assertEquals(AuthState.Guest, state.authState.value)
        assertNull(state.activeConversationId.value)
        // 401 handling never touches the visible thread — only session identity.
        assertEquals(1, state.guestThread.value.size)
    }

    @Test
    fun deleteAccountResetsToGuestOnSuccess() = runTest {
        val state = AppState()
        state.completeSignIn("a@b.com")
        val auth = FakeAuthService()

        state.deleteAccount(auth)

        assertEquals(AuthState.Guest, state.authState.value)
        assertEquals(1, auth.deleteAccountCallCount)
    }

    @Test
    fun deleteAccountPropagatesFailureWithoutResetting() = runTest {
        val state = AppState()
        state.completeSignIn("a@b.com")
        val auth = FakeAuthService(deleteAccountError = OakError.Http(500, "unknown", "boom"))

        try {
            state.deleteAccount(auth)
            fail("expected the OakError to propagate")
        } catch (e: OakError.Http) {
            // expected — deletion was not confirmed.
        }
        assertEquals(AuthState.SignedIn("a@b.com"), state.authState.value)
    }

    @Test
    fun clearGuestThreadResetsTurnsAndScope() {
        val state = AppState()
        state.appendGuestTurn(GuestTurn(content = GuestTurn.Content.User("hello")))
        state.setGuestThreadScope(Format.Gen5)

        state.clearGuestThread()

        assertEquals(emptyList<GuestTurn>(), state.guestThread.value)
        assertEquals(Format.Champions, state.guestThreadScope.value)
    }
}
