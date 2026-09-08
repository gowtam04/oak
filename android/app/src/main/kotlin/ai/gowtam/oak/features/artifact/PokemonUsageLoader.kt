package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.services.UsageService
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageSpecies
import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Loads `GET /api/usage/:slug` for a Pokémon artifact Usage tab.
 * Summary never waits on this — the pane calls [load] when Usage is shown.
 */
class PokemonUsageLoader(private val usage: UsageService) {

    @Immutable
    data class State(
        val ladder: UsageLadder = UsageLadder.Doubles,
        val detail: UsageSpecies? = null,
        val loading: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    suspend fun load(slug: String, ladder: UsageLadder = _state.value.ladder) {
        val trimmed = slug.trim()
        if (trimmed.isEmpty()) {
            _state.update {
                it.copy(
                    ladder = ladder,
                    loading = false,
                    detail = UsageSpecies(available = false, error = "upstream_unavailable"),
                )
            }
            return
        }
        _state.update { it.copy(loading = true, ladder = ladder) }
        val detail = usage.species(trimmed, ladder)
        _state.update { it.copy(detail = detail, loading = false, ladder = ladder) }
    }
}
