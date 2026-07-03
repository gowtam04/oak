package ai.gowtam.oak.auth

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.auth.AuthViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.Account
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.support.FakeAuthService
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises [AuthViewModel] against [FakeAuthService] (implementation-plan.md P8
 * acceptance checks 1–2; mirrors iOS `AuthViewModelTests`). The 60s resend
 * cooldown is driven by an injected clock array (mutated mid-test) rather than
 * real/virtual coroutine delay — [AuthViewModel] never runs a background timer,
 * it only compares `now()` to a stored deadline, so this is fully deterministic
 * with no `Dispatchers.Main`/`TestDispatcher` setup required.
 */
class AuthViewModelTest {

    private fun viewModel(
        auth: FakeAuthService = FakeAuthService(),
        appState: AppState = AppState(),
        cooldownMillis: Long = 60_000L,
        clock: LongArray = longArrayOf(0L),
    ): AuthViewModel = AuthViewModel(
        auth = auth,
        appState = appState,
        cooldownDurationMillis = cooldownMillis,
        now = { clock[0] },
    )

    // -------------------------------------------------------------------
    // Email step
    // -------------------------------------------------------------------

    @Test
    fun submitEmailNormalizesRequestsACodeAndAdvancesToTheCodeStep() = runTest {
        val auth = FakeAuthService()
        val model = viewModel(auth)
        model.onEmailChange(" Ash@Pallet.town ")

        model.submitEmail()

        assertEquals(listOf("ash@pallet.town"), auth.requestCodeCalls)
        assertEquals(AuthViewModel.Step.CODE, model.state.value.step)
        assertEquals("", model.state.value.code)
        assertTrue(model.state.value.noticeMessage!!.contains("ash@pallet.town"))
        assertEquals(60, model.resendSecondsRemaining)
    }

    @Test
    fun submitEmailIsANoOpForAnInvalidEmail() = runTest {
        val auth = FakeAuthService()
        val model = viewModel(auth)
        model.onEmailChange("not-an-email")

        model.submitEmail()

        assertTrue(auth.requestCodeCalls.isEmpty())
        assertEquals(AuthViewModel.Step.EMAIL, model.state.value.step)
    }

    @Test
    fun looksLikeEmailAcceptsAndRejectsTheExpectedShapes() {
        assertTrue(AuthViewModel.looksLikeEmail("ash@pallet.town"))
        assertFalse(AuthViewModel.looksLikeEmail("ash"))
        assertFalse(AuthViewModel.looksLikeEmail("@pallet.town"))
        assertFalse(AuthViewModel.looksLikeEmail("ash@"))
        assertFalse(AuthViewModel.looksLikeEmail("ash@pallettown"))
        assertFalse(AuthViewModel.looksLikeEmail("ash@.town"))
        assertFalse(AuthViewModel.looksLikeEmail("ash@pallet."))
    }

    @Test
    fun onEmailChangeClearsAStaleErrorAsTheUserRetypes() = runTest {
        val auth = FakeAuthService(requestCodeError = OakError.Http(400, "invalid_email", "bad"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        assertTrue(model.state.value.errorMessage != null)

        model.onEmailChange("ash2@pallet.town")

        assertNull(model.state.value.errorMessage)
    }

    @Test
    fun invalidEmailFromTheServerSurfacesItsSpecificMessage() = runTest {
        val auth = FakeAuthService(requestCodeError = OakError.Http(400, "invalid_email", "bad"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")

        model.submitEmail()

        assertEquals("Enter a valid email address.", model.state.value.errorMessage)
        assertEquals(AuthViewModel.Step.EMAIL, model.state.value.step)
    }

    @Test
    fun emailFailedFromTheServerSurfacesItsSpecificMessage() = runTest {
        val auth = FakeAuthService(requestCodeError = OakError.Http(502, "email_failed", "smtp down"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")

        model.submitEmail()

        assertEquals("We couldn't send your code right now. Please try again.", model.state.value.errorMessage)
    }

    @Test
    fun transportFailureDuringRequestCodeShowsTheConnectionMessage() = runTest {
        val auth = FakeAuthService(requestCodeError = OakError.Transport("boom"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")

        model.submitEmail()

        assertEquals(AuthViewModel.CONNECTION_MESSAGE, model.state.value.errorMessage)
    }

    @Test
    fun rateLimitedRequestCodeSurfacesTheRetryAfterWindow() = runTest {
        val auth = FakeAuthService(requestCodeError = OakError.RateLimited(retryAfterSeconds = 42))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")

        model.submitEmail()

        assertEquals("Too many attempts. Please wait 42s and try again.", model.state.value.errorMessage)
    }

    @Test
    fun rateLimitedWithoutARetryAfterHeaderShowsTheGenericWaitMessage() = runTest {
        val auth = FakeAuthService(requestCodeError = OakError.RateLimited(retryAfterSeconds = null))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")

        model.submitEmail()

        assertEquals("Too many attempts. Please wait a moment and try again.", model.state.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Code step
    // -------------------------------------------------------------------

    @Test
    fun onCodeChangeStripsNonDigitsAndCapsAtSixSoAPasteBehavesLikeTyping() = runTest {
        val auth = FakeAuthService()
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()

        // Simulates a paste of a copied code with incidental formatting.
        model.onCodeChange("12-34 5678")

        assertEquals("123456", model.state.value.code)
        assertTrue(model.canSubmitCode)
    }

    @Test
    fun submitCodeStoresTheAccountAndCompletesSignIn() = runTest {
        val auth = FakeAuthService(verifyResult = Account(email = "ash@pallet.town", created = false))
        val appState = AppState()
        val model = viewModel(auth, appState)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        model.onCodeChange("123456")

        model.submitCode()

        assertEquals(listOf("ash@pallet.town" to "123456"), auth.verifyCalls)
        assertEquals(AuthState.SignedIn("ash@pallet.town"), appState.authState.value)
        assertEquals("ash@pallet.town", model.state.value.signedInEmail)
    }

    @Test
    fun invalidCodeShowsAMessageAndKeepsTheDigitsForCorrection() = runTest {
        val auth = FakeAuthService(verifyError = OakError.Http(400, "invalid_code", "nope"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        model.onCodeChange("111111")

        model.submitCode()

        assertEquals("That code is incorrect. Please try again.", model.state.value.errorMessage)
        assertEquals("111111", model.state.value.code)
        assertNull(model.state.value.signedInEmail)
    }

    @Test
    fun expiredCodeClearsTheFieldForAFreshAttempt() = runTest {
        val auth = FakeAuthService(verifyError = OakError.Http(400, "invalid_or_expired", "stale"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        model.onCodeChange("111111")

        model.submitCode()

        assertEquals("That code is no longer valid. Request a new one.", model.state.value.errorMessage)
        assertEquals("", model.state.value.code)
    }

    @Test
    fun tooManyAttemptsClearsTheFieldAndShowsItsMessage() = runTest {
        val auth = FakeAuthService(verifyError = OakError.Http(429, "too_many_attempts", "slow down"))
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        model.onCodeChange("111111")

        model.submitCode()

        assertEquals("Too many incorrect attempts. Request a new code.", model.state.value.errorMessage)
        assertEquals("", model.state.value.code)
    }

    @Test
    fun submitCodeIsANoOpUntilSixDigitsArePresent() = runTest {
        val auth = FakeAuthService()
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        model.onCodeChange("123")

        model.submitCode()

        assertTrue(auth.verifyCalls.isEmpty())
    }

    // -------------------------------------------------------------------
    // Resend cooldown (virtual-time gating via the injected clock)
    // -------------------------------------------------------------------

    @Test
    fun resendIsGatedByTheCooldownAndAllowedOnceItElapses() = runTest {
        val auth = FakeAuthService()
        val clock = longArrayOf(0L)
        val model = viewModel(auth, cooldownMillis = 60_000L, clock = clock)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        assertEquals(1, auth.requestCodeCalls.size)
        assertFalse(model.canResend)

        // Still inside the cooldown window: resend is a no-op.
        clock[0] = 30_000L
        model.resendCode()
        assertEquals(1, auth.requestCodeCalls.size)
        assertEquals(30, model.resendSecondsRemaining)

        // The cooldown has fully elapsed: resend is allowed and fires a fresh request.
        clock[0] = 60_000L
        assertTrue(model.canResend)
        model.resendCode()
        assertEquals(2, auth.requestCodeCalls.size)
    }

    @Test
    fun resendSecondsRemainingIsZeroBeforeAnyCodeHasBeenRequested() = runTest {
        val model = viewModel()
        assertEquals(0, model.resendSecondsRemaining)
        assertTrue(model.canResend)
    }

    // -------------------------------------------------------------------
    // Edit email
    // -------------------------------------------------------------------

    @Test
    fun editEmailResetsToTheEmailStepAndClearsTheCooldown() = runTest {
        val auth = FakeAuthService()
        val model = viewModel(auth)
        model.onEmailChange("ash@pallet.town")
        model.submitEmail()
        model.onCodeChange("123456")

        model.editEmail()

        assertEquals(AuthViewModel.Step.EMAIL, model.state.value.step)
        assertEquals("", model.state.value.code)
        assertEquals(0, model.resendSecondsRemaining)
        assertTrue(model.canResend)
    }
}
