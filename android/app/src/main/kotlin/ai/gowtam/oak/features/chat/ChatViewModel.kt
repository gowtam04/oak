package ai.gowtam.oak.features.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.GuestTurn
import ai.gowtam.oak.networking.ImageRejectReason
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TurnInProgressSignal
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
import kotlinx.coroutines.delay
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

    /** A scheduled transport-drop reattach waiting out its backoff; cancelled by any
     * teardown (detach/stop/new-conversation) so it can never fire after the fact. */
    private var reattachJob: Job? = null

    /** The last turn's request, retained so a manual [retry] can re-send a dead turn. */
    private var lastRequest: PendingRequest? = null

    /** When the current turn started (millis), for the quick-stop window. `null` when idle. */
    private var turnStartedAt: Long? = null

    /**
     * The durable turn currently attached (or pending) for THIS conversation — the
     * server-minted id from the `turn` frame, or one recovered from `active_turn`.
     * Mirrored into [AppState]'s pending-turn map so it survives navigation; `null`
     * once the turn reaches a terminal event or a reattach 404s.
     */
    private var currentTurnId: String? = null

    /** Consecutive transport-drop reattach attempts, bounded by [MAX_REATTACH]. Reset
     * to 0 the moment real events flow again (a return-to-thread reattach also resets). */
    private var reattachAttempts: Int = 0

    /** A drop noticed while backgrounded; the reattach fires on the next foreground. */
    private var pendingReattach: Boolean = false

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

        // Sending a new message in the SAME conversation while one is still running
        // stops that turn server-side first (BT-4 / §6.3), then starts fresh. (The
        // composer is normally disabled while streaming, so this is a defensive path.)
        stopInFlightTurn()

        turns = turns + ChatTurnItem.User(text = text, imageCount = images.size)
        mirrorGuestTurn(GuestTurn(content = GuestTurn.Content.User(text)))

        composerText = ""
        pendingImages = emptyList()
        // Reset reattach bookkeeping for this fresh turn and stamp the quick-stop window.
        turnStartedAt = now()
        reattachAttempts = 0
        pendingReattach = false
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
     * The manual Retry affordance for a genuinely dead/interrupted turn: re-sends the
     * last turn as a FRESH request (a new durable turn), WITHOUT appending another user
     * message (it is already in the thread). A no-op while a turn is already streaming
     * or when there is nothing to re-send.
     */
    fun retry() {
        if (isStreaming) return
        val request = lastRequest ?: return
        currentTurnId = null
        appState.clearPendingTurn(sessionId)
        reattachAttempts = 0
        pendingReattach = false
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
        // An explicit stop is now an API call (BT-4): discard the durable turn
        // server-side, then tear down locally. Local teardown happens regardless of
        // whether the stop call succeeds; no error banner (a user stop isn't a failure).
        stopInFlightTurn()
        isStreaming = false
        reconnecting = false
        pendingReattach = false
        streamingText = ""
        toolActivities = emptyList()

        if (elapsed >= QUICK_STOP_MS || stopped == null) {
            // Late stop: keep the answerless user turn in the thread; nothing else to do.
            publish()
            return
        }

        // Quick stop: wipe to a brand-new session and restore the message for a redo.
        // Scope is intentionally NOT reset (web keeps resolvedScope/scopeSeed on stop).
        turns = emptyList()
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

    // ---- Lifecycle (background unsubscribes; foreground reattaches — §6.3) ----

    /**
     * The app entered the background (screen lock / app switch), wired from
     * `Lifecycle.Event.ON_STOP`. The durable turn keeps generating server-side; we
     * simply note we are hidden so a resulting socket drop defers its reattach to the
     * next foreground rather than fighting the OS while backgrounded.
     */
    fun onEnterBackground() {
        isForeground = false
    }

    /**
     * The app returned to the foreground, wired from `Lifecycle.Event.ON_START`.
     * Reattach to the conversation's durable turn if one is unresolved — either a drop
     * was deferred while backgrounded, or the socket is simply no longer live
     * (background-turns/design.md §6.3).
     */
    fun onEnterForeground() {
        isForeground = true
        val turnId = currentTurnId ?: appState.pendingTurn(sessionId) ?: return
        val needsReattach = pendingReattach || (isStreaming && streamJob?.isActive != true)
        if (!needsReattach) return
        pendingReattach = false
        reattachAttempts = 0
        reattachStream(turnId)
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
        // Abandon the current thread: stop its durable turn server-side (frees the
        // per-conversation / per-owner slot) rather than leaving it running unwatched.
        stopInFlightTurn()
        turns = emptyList()
        streamingText = ""
        toolActivities = emptyList()
        errorBanner = null
        composerText = ""
        pendingImages = emptyList()
        lastRequest = null
        turnStartedAt = null
        isStreaming = false
        reconnecting = false
        pendingReattach = false
        reattachAttempts = 0
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
     *
     * [activeTurnId] is the conversation's `active_turn` from the history GET (a durable
     * turn still generating server-side): when present it seeds the pending-turn pointer
     * and the thread immediately reattaches to it — the app-relaunch recovery path
     * (background-turns/design.md §6.3).
     */
    fun loadResumed(
        conversationId: String,
        format: Format,
        turns: List<ChatTurn>,
        activeTurnId: String? = null,
    ) {
        // Close the socket for the PREVIOUS conversation without cancelling its durable
        // turn — its pending pointer stays in AppState (keyed by the old session id), so
        // it can be reattached if the user returns to it.
        detach()
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
        isStreaming = false
        reconnecting = false
        pendingReattach = false
        reattachAttempts = 0
        currentTurnId = null
        if (activeTurnId != null) appState.setPendingTurn(conversationId, activeTurnId)
        publish()
        reattachIfPending()
    }

    /**
     * Unsubscribes from the live stream WITHOUT stopping the durable turn — the socket
     * closes but the server keeps generating (background-turns/design.md §6.3). Used by
     * the screen leaving composition and by [loadResumed] switching conversations. The
     * pending-turn pointer is deliberately kept so the thread can reattach on return;
     * releases the wake hold and clears "Reconnecting…" so neither gets stuck on.
     */
    fun detach() {
        reattachJob?.cancel()
        reattachJob = null
        closeStream()
        reconnecting = false
        pendingReattach = false
        publish()
    }

    /**
     * Reattaches to this conversation's pending durable turn if one exists and no live
     * subscription is already running — the return-to-thread recovery path. Resets the
     * transport-drop budget (a user-driven reattach is not a failed one).
     */
    fun reattachIfPending() {
        if (streamJob?.isActive == true) return
        val turnId = currentTurnId ?: appState.pendingTurn(sessionId) ?: return
        reattachAttempts = 0
        reattachStream(turnId)
    }

    /** Releases the stream on `ViewModel` teardown so the wake hold never leaks. The
     * durable turn keeps running server-side and stays reattachable (a config change
     * retains the store; a true finish leaves it recoverable via `active_turn`). */
    override fun onCleared() {
        detach()
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
        // Real content (anything past the `turn` frame) means a (re)attach is making
        // progress → reset the transport-drop budget so a genuine long turn isn't
        // starved by earlier blips.
        if (event !is SseEvent.Turn) reattachAttempts = 0
        when (event) {
            is SseEvent.Turn -> {
                // The server-minted turn id: record it as this conversation's pending
                // turn (survives navigation via AppState) so it can be reattached/stopped.
                // The `turn` frame opens BOTH the POST and the resume streams, so a
                // reattach replay rebuilds the in-flight UI from scratch here.
                currentTurnId = event.turnId
                appState.setPendingTurn(sessionId, event.turnId)
                streamingText = ""
                toolActivities = emptyList()
            }

            SseEvent.Stopped -> {
                // The durable turn was stopped (this device or another). Nothing is
                // persisted; clear the in-flight state with no error banner.
                clearPendingTurn()
                streamingText = ""
                toolActivities = emptyList()
                isStreaming = false
                setKeepScreenOn(false)
            }

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
                clearPendingTurn()
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
                clearPendingTurn()
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
        setKeepScreenOn(true)
        publish()

        val images: List<SourceImage> = request.images.map { BitmapSourceImage(it) }
        val stream = chat.send(
            sessionId = sessionId,
            message = request.message,
            images = images,
            scopeSeed = request.scopeSeed,
        )
        streamJob = viewModelScope.launch { consume(stream, isResume = false) }
    }

    /**
     * Reattaches to a durable turn's live stream: closes any current subscription,
     * shows "Reconnecting…" until the replay flows, then folds the replayed +
     * live-tailed events through the SAME reducer (the `turn` frame rebuilds the
     * in-flight UI from scratch). A resume 404 → the turn is dead → [handleDeadTurn].
     */
    private fun reattachStream(turnId: String) {
        closeStream()
        currentTurnId = turnId
        appState.setPendingTurn(sessionId, turnId)
        isStreaming = true
        reconnecting = true
        errorBanner = null
        setKeepScreenOn(true)
        publish()
        streamJob = viewModelScope.launch { consume(chat.resume(turnId, sessionId), isResume = true) }
    }

    private suspend fun consume(stream: Flow<SseEvent>, isResume: Boolean) {
        try {
            stream.collect { event ->
                if (!currentCoroutineContext().isActive) return@collect
                apply(event)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: TurnInProgressSignal) {
            // 409 on send: a durable turn is already generating for this conversation →
            // reattach to it instead of erroring (BT-5 / §6.3).
            reattachAttempts = 0
            reattachStream(e.turnId)
            return
        } catch (e: OakError) {
            // A resume that 404s means the turn is gone (expired / server restart) — it
            // can't be tailed; surface the interrupted/Retry affordance.
            if (isResume && e is OakError.Http && e.status == 404) {
                handleDeadTurn()
                return
            }
            // A connection drop reattaches (bounded); every other OakError (rate limit,
            // HTTP, image rejection, decode) is a clean fault — surface it.
            if (e is OakError.Transport) {
                handleDrop()
                return
            }
            applyStreamFailure(e)
            return
        } catch (e: Exception) {
            // An unexpected non-OakError throw is treated as a connection drop.
            handleDrop()
            return
        }
        // The stream ended without a terminal event and was not cancelled — a dropped
        // socket can return a clean EOF instead of throwing. Treat it as a drop.
        if (isStreaming) handleDrop()
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
     * Handles a live-stream drop (transport fault or clean EOF mid-turn). With a known
     * durable turn id the client REATTACHES rather than re-sending: immediately when
     * foregrounded (bounded by [MAX_REATTACH] with a brief backoff), or deferred to the
     * next foreground when backgrounded. A drop before the `turn` frame (no id) has no
     * turn to reattach to and falls back to the connection-error banner.
     */
    private fun handleDrop() {
        val turnId = currentTurnId
        if (turnId == null) {
            // Pre-turn drop: nothing to reattach to — surface the connection banner.
            applyStreamFailure(OakError.Transport("pre_turn_drop"))
            return
        }
        if (!isForeground) {
            // Backgrounded: keep the turn "in flight" showing Reconnecting…; the actual
            // reattach fires from onEnterForeground.
            pendingReattach = true
            reconnecting = true
            isStreaming = true
            streamingText = ""
            toolActivities = emptyList()
            errorBanner = null
            setKeepScreenOn(false)
            publish()
            return
        }
        reattachAttempts += 1
        if (reattachAttempts > MAX_REATTACH) {
            handleDeadTurn()
            return
        }
        reconnecting = true
        isStreaming = true
        streamingText = ""
        toolActivities = emptyList()
        publish()
        reattachJob = viewModelScope.launch {
            delay(REATTACH_BACKOFF_MS)
            // Guard against a send/stop/detach having superseded the turn during backoff.
            if (currentTurnId == turnId && isStreaming) reattachStream(turnId)
        }
    }

    /**
     * A durable turn that can no longer be reattached (resume 404, or the transport-drop
     * budget exhausted): clear the pending pointer and surface the interrupted banner.
     * Retry re-sends the last turn as a fresh one when its request is still retained.
     */
    private fun handleDeadTurn() {
        clearPendingTurn()
        isStreaming = false
        reconnecting = false
        pendingReattach = false
        streamingText = ""
        toolActivities = emptyList()
        errorBanner = ErrorBanner(INTERRUPTED_MESSAGE, isRetryable = lastRequest != null)
        setKeepScreenOn(false)
        publish()
    }

    /** Cancels the live subscription and releases the wake hold — the mechanical half of
     * [detach]/[stopInFlightTurn]. Leaves all reducer/pending state untouched. */
    private fun closeStream() {
        streamJob?.cancel()
        streamJob = null
        setKeepScreenOn(false)
    }

    /**
     * Stops the conversation's durable turn server-side (fire-and-forget — a stop failure
     * never blocks the UI) and tears down the local subscription. Used when a turn is
     * genuinely abandoned: an explicit Stop, a new send in the same thread, or starting a
     * new conversation. Does NOT touch the visible thread — callers decide that.
     */
    private fun stopInFlightTurn() {
        val turnId = currentTurnId
        if (isStreaming && turnId != null) {
            viewModelScope.launch { runCatching { chat.stop(turnId, sessionId) } }
        }
        reattachJob?.cancel()
        reattachJob = null
        clearPendingTurn()
        closeStream()
    }

    /** Drops this conversation's pending-turn pointer (local field + AppState map). */
    private fun clearPendingTurn() {
        currentTurnId = null
        appState.clearPendingTurn(sessionId)
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

        /** Max consecutive transport-drop reattach attempts before giving the turn up
         * for dead (background-turns/design.md §6.3, "bounded ~2 attempts"). */
        const val MAX_REATTACH = 2

        /** Brief backoff between transport-drop reattach attempts. */
        const val REATTACH_BACKOFF_MS = 400L

        const val CONNECTION_MESSAGE = "No connection. Check your network and try again."
        const val INTERRUPTED_MESSAGE = "This response was interrupted. Tap Retry to try again."
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
