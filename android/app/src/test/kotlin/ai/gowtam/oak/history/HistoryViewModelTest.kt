package ai.gowtam.oak.history

import ai.gowtam.oak.features.history.HistoryViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.support.FakeHistoryService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.Format
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [HistoryViewModel] against [FakeHistoryService]
 * (implementation-plan.md P9 acceptance check 1; mirrors iOS `HistoryListViewModelTests`):
 * list/search/filter and the optimistic pin/rename/delete mutations, including
 * revert-on-failure and the idempotent-404-delete case.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HistoryViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun conversation(
        id: String,
        title: String = "Conversation $id",
        format: Format = Format.Champions,
        pinned: Boolean = false,
        updatedAt: Long = 1_000L,
    ) = ConversationSummary(id = id, title = title, format = format, pinned = pinned, updatedAt = updatedAt)

    // -------------------------------------------------------------------
    // reload / initial list
    // -------------------------------------------------------------------

    @Test
    fun reloadPopulatesTheListFromTheService() = runTest {
        val service = FakeHistoryService(listResult = listOf(conversation("1"), conversation("2")))
        val model = HistoryViewModel(service)

        model.reload()

        assertEquals(2, model.uiState.value.conversations.size)
        assertFalse(model.uiState.value.isLoading)
        assertNull(model.uiState.value.errorMessage)
    }

    @Test
    fun reloadFailureSurfacesAnErrorAndKeepsThePriorList() = runTest {
        val service = FakeHistoryService(listResult = listOf(conversation("1")))
        val model = HistoryViewModel(service)
        model.reload()

        service.listError = OakError.Transport("boom")
        model.reload()

        assertEquals(HistoryViewModel.CONNECTION_MESSAGE, model.uiState.value.errorMessage)
        assertEquals(1, model.uiState.value.conversations.size)
    }

    @Test
    fun reloadSendsTheTrimmedQueryAndTheFormatFilter() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)

        model.onSearchQueryChange("  garchomp  ")
        model.search()
        model.setFormatFilter(Format.Gen7)

        val (query, format) = service.listCalls.last()
        assertEquals("garchomp", query)
        assertEquals(Format.Gen7, format)
    }

    @Test
    fun reloadSendsNoQueryWhenTheSearchFieldIsBlank() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)

        model.reload()

        val (query, _) = service.listCalls.last()
        assertNull(query)
    }

    // -------------------------------------------------------------------
    // Search debounce
    // -------------------------------------------------------------------

    @Test
    fun onSearchQueryChangeUpdatesTheFieldImmediatelyButDebouncesTheRefetch() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)
        model.reload() // initial load: 1 call so far

        model.onSearchQueryChange("gar")
        assertEquals("gar", model.uiState.value.searchQuery)
        // Not yet re-fetched — still within the debounce window.
        assertEquals(1, service.listCalls.size)

        advanceTimeBy(HistoryViewModel.SEARCH_DEBOUNCE_MS + 50)
        assertEquals(2, service.listCalls.size)
        assertEquals("gar", service.listCalls.last().first)
    }

    @Test
    fun rapidKeystrokesOnlyFetchOnceAfterTheLastOne() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)
        model.reload()

        model.onSearchQueryChange("g")
        advanceTimeBy(100)
        model.onSearchQueryChange("ga")
        advanceTimeBy(100)
        model.onSearchQueryChange("gar")
        advanceTimeBy(HistoryViewModel.SEARCH_DEBOUNCE_MS + 50)

        assertEquals(2, service.listCalls.size) // initial reload + one debounced fetch
        assertEquals("gar", service.listCalls.last().first)
    }

    @Test
    fun searchBypassesTheDebounceAndFetchesImmediately() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)
        model.reload()

        model.onSearchQueryChange("garchomp")
        model.search()

        assertEquals(2, service.listCalls.size)
        assertEquals("garchomp", service.listCalls.last().first)
    }

    // -------------------------------------------------------------------
    // Format filter
    // -------------------------------------------------------------------

    @Test
    fun setFormatFilterIsANoOpWhenUnchanged() = runTest {
        val service = FakeHistoryService()
        val model = HistoryViewModel(service)
        model.setFormatFilter(Format.Champions)
        val callsAfterFirst = service.listCalls.size

        model.setFormatFilter(Format.Champions)

        assertEquals(callsAfterFirst, service.listCalls.size)
    }

    // -------------------------------------------------------------------
    // Pin (optimistic + revert)
    // -------------------------------------------------------------------

    @Test
    fun togglePinOptimisticallyFlipsAndReSortsPinnedFirst() = runTest {
        val service = FakeHistoryService(
            listResult = listOf(
                conversation("1", pinned = false, updatedAt = 100),
                conversation("2", pinned = false, updatedAt = 200),
            ),
        )
        val model = HistoryViewModel(service)
        model.reload()

        model.togglePin(model.uiState.value.conversations.first { it.id == "1" })

        val conversations = model.uiState.value.conversations
        assertTrue(conversations.first().pinned)
        assertEquals("1", conversations.first().id)
        assertEquals(1, service.setPinnedCalls.size)
        assertEquals("1" to true, service.setPinnedCalls.single())
    }

    @Test
    fun togglePinRevertsAndSurfacesAnErrorOnFailure() = runTest {
        val service = FakeHistoryService(
            listResult = listOf(conversation("1", pinned = false)),
            setPinnedError = OakError.Http(500, "unknown", "server exploded"),
        )
        val model = HistoryViewModel(service)
        model.reload()

        model.togglePin(model.uiState.value.conversations.single())

        assertFalse(model.uiState.value.conversations.single().pinned)
        assertEquals("server exploded", model.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Rename (optimistic + revert)
    // -------------------------------------------------------------------

    @Test
    fun renameTrimsAndPersistsTheNewTitle() = runTest {
        val service = FakeHistoryService(listResult = listOf(conversation("1", title = "Old title")))
        val model = HistoryViewModel(service)
        model.reload()

        model.rename(model.uiState.value.conversations.single(), "  New title  ")

        assertEquals("New title", model.uiState.value.conversations.single().title)
        assertEquals("1" to "New title", service.renameCalls.single())
    }

    @Test
    fun renameIgnoresAnEmptyOrUnchangedTitle() = runTest {
        val service = FakeHistoryService(listResult = listOf(conversation("1", title = "Same")))
        val model = HistoryViewModel(service)
        model.reload()
        val original = model.uiState.value.conversations.single()

        model.rename(original, "   ")
        model.rename(original, "Same")

        assertEquals(0, service.renameCalls.size)
        assertEquals("Same", model.uiState.value.conversations.single().title)
    }

    @Test
    fun renameRevertsAndSurfacesAnErrorOnFailure() = runTest {
        val service = FakeHistoryService(
            listResult = listOf(conversation("1", title = "Old title")),
            renameError = OakError.Transport("boom"),
        )
        val model = HistoryViewModel(service)
        model.reload()

        model.rename(model.uiState.value.conversations.single(), "New title")

        assertEquals("Old title", model.uiState.value.conversations.single().title)
        assertEquals(HistoryViewModel.CONNECTION_MESSAGE, model.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Delete (optimistic; 404 = idempotent success)
    // -------------------------------------------------------------------

    @Test
    fun deleteOptimisticallyRemovesTheRow() = runTest {
        val service = FakeHistoryService(listResult = listOf(conversation("1"), conversation("2")))
        val model = HistoryViewModel(service)
        model.reload()

        model.delete(model.uiState.value.conversations.first { it.id == "1" })

        assertEquals(listOf("2"), model.uiState.value.conversations.map { it.id })
        assertEquals(listOf("1"), service.deleteCalls)
    }

    @Test
    fun deleteTreatsA404AsSuccessAndKeepsTheRowRemoved() = runTest {
        val service = FakeHistoryService(
            listResult = listOf(conversation("1")),
            deleteError = OakError.Http(404, "not_found", "gone"),
        )
        val model = HistoryViewModel(service)
        model.reload()

        model.delete(model.uiState.value.conversations.single())

        assertTrue(model.uiState.value.conversations.isEmpty())
        assertNull(model.uiState.value.errorMessage)
    }

    @Test
    fun deleteRestoresTheRowAndSurfacesAnErrorOnANonNotFoundFailure() = runTest {
        val service = FakeHistoryService(
            listResult = listOf(conversation("1")),
            deleteError = OakError.Http(500, "unknown", "server exploded"),
        )
        val model = HistoryViewModel(service)
        model.reload()

        model.delete(model.uiState.value.conversations.single())

        assertEquals(1, model.uiState.value.conversations.size)
        assertEquals("server exploded", model.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Error dismissal
    // -------------------------------------------------------------------

    @Test
    fun dismissErrorClearsTheBanner() = runTest {
        val service = FakeHistoryService(listError = OakError.Transport("boom"))
        val model = HistoryViewModel(service)
        model.reload()
        assertEquals(HistoryViewModel.CONNECTION_MESSAGE, model.uiState.value.errorMessage)

        model.dismissError()

        assertNull(model.uiState.value.errorMessage)
    }
}
