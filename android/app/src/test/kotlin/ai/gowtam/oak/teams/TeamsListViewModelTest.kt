package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamsListViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ImportNote
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamSummary
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [TeamsListViewModel] against [FakeTeamService] (implementation-plan.md P10
 * acceptance check 1; mirrors iOS `TeamsListViewModelTests`): list/filter, the
 * optimistic delete-with-revert, and create/duplicate/import all inserting the fresh
 * summary at the top of the list.
 */
class TeamsListViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun summary(id: String, format: Format = Format.Champions, name: String = "Team $id") =
        TeamSummary(id = id, name = name, format = format, memberCount = 0, incomplete = true, species = emptyList(), updatedAt = 0L)

    // -------------------------------------------------------------------
    // reload / filter
    // -------------------------------------------------------------------

    @Test
    fun reloadPopulatesTheListFromTheService() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(listResult = listOf(summary("1"), summary("2")))
        val model = TeamsListViewModel(service)

        model.reload()
        advanceUntilIdle()

        assertEquals(2, model.uiState.value.teams.size)
        assertFalse(model.uiState.value.isLoading)
        assertNull(model.uiState.value.errorMessage)
    }

    @Test
    fun reloadFailureSurfacesAnErrorAndKeepsThePriorList() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(listResult = listOf(summary("1")))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        service.error = OakError.Transport("boom")
        model.reload()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.teams.size)
        assertNotNull(model.uiState.value.errorMessage)
    }

    @Test
    fun thereIsNoOtherGameFormatFilter() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService()
        val model = TeamsListViewModel(service)

        model.reload()
        advanceUntilIdle()

        val names = model.uiState.value::class.java.declaredFields.map { it.name }
        assertFalse("formatFilter" in names)
        assertTrue(service.listCalls.none { it == Format.Gen5 })
    }

    // -------------------------------------------------------------------
    // Create / duplicate / import — all insert at the top
    // -------------------------------------------------------------------

    @Test
    fun createTeamInsertsTheNewSummaryAtTheTopAndInvokesOnCreated() = runTest(mainDispatcherRule.dispatcher) {
        val created = fakeTeam(id = "new-1").copy(name = "Fresh Team")
        val service = FakeTeamService(listResult = listOf(summary("old")), teamResult = created to emptyList())
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        var createdCallback: Team? = null
        model.createTeam { createdCallback = it }
        advanceUntilIdle()

        assertEquals("new-1", createdCallback?.id)
        assertEquals("new-1", model.uiState.value.teams.first().id)
        assertEquals(2, model.uiState.value.teams.size)
    }

    @Test
    fun duplicateInsertsTheCopyAtTheTop() = runTest(mainDispatcherRule.dispatcher) {
        val duplicated = fakeTeam(id = "dup-1")
        val service = FakeTeamService(listResult = listOf(summary("old")), teamResult = duplicated to emptyList())
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        model.duplicate(summary("old"))
        advanceUntilIdle()

        assertEquals("dup-1", model.uiState.value.teams.first().id)
        assertEquals(listOf("old"), service.duplicateCalls)
    }

    @Test
    fun importPasteInsertsTheImportedTeamAndSurfacesNotes() = runTest(mainDispatcherRule.dispatcher) {
        val imported = fakeTeam(id = "import-1")
        val notes = listOf(ImportNote(slot = 0, kind = ImportNote.Kind.POKEMON, raw = "??", resolvedTo = null, message = "Unresolved species"))
        val service = FakeTeamService(importPasteResult = Triple(imported, emptyList(), notes))
        val model = TeamsListViewModel(service)

        var resultTeam: Team? = null
        var resultNotes: List<ImportNote> = emptyList()
        model.importPaste("some paste") { team, n -> resultTeam = team; resultNotes = n }
        advanceUntilIdle()

        assertEquals("import-1", resultTeam?.id)
        assertEquals(1, resultNotes.size)
        assertEquals("import-1", model.uiState.value.teams.first().id)
    }

    @Test
    fun importPasteFailureCallsBackWithNullAndSurfacesAnError() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(error = OakError.Transport("boom"))
        val model = TeamsListViewModel(service)

        var resultTeam: Team? = fakeTeam()
        model.importPaste("paste") { team, _ -> resultTeam = team }
        advanceUntilIdle()

        assertNull(resultTeam)
        assertNotNull(model.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Delete — optimistic, revert-on-failure, idempotent 404
    // -------------------------------------------------------------------

    @Test
    fun deleteOptimisticallyRemovesAndStaysRemovedOnSuccess() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(listResult = listOf(summary("1"), summary("2")))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        model.delete(summary("1"))
        // Optimistic removal happens synchronously before the network call resolves.
        assertEquals(1, model.uiState.value.teams.size)
        advanceUntilIdle()
        assertEquals(1, model.uiState.value.teams.size)
        assertEquals("2", model.uiState.value.teams.first().id)
    }

    @Test
    fun deleteA404IsTreatedAsSuccessIdempotentUx() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(listResult = listOf(summary("1")))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        service.error = OakError.Http(404, "not_found", "gone")
        model.delete(summary("1"))
        advanceUntilIdle()

        assertTrue(model.uiState.value.teams.isEmpty())
        assertNull(model.uiState.value.errorMessage)
    }

    @Test
    fun deleteFailureRestoresTheRowAndSurfacesAnError() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(listResult = listOf(summary("1")))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        service.error = OakError.Transport("boom")
        model.delete(summary("1"))
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.teams.size)
        assertNotNull(model.uiState.value.errorMessage)
    }

    @Test
    fun dismissErrorClearsTheBanner() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(error = OakError.Transport("boom"))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()
        assertNotNull(model.uiState.value.errorMessage)

        model.dismissError()
        assertNull(model.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Editor factories
    // -------------------------------------------------------------------

    @Test
    fun makeEditorForANewTeamStartsUnsavedWithNoNetworkCall() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService()
        val model = TeamsListViewModel(service)

        val editor = model.makeEditor()
        advanceUntilIdle()

        assertNull(editor.uiState.value.teamId)
        assertEquals(Format.Champions, editor.format)
        assertTrue(service.getCalls.isEmpty())
        assertTrue(service.createCalls.isEmpty())
    }
}
