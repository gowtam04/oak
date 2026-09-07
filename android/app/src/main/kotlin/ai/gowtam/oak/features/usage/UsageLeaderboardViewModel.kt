package ai.gowtam.oak.features.usage

import ai.gowtam.oak.services.UsageService
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboardRow
import ai.gowtam.oak.wire.UsageSpecies
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Dex-section Usage leaderboard (ADR-6). Doubles is the default and is not
 * persisted (CF-AS-2). Public — no sign-in. Fail-soft when the live ladder is
 * down; never invents a Smogon OU board.
 */
class UsageLeaderboardViewModel(
    private val usage: UsageService,
) : ViewModel() {

    @Immutable
    data class UiState(
        val ladder: UsageLadder = UsageLadder.Doubles,
        val available: Boolean = false,
        val rows: List<UsageLeaderboardRow> = emptyList(),
        val season: String? = null,
        val fetchedAt: Long? = null,
        val attribution: String? = null,
        val errorMessage: String? = null,
        val isLoading: Boolean = false,
        val species: UsageSpecies? = null,
        val speciesLoading: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun start() {
        load(_uiState.value.ladder)
    }

    fun setLadder(ladder: UsageLadder) {
        if (ladder == _uiState.value.ladder && !_uiState.value.isLoading) {
            load(ladder)
            return
        }
        _uiState.update { it.copy(ladder = ladder, species = null) }
        load(ladder)
    }

    fun openSpecies(slug: String) {
        val trimmed = slug.trim()
        if (trimmed.isEmpty()) return
        val ladder = _uiState.value.ladder
        viewModelScope.launch {
            _uiState.update { it.copy(speciesLoading = true) }
            val detail = usage.species(trimmed, ladder)
            _uiState.update { it.copy(species = detail, speciesLoading = false) }
        }
    }

    fun clearSpecies() {
        _uiState.update { it.copy(species = null, speciesLoading = false) }
    }

    private fun load(ladder: UsageLadder) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, ladder = ladder) }
            val board = usage.leaderboard(ladder)
            _uiState.update {
                it.copy(
                    ladder = board.ladder,
                    available = board.available,
                    rows = board.rows,
                    season = board.season,
                    fetchedAt = board.fetchedAt,
                    attribution = board.attribution,
                    errorMessage = if (board.available) {
                        null
                    } else {
                        board.error?.takeIf { err -> err.isNotBlank() } ?: "Usage unavailable"
                    },
                    isLoading = false,
                )
            }
        }
    }
}
