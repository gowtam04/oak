package ai.gowtam.oak.history

import ai.gowtam.oak.features.history.HistoryViewModel
import ai.gowtam.oak.support.FakeHistoryService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — History has no generation / format filter
 * (CF-HIST-AC-1.1, CF-UI-AC-1.2).
 */
class HistoryChampionsFirstTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun setFormatFilterDoesNotSendAnotherGame() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)

        model.setFormatFilter(Format.Gen7)
        model.reload()

        assertTrue(
            model.uiState.value.formatFilter == null ||
                model.uiState.value.formatFilter == Format.Champions,
        )
        assertTrue(service.listCalls.none { it.second == Format.Gen7 })
    }

    @Test
    fun defaultListHasNoFormatFilter() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)
        model.reload()
        assertNull(model.uiState.value.formatFilter)
        assertTrue(service.listCalls.all { it.second == null })
    }
}
