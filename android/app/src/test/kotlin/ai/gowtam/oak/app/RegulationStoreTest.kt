package ai.gowtam.oak.app

import ai.gowtam.oak.support.FakeScopeService
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.RegulationMeta
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class RegulationStoreTest {

    @Test
    fun appStateFallsBackToChampionsWithNoCache() {
        val state = AppState(regulationStore = InMemoryRegulationStore())
        assertEquals("Champions", state.regulation.value.chipLabel)
    }

    @Test
    fun appStatePaintsLastKnownOnInit() {
        val cached = RegulationMeta(
            format = Format.Champions,
            regulation = "Regulation M-C",
            chipLabel = "Champions · Reg M-C",
            hint = "Current Champions regulation: Regulation M-C",
        )
        val state = AppState(regulationStore = InMemoryRegulationStore(cached))
        assertEquals("Champions · Reg M-C", state.regulation.value.chipLabel)
    }

    @Test
    fun refreshAppliesASuccessfulFetch() = runTest {
        val store = InMemoryRegulationStore()
        val state = AppState(regulationStore = store)
        val fetched = RegulationMeta(
            format = Format.Champions,
            regulation = "Regulation M-C",
            chipLabel = "Champions · Reg M-C",
            hint = "Current Champions regulation: Regulation M-C",
        )
        state.refreshRegulation(FakeScopeService(currentResult = fetched))
        assertEquals("Champions · Reg M-C", state.regulation.value.chipLabel)
        assertEquals(fetched, store.load())
    }

    @Test
    fun refreshMissKeepsLastKnown() = runTest {
        val cached = RegulationMeta(
            format = Format.Champions,
            regulation = "Regulation M-B",
            chipLabel = "Champions · Reg M-B",
            hint = "Current Champions regulation: Regulation M-B",
        )
        val store = InMemoryRegulationStore(cached)
        val state = AppState(regulationStore = store)
        state.refreshRegulation(FakeScopeService(currentResult = null))
        assertEquals("Champions · Reg M-B", state.regulation.value.chipLabel)
        assertEquals(cached, store.load())
    }
}
