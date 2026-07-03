package ai.gowtam.oak.features.history

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.HistoryService
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.Format
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The signed-in conversation list's view model (history-and-teams.md D-HIST-1;
 * component-design.md "HistoryViewModel"). Holds the conversation list and the
 * search/format-filter state, and drives the list mutations (pin / rename / delete)
 * with optimistic updates so the UI feels instant. Class-for-class port of iOS
 * `HistoryListViewModel`, re-expressed as a single [uiState] [StateFlow] to match
 * this codebase's other view models (`ChatViewModel`, `AccountViewModel`).
 *
 * Search (`?q=`) and the format filter (`?format=`) are applied **server-side**:
 * changing either re-fetches via [reload] (the route returns pinned-first,
 * most-recent order). This view model is signed-in-only content — [HistoryService]
 * already returns `[]` for a guest with no network request, and the caller (the
 * Chat tab) mounts it only once signed in, mirroring iOS's `ConversationListView`
 * ("Content-only / signed-in only... there is no guest branch here").
 *
 * Mutating actions ([togglePin]/[rename]/[delete]/[setFormatFilter]/[search]) are
 * plain `suspend` functions the caller drives from its own coroutine scope (the
 * `Task { await model.x() }` pattern also used by `AuthViewModel`/`AccountViewModel`).
 * [onSearchQueryChange] is the one exception: it must debounce internally as the
 * user types, so it launches on [viewModelScope] itself (the same pattern
 * `ChatViewModel` uses for its stream consumer).
 */
class HistoryViewModel(
    private val history: HistoryService,
) : ViewModel() {

    /** The single renderable snapshot the history screen collects. */
    @Immutable
    data class UiState(
        /** The visible conversations, in the server's pinned-first / most-recent order. */
        val conversations: List<ConversationSummary> = emptyList(),
        /** `true` while a list fetch is in flight (drives the refresh spinner). */
        val isLoading: Boolean = false,
        /** A user-facing error message for the last failed operation, or `null` when clear. */
        val errorMessage: String? = null,
        /** The search text (two-way bound). Applied server-side via `?q=` on [reload]. */
        val searchQuery: String = "",
        /** The active format filter; `null` = all formats. Applied server-side via `?format=`. */
        val formatFilter: Format? = null,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    /** The in-flight debounce for [onSearchQueryChange]; cancelled by every keystroke. */
    private var searchDebounceJob: Job? = null

    /**
     * (Re)loads the conversation list with the current search + filter — the initial
     * load, pull-to-refresh, and the re-fetch after a search/filter change all route
     * through here. Never throws: a failure surfaces as [UiState.errorMessage] and
     * leaves the prior list in place.
     */
    suspend fun reload() {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        try {
            val result = history.list(query = trimmedQuery(), format = _uiState.value.formatFilter)
            _uiState.update { it.copy(conversations = result, isLoading = false) }
        } catch (e: OakError) {
            _uiState.update { it.copy(isLoading = false, errorMessage = message(e)) }
        } catch (e: Exception) {
            _uiState.update { it.copy(isLoading = false, errorMessage = GENERIC_MESSAGE) }
        }
    }

    /**
     * Updates the search field immediately (so typing feels responsive) and schedules
     * a debounced [reload] [SEARCH_DEBOUNCE_MS] after the last keystroke, cancelling
     * any pending debounce from an earlier keystroke.
     */
    fun onSearchQueryChange(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        searchDebounceJob?.cancel()
        searchDebounceJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            reload()
        }
    }

    /** Forces an immediate re-fetch (e.g. an IME search action), bypassing the debounce. */
    suspend fun search() {
        searchDebounceJob?.cancel()
        reload()
    }

    /** Switches the format filter and re-fetches. A no-op when unchanged. */
    suspend fun setFormatFilter(format: Format?) {
        if (format == _uiState.value.formatFilter) return
        _uiState.update { it.copy(formatFilter = format) }
        reload()
    }

    /**
     * Pins or unpins a conversation. Optimistically flips the flag and re-sorts
     * (pinned first), then persists; a failure reverts and surfaces an error.
     */
    suspend fun togglePin(summary: ConversationSummary) {
        val newPinned = !summary.pinned
        replaceLocal(summary.copy(pinned = newPinned))
        try {
            history.setPinned(summary.id, newPinned)
        } catch (e: OakError) {
            replaceLocal(summary)
            _uiState.update { it.copy(errorMessage = message(e)) }
        } catch (e: Exception) {
            replaceLocal(summary)
            _uiState.update { it.copy(errorMessage = GENERIC_MESSAGE) }
        }
    }

    /**
     * Renames a conversation. Trims the title and ignores an empty or unchanged
     * value; otherwise optimistically updates, then persists. A failure reverts and
     * surfaces an error.
     */
    suspend fun rename(summary: ConversationSummary, newTitle: String) {
        val title = newTitle.trim()
        if (title.isEmpty() || title == summary.title) return
        replaceLocal(summary.copy(title = title))
        try {
            history.rename(summary.id, title)
        } catch (e: OakError) {
            replaceLocal(summary)
            _uiState.update { it.copy(errorMessage = message(e)) }
        } catch (e: Exception) {
            replaceLocal(summary)
            _uiState.update { it.copy(errorMessage = GENERIC_MESSAGE) }
        }
    }

    /**
     * Deletes a conversation. Optimistically removes the row, then persists. A `404`
     * is treated as success (the conversation was already gone — idempotent UX); any
     * other failure restores the row and surfaces an error.
     */
    suspend fun delete(summary: ConversationSummary) {
        val snapshot = _uiState.value.conversations
        _uiState.update { it.copy(conversations = it.conversations.filterNot { c -> c.id == summary.id }) }
        try {
            history.delete(summary.id)
        } catch (e: OakError.Http) {
            if (e.status != 404) {
                _uiState.update { it.copy(conversations = snapshot, errorMessage = message(e)) }
            }
            // else: already deleted server-side — keep it removed (idempotent).
        } catch (e: OakError) {
            _uiState.update { it.copy(conversations = snapshot, errorMessage = message(e)) }
        } catch (e: Exception) {
            _uiState.update { it.copy(conversations = snapshot, errorMessage = GENERIC_MESSAGE) }
        }
    }

    /** Clears the current error banner. */
    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun trimmedQuery(): String? {
        val trimmed = _uiState.value.searchQuery.trim()
        return trimmed.ifEmpty { null }
    }

    /**
     * Replaces the conversation with the same id and re-sorts (pinned first, then
     * most-recently-active) so an optimistic pin moves the row immediately. A no-op
     * if the id is no longer in the list (e.g. it was deleted concurrently).
     */
    private fun replaceLocal(updated: ConversationSummary) {
        _uiState.update { state ->
            val index = state.conversations.indexOfFirst { it.id == updated.id }
            if (index < 0) return@update state
            val reordered = state.conversations.toMutableList().apply { this[index] = updated }
            reordered.sortWith(compareByDescending<ConversationSummary> { it.pinned }.thenByDescending { it.updatedAt })
            state.copy(conversations = reordered)
        }
    }

    companion object {
        /** How long to wait after the last keystroke before re-fetching. */
        const val SEARCH_DEBOUNCE_MS = 400L

        const val CONNECTION_MESSAGE = "No connection. Check your network and try again."
        const val SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again."
        const val GENERIC_MESSAGE = "Something went wrong. Please try again."

        /** Maps an [OakError] to a user-facing message. */
        fun message(error: OakError): String = when (error) {
            is OakError.Transport -> CONNECTION_MESSAGE
            is OakError.RateLimited -> "You're going too fast. Please wait a moment and try again."
            OakError.Unauthorized -> SESSION_EXPIRED_MESSAGE
            is OakError.Http -> error.message.ifEmpty { GENERIC_MESSAGE }
            is OakError.Decoding, is OakError.ImageRejected -> GENERIC_MESSAGE
        }
    }
}
