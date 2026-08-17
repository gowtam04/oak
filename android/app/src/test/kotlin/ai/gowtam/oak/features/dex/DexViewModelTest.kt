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
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [DexViewModel] against fakes (mirrors iOS `DexViewModelTests`).
 */
class DexViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    @Test
    fun startLoadsBlankBrowseForPokemon() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(
            searchResult = listOf(
                SearchMatch(slug = "abra", displayName = "Abra", kind = EntityKind.POKEMON),
            ),
        )
        val model = DexViewModel(dex, FakeArtifactService(), Format.ScarletViolet)

        model.start()
        advanceUntilIdle()

        assertEquals(DexSection.Pokemon, model.list.value.section)
        assertEquals(listOf("abra"), model.list.value.matches.map { it.slug })
        assertFalse(model.list.value.isLoading)
        assertEquals(1, dex.searchCalls.size)
        assertEquals(EntityKind.POKEMON, dex.searchCalls[0].first)
        assertEquals("", dex.searchCalls[0].second)
        assertEquals(Format.ScarletViolet, dex.searchCalls[0].third)
    }

    @Test
    fun selectSectionReloadsWithNewKind() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(
            searchResult = listOf(
                SearchMatch(slug = "earthquake", displayName = "Earthquake", kind = EntityKind.MOVE),
            ),
        )
        val model = DexViewModel(dex, FakeArtifactService(), Format.NationalDex)
        model.start()
        advanceUntilIdle()

        model.selectSection(DexSection.Move)
        advanceUntilIdle()

        assertEquals(DexSection.Move, model.list.value.section)
        assertEquals(EntityKind.MOVE, dex.searchCalls.last().first)
    }

    @Test
    fun selectFormatReloadsWithNewScope() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService()
        val model = DexViewModel(dex, FakeArtifactService(), Format.NationalDex)
        model.start()
        advanceUntilIdle()

        model.selectFormat(Format.Gen7)
        advanceUntilIdle()

        assertEquals(Format.Gen7, model.list.value.format)
        assertEquals(Format.Gen7, dex.searchCalls.last().third)
    }
}
