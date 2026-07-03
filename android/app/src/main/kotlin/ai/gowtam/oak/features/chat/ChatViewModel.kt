package ai.gowtam.oak.features.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.GuestTurn
import ai.gowtam.oak.networking.ImageRejectReason
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.services.BitmapSourceImage
import ai.gowtam.oak.services.ChatService
import ai.gowtam.oak.services.SourceImage
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SseEvent
import android.graphics.Bitmap
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The chat thread's view model — the **SSE reducer** at the heart of the chat
 * experience plus the full **stream-resilience state machine** (DADR-13). It is the
 * class-for-class Kotlin port of `ios/OakApp/Features/Chat/ChatViewModel.swift`.
 *
 * It holds the visible [turns], the in-progress streaming state (tool-activity items
 * + a streamed-text buffer), the composer state (text + staged images), and the
 * turn's game scope (server-resolved scope + a pending chip pick), and folds the
 * [SseEvent] stream into UI state one event at a time. All renderable state is
 * published as a single [uiState] [StateFlow] the screen collects; the machine's
 * private bookkeeping (retry counters, foreground flag, session id) is not part of it.
 *
 * Reducer contract (`sse-types.ts`): `tool_activity`* → `answer_start`* / `answer_delta`*
 * → exactly one terminal `answer`. On `answer_start` the streamed-text buffer clears
 * (the validate-and-re-emit reset) but the tool-activity history is kept; `answer_delta`
 * appends; the terminal `answer` replaces the buffer with the authoritative [OakAnswer]
 * and stops. Grok delivers the whole answer in a SINGLE delta, so the reducer never
 * assumes many. An `error` event (or a thrown transport fault) becomes a recoverable
 * banner and never leaves a half-rendered answer; a non-`answered` status is rendered
 * as a normal answer, never an error.
 *
 * It depends on the [ChatService] **interface** (never `LiveChatService`) so it
 * unit-tests against a fake. The wake-lock is exposed as [keepScreenOn]: the hosting
 * `Activity`/screen keeps the display on for the stream duration via
 * `FLAG_KEEP_SCREEN_ON` while a turn runs — released on every terminal/stop/cancel path.
 */
class ChatViewModel(
    private val chat: ChatService,
    private val appState: AppState,
    /** Monotonic clock (millis) for the quick-stop window; injectable for tests. */
    private val now: () -> Long = { System.currentTimeMillis() },
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())

    /** The single renderable snapshot the chat screen collects. */
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val _keepScreenOn = MutableStateFlow(false)

    /**
     * `true` while a turn streams — the host observes this and toggles
     * `FLAG_KEEP_SCREEN_ON` on the window (the Android analog of iOS's
     * `isIdleTimerDisabled`). Released on every terminal/stop/cancel path so the
     * screen can never be left stuck on.
     */
    val keepScreenOn: StateFlow<Boolean> = _keepScreenOn.asStateFlow()

    // ---- Renderable state (mirrored into [uiState] via [publish]) ----

    private var turns: List<ChatTurnItem> = emptyList()
    private var streamingText: String = ""
    private var toolActivities: List<ToolActivity> = emptyList()
    private var isStreaming: Boolean = false
    private var errorBanner: ErrorBanner? = null
    private var resolvedScope: Format? = null
    private var resolvedScopeSource: ScopeSource? = null
    private var scopeSeed: Format? = null
    private var pendingImages: List<Bitmap> = emptyList()
    private var composerText: String = ""
    private var reconnecting: Boolean = false

    // ---- State-machine bookkeeping (NOT part of [uiState]) ----

    /** The client thread id sent as `session_id` (equals the conversation id on resume). */
    private var sessionId: String = appState.activeConversationId.value ?: UUID.randomUUID().toString()

    /** The in-flight stream consumer; cancelled on a new turn or the screen leaving. */
    private var streamJob: Job? = null

    /** The last turn's request, retained so [retry]/auto-reconnect can re-open the stream. */
    private var lastRequest: PendingRequest? = null

    /** When the current turn started (millis), for the quick-stop window. `null` when idle. */
    private var turnStartedAt: Long? = null

    /** Armed while the app was backgrounded DURING the current stream; gates auto-retry. */
    private var hiddenDuringTurn: Boolean = false

    /** Auto-retries already spent on the current turn (bounded by [MAX_RETRIES]). */
    private var retryCount: Int = 0

    /** A drop noticed while still backgrounded; the retry fires on the next foreground. */
    private var pendingRetry: Boolean = false

    /** Whether the app is currently in the foreground (updated by the lifecycle hooks). */
    private var isForeground: Boolean = true

    init {
        publish()
    }

    // ---- Derived state ----

    /**
     * The scope the header chip displays and the artifact viewer scopes to: a pending
     * chip pick, else the server-resolved scope, else the champions default — identical
     * to web's `displayFormat = scopeSeed ?? resolvedScope ?? "champions"`.
     */
    private fun displayFormat(): Format = scopeSeed ?: resolvedScope ?: Format.Champions

    /**
     * Whether the composer can send: not already streaming, and either some text or at
     * least one attached image (an image-only turn is valid).
     */
    private fun canSend(): Boolean =
        !isStreaming && (composerText.trim().isNotEmpty() || pendingImages.isNotEmpty())

    /** The coarse in-progress phase, for the streaming status view. */
    private fun streamingPhase(): StreamingPhase = when {
        !isStreaming -> StreamingPhase.IDLE
        streamingText.isNotEmpty() -> StreamingPhase.ANSWERING
        toolActivities.isNotEmpty() -> StreamingPhase.USING_TOOLS
        else -> StreamingPhase.THINKING
    }

    private fun publish() {
        _uiState.value = ChatUiState(
            turns = turns,
            streamingText = streamingText,
            toolActivities = toolActivities,
            isStreaming = isStreaming,
            errorBanner = errorBanner,
            displayFormat = displayFormat(),
            resolvedScope = resolvedScope,
            scopeSeed = scopeSeed,
            pendingImages = pendingImages,
            composerText = composerText,
            reconnecting = reconnecting,
            canSend = canSend(),
            streamingPhase = streamingPhase(),
        )
    }

    // ---- Composer actions ----

    /** Two-way composer text setter (the `TextField`'s `onValueChange`). */
    fun setComposerText(text: String) {
        composerText = text
        publish()
    }

    /**
     * Prefills the composer with [text] WITHOUT sending — the artifact viewer's "Ask
     * about this in chat" affordance (mirrors web's `askInChat`).
     */
    fun prefillComposer(text: String) = setComposerText(text)

    /**
     * Stages images for the next turn, capped at [MAX_ATTACHED_IMAGES]. Returns the
     * number actually added so the composer can note when some were dropped at the cap.
     */
    fun attachImages(images: List<Bitmap>): Int {
        val remaining = MAX_ATTACHED_IMAGES - pendingImages.size
        if (remaining <= 0 || images.isEmpty()) return 0
        val toAdd = images.take(remaining)
        pendingImages = pendingImages + toAdd
        publish()
        return toAdd.size
    }

    /** Removes a staged image (the composer's per-thumbnail remove); a no-op out of range. */
    fun removeImage(index: Int) {
        if (index !in pendingImages.indices) return
        pendingImages = pendingImages.toMutableList().also { it.removeAt(index) }
        publish()
    }

    /**
     * Sends the composed turn: appends the user message immediately, resets the
     * streaming state, and starts consuming the event stream. A no-op when nothing can
     * be sent.
     */
    fun send() {
        if (!canSend()) return
        val text = composerText.trim()
        val images = pendingImages

        // Tear down any prior stream before starting a new turn.
        cancelStreaming()

        turns = turns + ChatTurnItem.User(text = text, imageCount = images.size)
        mirrorGuestTurn(GuestTurn(content = GuestTurn.Content.User(text)))

        composerText = ""
        pendingImages = emptyList()
        // Reset reconnect bookkeeping for this fresh turn and stamp the quick-stop window.
        turnStartedAt = now()
        retryCount = 0
        pendingRetry = false
        hiddenDuringTurn = false
        reconnecting = false
        // A pending chip pick (if any) rides THIS turn as `scope_seed`; a `scope` event
        // clears `scopeSeed` mid-turn so it never leaks onto the next turn.
        val request = PendingRequest(message = text, images = images, scopeSeed = scopeSeed)
        lastRequest = request
        beginStreaming(request)
    }

    /**
     * Sends [text] verbatim as the next user message (clarify options + suggestion
     * chips + example prompts). A no-op while a turn is already streaming.
     */
    fun sendFollowUp(text: String) {
        if (isStreaming) return
        composerText = text
        send()
    }

    /**
     * Re-opens the stream for the last turn after a recoverable failure, WITHOUT
     * appending another user turn (the message is already in the thread).
     */
    fun retry() {
        if (isStreaming) return
        val request = lastRequest ?: return
        beginStreaming(request)
    }

    /**
     * Handles the composer's Stop tap. A user-initiated stop is NOT a failure (no error
     * banner). A stop within [QUICK_STOP_MS] of [send] is a "quick stop": the whole
     * thread is wiped, the session rotated, and the message (+ staged images) restored
     * into the composer for an easy redo. A later stop leaves the answerless user turn.
     */
    fun stopStreaming() = performStop(now())

    /**
     * The clock-injectable core of [stopStreaming] — internal so tests can drive the
     * quick-stop vs. late-stop decision deterministically on a virtual clock.
     */
    fun performStop(nowMillis: Long) {
        if (!isStreaming) return
        val started = turnStartedAt
        val elapsed = if (started == null) Long.MAX_VALUE else nowMillis - started
        val stopped = lastRequest
        // Tear down the stream (no banner) and clear all reconnect state / wake hold.
        cancelStreaming()

        if (elapsed >= QUICK_STOP_MS || stopped == null) {
            // Late stop: keep the answerless user turn in the thread; nothing else to do.
            return
        }

        // Quick stop: wipe to a brand-new session and restore the message for a redo.
        // Scope is intentionally NOT reset (web keeps resolvedScope/scopeSeed on stop).
        turns = emptyList()
        streamingText = ""
        toolActivities = emptyList()
        errorBanner = null
        lastRequest = null
        turnStartedAt = null
        sessionId = UUID.randomUUID().toString()
        appState.setActiveConversationId(null)
        if (appState.authState.value is AuthState.Guest) {
            appState.clearGuestThread()
        }
        composerText = stopped.message
        pendingImages = stopped.images
        publish()
    }

    // ---- Lifecycle (screen-off auto-reconnect — web's `visibilitychange`) ----

    /**
     * The app entered the background (screen lock / app switch), wired from
     * `Lifecycle.Event.ON_STOP`. If a turn is streaming, arm the screen-off auto-retry
     * gate so a resulting connection drop can heal on resume.
     */
    fun onEnterBackground() {
        isForeground = false
        if (isStreaming) hiddenDuringTurn = true
    }

    /**
     * The app returned to the foreground, wired from `Lifecycle.Event.ON_START`. Fire
     * any retry that was deferred because the drop was noticed while backgrounded.
     */
    fun onEnterForeground() {
        isForeground = true
        if (pendingRetry) fireRetry()
    }

    /**
     * Records an explicit scope pick from the header chip. It seeds the NEXT turn as
     * `scope_seed` and immediately updates [displayFormat]. Ignored mid-stream so a
     * turn's scope stays stable (the chip is disabled then in the UI).
     */
    fun selectScope(format: Format) {
        if (isStreaming) return
        scopeSeed = format
        publish()
    }

    // ---- Conversation lifecycle ----

    /**
     * Starts a fresh conversation: tears down any stream, clears the thread, and rotates
     * the session id so the agent has no prior context. Clears the in-memory guest
     * thread for guests and drops any resolved scope so the chip falls back to champions.
     */
    fun startNewConversation() {
        cancelStreaming()
        turns = emptyList()
        streamingText = ""
        toolActivities = emptyList()
        errorBanner = null
        composerText = ""
        pendingImages = emptyList()
        lastRequest = null
        turnStartedAt = null
        sessionId = UUID.randomUUID().toString()
        appState.setActiveConversationId(null)
        resolvedScope = null
        resolvedScopeSource = null
        scopeSeed = null
        if (appState.authState.value is AuthState.Guest) {
            appState.clearGuestThread()
        }
        publish()
    }

    /**
     * Seeds the thread from a resumed conversation's rehydrated turns and binds the
     * session to its id, so earlier answers re-render through the normal answer-card
     * tree and follow-ups continue the saved thread under the same `session_id`. [format]
     * seeds [resolvedScope] so the chip + viewer reflect the saved scope immediately.
     * Also binds [AppState.activeConversationId] to [conversationId] (mirrors iOS's
     * `HistoryDetailViewModel.resume()`). Called by the Chat tab's history affordance
     * once it has loaded the conversation's full detail.
     */
    fun loadResumed(conversationId: String, format: Format, turns: List<ChatTurn>) {
        cancelStreaming()
        sessionId = conversationId
        appState.setActiveConversationId(conversationId)
        this.turns = turns.map { turn ->
            when (turn) {
                is ChatTurn.User -> ChatTurnItem.User(text = turn.content, imageCount = 0)
                is ChatTurn.Assistant -> ChatTurnItem.Assistant(answer = turn.answer)
            }
        }
        resolvedScope = format
        resolvedScopeSource = null
        scopeSeed = null
        streamingText = ""
        toolActivities = emptyList()
        errorBanner = null
        publish()
    }

    /**
     * Cancels the in-flight stream (a new turn, or the screen disappearing). Leaves the
     * thread intact; a cancelled consumer never writes a banner. Also clears the
     * reconnect bookkeeping and releases the wake hold so "Reconnecting…" / the screen
     * lock can never get stuck on.
     */
    fun cancelStreaming() {
        streamJob?.cancel()
        streamJob = null
        isStreaming = false
        reconnecting = false
        pendingRetry = false
        hiddenDuringTurn = false
        retryCount = 0
        setKeepScreenOn(false)
        publish()
    }

    /** Releases the stream on `ViewModel` teardown so the wake hold never leaks. */
    override fun onCleared() {
        cancelStreaming()
        super.onCleared()
    }

    // ---- Reducer (one event at a time) ----

    /**
     * Folds a single [SseEvent] into the streaming state. Internal so the transition
     * rules are unit-testable directly, in addition to the end-to-end [send] path.
     */
    fun apply(event: SseEvent) {
        // Any event means the stream is producing output again → clear "Reconnecting…".
        reconnecting = false
        when (event) {
            is SseEvent.Scope -> {
                // Adopt this turn's scope and retire any pending chip pick — the
                // conversation's scope is now sticky server-side and outranks a stale
                // seed on the following turn.
                resolvedScope = event.format
                resolvedScopeSource = event.source
                scopeSeed = null
                mirrorGuestScope(event.format)
            }

            is SseEvent.ToolActivity ->
                toolActivities = toolActivities + ToolActivity(tool = event.tool, label = event.label)

            SseEvent.AnswerStart ->
                // Re-emit reset: clear the streamed buffer, KEEP the tool-activity history.
                streamingText = ""

            is SseEvent.AnswerDelta ->
                streamingText += event.text

            is SseEvent.Answer -> {
                // The terminal, authoritative answer replaces the streamed buffer and ends
                // the turn. A non-`answered` status is rendered as a normal answer.
                turns = turns + ChatTurnItem.Assistant(answer = event.answer)
                // Mirror the FULL answer so the guest→sign-in import is non-lossy.
                mirrorGuestTurn(GuestTurn(content = GuestTurn.Content.Assistant(event.answer)))
                streamingText = ""
                toolActivities = emptyList()
                isStreaming = false
                setKeepScreenOn(false)
            }

            is SseEvent.Error -> {
                // Transport/API fault delivered in-band: a recoverable banner, no
                // half-rendered answer. The user turn stays. An in-band `error` frame is
                // NEVER auto-retried (it's a real model/agent fault, not a connection
                // drop) — this runs inside `apply`, outside the retry gate.
                errorBanner = ErrorBanner(
                    message = bannerMessage(event.code, event.message),
                    isRetryable = true,
                )
                streamingText = ""
                toolActivities = emptyList()
                isStreaming = false
                setKeepScreenOn(false)
            }
        }
        publish()
    }

    // ---- Streaming internals ----

    private fun beginStreaming(request: PendingRequest) {
        streamingText = ""
        toolActivities = emptyList()
        errorBanner = null
        isStreaming = true
        // A fresh attempt: only a hide DURING it should arm the auto-retry.
        hiddenDuringTurn = false
        setKeepScreenOn(true)
        publish()

        val images: List<SourceImage> = request.images.map { BitmapSourceImage(it) }
        val stream = chat.send(
            sessionId = sessionId,
            message = request.message,
            images = images,
            scopeSeed = request.scopeSeed,
        )
        streamJob = viewModelScope.launch { consume(stream) }
    }

    private suspend fun consume(stream: Flow<SseEvent>) {
        try {
            stream.collect { event ->
                if (!currentCoroutineContext().isActive) return@collect
                apply(event)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: OakError) {
            // A connection drop (`Transport`) while backgrounded auto-recovers; every
            // other OakError (rate limit, HTTP, image rejection, decode) is a clean
            // server fault — surface it, never auto-retry.
            if (e is OakError.Transport && handleRecoverableFailure()) return
            applyStreamFailure(e)
            return
        } catch (e: Exception) {
            // An unexpected non-OakError throw is treated as a connection drop.
            if (handleRecoverableFailure()) return
            applyStreamFailure(OakError.Transport(e::class.simpleName ?: "unknown"))
            return
        }
        // The stream ended without a terminal answer/error and was not cancelled — a
        // dropped socket can return a clean EOF instead of throwing. Recover if the drop
        // coincided with backgrounding; otherwise clear the working flag (defensive).
        if (isStreaming) {
            if (handleRecoverableFailure()) return
            isStreaming = false
            setKeepScreenOn(false)
            publish()
        }
    }

    /**
     * Maps a thrown transport/HTTP fault to a recoverable banner. Clears any partial
     * answer; the user turn remains so the user can retry.
     */
    private fun applyStreamFailure(error: OakError) {
        errorBanner = banner(error)
        streamingText = ""
        toolActivities = emptyList()
        isStreaming = false
        reconnecting = false
        setKeepScreenOn(false)
        publish()
    }

    /**
     * Decides whether a connection drop should be auto-recovered. Returns `true` if it
     * took ownership (fired or armed a retry); `false` ⇒ the caller surfaces the error.
     * Only a drop that happened while backgrounded, up to [MAX_RETRIES] times, recovers.
     */
    private fun handleRecoverableFailure(): Boolean {
        if (!hiddenDuringTurn || retryCount >= MAX_RETRIES) return false
        if (isForeground) {
            // Already back in the foreground — re-send immediately.
            fireRetry()
        } else {
            // Still backgrounded — show "Reconnecting…" and fire on foreground. The turn
            // stays in flight; keep the streamed buffer cleared so no half-answer lingers.
            pendingRetry = true
            reconnecting = true
            isStreaming = true
            streamingText = ""
            toolActivities = emptyList()
            errorBanner = null
            publish()
        }
        return true
    }

    /**
     * Re-opens the stream for the retained turn as an automatic recovery attempt (keeps
     * the turn in flight; shows "Reconnecting…" until output resumes).
     */
    private fun fireRetry() {
        val request = lastRequest ?: return
        pendingRetry = false
        retryCount += 1
        beginStreaming(request)
        reconnecting = true
        publish()
    }

    private fun setKeepScreenOn(on: Boolean) {
        _keepScreenOn.value = on
    }

    /**
     * Mirrors a completed turn into the in-memory guest thread (guests only) so the
     * guest→sign-in import has the turns. Signed-in turns are persisted server-side.
     */
    private fun mirrorGuestTurn(turn: GuestTurn) {
        if (appState.authState.value is AuthState.Guest) appState.appendGuestTurn(turn)
    }

    /**
     * Mirrors the latest turn's RESOLVED scope onto the guest thread (guests only), so
     * the import can upload the thread under the scope it actually ran in. A pending chip
     * pick is intentionally NOT mirrored — no turn has run under it yet.
     */
    private fun mirrorGuestScope(format: Format) {
        if (appState.authState.value is AuthState.Guest) appState.setGuestThreadScope(format)
    }

    // ---- Error copy ----

    /**
     * Maps an [OakError] to a banner. Rate-limited guests get the "sign in raises the
     * limit" hint.
     */
    private fun banner(error: OakError): ErrorBanner = when (error) {
        is OakError.Transport -> ErrorBanner(CONNECTION_MESSAGE, isRetryable = true)
        is OakError.RateLimited -> {
            var message = rateLimitMessage(error.retryAfterSeconds)
            if (appState.authState.value is AuthState.Guest) {
                message += " Sign in to raise the limit."
            }
            ErrorBanner(message, isRetryable = true)
        }
        OakError.Unauthorized -> ErrorBanner(SESSION_EXPIRED_MESSAGE, isRetryable = false)
        is OakError.Http -> ErrorBanner(error.message.ifEmpty { GENERIC_MESSAGE }, isRetryable = true)
        is OakError.ImageRejected -> ErrorBanner(imageRejectedMessage(error.reason), isRetryable = true)
        is OakError.Decoding -> ErrorBanner(GENERIC_MESSAGE, isRetryable = true)
    }

    /** One turn's request, retained for [retry]/auto-reconnect. */
    private data class PendingRequest(
        val message: String,
        val images: List<Bitmap>,
        val scopeSeed: Format?,
    )

    companion object {
        /** Max images attachable to one turn — the backend's `MAX_IMAGES`. */
        const val MAX_ATTACHED_IMAGES = 4

        /** The quick-stop window: a Stop within this of [send] wipes the just-sent turn. */
        const val QUICK_STOP_MS = 2000L

        /** Max automatic reconnect attempts after a backgrounding-induced drop. */
        const val MAX_RETRIES = 1

        const val CONNECTION_MESSAGE = "No connection. Check your network and try again."
        const val SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again."
        const val GENERIC_MESSAGE = "Something went wrong. Please try again."

        /** User-facing copy for a client-side image rejection. */
        fun imageRejectedMessage(reason: ImageRejectReason): String = when (reason) {
            ImageRejectReason.TooMany -> "You can attach up to $MAX_ATTACHED_IMAGES images."
            ImageRejectReason.PerImageTooLarge -> "That image is too large to send. Try a smaller one."
            ImageRejectReason.TotalTooLarge -> "Those images are too large together. Remove one and try again."
            ImageRejectReason.UnsupportedType -> "That image couldn't be processed. Try a different one."
        }

        /** Maps an in-band SSE `error` event to user-facing copy, falling back to the message. */
        fun bannerMessage(code: String, fallback: String): String = when (code) {
            "model_unavailable" -> "Oak is temporarily unavailable. Please try again in a moment."
            else -> fallback.ifEmpty { GENERIC_MESSAGE }
        }

        fun rateLimitMessage(retryAfterSeconds: Long?): String {
            if (retryAfterSeconds != null && retryAfterSeconds > 0) {
                return "You're sending messages too quickly. Please wait ${retryAfterSeconds}s and try again."
            }
            return "You're sending messages too quickly. Please wait a moment and try again."
        }
    }
}

/**
 * The single renderable snapshot the chat screen collects. Immutable so Compose can
 * skip recomposition when nothing changed.
 */
@Immutable
data class ChatUiState(
    val turns: List<ChatTurnItem> = emptyList(),
    val streamingText: String = "",
    val toolActivities: List<ToolActivity> = emptyList(),
    val isStreaming: Boolean = false,
    val errorBanner: ErrorBanner? = null,
    val displayFormat: Format = Format.Champions,
    val resolvedScope: Format? = null,
    val scopeSeed: Format? = null,
    val pendingImages: List<Bitmap> = emptyList(),
    val composerText: String = "",
    val reconnecting: Boolean = false,
    val canSend: Boolean = false,
    val streamingPhase: StreamingPhase = StreamingPhase.IDLE,
)

/** One rendered entry in the chat thread: a user message or a finalized answer. */
@Immutable
sealed interface ChatTurnItem {
    val id: String

    /** A user message. [imageCount] drives the "N image(s) attached" caption. */
    data class User(
        override val id: String = UUID.randomUUID().toString(),
        val text: String,
        val imageCount: Int,
    ) : ChatTurnItem

    /** A finalized, authoritative answer rendered through the answer card. */
    data class Assistant(
        override val id: String = UUID.randomUUID().toString(),
        val answer: OakAnswer,
    ) : ChatTurnItem
}

/** One live tool-activity item (`tool_activity` event), shown while the loop runs. */
@Immutable
data class ToolActivity(
    val id: String = UUID.randomUUID().toString(),
    val tool: String,
    val label: String,
)

/** A recoverable error rendered as a banner above the composer. */
@Immutable
data class ErrorBanner(val message: String, val isRetryable: Boolean)

/** The coarse in-progress phase used by the streaming status view. */
enum class StreamingPhase { IDLE, THINKING, USING_TOOLS, ANSWERING }
