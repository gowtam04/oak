package ai.gowtam.oak.features.account

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.auth.AuthViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.AuthService
import ai.gowtam.oak.services.AuthState
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Drives the Account screen (component-design.md "AccountViewModel";
 * accounts-and-access.md M-UI-US-7 equivalent): reflects the current tier
 * (guest vs. signed-in), runs sign-out, and owns the **account-deletion confirm
 * flow** (D-ACCT-2 / M-ACCT-US-6 — the Play Store deletion requirement). Mirrors
 * iOS `AccountViewModel` seam-for-seam.
 *
 * Depends on the [AuthService] **interface** (never `LiveAuthService`) so it is
 * unit-tested against `FakeAuthService`, and reads/flips the shared [appState]
 * for the session transitions (whose own transitions are covered by
 * `AppStateTest`). This view model adds no policy beyond mapping a failed
 * deletion to user-facing copy and gating the busy state.
 *
 * Actions are plain `suspend` functions — the caller (a Compose screen) drives
 * them from its own coroutine scope, so this stays JVM-testable without a
 * `Dispatchers.Main` setup.
 */
class AccountViewModel(
    private val auth: AuthService,
    val appState: AppState,
) : ViewModel() {

    /** Busy/error state for the sign-out and delete-account actions. */
    data class ActionState(
        /** `true` while a sign-out or deletion request is in flight (drives a spinner
         * and disables the destructive actions so they can't be double-fired). */
        val isBusy: Boolean = false,
        /** A user-facing error for a failed sign-out/deletion, or `null` when clear.
         * A successful deletion never sets this — it either completes (see
         * [deletionCompleted]) or this surfaces a recoverable message. */
        val errorMessage: String? = null,
        /**
         * One-shot signal that a deletion just completed (success OR an already-
         * orphaned 401 — both land the device on guest, per D-AC-ACCT2.3). The
         * screen shows a farewell snackbar on the `true` edge, then calls
         * [consumeDeletionCompleted].
         */
        val deletionCompleted: Boolean = false,
    )

    private val _actionState = MutableStateFlow(ActionState())
    val actionState: StateFlow<ActionState> = _actionState.asStateFlow()

    /** The live auth state, mirrored from [appState] so the screen reacts to
     * sign-in/out/deletion without holding its own copy. */
    val authState: StateFlow<AuthState> = appState.authState

    /** Whether the user is signed in (gates the sign-out + delete-account controls). */
    val isSignedIn: Boolean
        get() = appState.authState.value is AuthState.SignedIn

    /** The signed-in email, or `null` for a guest. */
    val email: String?
        get() = (appState.authState.value as? AuthState.SignedIn)?.email

    /** A short tier label, paired with text in the UI so the tier is never carried by
     * color alone. */
    val tierTitle: String
        get() = if (isSignedIn) SIGNED_IN_TIER_TITLE else GUEST_TIER_TITLE

    /** A qualitative description of the current tier's limit and what it unlocks.
     * Deliberately qualitative — the exact rate-limit numbers are enforced
     * server-side and must not be hard-coded into the client. */
    val tierDescription: String
        get() = if (isSignedIn) SIGNED_IN_TIER_DESCRIPTION else GUEST_TIER_DESCRIPTION

    // -------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------

    /** Signs out and returns to guest (M-ACCT-US-3). Best-effort server revoke + a local
     * token clear happen inside [AppState.onSignedOut], which never throws — so this
     * always lands the device back on guest. */
    suspend fun signOut() {
        _actionState.update { it.copy(errorMessage = null, isBusy = true) }
        appState.onSignedOut(auth)
        _actionState.update { it.copy(isBusy = false) }
    }

    /**
     * Permanently deletes the account and its server data, then returns to guest
     * (D-AC-ACCT2 / M-ACCT-US-6). A genuine backend failure is mapped to a
     * recoverable message and the user stays signed in — the UI must never
     * falsely claim a deletion that did not happen. A `401` (the token already
     * orphaned) is treated as an equivalent outcome to success per D-AC-ACCT2.3
     * and conventions.md's "Unauthorized → drop token, return to guest" rule —
     * [AppState.onUnauthorized] performs that drop, and the farewell snackbar
     * still shows.
     */
    suspend fun deleteAccount() {
        _actionState.update { it.copy(errorMessage = null, isBusy = true) }
        try {
            appState.deleteAccount(auth)
            _actionState.update { it.copy(isBusy = false, deletionCompleted = true) }
        } catch (e: OakError.Unauthorized) {
            appState.onUnauthorized(auth)
            _actionState.update { it.copy(isBusy = false, deletionCompleted = true) }
        } catch (e: OakError) {
            _actionState.update { it.copy(isBusy = false, errorMessage = deletionMessage(e)) }
        } catch (e: Exception) {
            _actionState.update { it.copy(isBusy = false, errorMessage = DELETION_FAILED_MESSAGE) }
        }
    }

    /** Clears the current error message (e.g. when the user dismisses the banner). */
    fun dismissError() {
        _actionState.update { it.copy(errorMessage = null) }
    }

    /** Clears the one-shot deletion-completed signal after the screen has shown its
     * farewell snackbar. */
    fun consumeDeletionCompleted() {
        _actionState.update { it.copy(deletionCompleted = false) }
    }

    // -------------------------------------------------------------------
    // Sign-in handoff
    // -------------------------------------------------------------------

    /** Builds the [AuthViewModel] for the sign-in sheet, keeping the [AuthService]
     * inside this view model so the screen never holds a service directly. The
     * shared [appState] is reused so a completed verification flips the whole app
     * to signed-in. */
    fun makeAuthViewModel(): AuthViewModel = AuthViewModel(auth = auth, appState = appState)

    companion object {
        const val GUEST_TIER_TITLE = "Guest"
        const val SIGNED_IN_TIER_TITLE = "Signed in"

        const val GUEST_TIER_DESCRIPTION =
            "You're using Oak as a guest, with the lower usage limit. Sign in to raise your limit and unlock saved history and the team builder."
        const val SIGNED_IN_TIER_DESCRIPTION =
            "You're signed in, with the higher usage limit plus saved history and the team builder across your devices."

        /** The explanatory body shown in the deletion confirmation (D-AC-ACCT2.2): names
         * exactly what is removed so the consent is informed. */
        const val DELETION_WARNING =
            "This permanently deletes your account, your saved conversations, and your saved teams. This can't be undone."

        const val CONNECTION_MESSAGE = "No connection. Check your network and try again."
        const val DELETION_FAILED_MESSAGE = "We couldn't delete your account right now. Please try again."

        /** Maps a failed deletion to user-facing copy. A transport fault gets the specific
         * connection message (so the user knows to check the network); every other fault
         * gets the generic deletion-failed message rather than leaking a status code.
         * [OakError.Unauthorized] is handled by a separate catch clause in [deleteAccount]
         * (it is not a failure — it lands the same as success), but this `when` stays
         * exhaustive over the sealed type. */
        fun deletionMessage(error: OakError): String = when (error) {
            is OakError.Transport -> CONNECTION_MESSAGE
            OakError.Unauthorized,
            is OakError.RateLimited,
            is OakError.Http,
            is OakError.Decoding,
            is OakError.ImageRejected,
            -> DELETION_FAILED_MESSAGE
        }
    }
}
