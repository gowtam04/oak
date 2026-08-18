package ai.gowtam.oak.wire

import kotlinx.serialization.Serializable

// Response DTOs for the `/api/auth/*` endpoints. These are already camelCase on
// the wire (`signedIn`, `expiresAt`) — the documented "mixed conventions" case
// (data-model.md): they are NOT snake_case, so no remapping is needed.

/**
 * `POST /api/auth/verify` success body. [token] is the Bearer-auth session
 * token the client stores in the Keystore and sends as
 * `Authorization: Bearer`. [expiresAt] is the epoch-ms expiry of the 30-day
 * session window. Only the 200 success path returns this shape; failures
 * decode as [ApiErrorBody].
 */
@Serializable
data class AuthVerifyResponse(
    val ok: Boolean,
    val email: String,
    val created: Boolean,
    val token: String,
    val expiresAt: Long,
)

/**
 * `GET /api/auth/me` body. `{ signedIn: true, email, lastUsedScope? }` for a
 * resolved account, `{ signedIn: false }` for a guest (no `email`) — always 200,
 * never an error (a guest is a first-class value, not a failure).
 * [lastUsedScope] is the account's remembered game scope for new chats (a Format
 * wire string); omitted when never set.
 */
@Serializable
data class MeResponse(
    val signedIn: Boolean,
    val email: String? = null,
    val lastUsedScope: String? = null,
    /** Signed-in MRU scopes (SCOPE-US-2). Absent for guests / older servers. */
    val lastUsedScopes: List<String>? = null,
    /** Compact/full default (COMPACT-US-2). Absent or `"full"` when unset. */
    val answerDensity: String? = null,
)

/**
 * The shared `{ code, message }` error envelope returned by non-2xx responses.
 * [status] is NOT part of the JSON body — the HTTP status line carries it — so
 * it decodes as `null` from the wire; it is a slot the networking layer (P2)
 * fills from the response when mapping to `OakError`.
 */
@Serializable
data class ApiErrorBody(
    val code: String,
    val message: String,
    val status: Int? = null,
)
