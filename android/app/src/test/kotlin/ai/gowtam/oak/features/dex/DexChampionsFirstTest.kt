package ai.gowtam.oak.features.dex

import ai.gowtam.oak.support.FakeArtifactService
import ai.gowtam.oak.support.FakeDexLookupService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.SearchMatch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — Dex browse is Champions roster only; no format picker.
 * Usage is a first-class Dex **section** (ADR-6), not a sixth tab.
 *
 * Requirement refs: CF-DEX-US-1, CF-DEX-AC-1.1–1.5, CF-UI-AC-1.1, CF-UI-AC-6.4,
 * ADR-6.
 */
class DexChampionsFirstTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    @Test
    fun startAlwaysSearchesChampionsEvenIfConstructedWithAnotherFormat() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(
            searchResult = listOf(SearchMatch(slug = "garchomp", displayName = "Garchomp", kind = EntityKind.POKEMON)),
        )
        val model = DexViewModel(dex, FakeArtifactService(), Format.NationalDex)

        model.start()
        advanceUntilIdle()

        assertEquals(Format.Champions, model.list.value.format)
        assertEquals(Format.Champions, dex.searchCalls.single().third)
        assertEquals(EntityKind.POKEMON, dex.searchCalls.single().first)
    }

    @Test
    fun selectFormatCannotSwitchToAnotherGame() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService()
        val model = DexViewModel(dex, FakeArtifactService(), Format.Champions)
        model.start()
        advanceUntilIdle()

        model.selectFormat(Format.Gen7)
        advanceUntilIdle()

        assertEquals(Format.Champions, model.list.value.format)
        assertTrue(dex.searchCalls.all { it.third == Format.Champions })
    }

    @Test
    fun applyHopLooksUpChampionsNotTheArtifactsOldFormat() = runTest(mainDispatcherRule.dispatcher) {
        val artifact = FakeArtifactService()
        val dex = FakeDexLookupService()
        val model = DexViewModel(dex, artifact, Format.Champions)
        model.start()
        advanceUntilIdle()
        dex.searchCalls.clear()
        artifact.entityCalls.clear()

        model.applyHop(EntityKind.POKEMON, "garchomp", Format.Gen4)
        advanceUntilIdle()

        assertEquals(Format.Champions, model.list.value.format)
        assertEquals(Format.Champions, artifact.entityCalls.single().third)
        assertFalse(artifact.entityCalls.any { it.third == Format.Gen4 })
    }

    @Test
    fun selectingUsageDoesNotQueryEntitySearch() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService()
        val model = DexViewModel(dex, FakeArtifactService(), Format.Champions)
        model.start()
        advanceUntilIdle()
        dex.searchCalls.clear()

        val usage = DexSection.entries.find { it.title == "Usage" }
        assertNotNull("DexSection must include Usage (ADR-6)", usage)
        model.selectSection(usage!!)
        advanceUntilIdle()

        assertEquals("Usage", model.list.value.section.title)
        assertTrue(dex.searchCalls.isEmpty())
    }
}
