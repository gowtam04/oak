package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.AuthVerifyResponse
import ai.gowtam.oak.wire.MeResponse
import android.util.Log
import kotlinx.serialization.Serializable

/**
 * The sign-in lifecycle seam (component-design.md "Services layer"; mirrors iOS
 * `AuthService`). View models depend on this **interface** (never `LiveAuthService`)
 * so they unit-test against a fake.
 *
 * Every method is `suspend` and surfaces failures as the single typed [OakError].
 * Sign-in is passwordless email-OTP: [requestCode] mails a 6-digit code, [verify]
 * exchanges it for a session — storing the raw Bearer token via [TokenStore] on
 * success. [me] reports the current state on launch, [signOut] returns to guest, and
 * [deleteAccount] performs real backend deletion.
 */
interface AuthService {
    /**
     * Requests a one-time code be emailed to [email]. Maps the route's failures to
     * [OakError]: `invalid_email` (400) → [OakError.Http], `rate_limited` (429) →
     * [OakError.RateLimited], `email_failed` (502) → [OakError.Http]. The success path
     * is non-enumerating (identical for new and returning emails), so there is nothing
     * to return.
     */
    suspend fun requestCode(email: String)

    /**
     * Verifies [code] for [email]. On success the raw session token is stored via
     * [TokenStore] (so it survives relaunch and rides every authed request as
     * `Authorization: Bearer`) and the resolved [Account] is returned. A wrong or
     * expired code throws an [OakError] (`invalid_code` / `invalid_or_expired` /
     * `too_many_attempts`).
     */
    suspend fun verify(email: String, code: String): Account

    /**
     * Reports the current auth state for launch restore: the request carries the
     * stored Bearer token (when present); a valid token resolves to
     * [AuthState.SignedIn], an absent or invalid token to [AuthState.Guest] (the route
     * returns guest as a first-class 200, never an error).
     */
    suspend fun me(): AuthState

    /**
     * Ends the device session: best-effort server revoke, then always clears the
     * stored token so the app returns to guest. Idempotent — calling it without a
     * session is a no-op.
     */
    suspend fun signOut()

    /**
     * Permanently deletes the account and all its server data, then clears the local
     * token. A transport/HTTP failure (other than an already-orphaned token)
     * propagates so the UI does not falsely claim deletion.
     */
    suspend fun deleteAccount()
}

/**
 * The result of a successful [AuthService.verify]. [created] distinguishes a
 * first-time signup (`true`) from a returning login (`false`); the UI may greet a
 * new account differently.
 */
data class Account(val email: String, val created: Boolean)

/** Whether the user is browsing as a guest or signed in with an email account. */
sealed interface AuthState {
    data object Guest : AuthState
    data class SignedIn(val email: String) : AuthState
}

/**
 * Production [AuthService] over [OakApiClient] (the network) and [TokenStore]. It
 * owns the only policy decisions the auth surface needs: when to persist the token
 * (on [verify]) and when to clear it (on [signOut] / [deleteAccount]).
 */
class LiveAuthService(
    private val apiClient: OakApiClient,
    private val tokenStore: TokenStore,
) : AuthService {

    override suspend fun requestCode(email: String) {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/auth/request-code",
            body = Endpoint.jsonBody(RequestCodeBody.serializer(), RequestCodeBody(email)),
            requiresAuth = false,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun verify(email: String, code: String): Account {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/auth/verify",
            body = Endpoint.jsonBody(VerifyBody.serializer(), VerifyBody(email, code)),
            requiresAuth = false,
        )
        val response = apiClient.send(endpoint, AuthVerifyResponse.serializer())
        // Persist the Bearer token — the one place a token is stored.
        tokenStore.set(response.token)
        return Account(email = response.email, created = response.created)
    }

    override suspend fun me(): AuthState {
        val endpoint = Endpoint(method = Endpoint.Method.GET, path = "/api/auth/me", requiresAuth = true)
        val response = apiClient.send(endpoint, MeResponse.serializer())
        val email = response.email
        return if (response.signedIn && email != null) AuthState.SignedIn(email) else AuthState.Guest
    }

    override suspend fun signOut() {
        // Best-effort server revoke: a transport/HTTP failure must NOT block the
        // local return to guest, so it is logged (never swallowed silently) and the
        // token is cleared regardless. Idempotent.
        val endpoint = Endpoint(method = Endpoint.Method.POST, path = "/api/auth/signout", requiresAuth = true)
        try {
            apiClient.sendNoContent(endpoint)
        } catch (e: OakError) {
            Log.e(TAG, "sign-out endpoint failed (${e::class.simpleName}); clearing local token anyway")
        }
        tokenStore.clear()
    }

    override suspend fun deleteAccount() {
        val endpoint = Endpoint(method = Endpoint.Method.DELETE, path = "/api/auth/account", requiresAuth = true)
        try {
            apiClient.sendNoContent(endpoint)
        } catch (e: OakError.Unauthorized) {
            // The token is already orphaned (the account row is gone) — clearing the
            // local token completes the deletion from the device's point of view.
            Log.i(TAG, "account deletion saw 401 (already orphaned); clearing local token")
        }
        // Reached only on a confirmed 2xx delete or an already-orphaned 401: every
        // other failure (transport / 5xx / rate limit) propagated above with the
        // token intact, so the account is genuinely gone before we clear it.
        tokenStore.clear()
    }

    private companion object {
        const val TAG = "Oak.Auth"
    }
}

/** `POST /api/auth/request-code` body. `email` is identical on the wire. */
@Serializable
private data class RequestCodeBody(val email: String)

/** `POST /api/auth/verify` body. `email`/`code` are identical on the wire. */
@Serializable
private data class VerifyBody(val email: String, val code: String)
