package ai.gowtam.oak.features.auth

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.AuthService
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Drives the two-step email-OTP sign-in flow (accounts-and-access.md D-ACCT-1 /
 * M-ACCT-US-2): enter email → request a code, then enter the 6-digit code →
 * verify. On success it hands the resolved account to [AppState] so the whole app
 * transitions to signed-in. Mirrors iOS `AuthViewModel` seam-for-seam.
 *
 * Depends on the [AuthService] **interface** (never `LiveAuthService`) so it is
 * unit-tested against `FakeAuthService`. All mutating actions are plain `suspend`
 * functions rather than internally `viewModelScope.launch`ed — the caller (a
 * Compose screen) drives them from its own coroutine scope, exactly like the
 * `Task { await model.submitX() }` pattern on iOS; this keeps the view model
 * JVM-testable with no `Dispatchers.Main` setup required.
 *
 * The 60-second resend cooldown is computed from an injected [now] clock rather
 * than a running timer, so it stays deterministic under `kotlinx-coroutines-test`
 * virtual time — a test simply advances its own fake clock and re-reads
 * [resendSecondsRemaining]. A Compose screen re-derives the countdown each second
 * via its own polling `LaunchedEffect` (the Android analogue of iOS's
 * `TimelineView`).
 *
 * **D-AC-ACCT1.3 (no autofill):** codes arrive by EMAIL, not SMS, so there is no
 * SMS Retriever/Autofill hook here — [AuthScreen] instead offers first-class paste
 * support (a single hidden text field backs the six visual digit boxes; a paste of
 * six digits fills [UiState.code] at once via [onCodeChange]).
 */
class AuthViewModel(
    private val auth: AuthService,
    private val appState: AppState,
    private val cooldownDurationMillis: Long = COOLDOWN_MILLIS,
    private val now: () -> Long = { System.currentTimeMillis() },
) : ViewModel() {

    /** Which entry step the screen is showing. */
    enum class Step { EMAIL, CODE }

    /** The auth screen's observed state (Compose `collectAsState()`s this). */
    data class UiState(
        val step: Step = Step.EMAIL,
        val email: String = "",
        val code: String = "",
        val isBusy: Boolean = false,
        val errorMessage: String? = null,
        val noticeMessage: String? = null,
        /** The signed-in email once verification completes; `null` while still a guest. */
        val signedInEmail: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /** When the resend cooldown ends (epoch millis); `null` before a code is requested. */
    private var cooldownUntil: Long? = null

    // -------------------------------------------------------------------
    // Derived state
    // -------------------------------------------------------------------

    /** The email normalized for submission (trimmed + lowercased). */
    val normalizedEmail: String
        get() = _state.value.email.trim().lowercase()

    /** Whether the entered email looks well-formed enough to attempt a request
     * (the server is the real authority and may still return `invalid_email`). */
    val canSubmitEmail: Boolean
        get() = looksLikeEmail(normalizedEmail) && !_state.value.isBusy

    /** Whether the code field holds exactly six digits. */
    val canSubmitCode: Boolean
        get() = _state.value.code.length == 6 && _state.value.code.all(Char::isDigit) && !_state.value.isBusy

    /** Whole seconds remaining before another code can be requested (0 = ready). */
    val resendSecondsRemaining: Int
        get() {
            val until = cooldownUntil ?: return 0
            val remainingMillis = until - now()
            if (remainingMillis <= 0) return 0
            return ((remainingMillis + 999) / 1000).toInt()
        }

    /** Whether the resend action is currently allowed. */
    val canResend: Boolean
        get() = resendSecondsRemaining == 0 && !_state.value.isBusy

    // -------------------------------------------------------------------
    // Bindable input
    // -------------------------------------------------------------------

    /** Updates the email field (email step). Clears any stale error as the user retypes. */
    fun onEmailChange(value: String) {
        _state.update { it.copy(email = value, errorMessage = null) }
    }

    /** Updates the code field (code step) — digits only, capped at 6, so both manual
     * entry and a 6-digit paste land the same way. Clears any stale error. */
    fun onCodeChange(value: String) {
        val digits = value.filter(Char::isDigit).take(6)
        _state.update { it.copy(code = digits, errorMessage = null) }
    }

    // -------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------

    /** Step 1: request a code for the entered email and advance to the code step. */
    suspend fun submitEmail() {
        if (!canSubmitEmail) return
        requestCode(advancingToCodeStep = true)
    }

    /** Re-send a fresh code (only while past the cooldown). A no-op otherwise. */
    suspend fun resendCode() {
        if (_state.value.step != Step.CODE || !canResend) return
        requestCode(advancingToCodeStep = false)
    }

    /**
     * Step 2: verify the entered code. On success, transitions the app to
     * signed-in via [AppState]; on a stale/locked code, clears the field so the
     * user re-enters or resends. The screen calls this automatically once
     * [UiState.code] reaches 6 digits (typed or pasted).
     */
    suspend fun submitCode() {
        if (_state.value.step != Step.CODE || !canSubmitCode) return
        _state.update { it.copy(errorMessage = null, noticeMessage = null, isBusy = true) }
        try {
            val account = auth.verify(normalizedEmail, _state.value.code)
            // The token is now stored (the service persisted it); flip app state. The
            // guest→sign-in thread import is triggered by the caller via AppState.onSignedIn
            // (this view model only completes the sign-in itself, mirroring iOS).
            appState.completeSignIn(account.email)
            _state.update { it.copy(isBusy = false, signedInEmail = account.email) }
        } catch (e: OakError) {
            _state.update {
                it.copy(
                    isBusy = false,
                    errorMessage = verifyMessage(e),
                    code = if (shouldClearCode(e)) "" else it.code,
                )
            }
        } catch (e: Exception) {
            _state.update { it.copy(isBusy = false, errorMessage = GENERIC_ERROR_MESSAGE) }
        }
    }

    /** Return to the email step (e.g. "use a different email"), resetting code + cooldown. */
    fun editEmail() {
        cooldownUntil = null
        _state.update { it.copy(step = Step.EMAIL, code = "", errorMessage = null, noticeMessage = null) }
    }

    // -------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------

    /** Shared request-code path for both the first send and a resend. */
    private suspend fun requestCode(advancingToCodeStep: Boolean) {
        _state.update { it.copy(errorMessage = null, noticeMessage = null, isBusy = true) }
        val email = normalizedEmail
        try {
            auth.requestCode(email)
            cooldownUntil = now() + cooldownDurationMillis
            _state.update {
                it.copy(
                    isBusy = false,
                    step = if (advancingToCodeStep) Step.CODE else it.step,
                    code = if (advancingToCodeStep) "" else it.code,
                    noticeMessage = "We sent a 6-digit code to $email.",
                )
            }
        } catch (e: OakError) {
            _state.update { it.copy(isBusy = false, errorMessage = requestCodeMessage(e)) }
        } catch (e: Exception) {
            _state.update { it.copy(isBusy = false, errorMessage = GENERIC_ERROR_MESSAGE) }
        }
    }

    companion object {
        /** The default resend cooldown (accounts-and-access.md; mirrors iOS's 60s default). */
        const val COOLDOWN_MILLIS = 60_000L

        /** Generic fallback used for the (should-be-impossible) non-`OakError` path. */
        const val GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again."

        /** Shown for a transport fault (no connection). */
        const val CONNECTION_MESSAGE = "No connection. Check your network and try again."

        /** A minimal client-side shape check — local + domain around a single `@`, with a
         * dot in the domain. The server does authoritative validation. */
        fun looksLikeEmail(value: String): Boolean {
            val parts = value.split("@")
            if (parts.size != 2) return false
            val local = parts[0]
            val domain = parts[1]
            return local.isNotEmpty() && domain.contains(".") && !domain.startsWith(".") && !domain.endsWith(".")
        }

        /** Maps a `requestCode` failure to user-facing copy (M-AC-5.1: specific, not generic). */
        fun requestCodeMessage(error: OakError): String = when (error) {
            is OakError.Transport -> CONNECTION_MESSAGE
            is OakError.RateLimited -> rateLimitMessage(error.retryAfterSeconds)
            is OakError.Http -> when (error.code) {
                "invalid_email" -> "Enter a valid email address."
                "email_failed" -> "We couldn't send your code right now. Please try again."
                else -> GENERIC_ERROR_MESSAGE
            }
            OakError.Unauthorized, is OakError.Decoding, is OakError.ImageRejected -> GENERIC_ERROR_MESSAGE
        }

        /** Maps a `verify` failure to user-facing copy (M-AC-2.2). */
        fun verifyMessage(error: OakError): String = when (error) {
            is OakError.Transport -> CONNECTION_MESSAGE
            is OakError.RateLimited -> rateLimitMessage(error.retryAfterSeconds)
            is OakError.Http -> when (error.code) {
                "invalid_code" -> "That code is incorrect. Please try again."
                "invalid_or_expired" -> "That code is no longer valid. Request a new one."
                "too_many_attempts" -> "Too many incorrect attempts. Request a new code."
                else -> GENERIC_ERROR_MESSAGE
            }
            OakError.Unauthorized, is OakError.Decoding, is OakError.ImageRejected -> GENERIC_ERROR_MESSAGE
        }

        /** The OTP throttle message (request/verify caps), with the wait when known. */
        fun rateLimitMessage(retryAfterSeconds: Long?): String =
            if (retryAfterSeconds != null && retryAfterSeconds > 0) {
                "Too many attempts. Please wait ${retryAfterSeconds}s and try again."
            } else {
                "Too many attempts. Please wait a moment and try again."
            }

        /** A stale/locked code should be cleared so the next attempt starts fresh; a merely
         * wrong code is left in place so the user can correct a digit. */
        private fun shouldClearCode(error: OakError): Boolean =
            error is OakError.Http && (error.code == "invalid_or_expired" || error.code == "too_many_attempts")
    }
}
