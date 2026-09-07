package ai.gowtam.oak.features.calc

import ai.gowtam.oak.support.FakeCalcService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.CalcMove
import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — Calc is L50 Stat Points, no generation picker
 * (CF-CALC-US-1, CF-UI-US-8). Species pickers are Champions roster only
 * (enforced by Dex search format, not a local list).
 *
 * Requirement refs: CF-CALC-AC-1.1, CF-CALC-AC-1.2, CF-UI-AC-8.1, ADR-3.
 */
class CalculatorChampionsFirstTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    @Test
    fun defaultLevelIs50ForEveryStoredFormat() {
        assertEquals(50, defaultCalcLevel(Format.Champions))
        for (format in Format.knownCases) {
            assertEquals("defaultCalcLevel($format) must be 50", 50, defaultCalcLevel(format))
        }
        assertEquals(50, defaultCalcLevel(Format.Unknown("gen-99-mystery")))
    }

    @Test
    fun standaloneOpensAsChampionsL50EvenIfConstructedWithAnotherFormat() = runTest(mainDispatcherRule.dispatcher) {
        val vm = CalculatorViewModel(
            FakeCalcService(result = CalcResult.Error(error = "incomplete")),
            initialFormat = Format.Gen5,
        )
        advanceUntilIdle()

        val scenario = vm.uiState.value.scenario
        assertEquals(Format.Champions, scenario.format)
        assertNull(scenario.attacker.species)
        val level = scenario.attacker.level ?: defaultCalcLevel(scenario.format)
        assertEquals(50, level)
        assertNull(scenario.attacker.ivs)
        assertNull(scenario.attacker.tera)
    }

    @Test
    fun setFormatDoesNotBecomeAGenerationPicker() = runTest(mainDispatcherRule.dispatcher) {
        val calc = FakeCalcService(result = CalcResult.Error(error = "incomplete"))
        val vm = CalculatorViewModel(calc, initialFormat = Format.Champions)
        vm.setAttackerSpecies("garchomp")
        vm.setDefenderSpecies("farigiraf")
        vm.setMoveSlug("earthquake")
        advanceUntilIdle()

        vm.setFormat(Format.Gen7)
        advanceUntilIdle()

        assertEquals(Format.Champions, vm.uiState.value.scenario.format)
        assertTrue(calc.estimateCalls.isEmpty() || calc.estimateCalls.all { it.format == Format.Champions })
    }

    @Test
    fun aPrefillFromAnotherFormatIsNormalizedToChampionsL50() = runTest(mainDispatcherRule.dispatcher) {
        val prefilled = CalcScenario(
            format = Format.NationalDex,
            attacker = CalcSide(species = "garchomp", level = 100, tera = "ground", evs = mapOf("atk" to 252)),
            defender = CalcSide(),
            move = CalcMove(),
        )
        val vm = CalculatorViewModel(
            FakeCalcService(result = CalcResult.Error(error = "incomplete")),
            initialFormat = Format.NationalDex,
            initialScenario = prefilled,
        )
        advanceUntilIdle()

        assertEquals(Format.Champions, vm.uiState.value.scenario.format)
        assertEquals("garchomp", vm.uiState.value.scenario.attacker.species)
        assertEquals(50, vm.uiState.value.scenario.attacker.level ?: defaultCalcLevel(Format.Champions))
        assertNull(vm.uiState.value.scenario.attacker.tera)
    }
}
