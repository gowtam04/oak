package ai.gowtam.oak.account

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.account.AccountViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.Account
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.support.FakeAuthService
import ai.gowtam.oak.support.FakePreferencesService
import ai.gowtam.oak.wire.AnswerDensity
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises [AccountViewModel] against [FakeAuthService]/[AppState]
 * (implementation-plan.md P8 acceptance checks 1, 3, 4; mirrors iOS
 * `AccountViewModelTests`).
 */
class AccountViewModelTest {

    // -------------------------------------------------------------------
    // Tier / session reflection
    // -------------------------------------------------------------------

    @Test
    fun guestStateExplainsTheLowerTierAndOffersSignIn() {
        val model = AccountViewModel(FakeAuthService(), AppState())

        assertFalse(model.isSignedIn)
        assertNull(model.email)
        assertEquals(AccountViewModel.GUEST_TIER_TITLE, model.tierTitle)
        assertEquals(AccountViewModel.GUEST_TIER_DESCRIPTION, model.tierDescription)
        assertEquals(AuthState.Guest, model.authState.value)
    }

    @Test
    fun signedInStateReflectsTheAppStateEmailAndHigherTier() {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val model = AccountViewModel(FakeAuthService(), appState)

        assertTrue(model.isSignedIn)
        assertEquals("ash@pallet.town", model.email)
        assertEquals(AccountViewModel.SIGNED_IN_TIER_TITLE, model.tierTitle)
        assertEquals(AccountViewModel.SIGNED_IN_TIER_DESCRIPTION, model.tierDescription)
    }

    // -------------------------------------------------------------------
    // Sign out (acceptance check 1)
    // -------------------------------------------------------------------

    @Test
    fun signOutReturnsToGuestEvenWhenTheServerRevokeFails() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService(signOutError = OakError.Transport("boom"))
        val model = AccountViewModel(auth, appState)

        model.signOut()

        assertFalse(model.isSignedIn)
        assertEquals(1, auth.signOutCallCount)
        assertFalse(model.actionState.value.isBusy)
    }

    // -------------------------------------------------------------------
    // Account deletion (acceptance check 4)
    // -------------------------------------------------------------------

    @Test
    fun deleteAccountOnSuccessReturnsToGuestAndFlagsTheFarewell() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService()
        val model = AccountViewModel(auth, appState)

        model.deleteAccount()

        assertEquals(1, auth.deleteAccountCallCount)
        assertFalse(model.isSignedIn)
        assertTrue(model.actionState.value.deletionCompleted)
        assertNull(model.actionState.value.errorMessage)

        model.consumeDeletionCompleted()
        assertFalse(model.actionState.value.deletionCompleted)
    }

    @Test
    fun deleteAccountFailureKeepsTheUserSignedInWithARecoverableMessage() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService(deleteAccountError = OakError.Http(500, "unknown", "boom"))
        val model = AccountViewModel(auth, appState)

        model.deleteAccount()

        assertTrue(model.isSignedIn)
        assertEquals(AccountViewModel.DELETION_FAILED_MESSAGE, model.actionState.value.errorMessage)
        assertFalse(model.actionState.value.deletionCompleted)
    }

    @Test
    fun deleteAccountTransportFailureShowsTheConnectionMessage() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService(deleteAccountError = OakError.Transport("boom"))
        val model = AccountViewModel(auth, appState)

        model.deleteAccount()

        assertTrue(model.isSignedIn)
        assertEquals(AccountViewModel.CONNECTION_MESSAGE, model.actionState.value.errorMessage)
    }

    /**
     * A raw `401` during deletion (the token already orphaned server-side) is
     * treated as an equivalent outcome to a confirmed deletion (D-AC-ACCT2.3):
     * the device still drops to guest and shows the farewell, per
     * conventions.md's "Unauthorized → drop token, return to guest" rule. Uses
     * [FakeAuthService] to simulate the raw `401` directly — `LiveAuthService`
     * already absorbs this case internally, so this exercises the view model's
     * own defensive handling of the documented convention.
     */
    @Test
    fun deleteAccountUnauthorizedStillLandsOnGuestWithTheFarewell() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService(deleteAccountError = OakError.Unauthorized)
        val model = AccountViewModel(auth, appState)

        model.deleteAccount()

        assertFalse(model.isSignedIn)
        assertEquals(AuthState.Guest, appState.authState.value)
        assertTrue(model.actionState.value.deletionCompleted)
        assertNull(model.actionState.value.errorMessage)
        // AppState.onUnauthorized performs a best-effort signOut() to drop any
        // orphaned token — confirms the shared 401 hook actually ran.
        assertEquals(1, auth.signOutCallCount)
    }

    @Test
    fun dismissErrorClearsAFailedDeletionMessage() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService(deleteAccountError = OakError.Http(500, "unknown", "boom"))
        val model = AccountViewModel(auth, appState)
        model.deleteAccount()
        assertTrue(model.actionState.value.errorMessage != null)

        model.dismissError()

        assertNull(model.actionState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // 401 on an authed call made elsewhere in the app (acceptance check 3)
    // -------------------------------------------------------------------

    /**
     * [AccountViewModel] holds no private copy of the auth state — it mirrors
     * [AppState.authState] live — so when some other authed call anywhere in
     * the app (history, teams, …) receives a `401` and invokes the shared
     * [AppState.onUnauthorized] hook, the Account screen reflects guest
     * immediately without any code of its own.
     */
    @Test
    fun accountReflectsAn401DroppedElsewhereInTheAppViaTheSharedAppStateHook() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val auth = FakeAuthService()
        val model = AccountViewModel(auth, appState)
        assertTrue(model.isSignedIn)

        appState.onUnauthorized(auth)

        assertFalse(model.isSignedIn)
        assertNull(model.email)
        assertEquals(AuthState.Guest, model.authState.value)
    }

    // -------------------------------------------------------------------
    // Sign-in handoff
    // -------------------------------------------------------------------

    @Test
    fun makeAuthViewModelSharesTheAppStateSoASuccessfulSignInReflectsBack() = runTest {
        val appState = AppState()
        val auth = FakeAuthService(verifyResult = Account(email = "ash@pallet.town", created = true))
        val model = AccountViewModel(auth, appState)
        val authViewModel = model.makeAuthViewModel()

        authViewModel.onEmailChange("ash@pallet.town")
        authViewModel.submitEmail()
        authViewModel.onCodeChange("123456")
        authViewModel.submitCode()

        assertTrue(model.isSignedIn)
        assertEquals("ash@pallet.town", model.email)
    }

    // -------------------------------------------------------------------
    // COMPACT-US-1 / COMPACT-US-2 — compact / full default
    //
    // Fails to compile until P8 adds:
    //   wire.AnswerDensity { Full, Compact }
    //   AccountViewModel(auth, appState, preferences: PreferencesService? = null)
    //   answerDensity: StateFlow<AnswerDensity>   — factory default Full
    //   setAnswerDensity(density)                 — guest local; signed-in PATCH
    // -------------------------------------------------------------------

    @Test
    fun aNeverSetPreferenceDefaultsToFull() {
        val model = AccountViewModel(FakeAuthService(), AppState())
        assertEquals(AnswerDensity.Full, model.answerDensity.value)
    }

    @Test
    fun settingCompactUpdatesAlreadyRenderedCardsOnThisClient() = runTest {
        val model = AccountViewModel(FakeAuthService(), AppState())

        model.setAnswerDensity(AnswerDensity.Compact)

        assertEquals(AnswerDensity.Compact, model.answerDensity.value)
    }

    @Test
    fun aGuestWriteStaysDeviceOnlyAndDoesNotPatchTheServer() = runTest {
        val prefs = FakePreferencesService()
        val model = AccountViewModel(FakeAuthService(), AppState(), preferences = prefs)
        assertFalse(model.isSignedIn)

        model.setAnswerDensity(AnswerDensity.Compact)

        assertEquals(AnswerDensity.Compact, model.answerDensity.value)
        assertTrue(prefs.patchCalls.isEmpty())
    }

    @Test
    fun aSignedInWritePatchesAccountPreferences() = runTest {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val prefs = FakePreferencesService()
        val model = AccountViewModel(FakeAuthService(), appState, preferences = prefs)

        model.setAnswerDensity(AnswerDensity.Compact)

        assertEquals(listOf(AnswerDensity.Compact), prefs.patchCalls)
        assertEquals(AnswerDensity.Compact, model.answerDensity.value)

        model.setAnswerDensity(AnswerDensity.Full)
        assertEquals(listOf(AnswerDensity.Compact, AnswerDensity.Full), prefs.patchCalls)
        assertEquals(AnswerDensity.Full, model.answerDensity.value)
    }
}
