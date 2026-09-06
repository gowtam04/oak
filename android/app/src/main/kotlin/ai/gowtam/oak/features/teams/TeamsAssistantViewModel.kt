package ai.gowtam.oak.features.teams

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.TeamsAssistantService
import ai.gowtam.oak.wire.BuilderAnswer
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.TeamsAssistantDraft
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** One committed exchange in the panel's thread. `answer` is `null` while still streaming. */
@Immutable
data class AssistantTurn(val id: Int, val user: String, val answer: BuilderAnswer? = null)

/** The panel's coarse status (mirrors web's `AssistantStatus`). [THINKING] disables the composer's send. */
enum class AssistantStatus { IDLE, THINKING, ERROR }

/** The single renderable snapshot the Teams Assistant sheet collects. */
@Immutable
data class TeamsAssistantUiState(
    /** The committed turns (user message + finalized [BuilderAnswer]), oldest first. */
    val turns: List<AssistantTurn> = emptyList(),
    val status: AssistantStatus = AssistantStatus.IDLE,
    /** The latest tool-activity label while thinking, or `null`. */
    val activity: String? = null,
    /** The incrementally streamed `answer_markdown` for the in-flight turn. */
    val streamingMarkdown: String = "",
    /** A transport-fault banner message (in-domain failures ride a normal answer). */
    val errorMessage: String? = null,
    /** False for denylist / daily-cap refusals so the sheet hides Retry. */
    val errorIsRetryable: Boolean = true,
    /** Turn ids whose patch has been applied to the draft (drives "Applied ✓"). */
    val appliedTurnIds: Set<Int> = emptySet(),
    /** The most recent Apply's turn id — only THIS turn shows an Undo affordance. */
    val lastAppliedTurnId: Int? = null,
)

/**
 * The team-builder assistant's view model — the SSE reducer behind the editor's
 * assistant panel (history-and-teams.md D-TEAM-2; component-design.md
 * "TeamsAssistantViewModel"; mirrors iOS `TeamsAssistantViewModel` / web's
 * `useTeamsAssistant` + `TeamsAssistantPanel`). Holds the in-memory thread, folds a
 * [BuilderSseEvent] stream into UI state one event at a time, and brokers Apply/Undo of
 * a proposed `TeamPatch` against the owning [editor]'s **unsaved draft** — never the
 * DB (the user still reviews and hits Save).
 *
 * Depends on the [TeamsAssistantService] **interface** (never `LiveTeamsAssistantService`)
 * so it unit-tests against a fake, and holds a reference to the LIVE [editor] so the
 * draft it sends each turn — and the draft Apply mutates — is always the current
 * on-screen team, including manual edits made between assistant turns.
 *
 * Reducer contract (a sibling of the chat reducer MINUS `scope`): zero-or-more
 * `tool_activity`, then zero-or-more `answer_start`/`answer_delta`, then exactly one
 * terminal `answer` (a [BuilderAnswer], authoritative). A transport fault (thrown
 * [OakError] or an in-band `error` event)
 * drops the half-finished turn, surfaces a friendly banner, and exposes [retry].
 *
 * **Apply/Undo parity note:** [apply] always overwrites the "last applied" slot — a
 * SECOND apply forecloses the first one's Undo. A plain manual draft edit does NOT
 * itself clear the "last applied" pointer (this matches the shipped web
 * `TeamsAssistantPanel.tsx` / iOS behavior exactly, not merely a superficial reading of
 * the requirement copy); Undo, when offered, always restores the exact pre-apply
 * snapshot, discarding any interim edits along with the applied patch.
 */
class TeamsAssistantViewModel(
    private val service: TeamsAssistantService,
    private val editor: TeamEditorViewModel,
) : ViewModel() {

    /** The client thread id sent as `session_id` — one in-memory conversation per
     * mounted view model (server namespaces history under it). */
    val sessionId: String = UUID.randomUUID().toString()

    private val _uiState = MutableStateFlow(TeamsAssistantUiState())
    val uiState: StateFlow<TeamsAssistantUiState> = _uiState.asStateFlow()

    private var nextId = 1
    private var lastMessage: String = ""
    private var lastAppliedSnapshot: TeamDraftSnapshot? = null

    /** The in-flight stream consumer; cancelled on a new turn or [cancel]. */
    private var streamJob: Job? = null

    /** Whether the composer can send: not already thinking, and some non-blank text. */
    fun canSend(text: String): Boolean = uiState.value.status != AssistantStatus.THINKING && text.isNotBlank()

    /** Sends one turn: appends the user message immediately, resets the streaming
     * state, and starts consuming the event stream with the LIVE editor draft attached.
     * A no-op while a turn is already in flight or the text is blank. */
    fun send(message: String) {
        val text = message.trim()
        if (uiState.value.status == AssistantStatus.THINKING || text.isEmpty()) return

        streamJob?.cancel()
        lastMessage = text
        val id = nextId
        nextId += 1

        _uiState.update {
            it.copy(
                turns = it.turns + AssistantTurn(id = id, user = text),
                status = AssistantStatus.THINKING,
                activity = null,
                streamingMarkdown = "",
                errorMessage = null,
                errorIsRetryable = true,
            )
        }

        val draft = TeamsAssistantDraft(
            name = editor.uiState.value.name,
            format = editor.format,
            members = editor.draftWireMembers(),
        )
        streamJob = viewModelScope.launch { consume(id, text, draft) }
    }

    /** Re-sends the last message after a recoverable failure. Mirrors the panel's Retry button. */
    fun retry() {
        if (uiState.value.status == AssistantStatus.THINKING || lastMessage.isEmpty()) return
        send(lastMessage)
    }

    /** Applies a turn's proposed patch to the editor's unsaved draft, snapshotting the
     * pre-apply draft so [undo] can restore it. Marks the turn applied. */
    fun apply(turn: AssistantTurn) {
        val patch = turn.answer?.teamPatch ?: return
        lastAppliedSnapshot = editor.draftSnapshot()
        _uiState.update { it.copy(appliedTurnIds = it.appliedTurnIds + turn.id, lastAppliedTurnId = turn.id) }
        editor.applyAssistantPatch(patch)
    }

    /** Restores the pre-apply draft snapshot (Undo) and un-marks the turn. A no-op when
     * there is no pending "last applied" (nothing to undo, or it was already
     * foreclosed by a further apply). */
    fun undo() {
        val snapshot = lastAppliedSnapshot ?: return
        val turnId = uiState.value.lastAppliedTurnId ?: return
        editor.restoreDraft(snapshot)
        _uiState.update { it.copy(appliedTurnIds = it.appliedTurnIds - turnId, lastAppliedTurnId = null) }
        lastAppliedSnapshot = null
    }

    /** Tears down any in-flight stream (panel dismissed). Committed turns are left
     * intact — reopening resumes the same in-memory thread — but a half-finished
     * in-flight turn is dropped and the status reset to idle, so a mid-stream dismiss
     * can never leave the panel stuck "thinking". */
    fun cancel() {
        streamJob?.cancel()
        streamJob = null
        if (uiState.value.status != AssistantStatus.THINKING) return
        _uiState.update { state ->
            state.copy(
                turns = state.turns.filter { it.answer != null },
                status = AssistantStatus.IDLE,
                activity = null,
                streamingMarkdown = "",
            )
        }
    }

    override fun onCleared() {
        streamJob?.cancel()
        super.onCleared()
    }

    // ---- Reducer ----

    private suspend fun consume(turnId: Int, message: String, draft: TeamsAssistantDraft) {
        var terminal: BuilderAnswer? = null
        var inbandError: BuilderSseEvent.Error? = null

        try {
            service.send(sessionId, message, draft).collect { event ->
                when (event) {
                    is BuilderSseEvent.ToolActivity -> _uiState.update { it.copy(activity = event.label) }
                    BuilderSseEvent.AnswerStart -> _uiState.update { it.copy(streamingMarkdown = "") }
                    is BuilderSseEvent.AnswerDelta -> _uiState.update { it.copy(streamingMarkdown = it.streamingMarkdown + event.text) }
                    is BuilderSseEvent.Answer -> terminal = event.answer
                    is BuilderSseEvent.Error -> inbandError = event
                }
            }
        } catch (e: CancellationException) {
            // Panel reset / unmount — drop silently (never leaves a banner).
            throw e
        } catch (e: OakError) {
            finishWithFailure(
                turnId,
                TeamEditorViewModel.message(e),
                isRetryable = e.isRetryableAgentTurn(),
            )
            return
        } catch (e: Exception) {
            finishWithFailure(turnId, TeamEditorViewModel.GENERIC_MESSAGE)
            return
        }

        val answer = terminal
        if (answer != null) {
            _uiState.update { state ->
                state.copy(
                    turns = state.turns.map { if (it.id == turnId) it.copy(answer = answer) else it },
                    status = AssistantStatus.IDLE,
                    activity = null,
                    streamingMarkdown = "",
                )
            }
        } else {
            val inband = inbandError
            finishWithFailure(
                turnId,
                inband?.message ?: "The stream ended without an answer.",
                isRetryable = inband == null || !OakError.isSpendControlRefusal(inband.code),
            )
        }
    }

    /** Drops the in-flight turn and raises a banner (a retry re-sends
     * cleanly rather than duplicating a half-turn). Spend-control refusals
     * hide Retry ([errorIsRetryable] false). */
    private fun finishWithFailure(turnId: Int, message: String, isRetryable: Boolean = true) {
        _uiState.update {
            it.copy(
                turns = it.turns.filterNot { turn -> turn.id == turnId },
                errorMessage = message,
                errorIsRetryable = isRetryable,
                status = AssistantStatus.ERROR,
                activity = null,
                streamingMarkdown = "",
            )
        }
    }

    private fun OakError.isRetryableAgentTurn(): Boolean = when (this) {
        is OakError.Http -> !OakError.isSpendControlRefusal(code)
        else -> true
    }

    companion object {
        /** The one-tap first-use prompts (mirrors web's `ASSISTANT_SUGGESTIONS`). */
        val suggestions = listOf("Check my coverage", "Fill slot 3", "Suggest an item")
    }
}
