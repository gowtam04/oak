package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamsListViewModel
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamSummary
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — Teams list is living Champions vs Archived other-format
 * (CF-TEAM-US-5, CF-UI-US-4). Create/import always Champions; no format picker.
 * Archived rows are view + delete only.
 *
 * Fails to compile until P8 adds:
 *
 *   TeamsListUiState.livingTeams / archivedTeams  (no formatFilter gen picker)
 *   TeamsListViewModel.createTeam(name?)          (no format argument)
 *   TeamsListViewModel.importPaste(paste)         (no format argument)
 *   TeamsListViewModel.makeEditor()               (new team is Champions)
 *   canEdit / canDuplicate / canApplySet / canUseInChat → false for archived
 *
 *   TeamService.list(archived: Boolean = false)
 *     GET /api/teams            living
 *     GET /api/teams?archived=1 archived
 *
 * Requirement refs: CF-TEAM-AC-1.1, CF-TEAM-AC-1.7, CF-TEAM-AC-5.1–5.5,
 * CF-UI-AC-1.1, CF-UI-AC-4.1–4.2, CF-DATA-BR-9, CF-DATA-BR-12, ADR-3.
 */
class TeamsArchiveTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun summary(
        id: String,
        format: Format,
        name: String = "Team $id",
    ) = TeamSummary(
        id = id,
        name = name,
        format = format,
        memberCount = 0,
        incomplete = true,
        species = emptyList(),
        updatedAt = 0L,
    )

    @Test
    fun reloadShowsLivingChampionsOnlyAndArchivesOtherFormats() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(
            listResult = listOf(
                summary("live-1", Format.Champions, "Reg rain"),
                summary("old-7", Format.Gen7, "USUM Rain"),
                summary("old-sv", Format.ScarletViolet, "SV Core"),
            ),
        )
        val model = TeamsListViewModel(service)

        model.reload()
        advanceUntilIdle()

        assertEquals(listOf("live-1"), model.uiState.value.livingTeams.map { it.id })
        assertTrue(model.uiState.value.livingTeams.all { it.format == Format.Champions })
        assertEquals(listOf("old-7", "old-sv"), model.uiState.value.archivedTeams.map { it.id })
        assertTrue(model.uiState.value.archivedTeams.all { it.format.isArchived })
        assertTrue(model.uiState.value.teams.none { it.format != Format.Champions })
        assertNull(model.uiState.value.errorMessage)
        val fieldNames = model.uiState.value::class.java.declaredFields.map { it.name }
        assertFalse("formatFilter" in fieldNames)
    }

    @Test
    fun emptyArchiveIsOmittedOrEmptyWithoutError() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(listResult = listOf(summary("live-1", Format.Champions)))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        assertTrue(model.uiState.value.archivedTeams.isEmpty())
        assertNull(model.uiState.value.errorMessage)
        assertEquals(1, model.uiState.value.livingTeams.size)
    }

    @Test
    fun archivedRowsAreViewAndDeleteOnly() = runTest(mainDispatcherRule.dispatcher) {
        val archived = summary("old-7", Format.Gen7)
        val living = summary("live-1", Format.Champions)
        val service = FakeTeamService(listResult = listOf(living, archived))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        assertTrue(model.canDelete(archived))
        assertFalse(model.canEdit(archived))
        assertFalse(model.canDuplicate(archived))
        assertFalse(model.canApplySet(archived))
        assertFalse(model.canUseInChat(archived))

        assertTrue(model.canEdit(living))
        assertTrue(model.canDuplicate(living))

        model.duplicate(archived)
        advanceUntilIdle()
        assertTrue(service.duplicateCalls.isEmpty())
    }

    @Test
    fun createTeamIsAlwaysChampionsWithNoFormatPicker() = runTest(mainDispatcherRule.dispatcher) {
        val created = fakeTeam(id = "new-1").copy(name = "Fresh", format = Format.Champions)
        val service = FakeTeamService(
            listResult = emptyList(),
            teamResult = created to emptyList(),
        )
        val model = TeamsListViewModel(service)

        var callback: Team? = null
        model.createTeam { callback = it }
        advanceUntilIdle()

        assertEquals("new-1", callback?.id)
        assertEquals(Format.Champions, callback?.format)
        assertEquals("new-1", model.uiState.value.livingTeams.first().id)
        assertTrue(service.createCalls.none { it.first != Format.Champions })
    }

    @Test
    fun importPasteDoesNotTakeAFormatAndLandsInLiving() = runTest(mainDispatcherRule.dispatcher) {
        val imported = fakeTeam(id = "import-1").copy(format = Format.Champions)
        val service = FakeTeamService(
            importPasteResult = Triple(imported, emptyList(), emptyList()),
        )
        val model = TeamsListViewModel(service)

        var result: Team? = null
        model.importPaste("Garchomp @ Life Orb") { team, _ -> result = team }
        advanceUntilIdle()

        assertEquals("import-1", result?.id)
        assertEquals(Format.Champions, result?.format)
        assertEquals("import-1", model.uiState.value.livingTeams.first().id)
    }

    @Test
    fun makeEditorForANewTeamIsChampionsAndUnsaved() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService()
        val model = TeamsListViewModel(service)

        val editor = model.makeEditor()
        advanceUntilIdle()

        assertNull(editor.uiState.value.teamId)
        assertEquals(Format.Champions, editor.format)
        assertFalse(editor.format.isArchived)
        assertTrue(service.getCalls.isEmpty())
        assertTrue(service.createCalls.isEmpty())
    }

    @Test
    fun deletingAnArchivedTeamRemovesItFromTheArchiveSection() = runTest(mainDispatcherRule.dispatcher) {
        val archived = summary("old-7", Format.Gen7)
        val service = FakeTeamService(listResult = listOf(summary("live-1", Format.Champions), archived))
        val model = TeamsListViewModel(service)
        model.reload()
        advanceUntilIdle()

        model.delete(archived)
        advanceUntilIdle()

        assertTrue(model.uiState.value.archivedTeams.none { it.id == "old-7" })
        assertEquals(listOf("old-7"), service.deleteCalls)
    }
}
