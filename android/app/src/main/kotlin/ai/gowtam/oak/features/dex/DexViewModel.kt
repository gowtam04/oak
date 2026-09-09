package ai.gowtam.oak.features.dex

import ai.gowtam.oak.services.ArtifactService
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityArtifactOk
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.SearchMatch
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
 * Drives the Dex tab list (section, format, debounced search) and loads entity
 * profiles for the detail stack. Mirrors iOS `DexViewModel` + the detail host's
 * fetch. Never throws — [DexLookupService] / [ArtifactService] fold faults.
 */
class DexViewModel(
    private val dexLookup: DexLookupService,
    private val artifact: ArtifactService,
    initialFormat: Format = Format.Champions,
) : ViewModel() {

    data class ListState(
        val section: DexSection = DexSection.Pokemon,
        val format: Format = Format.Champions,
        val query: String = "",
        val matches: List<SearchMatch> = emptyList(),
        val isLoading: Boolean = false,
    )

    sealed interface DetailState {
        data object Loading : DetailState
        data class Ready(val artifact: EntityArtifactOk) : DetailState
        data class Unavailable(val kind: EntityKind, val query: String, val suggestions: List<String>) : DetailState
    }

    private val _list = MutableStateFlow(ListState(format = Format.Champions))
    val list: StateFlow<ListState> = _list.asStateFlow()

    private val _detail = MutableStateFlow<DetailState?>(null)
    val detail: StateFlow<DetailState?> = _detail.asStateFlow()

    private var searchJob: Job? = null
    private var detailJob: Job? = null
    private var generation = 0

    fun start() {
        reloadImmediate()
    }

    fun selectSection(section: DexSection) {
        if (section == _list.value.section) return
        _list.update { it.copy(section = section, matches = emptyList()) }
        if (section.entityKind == null) {
            searchJob?.cancel()
            _list.update { it.copy(isLoading = false) }
            return
        }
        reloadImmediate()
    }

    fun selectFormat(format: Format) {
        // Champions-only: other games are not a picker (CF-UI-AC-1.1).
        if (format != Format.Champions) return
        if (format == _list.value.format) return
        _list.update { it.copy(format = Format.Champions) }
        reloadImmediate()
    }

    fun setQuery(query: String) {
        if (query == _list.value.query) return
        _list.update { it.copy(query = query) }
        scheduleSearch()
    }

    fun loadDetail(kind: EntityKind, query: String) {
        detailJob?.cancel()
        _detail.value = DetailState.Loading
        val format = Format.Champions
        detailJob = viewModelScope.launch {
            when (val result = artifact.entity(kind, query, format)) {
                is EntityArtifact.Ok -> _detail.value = DetailState.Ready(result.v)
                is EntityArtifact.NotFound ->
                    _detail.value = DetailState.Unavailable(kind, query, result.v.suggestions)
                else ->
                    _detail.value = DetailState.Unavailable(kind, query, emptyList())
            }
        }
    }

    /**
     * Writes [format] first so [loadDetail] fetches under the artifact's tagged
     * scope, not the Dex browse scope (DEX-US-2 / DEX-BR-3).
     */
    fun applyHop(kind: EntityKind, query: String, format: Format) {
        if (_list.value.format != Format.Champions) {
            _list.update { it.copy(format = Format.Champions) }
        }
        reloadImmediate()
        loadDetail(kind, query)
    }

    fun clearDetail() {
        detailJob?.cancel()
        _detail.value = null
    }

    private fun reloadImmediate() {
        val kind = _list.value.section.entityKind ?: return
        searchJob?.cancel()
        val snapshot = _list.value
        val gen = ++generation
        _list.update { it.copy(isLoading = true) }
        searchJob = viewModelScope.launch {
            val results = dexLookup.search(kind, snapshot.query, Format.Champions)
            if (gen != generation) return@launch
            _list.update { it.copy(matches = results, isLoading = false, format = Format.Champions) }
        }
    }

    private fun scheduleSearch() {
        val kind = _list.value.section.entityKind ?: return
        searchJob?.cancel()
        val snapshot = _list.value
        val gen = ++generation
        searchJob = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            if (gen != generation) return@launch
            _list.update { it.copy(isLoading = true) }
            val results = dexLookup.search(kind, snapshot.query, Format.Champions)
            if (gen != generation) return@launch
            _list.update { it.copy(matches = results, isLoading = false, format = Format.Champions) }
        }
    }

    companion object {
        private const val DEBOUNCE_MS = 280L
    }
}
