package ai.gowtam.oak.features.calc

import ai.gowtam.oak.services.CalcService
import ai.gowtam.oak.wire.CalcField
import ai.gowtam.oak.wire.CalcMove
import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.isComplete
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Standalone / overlay calculator (CALC-US-1/2/4/5/6/8). Incomplete input
 * never invents a 0 success (CALC-BR-8). Knob changes POST `/api/calc`
 * through [CalcService] (CALC-BR-1).
 */
class CalculatorViewModel(
    private val calc: CalcService,
    initialFormat: Format,
    initialScenario: CalcScenario? = null,
) : ViewModel() {

    data class UiState(
        val scenario: CalcScenario,
        val result: CalcResult? = null,
        val isComputing: Boolean = false,
    )

    private val _uiState = MutableStateFlow(
        UiState(
            scenario = initialScenario ?: CalcScenario(
                format = initialFormat,
                attacker = CalcSide(),
                defender = CalcSide(),
                move = CalcMove(),
            ),
        ),
    )
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private var generation = 0

    init {
        scheduleEstimate()
    }

    fun setAttackerSpecies(species: String?) {
        updateScenario { it.copy(attacker = it.attacker.copy(species = species)) }
    }

    fun setDefenderSpecies(species: String?) {
        updateScenario { it.copy(defender = it.defender.copy(species = species)) }
    }

    fun setMoveSlug(slug: String?) {
        updateScenario { it.copy(move = it.move.copy(slug = slug)) }
    }

    fun setAttackerItem(item: String?) {
        updateScenario { it.copy(attacker = it.attacker.copy(item = item)) }
    }

    fun setField(field: CalcField) {
        updateScenario { it.copy(field = field) }
    }

    fun setFormat(format: Format) {
        updateScenario { it.copy(format = format) }
    }

    fun explainPrompt(): String? {
        val state = _uiState.value
        if (!state.scenario.isComplete()) return null
        val result = state.result ?: CalcResult.Error(error = "incomplete")
        return explainCalcPrompt(state.scenario, result)
    }

    private fun updateScenario(transform: (CalcScenario) -> CalcScenario) {
        _uiState.update { it.copy(scenario = transform(it.scenario)) }
        scheduleEstimate()
    }

    private fun scheduleEstimate() {
        val scenario = _uiState.value.scenario
        if (!scenario.isComplete()) {
            generation += 1
            _uiState.update { it.copy(result = CalcResult.Error(error = "incomplete"), isComputing = false) }
            return
        }
        val gen = ++generation
        viewModelScope.launch {
            _uiState.update { it.copy(isComputing = true) }
            val result = calc.estimate(scenario)
            if (gen != generation) return@launch
            _uiState.update { it.copy(result = result, isComputing = false) }
        }
    }
}
