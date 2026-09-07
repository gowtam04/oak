package ai.gowtam.oak.features.calc

import ai.gowtam.oak.support.FakeCalcService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.CalcApplied
import ai.gowtam.oak.wire.CalcEstimate
import ai.gowtam.oak.wire.CalcField
import ai.gowtam.oak.wire.CalcKo
import ai.gowtam.oak.wire.CalcMove
import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Phase 8 VM for the standalone / overlay calculator (CALC-US-1/2/4/5/6/8).
 *
 * Fails to compile until P8 adds:
 *
 *   services/CalcService.kt
 *     suspend fun estimate(scenario: CalcScenario): CalcResult?  // never-throw
 *
 *   features/calc/CalculatorViewModel.kt
 *     CalculatorViewModel(calc, initialFormat, initialScenario?)
 *     uiState: StateFlow<UiState>  — scenario, result, isComputing
 *     setAttackerSpecies / setDefenderSpecies / setMoveSlug / setAttackerItem
 *     setField / setFormat
 *     explainPrompt(): String?   // does not POST chat; null when incomplete
 *
 * Incomplete input → empty / `CalcResult.Error("incomplete")`, never a fake 0
 * success (CALC-BR-8). Changing a knob POSTs `/api/calc` via [FakeCalcService]
 * (CALC-BR-1). Explain builds the portable prompt and leaves the scenario
 * untouched (CALC-AC-8.2).
 *
 * Requirement refs: CALC-US-1, CALC-US-2, CALC-US-4, CALC-US-5, CALC-US-6,
 * CALC-US-8, CALC-AC-1.1, CALC-AC-4.2, CALC-AC-4.4, CALC-AC-5.4, CALC-AC-6.1,
 * CALC-AC-6.2, CALC-AC-8.1, CALC-AC-8.2, CALC-BR-1, CALC-BR-2, CALC-BR-5,
 * CALC-BR-8.
 */
class CalculatorViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun success(
        format: Format = Format.ScarletViolet,
        unsupported: List<String> = emptyList(),
        caveat: String? = null,
    ) = CalcResult.Ok(
        format = format,
        estimate = CalcEstimate(
            minDamage = 100, maxDamage = 120,
            percentMin = 30.0, percentMax = 36.0,
            ko = CalcKo(hits = 3), isEstimate = true,
        ),
        breakdown = "estimate",
        applied = CalcApplied(
            stab = true,
            typeEffectiveness = 1.0,
            otherModifier = 1.0,
            unsupported = unsupported,
        ),
        caveat = caveat,
    )

    private fun newModel(
        calc: FakeCalcService = FakeCalcService(result = success()),
        format: Format = Format.NationalDex,
        scenario: CalcScenario? = null,
    ) = CalculatorViewModel(calc, initialFormat = format, initialScenario = scenario)

    private fun isIncomplete(result: CalcResult?): Boolean =
        result == null || (result is CalcResult.Error && result.error == "incomplete")

    // -------------------------------------------------------------------
    // CALC-US-1 / CALC-AC-1.1 — empty first-class destination
    // -------------------------------------------------------------------

    @Test
    fun standaloneOpensWithEmptySidesAndChampions() = runTest(mainDispatcherRule.dispatcher) {
        val vm = newModel(
            calc = FakeCalcService(result = CalcResult.Error(error = "incomplete")),
            format = Format.Gen5,
        )
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(Format.Champions, state.scenario.format)
        assertNull(state.scenario.attacker.species)
        assertNull(state.scenario.defender.species)
        assertNull(state.scenario.move.slug)
        assertTrue(isIncomplete(state.result))
    }

    @Test
    fun hopPrefillCarriesTheGivenScenario() = runTest(mainDispatcherRule.dispatcher) {
        val prefilled = CalcScenario(
            format = Format.Champions,
            attacker = CalcSide(species = "garchomp", level = 50),
            defender = CalcSide(),
            move = CalcMove(),
        )
        val vm = newModel(format = Format.NationalDex, scenario = prefilled)
        advanceUntilIdle()

        assertEquals(Format.Champions, vm.uiState.value.scenario.format)
        assertEquals("garchomp", vm.uiState.value.scenario.attacker.species)
        assertEquals(50, vm.uiState.value.scenario.attacker.level)
        assertNull(vm.uiState.value.scenario.defender.species)
    }

    // -------------------------------------------------------------------
    // CALC-BR-8 / CALC-AC-5.4 — incomplete never invents a 0
    // -------------------------------------------------------------------

    @Test
    fun missingSpeciesOrMoveIsAnEmptyResultNotAZeroRoll() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = CalcResult.Error(error = "incomplete", detail = "need sides"))
        val vm = newModel(calc, format = Format.ScarletViolet)
        advanceUntilIdle()

        val result = vm.uiState.value.result
        assertTrue(isIncomplete(result))
        if (result is CalcResult.Ok) {
            throw AssertionError("incomplete input must not produce a success range")
        }
        assertTrue(calc.estimateCalls.isEmpty() || calc.estimateCalls.all { call ->
            call.attacker.species.isNullOrBlank() ||
                call.defender.species.isNullOrBlank() ||
                (call.move.slug.isNullOrBlank() && call.move.name.isNullOrBlank())
        })
    }

    @Test
    fun aStatusMoveIsAnHonestMissNotAFakeRange() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = CalcResult.Error(error = "status_move"))
        val vm = newModel(calc)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("farigiraf")
        vm.setMoveSlug("swords-dance")
        advanceUntilIdle()

        val err = vm.uiState.value.result as CalcResult.Error
        assertEquals("status_move", err.error)
    }

    // -------------------------------------------------------------------
    // CALC-AC-4.2 / CALC-BR-1 — knob change recomputes without a model
    // -------------------------------------------------------------------

    @Test
    fun changingAKnobRecomputesThroughCalcService() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = success())
        val vm = newModel(calc)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("farigiraf")
        vm.setMoveSlug("earthquake")
        advanceUntilIdle()

        assertTrue(calc.estimateCalls.isNotEmpty())
        val last = calc.estimateCalls.last()
        assertEquals("garchomp", last.attacker.species)
        assertEquals("farigiraf", last.defender.species)
        assertEquals("earthquake", last.move.slug)
        val ok = vm.uiState.value.result as CalcResult.Ok
        assertTrue(ok.estimate.isEstimate)
    }

    @Test
    fun anUnsupportedItemIsLabeledNotModeledOnTheResult() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = success(unsupported = listOf("leftovers")))
        val vm = newModel(calc)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("farigiraf")
        vm.setMoveSlug("earthquake")
        vm.setAttackerItem("leftovers")
        advanceUntilIdle()

        val ok = vm.uiState.value.result as CalcResult.Ok
        assertTrue(ok.applied.unsupported.contains("leftovers"))
        assertEquals("leftovers", vm.uiState.value.scenario.attacker.item)
    }

    // -------------------------------------------------------------------
    // CF-CALC-AC-1.1 — format is Champions; not a gen picker
    // -------------------------------------------------------------------

    @Test
    fun changingFormatDoesNotLeaveChampions() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = success(format = Format.Champions))
        val vm = newModel(calc, format = Format.ScarletViolet)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("ferrothorn")
        vm.setMoveSlug("earthquake")
        advanceUntilIdle()

        vm.setFormat(Format.Gen5)
        advanceUntilIdle()

        assertEquals(Format.Champions, vm.uiState.value.scenario.format)
        assertEquals(Format.Champions, calc.estimateCalls.last().format)
    }

    @Test
    fun aPrefillFromAnotherFormatIsNormalizedToChampions() = runTest(mainDispatcherRule.dispatcher) {
        val prefilled = CalcScenario(
            format = Format.Gen7,
            attacker = CalcSide(species = "garchomp"),
            defender = CalcSide(species = "ferrothorn"),
            move = CalcMove(slug = "earthquake"),
        )
        val vm = newModel(scenario = prefilled)
        advanceUntilIdle()

        assertEquals(Format.Champions, vm.uiState.value.scenario.format)
        assertNotEquals(Format.Gen7, vm.uiState.value.scenario.format)
    }

    // -------------------------------------------------------------------
    // CALC-US-8 / CALC-AC-8.2 — Explain does not reset the form
    // -------------------------------------------------------------------

    @Test
    fun explainPromptLeavesTheScenarioConfigured() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = success())
        val vm = newModel(calc)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("farigiraf")
        vm.setMoveSlug("earthquake")
        vm.setField(CalcField(weather = "sun", reflect = true, lightScreen = false))
        advanceUntilIdle()

        val before = vm.uiState.value.scenario
        val prompt = vm.explainPrompt()
        assertNotNull(prompt)
        assertTrue(prompt!!.startsWith("Explain this damage estimate"))
        assertEquals(before, vm.uiState.value.scenario)
        assertFalse(prompt.contains("{"))
    }

    @Test
    fun explainPromptIsNullWhileIncomplete() = runTest(mainDispatcherRule.dispatcher) {
        val vm = newModel(FakeCalcService(result = CalcResult.Error(error = "incomplete")))
        advanceUntilIdle()
        assertNull(vm.explainPrompt())
    }

    @Test
    fun aTransportFaultFoldsToANullResultWithoutThrowing() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = null)
        val vm = newModel(calc)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("farigiraf")
        vm.setMoveSlug("earthquake")
        advanceUntilIdle()

        assertNull(vm.uiState.value.result)
        assertTrue(calc.estimateCalls.isNotEmpty())
    }
}
