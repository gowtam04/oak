package ai.gowtam.oak.features.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.GuestTurn
import ai.gowtam.oak.networking.ImageRejectReason
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TurnInProgressSignal
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.services.BitmapSourceImage
import ai.gowtam.oak.services.ChatService
import ai.gowtam.oak.services.HistoryService
import ai.gowtam.oak.services.ScopeService
import ai.gowtam.oak.services.ShareService
import ai.gowtam.oak.services.SourceImage
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.wire.ChatRecovery
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.CreatedShare
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SseEvent
import ai.gowtam.oak.wire.TeamSummary
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
    /** Monotonic clock (millis) for the quick-stop / undo window; injectable for tests. */
    private val now: () -> Long = { System.currentTimeMillis() },
    private val history: HistoryService? = null,
    private val teams: TeamService? = null,
    private val scope: ScopeService? = null,
    private val shares: ShareService? = null,
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
    private var undoUntilMillis: Long? = null
    private var pendingRecovery: ChatRecovery? = null
    private var editingLast: Boolean = false
    private var deadMentions: List<String> = emptyList()
    private var mentionQuery: String? = null
    private var mentionSuggestions: List<TeamSummary> = emptyList()
    private var savedTeams: List<TeamSummary> = emptyList()
    private var followUpChips: List<FollowUpChip> = emptyList()
    private var lastMentionedTeam: MentionedTeam? = null
    private var pinnedMessageIds: List<String> = emptyList()
    private var missingImagesNote: String? = null
    private var lastShareUrl: String? = null
    private var emptyDeskRecents: EmptyDeskRecents? = null

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

    /**
     * A stop requested BEFORE the `turn { turn_id }` frame arrived (the pre-turn-frame
     * race — connection setup + server pre-stream work spans ~100–500ms, and quick-stop
     * fires fast). The UI is finalized immediately, but the read is kept alive solely to
     * capture the turn id so the stop endpoint can still be hit — otherwise the server
     * turn runs to completion and persists a ghost answer into a signed-in conversation.
     * [pendingStopSessionId] pins the owning session id (the visible session may rotate,
     * e.g. a quick-stop). Cleared on send/resume/detach and once the turn is captured.
     */
    private var pendingStop: Boolean = false
    private var pendingStopSessionId: String? = null

    /** Whether the app is currently in the foreground (updated by the lifecycle hooks). */
    private var isForeground: Boolean = true

    init {
        publish()
    }

    // ---- Derived state ----

    /**
     * The scope the header chip displays and the artifact viewer scopes to: a pending
     * chip pick, else the server-resolved scope, else the signed-in last-used preference,
     * else the national-dex default — identical to web's
     * `displayFormat = scopeSeed ?? resolvedScope ?? lastUsedScope ?? "national-dex"`.
     */
    private fun displayFormat(): Format =
        scopeSeed ?: resolvedScope ?: appState.lastUsedScope.value ?: Format.NationalDex

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
            undoUntilMillis = undoUntilMillis,
            lastUserTurnId = lastUserTurn()?.id,
            lastAssistantTurnId = lastAssistantTurn()?.id,
            canRetryLast = !isStreaming && lastAssistantTurn() != null && turns.lastOrNull() is ChatTurnItem.Assistant,
            canEditLast = lastUserTurn() != null,
            deadMentions = deadMentions,
            mentionQuery = mentionQuery,
            mentionSuggestions = mentionSuggestions,
            followUpChips = followUpChips,
            pinnedMessageIds = pinnedMessageIds,
            missingImagesNote = missingImagesNote,
            lastShareUrl = lastShareUrl,
            isSignedIn = appState.authState.value is AuthState.SignedIn,
            emptyDeskRecents = emptyDeskRecents,
            editingLast = editingLast,
            lastUsedScopes = if (appState.authState.value is AuthState.SignedIn) {
                appState.lastUsedScopes.value
            } else {
                emptyList()
            },
        )
    }

    // ---- Composer actions ----

    /** Two-way composer text setter (the `TextField`'s `onValueChange`). */
    fun setComposerText(text: String) {
        composerText = text
        deadMentions = emptyList()
        mentionQuery = extractMentionQuery(text)
        refreshMentionSuggestions()
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
        if (!canSend() && !editingLast) return
        val text = composerText.trim()
        val images = pendingImages

        when (val slash = parseSlashCommand(text)) {
            is SlashCommand.Navigate -> {
                handleSlash(slash.target, slashArgs(text))
                composerText = ""
                mentionQuery = null
                publish()
                return
            }
            // P8 owns calc overlay dispatch. Fall through so `/calc` still sends.
            is SlashCommand.Calc -> Unit
            SlashCommand.Message -> Unit
        }

        val signedIn = appState.authState.value is AuthState.SignedIn
        val mentions = if (signedIn) resolveMentions(text) else MentionResolution.empty()
        if (signedIn && mentions.dead.isNotEmpty()) {
            deadMentions = mentions.dead
            publish()
            return
        }

        val recovery = if (editingLast) ChatRecovery.Edit else null

        // Sending a new message in the SAME conversation while one is still running
        // stops that turn server-side first (BT-4 / §6.3), then starts fresh. (The
        // composer is normally disabled while streaming, so this is a defensive path.)
        if (recovery == null) {
            stopInFlightTurn()
            turns = turns + ChatTurnItem.User(text = text, imageCount = images.size)
            mirrorGuestTurn(GuestTurn(content = GuestTurn.Content.User(text)))
        } else if (isStreaming) {
            stopInFlightTurn()
        }

        composerText = ""
        pendingImages = emptyList()
        mentionQuery = null
        missingImagesNote = null
        // Reset reattach bookkeeping for this fresh turn and stamp the quick-stop / undo window.
        val started = now()
        turnStartedAt = started
        undoUntilMillis = if (recovery == null) started + UNDO_WINDOW_MS else null
        reattachAttempts = 0
        pendingReattach = false
        reconnecting = false
        pendingRecovery = recovery
        lastMentionedTeam = mentions.bound.firstOrNull()
        // A pending chip pick (if any) rides THIS turn as `scope_seed`; a `scope` event
        // clears `scopeSeed` mid-turn so it never leaks onto the next turn.
        val request = PendingRequest(
            message = text,
            images = images,
            scopeSeed = scopeSeed,
            recovery = recovery,
            mentionedTeamIds = mentions.ids.takeIf { it.isNotEmpty() },
        )
        lastRequest = request
        editingLast = false
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
     * Retry the last completed assistant answer (REC-US-1). Keeps the previous
     * card visible until a successful replacement arrives.
     */
    fun retryLastAnswer() {
        if (isStreaming) return
        val lastUser = lastUserTurn() ?: return
        if (turns.lastOrNull() !is ChatTurnItem.Assistant) return
        val retained = lastRequest?.takeIf { it.message == lastUser.text }?.images.orEmpty()
        missingImagesNote = if (lastUser.imageCount > 0 && retained.isEmpty()) IMAGES_GONE_NOTE else null
        val request = PendingRequest(
            message = lastUser.text,
            images = retained,
            scopeSeed = lastRequest?.scopeSeed ?: scopeSeed,
            recovery = ChatRecovery.Retry,
            mentionedTeamIds = lastRequest?.mentionedTeamIds,
        )
        lastRequest = request
        pendingRecovery = ChatRecovery.Retry
        turnStartedAt = now()
        undoUntilMillis = null
        beginStreaming(request)
    }

    /**
     * Load the last user message into the composer for edit (REC-US-2).
     */
    fun beginEditLast() {
        if (isStreaming) return
        val lastUser = lastUserTurn() ?: return
        editingLast = true
        composerText = lastUser.text
        missingImagesNote = if (lastUser.imageCount > 0) IMAGES_GONE_NOTE else null
        publish()
    }

    /** Undo a just-sent turn within [UNDO_WINDOW_MS] (REC-US-3): Stop + restore composer. */
    fun undoSend() {
        if (!isStreaming) return
        val deadline = undoUntilMillis ?: return
        if (now() > deadline) return
        val stopped = lastRequest ?: return
        requestStop()
        isStreaming = false
        reconnecting = false
        pendingReattach = false
        streamingText = ""
        toolActivities = emptyList()
        pendingRecovery = null
        undoUntilMillis = null
        if (turns.lastOrNull() is ChatTurnItem.User) {
            turns = turns.dropLast(1)
        }
        composerText = stopped.message
        pendingImages = stopped.images
        publish()
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
        // server-side, then tear down locally. When the `turn` frame hasn't arrived yet
        // this arms the pre-turn-frame capture (below) rather than killing the read.
        // Local teardown happens regardless; no error banner (a user stop isn't a failure).
        requestStop()
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
        if (appState.authState.value is AuthState.SignedIn) {
            appState.setLastUsedScope(format)
            val mru = listOf(format) + appState.lastUsedScopes.value.filter { it != format }
            appState.setLastUsedScopes(mru)
        }
        persistScopePick(format)
        publish()
    }

    /** Apply a follow-up chip (CHIP-US-1). */
    fun activateChip(chip: FollowUpChip) {
        when (chip.kind) {
            FollowUpChip.Kind.Scope -> Format.fromRaw(chip.target).takeUnless { it is Format.Unknown }?.let { selectScope(it) }
            FollowUpChip.Kind.Dex -> appState.requestDex(chip.target)
            FollowUpChip.Kind.Team -> appState.requestTeams(id = chip.target)
        }
    }

    fun insertMention(team: TeamSummary) {
        val text = composerText
        val at = text.lastIndexOf('@')
        val prefix = if (at >= 0) text.substring(0, at) else text
        composerText = "$prefix@${team.name} "
        mentionQuery = null
        mentionSuggestions = emptyList()
        deadMentions = emptyList()
        publish()
    }

    fun pinTurn(assistantTurnId: String, pinned: Boolean) {
        val hist = history ?: return
        val serverId = (turns.firstOrNull { it.id == assistantTurnId } as? ChatTurnItem.Assistant)?.serverId
            ?: return
        if (appState.authState.value !is AuthState.SignedIn) return
        viewModelScope.launch {
            runCatching { hist.setMessagePinned(sessionId, serverId, pinned) }
                .onSuccess { pinnedMessageIds = it; publish() }
        }
    }

    fun forkFrom(assistantTurnId: String, onForked: (String) -> Unit) {
        val hist = history ?: return
        val serverId = (turns.firstOrNull { it.id == assistantTurnId } as? ChatTurnItem.Assistant)?.serverId
            ?: return
        if (appState.authState.value !is AuthState.SignedIn) return
        viewModelScope.launch {
            runCatching { hist.fork(sessionId, serverId) }
                .onSuccess { onForked(it.id) }
        }
    }

    fun shareTurn(assistantTurnId: String, onShared: (CreatedShare) -> Unit) {
        val share = shares ?: return
        val serverId = (turns.firstOrNull { it.id == assistantTurnId } as? ChatTurnItem.Assistant)?.serverId
            ?: return
        if (appState.authState.value !is AuthState.SignedIn) return
        viewModelScope.launch {
            runCatching { share.create(sessionId, serverId) }
                .onSuccess {
                    lastShareUrl = it.url
                    publish()
                    onShared(it)
                }
        }
    }

    fun exportConversation(format: String, onReady: (ByteArray, String) -> Unit) {
        val hist = history ?: return
        if (appState.authState.value !is AuthState.SignedIn) return
        if (turns.isEmpty()) return
        viewModelScope.launch {
            runCatching { hist.export(sessionId, format) }
                .onSuccess { (bytes, filename) -> onReady(bytes, filename) }
        }
    }

    fun refreshEmptyDesk() {
        if (appState.authState.value !is AuthState.SignedIn) {
            emptyDeskRecents = null
            publish()
            return
        }
        viewModelScope.launch {
            val lastConvo = runCatching { history?.list(query = null, format = null).orEmpty() }
                .getOrDefault(emptyList())
                .firstOrNull()
            val lastTeam = runCatching { teams?.list(format = null).orEmpty() }
                .getOrDefault(emptyList())
                .firstOrNull()
            emptyDeskRecents = EmptyDeskRecents(
                lastConversation = lastConvo?.let { EmptyDeskRecents.Conversation(it.id, it.title) },
                lastTeam = lastTeam?.let { EmptyDeskRecents.Team(it.id, it.name) },
                scope = displayFormat(),
            )
            savedTeams = runCatching { teams?.list(format = null).orEmpty() }.getOrDefault(savedTeams)
            publish()
        }
    }

    // ---- Conversation lifecycle ----

    /**
     * Starts a fresh conversation: tears down any stream, clears the thread, and rotates
     * the session id so the agent has no prior context. Clears the in-memory guest
     * thread for guests and drops resolved/seed scope so the chip falls through to
     * lastUsedScope (signed-in) or national-dex. lastUsedScope is intentionally kept.
     */
    fun startNewConversation() {
        // Abandon the current thread WITHOUT stopping its durable turn: unsubscribe and
        // drop the LOCAL pending pointer, but let the turn keep generating server-side
        // (BT-7 — the headline "start another chat while one generates" flow; parity with
        // web `reset()` and iOS `resetStreamState()` + `clearPendingTurn()`, which never
        // stop). A signed-in turn still completes and persists, recoverable on reopen via
        // `active_turn`; a guest's wiped thread is unreachable anyway. Clearing the local
        // pointer must happen BEFORE the session id rotates below.
        detach()
        clearPendingTurn()
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
        pendingRecovery = null
        editingLast = false
        undoUntilMillis = null
        followUpChips = emptyList()
        pinnedMessageIds = emptyList()
        deadMentions = emptyList()
        mentionQuery = null
        mentionSuggestions = emptyList()
        missingImagesNote = null
        lastMentionedTeam = null
        if (appState.authState.value is AuthState.Guest) {
            appState.clearGuestThread()
        }
        refreshEmptyDesk()
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
        pinnedMessageIds: List<String> = emptyList(),
    ) {
        // Close the socket for the PREVIOUS conversation without cancelling its durable
        // turn — its pending pointer stays in AppState (keyed by the old session id), so
        // it can be reattached if the user returns to it.
        detach()
        sessionId = conversationId
        appState.setActiveConversationId(conversationId)
        this.turns = turns.map { turn ->
            when (turn) {
                is ChatTurn.User -> ChatTurnItem.User(
                    id = turn.id,
                    text = turn.content,
                    imageCount = 0,
                    serverId = turn.id,
                )
                is ChatTurn.Assistant -> ChatTurnItem.Assistant(
                    id = turn.id,
                    answer = turn.answer,
                    serverId = turn.id,
                )
            }
        }
        this.pinnedMessageIds = pinnedMessageIds
        followUpChips = (this.turns.lastOrNull() as? ChatTurnItem.Assistant)
            ?.let { chipsFor(it.answer) }
            .orEmpty()
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
        pendingRecovery = null
        undoUntilMillis = null
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
        pendingStop = false
        pendingStopSessionId = null
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
        // A stop is waiting for the turn id (pre-turn-frame race): capture it from the
        // `turn` frame — always the first frame — fire the stop, and tear the read down.
        // Ignore anything that races in ahead of the frame.
        if (pendingStop) {
            if (event is SseEvent.Turn) completePendingStop(event.turnId)
            return
        }
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
                // Recovery stop keeps the previous pair (REC-BR-2 / REC-BR-4).
                restoreComposerAfterFailedRecovery()
                pendingRecovery = null
                undoUntilMillis = null
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
                // Signed-in only: remember for New Chat (server also persists on the account).
                if (appState.authState.value is AuthState.SignedIn) {
                    appState.setLastUsedScope(event.format)
                    val mru = listOf(event.format) + appState.lastUsedScopes.value.filter { it != event.format }
                    appState.setLastUsedScopes(mru)
                }
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
                // Recovery (retry/edit) replaces the last pair only on success (REC-BR-2).
                when (pendingRecovery) {
                    ChatRecovery.Retry -> replaceLastAssistant(event.answer)
                    ChatRecovery.Edit -> replaceLastPair(lastRequest?.message.orEmpty(), event.answer)
                    null -> {
                        turns = turns + ChatTurnItem.Assistant(answer = event.answer)
                        mirrorGuestTurn(GuestTurn(content = GuestTurn.Content.Assistant(event.answer)))
                    }
                }
                pendingRecovery = null
                undoUntilMillis = null
                followUpChips = chipsFor(event.answer)
                clearPendingTurn()
                streamingText = ""
                toolActivities = emptyList()
                isStreaming = false
                setKeepScreenOn(false)
                refreshIdsIfSignedIn()
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
                restoreComposerAfterFailedRecovery()
                pendingRecovery = null
                undoUntilMillis = null
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
        pendingStop = false
        pendingStopSessionId = null
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
            recovery = request.recovery,
            mentionedTeamIds = request.mentionedTeamIds,
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
        pendingStop = false
        pendingStopSessionId = null
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
            // 409 on send: a durable turn is already generating for this conversation. If
            // a stop was pending the turn id, stop THAT turn; otherwise reattach to it
            // instead of erroring (BT-5 / §6.3).
            if (pendingStop) {
                completePendingStop(e.turnId)
                return
            }
            reattachAttempts = 0
            reattachStream(e.turnId)
            return
        } catch (e: OakError) {
            // A pre-turn-frame stop whose capture read died before the frame: nothing to
            // stop, stay silently idle (§6.3, the pre-turn stop race).
            if (abandonPendingStop()) return
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
            if (abandonPendingStop()) return
            handleDrop()
            return
        }
        // The stream ended without a terminal event and was not cancelled — a dropped
        // socket can return a clean EOF instead of throwing. A pre-turn-frame stop that
        // saw EOF has nothing to stop; otherwise treat it as a drop.
        if (abandonPendingStop()) return
        if (isStreaming) handleDrop()
    }

    /**
     * Maps a thrown transport/HTTP fault to a recoverable banner. Clears any partial
     * answer; the user turn remains so the user can retry.
     */
    private fun applyStreamFailure(error: OakError) {
        restoreComposerAfterFailedRecovery()
        pendingRecovery = null
        undoUntilMillis = null
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
        pendingStop = false
        pendingStopSessionId = null
        clearPendingTurn()
        closeStream()
    }

    /**
     * The explicit-Stop teardown (BT-4), race-aware. If the durable turn id is already
     * known, stop it now and close the read. If a stream attempt is in flight but its
     * `turn` frame hasn't arrived yet, DON'T kill the read — arm [pendingStop] so the
     * consumer keeps reading solely to capture the id, then stops server-side (the id
     * capture happens in [apply]/[completePendingStop]). Otherwise there's nothing to stop.
     */
    private fun requestStop() {
        reattachJob?.cancel()
        reattachJob = null
        val turnId = currentTurnId
        if (turnId != null) {
            if (isStreaming) viewModelScope.launch { runCatching { chat.stop(turnId, sessionId) } }
            pendingStop = false
            pendingStopSessionId = null
            clearPendingTurn()
            closeStream()
            return
        }
        if (isStreaming && streamJob?.isActive == true) {
            pendingStop = true
            pendingStopSessionId = sessionId
            return
        }
        pendingStop = false
        pendingStopSessionId = null
        clearPendingTurn()
        closeStream()
    }

    /**
     * The turn id arrived after a pre-turn-frame stop: fire the stop endpoint with the
     * captured id + owning session (which may differ from the now-visible session after
     * a quick-stop rotation) and tear the capture read down.
     */
    private fun completePendingStop(turnId: String) {
        val sid = pendingStopSessionId ?: sessionId
        pendingStop = false
        pendingStopSessionId = null
        viewModelScope.launch { runCatching { chat.stop(turnId, sid) } }
        appState.clearPendingTurn(sid)
        closeStream()
    }

    /**
     * The capture read ended (drop / EOF) before the `turn` frame arrived: there is no id
     * to stop, so stay silently idle (the turn may never have materialized, or died with
     * the socket). Returns whether it took ownership so the consumer skips its own
     * drop/banner handling.
     */
    private fun abandonPendingStop(): Boolean {
        if (!pendingStop) return false
        pendingStop = false
        pendingStopSessionId = null
        setKeepScreenOn(false)
        return true
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
        val recovery: ChatRecovery? = null,
        val mentionedTeamIds: List<String>? = null,
    )

    private fun lastUserTurn(): ChatTurnItem.User? = turns.lastOrNull { it is ChatTurnItem.User } as? ChatTurnItem.User

    private fun lastAssistantTurn(): ChatTurnItem.Assistant? =
        turns.lastOrNull { it is ChatTurnItem.Assistant } as? ChatTurnItem.Assistant

    private fun replaceLastAssistant(answer: OakAnswer) {
        val index = turns.indexOfLast { it is ChatTurnItem.Assistant }
        if (index < 0) {
            turns = turns + ChatTurnItem.Assistant(answer = answer)
        } else {
            val previous = turns[index] as ChatTurnItem.Assistant
            turns = turns.toMutableList().apply {
                this[index] = previous.copy(answer = answer)
            }
        }
    }

    private fun replaceLastPair(userText: String, answer: OakAnswer) {
        val userIndex = turns.indexOfLast { it is ChatTurnItem.User }
        val asstIndex = turns.indexOfLast { it is ChatTurnItem.Assistant }
        val updated = turns.toMutableList()
        if (userIndex >= 0) {
            val previous = updated[userIndex] as ChatTurnItem.User
            updated[userIndex] = previous.copy(text = userText)
        }
        if (asstIndex >= 0) {
            val previous = updated[asstIndex] as ChatTurnItem.Assistant
            updated[asstIndex] = previous.copy(answer = answer)
        } else {
            updated += ChatTurnItem.Assistant(answer = answer)
        }
        turns = updated
    }

    private fun restoreComposerAfterFailedRecovery() {
        if (pendingRecovery != ChatRecovery.Edit) return
        val stopped = lastRequest ?: return
        composerText = stopped.message
        pendingImages = stopped.images
        editingLast = true
    }

    private fun persistScopePick(format: Format) {
        val svc = scope ?: return
        val conversationId = appState.activeConversationId.value
        viewModelScope.launch {
            runCatching { svc.persist(format, conversationId, sessionId) }
                .onSuccess { result ->
                    result.lastUsedScopes?.let { appState.setLastUsedScopes(it) }
                }
        }
    }

    private fun chipsFor(answer: OakAnswer): List<FollowUpChip> {
        val implied = impliedFormat(answer)
        val signedIn = appState.authState.value is AuthState.SignedIn
        val mentioned = lastMentionedTeam.takeIf { signedIn }
        return deriveFollowUpChips(answer, implied, mentioned)
            .filter { it.kind != FollowUpChip.Kind.Team || signedIn }
    }

    private fun impliedFormat(answer: OakAnswer): Format? {
        if (!answer.generationBasis.fallback) return null
        val raw = answer.generationBasis.generation
        val format = Format.fromRaw(raw)
        if (format is Format.Unknown) return null
        if (format == displayFormat()) return null
        return format
    }

    private fun handleSlash(target: SlashCommand.Target, args: String) {
        when (target) {
            SlashCommand.Target.New -> startNewConversation()
            SlashCommand.Target.Team -> {
                val match = savedTeams.firstOrNull { it.name.equals(args, ignoreCase = true) }
                appState.requestTeams(id = match?.id, name = args.ifBlank { null })
            }
            SlashCommand.Target.Dex -> appState.requestDex(args.ifBlank { null })
            SlashCommand.Target.Usage -> Unit // Android has no usage page
        }
    }

    private data class MentionResolution(
        val ids: List<String>,
        val names: List<String>,
        val bound: List<MentionedTeam>,
        val dead: List<String>,
    ) {
        companion object {
            fun empty() = MentionResolution(emptyList(), emptyList(), emptyList(), emptyList())
        }
    }

    private fun resolveMentions(text: String): MentionResolution {
        if (text.indexOf('@') < 0) {
            return MentionResolution(emptyList(), emptyList(), emptyList(), emptyList())
        }
        val teamsByName = savedTeams.sortedByDescending { it.name.length }
        val ids = mutableListOf<String>()
        val names = mutableListOf<String>()
        val bound = mutableListOf<MentionedTeam>()
        val dead = mutableListOf<String>()
        // Longest-name scan: for each '@', try saved team names.
        var i = 0
        while (i < text.length) {
            val at = text.indexOf('@', i)
            if (at < 0) break
            val rest = text.substring(at + 1)
            val match = teamsByName.firstOrNull { rest.startsWith(it.name) }
            if (match != null) {
                ids += match.id
                names += match.name
                bound += MentionedTeam(match.id, match.name)
                i = at + 1 + match.name.length
            } else {
                val token = rest.takeWhile { !it.isWhitespace() }
                if (token.isNotEmpty()) dead += token
                i = at + 1 + token.length
            }
        }
        return MentionResolution(ids.distinct(), names, bound, dead)
    }

    private fun extractMentionQuery(text: String): String? {
        if (appState.authState.value !is AuthState.SignedIn) return null
        val at = text.lastIndexOf('@')
        if (at < 0) return null
        val after = text.substring(at + 1)
        if (after.contains('\n')) return null
        return after
    }

    private fun refreshMentionSuggestions() {
        val query = mentionQuery
        if (query == null) {
            mentionSuggestions = emptyList()
            return
        }
        if (savedTeams.isEmpty()) {
            viewModelScope.launch {
                savedTeams = runCatching { teams?.list(format = null).orEmpty() }.getOrDefault(emptyList())
                mentionSuggestions = filterTeams(mentionQuery.orEmpty())
                publish()
            }
        } else {
            mentionSuggestions = filterTeams(query)
        }
    }

    private fun filterTeams(query: String): List<TeamSummary> {
        val q = query.trim()
        return if (q.isEmpty()) savedTeams.take(8)
        else savedTeams.filter { it.name.contains(q, ignoreCase = true) }.take(8)
    }

    private fun refreshIdsIfSignedIn() {
        if (appState.authState.value !is AuthState.SignedIn) return
        val hist = history ?: return
        viewModelScope.launch {
            runCatching { hist.get(sessionId) }.onSuccess { detail ->
                pinnedMessageIds = detail.pinnedMessageIds
                val serverTurns = detail.turns
                if (serverTurns.size == turns.size) {
                    turns = turns.mapIndexed { index, item ->
                        when {
                            item is ChatTurnItem.User && serverTurns[index] is ChatTurn.User ->
                                item.copy(serverId = serverTurns[index].id, id = serverTurns[index].id)
                            item is ChatTurnItem.Assistant && serverTurns[index] is ChatTurn.Assistant ->
                                item.copy(serverId = serverTurns[index].id, id = serverTurns[index].id)
                            else -> item
                        }
                    }
                }
                publish()
            }
        }
    }

    companion object {
        /** Max images attachable to one turn — the backend's `MAX_IMAGES`. */
        const val MAX_ATTACHED_IMAGES = 4

        /** The quick-stop window: a Stop within this of [send] wipes the just-sent turn. */
        const val QUICK_STOP_MS = 2000L

        /** Undo-send bubble window (REC-US-3 / ADR-3). */
        const val UNDO_WINDOW_MS = 3000L

        const val IMAGES_GONE_NOTE = "Pictures from this turn will not be attached."

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
    val displayFormat: Format = Format.NationalDex,
    val resolvedScope: Format? = null,
    val scopeSeed: Format? = null,
    val pendingImages: List<Bitmap> = emptyList(),
    val composerText: String = "",
    val reconnecting: Boolean = false,
    val canSend: Boolean = false,
    val streamingPhase: StreamingPhase = StreamingPhase.IDLE,
    val undoUntilMillis: Long? = null,
    val lastUserTurnId: String? = null,
    val lastAssistantTurnId: String? = null,
    val canRetryLast: Boolean = false,
    val canEditLast: Boolean = false,
    val deadMentions: List<String> = emptyList(),
    val mentionQuery: String? = null,
    val mentionSuggestions: List<TeamSummary> = emptyList(),
    val followUpChips: List<FollowUpChip> = emptyList(),
    val pinnedMessageIds: List<String> = emptyList(),
    val missingImagesNote: String? = null,
    val lastShareUrl: String? = null,
    val isSignedIn: Boolean = false,
    val emptyDeskRecents: EmptyDeskRecents? = null,
    val editingLast: Boolean = false,
    val lastUsedScopes: List<Format> = emptyList(),
)

/** Signed-in empty-desk continue-last rows (EMPTY-US-1). */
@Immutable
data class EmptyDeskRecents(
    val lastConversation: Conversation?,
    val lastTeam: Team?,
    val scope: Format,
) {
    @Immutable
    data class Conversation(val id: String, val title: String)

    @Immutable
    data class Team(val id: String, val name: String)
}

/** One rendered entry in the chat thread: a user message or a finalized answer. */
@Immutable
sealed interface ChatTurnItem {
    val id: String

    /** A user message. [imageCount] drives the "N image(s) attached" caption. */
    data class User(
        override val id: String = UUID.randomUUID().toString(),
        val text: String,
        val imageCount: Int,
        val serverId: String? = null,
    ) : ChatTurnItem

    /** A finalized, authoritative answer rendered through the answer card. */
    data class Assistant(
        override val id: String = UUID.randomUUID().toString(),
        val answer: OakAnswer,
        val serverId: String? = null,
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
