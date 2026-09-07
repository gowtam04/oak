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
        assertEquals(Format.Champions, dex.searchCalls[0].third)
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

        assertEquals(Format.Champions, model.list.value.format)
        assertEquals(Format.Champions, dex.searchCalls.last().third)
    }

    // -------------------------------------------------------------------
    // DEX-US-2 / DEX-AC-2.1 / DEX-BR-3 — hop writes format before push
    //
    // Fails to compile until DexViewModel grows:
    //   fun applyHop(kind: EntityKind, query: String, format: Format)
    // Format is written first so loadDetail fetches under the artifact's
    // tagged scope, not the Dex browse scope.
    // -------------------------------------------------------------------

    @Test
    fun applyHopWritesFormatBeforeLoadingTheEntity() = runTest(mainDispatcherRule.dispatcher) {
        val artifact = FakeArtifactService()
        val dex = FakeDexLookupService()
        val model = DexViewModel(dex, artifact, Format.NationalDex)
        model.start()
        advanceUntilIdle()
        dex.searchCalls.clear()
        artifact.entityCalls.clear()

        model.applyHop(EntityKind.MOVE, "earthquake", Format.Gen5)
        advanceUntilIdle()

        assertEquals(Format.Champions, model.list.value.format)
        assertEquals(1, artifact.entityCalls.size)
        assertEquals(EntityKind.MOVE, artifact.entityCalls.single().first)
        assertEquals("earthquake", artifact.entityCalls.single().second)
        assertEquals(Format.Champions, artifact.entityCalls.single().third)
        assertEquals(Format.Champions, dex.searchCalls.last().third)
    }

    @Test
    fun applyHopDoesNotSilentlyKeepTheBrowseFormat() = runTest(mainDispatcherRule.dispatcher) {
        val artifact = FakeArtifactService()
        val model = DexViewModel(FakeDexLookupService(), artifact, Format.NationalDex)
        model.start()
        advanceUntilIdle()

        model.applyHop(EntityKind.POKEMON, "garchomp", Format.Gen4)
        advanceUntilIdle()

        assertEquals(Format.Champions, model.list.value.format)
        assertEquals(Format.Champions, artifact.entityCalls.single().third)
        assertFalse(artifact.entityCalls.any { it.third == Format.NationalDex })
        assertFalse(artifact.entityCalls.any { it.third == Format.Gen4 })
    }
}
