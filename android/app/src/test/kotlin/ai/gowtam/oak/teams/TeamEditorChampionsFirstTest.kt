package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamEditorViewModel
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamMember
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — living editor knobs match Champions (no Tera / IV /
 * level; Stat Points 66/32). Archived editors are read-only.
 *
 * JSON still carries tera_type / ivs / level (ADR-7); the UI ignores them.
 *
 * Requirement refs: CF-TEAM-AC-1.2–1.3, CF-TEAM-AC-5.2–5.4, CF-UI-AC-1.3, ADR-7.
 */
class TeamEditorChampionsFirstTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    @Test
    fun livingEditorHidesTeraIvLevelAndShowsStatPointBudget() {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)

        assertFalse(model.showsTeraField)
        assertFalse(model.showsIvKnobs)
        assertFalse(model.showsLevelKnob)
        assertTrue(model.showsStatPoints)
        assertEquals(66, TeamEditorViewModel.STAT_POINT_BUDGET)
        assertEquals(32, TeamEditorViewModel.STAT_POINT_PER_STAT_MAX)
        assertEquals(50, TeamEditorViewModel.LEVEL)
        assertEquals(50, model.uiState.value.members[0].level)
        assertTrue(model.uiState.value.members[0].teraType.isBlank())
        assertEquals(31, model.uiState.value.members[0].ivs.hp)
        assertEquals("not in the Champions roster", TeamEditorViewModel.OFF_ROSTER_LABEL)
    }

    @Test
    fun statPointTotalIsVisibleOnTheSlot() {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        model.updateMember(0) {
            it.copy(evs = StatSpread(hp = 2, atk = 32, def = 0, spa = 0, spd = 0, spe = 32))
        }
        val member = model.uiState.value.members[0]
        assertEquals(66, member.statPointTotal)
        assertEquals(member.evTotal, member.statPointTotal)
    }

    @Test
    fun anArchivedTeamOpensReadOnlyAndRejectsMutations() = runTest(mainDispatcherRule.dispatcher) {
        val archived = fakeTeam("old-7").copy(
            format = Format.Gen7,
            members = listOf(
                TeamMember(
                    species = "incineroar",
                    ability = "intimidate",
                    item = "figy-berry",
                    moves = listOf("flare-blitz"),
                    nature = "adamant",
                    evs = StatSpread(252, 252, 4, 0, 0, 0),
                    ivs = StatSpread(31, 31, 31, 31, 31, 31),
                    teraType = "grass",
                    level = 50,
                ),
            ),
        )
        val service = FakeTeamService()
        val model = TeamEditorViewModel(service, team = archived)

        assertTrue(model.format.isArchived)
        assertTrue(model.isReadOnly)
        assertFalse(model.showsTeraField)
        assertFalse(model.canDuplicate)

        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()
        assertEquals("incineroar", model.uiState.value.members[0].species)

        model.save()
        advanceUntilIdle()
        assertTrue(service.updateCalls.isEmpty())
        assertTrue(service.createCalls.isEmpty())
        assertEquals("incineroar", model.uiState.value.members[0].species)
        assertEquals("not in the Champions roster", TeamEditorViewModel.OFF_ROSTER_LABEL)
    }
}
