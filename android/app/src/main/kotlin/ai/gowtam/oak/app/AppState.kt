package ai.gowtam.oak.app

import ai.gowtam.oak.services.AuthService
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.services.HistoryService
import ai.gowtam.oak.wire.AnswerDensity
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import android.util.Log
import androidx.compose.runtime.Stable
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

private const val TAG = "Oak.AppState"

/**
 * Root session/app state (component-design.md "App / session state"; mirrors iOS
 * `AppState`). Holds the cross-cutting state that outlives any single screen: the
 * current auth state, the active conversation id, the in-memory guest thread, and
 * that thread's resolved data scope (for the sign-in import).
 *
 * [Stable] (not `@Observable`/Compose `State`) so Compose can skip recomposition
 * intelligently while the class itself stays UI-framework-light — `StateFlow`
 * throughout, no composables — so it is plain JVM-testable. ViewModels/composables
 * `collectAsState()` the flows they need.
 */
@Stable
class AppState(
    private val appearanceStore: AppearanceStore = InMemoryAppearanceStore(),
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Guest)

    /** Whether the user is a guest or signed in. */
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _activeConversationId = MutableStateFlow<String?>(null)

    /** The active conversation id. `null` means a fresh, unsaved thread. */
    val activeConversationId: StateFlow<String?> = _activeConversationId.asStateFlow()

    private val _guestThread = MutableStateFlow<List<GuestTurn>>(emptyList())

    /**
     * The in-memory guest thread: turns kept only for the session and never
     * persisted. On sign-in these are mapped to the import payload ([onSignedIn]).
     * Appended to as the chat reducer streams turns.
     */
    val guestThread: StateFlow<List<GuestTurn>> = _guestThread.asStateFlow()

    /**
     * The pending durable turn per conversation: `session_id → turn_id`
     * (background-turns/design.md §6.3). A turn is recorded here on the `turn` SSE
     * frame and removed when it reaches a terminal event (answer/error/stopped) or a
     * reattach 404s. It lives on [AppState] — not the (per-thread) `ChatViewModel`
     * state — so it survives list⟷thread navigation and a tab switch even though ONE
     * shared view model backs every thread; that is what lets "send in chat A, work
     * in chat B" reattach chat A's still-running turn when it is reopened. Guest
     * threads are device-local, so this map is the guest's only pending pointer;
     * signed-in threads additionally recover it from `active_turn` on the history GET.
     */
    private val pendingTurns = java.util.concurrent.ConcurrentHashMap<String, String>()

    private val _guestThreadScope = MutableStateFlow<Format>(Format.Champions)

    /**
     * The guest thread's resolved data scope, mirrored from the chat reducer's
     * `scope` events so the guest→sign-in import can persist the thread under the
     * scope it actually ran in. Defaults to national-dex (the server default) until a
     * turn resolves otherwise; reset with the guest thread.
     */
    val guestThreadScope: StateFlow<Format> = _guestThreadScope.asStateFlow()

    private val _lastUsedScope = MutableStateFlow<Format?>(null)

    /**
     * Signed-in account's last-used game scope for NEW chats (from `GET /api/auth/me`
     * + every subsequent `scope` event while signed in). Survives New Chat so the
     * chip doesn't flash National Dex for a user mid–Gen 7 run. `null` for guests
     * and never-chatted accounts. Mirrors web's `lastUsedScope` / iOS `AppState`.
     */
    val lastUsedScope: StateFlow<Format?> = _lastUsedScope.asStateFlow()

    /**
     * Binds the active conversation id — the Chat tab's resume / New Chat navigation
     * (history-and-teams.md D-HIST-1): resuming a saved conversation sets it to that
     * conversation's id (so a relaunch would seed a fresh `ChatViewModel` under the
     * same thread); starting a new conversation or a quick-stop clears it to `null`.
     * Mirrors iOS's plain `appState.activeConversationId = …` assignment, exposed as
     * a method here since [activeConversationId] is otherwise read-only.
     */
    fun setActiveConversationId(id: String?) {
        _activeConversationId.value = id
    }

    // -------------------------------------------------------------------
    // Guest thread mutation
    // -------------------------------------------------------------------

    /** Appends one turn to the in-memory guest thread. */
    fun appendGuestTurn(turn: GuestTurn) {
        _guestThread.update { it + turn }
    }

    /** Records the scope a guest turn resolved to (mirrored from the `scope` SSE event). */
    fun setGuestThreadScope(format: Format) {
        _guestThreadScope.value = format
    }

    /** Updates the signed-in last-used scope (new-chat default). */
    fun setLastUsedScope(format: Format?) {
        _lastUsedScope.value = format
    }

    private val _lastUsedScopes = MutableStateFlow<List<Format>>(emptyList())

    /**
     * Signed-in MRU scopes (SCOPE-US-2), most recent first. Empty for guests.
     */
    val lastUsedScopes: StateFlow<List<Format>> = _lastUsedScopes.asStateFlow()

    fun setLastUsedScopes(formats: List<Format>) {
        _lastUsedScopes.value = formats
    }

    private val _answerDensity = MutableStateFlow<AnswerDensity>(AnswerDensity.Full)
    val answerDensity: StateFlow<AnswerDensity> = _answerDensity.asStateFlow()

    fun setAnswerDensity(density: AnswerDensity) {
        _answerDensity.value = density
    }

    private val _appearance = MutableStateFlow(appearanceStore.load())
    val appearance: StateFlow<AppearancePreference> = _appearance.asStateFlow()

    fun setAppearance(preference: AppearancePreference) {
        _appearance.value = preference
        appearanceStore.save(preference)
    }

    /**
     * One-shot hop to Dex / Teams from a slash, chip, or empty-desk row.
     * Consumed by [OakApp] so Chat does not own tab navigation.
     */
    sealed interface SurfaceRequest {
        data object None : SurfaceRequest
        data class Dex(
            val query: String?,
            val kind: ai.gowtam.oak.wire.EntityKind? = null,
            val format: Format? = null,
        ) : SurfaceRequest
        data class Teams(val id: String? = null, val name: String? = null) : SurfaceRequest
        data class ShareSnapshot(val id: String) : SurfaceRequest
        data class Calculator(val scenario: ai.gowtam.oak.wire.CalcScenario?) : SurfaceRequest
        /** Open the Dex tab on the Usage section (ADR-6). */
        data object Usage : SurfaceRequest
    }

    private val _surfaceRequest = MutableStateFlow<SurfaceRequest>(SurfaceRequest.None)
    val surfaceRequest: StateFlow<SurfaceRequest> = _surfaceRequest.asStateFlow()

    fun requestDex(
        query: String?,
        kind: ai.gowtam.oak.wire.EntityKind? = null,
        format: Format? = null,
    ) {
        _surfaceRequest.value = SurfaceRequest.Dex(query, kind, format)
    }

    fun requestTeams(id: String? = null, name: String? = null) {
        _surfaceRequest.value = SurfaceRequest.Teams(id, name)
    }

    fun requestShareSnapshot(id: String) {
        _surfaceRequest.value = SurfaceRequest.ShareSnapshot(id)
    }

    fun requestCalculator(scenario: ai.gowtam.oak.wire.CalcScenario?) {
        _surfaceRequest.value = SurfaceRequest.Calculator(scenario)
    }

    fun requestUsage() {
        _surfaceRequest.value = SurfaceRequest.Usage
    }

    fun consumeSurfaceRequest() {
        _surfaceRequest.value = SurfaceRequest.None
    }

    /**
     * A public share whose proposed team should be imported after the viewer
     * signs in (SHARE-AC-5.2 / ADR-12).
     */
    private val _pendingShareImportId = MutableStateFlow<String?>(null)
    val pendingShareImportId: StateFlow<String?> = _pendingShareImportId.asStateFlow()

    fun setPendingShareImport(id: String?) {
        _pendingShareImportId.value = id
    }

    // -------------------------------------------------------------------
    // Pending durable turns (background-turns/design.md §6.3)
    // -------------------------------------------------------------------

    /** Records the running turn for [sessionId] (set on the `turn` SSE frame). */
    fun setPendingTurn(sessionId: String, turnId: String) {
        pendingTurns[sessionId] = turnId
    }

    /** The pending turn id for [sessionId], or `null` when none is in flight. */
    fun pendingTurn(sessionId: String): String? = pendingTurns[sessionId]

    /** Clears [sessionId]'s pending turn (a terminal event or a resume 404). */
    fun clearPendingTurn(sessionId: String) {
        pendingTurns.remove(sessionId)
    }

    /** Clears the in-memory guest thread back to its defaults (e.g. on quick-stop). */
    fun clearGuestThread() {
        _guestThread.value = emptyList()
        _guestThreadScope.value = Format.Champions
    }

    // -------------------------------------------------------------------
    // Auth transitions
    // -------------------------------------------------------------------

    /**
     * Restores the session on launch: ask the backend who we are. The client attaches
     * the stored Bearer token (if any), so a valid token resolves to
     * [AuthState.SignedIn], an absent/expired token to [AuthState.Guest] (the `me`
     * route returns guest as a first-class 200). A transport failure leaves the state
     * as the launch default (guest) rather than throwing — the next authed call will
     * surface connectivity if it persists.
     */
    suspend fun restoreSession(auth: AuthService) {
        try {
            val snapshot = auth.me()
            _authState.value = snapshot.state
            if (snapshot.state is AuthState.SignedIn) {
                _lastUsedScope.value = snapshot.lastUsedScope
                _lastUsedScopes.value = snapshot.lastUsedScopes
            } else {
                _lastUsedScope.value = null
                _lastUsedScopes.value = emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "session restore failed; remaining a guest (${e::class.simpleName})")
        }
    }

    /**
     * Applies a completed verification: flips the whole app to signed-in. The token
     * was already persisted by the service. The on-screen guest thread is preserved;
     * importing it into durable history is the separate, non-fatal [importGuestThread]
     * step invoked by [onSignedIn].
     *
     * [lastUsedScope] is typically null on a fresh sign-in (verify doesn't return it);
     * the next `scope` event or a later `me()` restore fills it in.
     */
    fun completeSignIn(email: String, lastUsedScope: Format? = null) {
        _authState.value = AuthState.SignedIn(email)
        if (lastUsedScope != null) {
            _lastUsedScope.value = lastUsedScope
        }
    }

    /**
     * The full sign-in transition: flips to signed-in AND triggers the guest→sign-in
     * import when a guest thread exists (non-fatal — see [importGuestThread]). Returns
     * the imported conversation id, or `null` when there was nothing to import or the
     * import failed.
     */
    suspend fun onSignedIn(email: String, history: HistoryService): String? {
        completeSignIn(email)
        return importGuestThread(history)
    }

    /**
     * Signs out: best-effort server revoke + local token clear via the service, then
     * return to guest. Never throws — sign-out must always succeed in returning the
     * device to guest. The on-screen thread is preserved (only auth/session state
     * resets).
     */
    suspend fun onSignedOut(auth: AuthService) {
        try {
            auth.signOut()
        } catch (e: Exception) {
            Log.e(TAG, "sign-out failed; clearing local session anyway (${e::class.simpleName})")
        }
        resetToGuest()
    }

    /**
     * Handles a `401` on a previously-authed call: the session expired or was
     * revoked, so drop the token and return to guest — the on-screen thread is kept.
     * The revoke endpoint is idempotent, so reusing sign-out to clear the now-orphaned
     * token is safe.
     */
    suspend fun onUnauthorized(auth: AuthService) {
        Log.i(TAG, "received 401 on an authed call; returning to guest")
        try {
            auth.signOut()
        } catch (e: Exception) {
            Log.e(TAG, "token drop after 401 failed (${e::class.simpleName})")
        }
        resetToGuest()
    }

    /**
     * Deletes the account and its server data, then returns to guest. A real backend
     * failure propagates so the UI doesn't falsely report deletion; only a confirmed
     * deletion reaches the guest reset.
     */
    suspend fun deleteAccount(auth: AuthService) {
        auth.deleteAccount()
        onAccountDeleted()
    }

    /** Applies the post-deletion reset (split out so a caller that already confirmed
     * deletion server-side, e.g. a 401-during-delete path, can reset without re-calling
     * the service). */
    fun onAccountDeleted() {
        resetToGuest()
    }

    /** Clears all session-scoped state back to the guest baseline. The on-screen guest
     * thread is intentionally left untouched — only auth/session identifiers reset. */
    private fun resetToGuest() {
        _authState.value = AuthState.Guest
        _lastUsedScope.value = null
        _lastUsedScopes.value = emptyList()
        _activeConversationId.value = null
        _surfaceRequest.value = SurfaceRequest.None
    }

    // -------------------------------------------------------------------
    // Guest → sign-in thread import
    // -------------------------------------------------------------------

    /**
     * Persists the in-memory guest thread to durable history right after sign-in.
     * Maps the session-only [GuestTurn]s into the wire [ChatTurn]s the import endpoint
     * expects and uploads them under a stable session id; the returned conversation id
     * becomes the active conversation so follow-ups continue the same thread.
     *
     * **Non-fatal by design:** an empty thread imports nothing (returns `null`), and
     * any failure is logged and swallowed — the on-screen thread is preserved either
     * way, so a transient backend problem never costs the user their visible
     * conversation.
     */
    suspend fun importGuestThread(history: HistoryService): String? {
        val turns = _guestThread.value
        if (turns.isEmpty()) return null

        // Reuse the active conversation id when one exists; otherwise mint a fresh
        // session id (the import route creates the conversation under this id and
        // echoes it back as the returned id).
        val sessionId = _activeConversationId.value ?: UUID.randomUUID().toString()

        return try {
            val id = history.importGuestThread(
                sessionId = sessionId,
                format = _guestThreadScope.value,
                turns = turns.map { it.asChatTurn() },
            )
            if (id != null) _activeConversationId.value = id
            id
        } catch (e: Exception) {
            Log.e(TAG, "guest thread import failed; keeping the on-screen thread (${e::class.simpleName})")
            null
        }
    }
}

/**
 * One turn of the in-memory guest thread (session-only, never persisted). A user turn
 * carries its raw text; an assistant turn carries the COMPLETE [OakAnswer] (not just
 * its prose) so the guest→sign-in import preserves full fidelity — reasoning,
 * citations, inferences, and every structured block survive sign-in.
 */
data class GuestTurn(val id: String = UUID.randomUUID().toString(), val content: Content) {
    /** A guest turn's payload, discriminated by role. */
    sealed interface Content {
        /** A user message — its raw text. */
        data class User(val text: String) : Content

        /** A finalized assistant answer — the full [OakAnswer] the reducer had at finalize time. */
        data class Assistant(val answer: OakAnswer) : Content
    }

    /** The turn's role, kept first-class so call sites can branch without a `when` on [content]. */
    enum class Role { USER, ASSISTANT }

    val role: Role
        get() = when (content) {
            is Content.User -> Role.USER
            is Content.Assistant -> Role.ASSISTANT
        }
}

/** Maps a session-only guest turn into the wire [ChatTurn] the import endpoint validates. */
private fun GuestTurn.asChatTurn(): ChatTurn = when (val c = content) {
    is GuestTurn.Content.User -> ChatTurn.User(id = id, content = c.text)
    is GuestTurn.Content.Assistant -> ChatTurn.Assistant(id = id, answer = c.answer)
}
