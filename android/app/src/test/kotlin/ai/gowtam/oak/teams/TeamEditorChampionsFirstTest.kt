package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamEditorViewModel
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.SetTemplateResult
import ai.gowtam.oak.wire.TeamMember
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — living editor knobs match Champions (no Tera / IV /
 * level; Stat Points 66/32) and apply-set confirms before replacing a filled
 * slot (CF-TEAM-AC-1.2, CF-TEAM-AC-6.3, CF-UI-US-5). Archived editors are
 * read-only.
 *
 * Fails to compile until P8 adds:
 *
 *   TeamEditorViewModel
 *     showsTeraField / showsIvKnobs / showsLevelKnob / showsStatPoints
 *     STAT_POINT_BUDGET = 66, STAT_POINT_PER_STAT_MAX = 32, LEVEL = 50
 *     OFF_ROSTER_LABEL = "not in the Champions roster"
 *     isReadOnly  (true when format.isArchived)
 *     applyUsageSet(slotIndex, incoming)
 *     confirmApplySet() / cancelApplySet()
 *   TeamEditorUiState.pendingApplyConfirm
 *
 * JSON still carries tera_type / ivs / level (ADR-7); the UI ignores them.
 *
 * Requirement refs: CF-TEAM-AC-1.2–1.3, CF-TEAM-AC-5.2–5.4, CF-TEAM-AC-6.1–6.3,
 * CF-UI-AC-1.3, CF-UI-AC-5.1–5.3, CF-AS-3, ADR-7.
 */
class TeamEditorChampionsFirstTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun usageMember() = TeamMember(
        species = "garchomp",
        ability = "rough-skin",
        item = "life-orb",
        moves = listOf("earthquake", "dragon-claw", "stealth-rock", "swords-dance"),
        nature = "jolly",
        evs = StatSpread(hp = 0, atk = 32, def = 0, spa = 0, spd = 2, spe = 32),
        ivs = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
        teraType = null,
        level = 50,
    )

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
    fun applyChampionsSetFetchesTheTemplateAndFillsAnEmptySlot() = runTest(mainDispatcherRule.dispatcher) {
        val incoming = usageMember()
        val service = FakeTeamService()
        service.setTemplateResult = SetTemplateResult(found = true, member = incoming)
        val model = TeamEditorViewModel(service, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()

        model.applyChampionsSet(0)
        advanceUntilIdle()

        assertEquals(listOf("garchomp"), service.setTemplateCalls)
        assertNotNull(model.uiState.value.pendingApplyConfirm)
        model.confirmApplySet()
        advanceUntilIdle()
        assertNull(model.uiState.value.pendingApplyConfirm)
        assertEquals("life-orb", model.uiState.value.members[0].item)
        assertTrue(model.uiState.value.members[0].teraType.isBlank())
    }

    @Test
    fun applyUsageSetOnAnEmptySlotFillsWithoutConfirm() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        val incoming = usageMember()

        model.applyUsageSet(slotIndex = 0, incoming = incoming)
        advanceUntilIdle()

        assertNull(model.uiState.value.pendingApplyConfirm)
        assertEquals("garchomp", model.uiState.value.members[0].species)
        assertEquals("rough-skin", model.uiState.value.members[0].ability)
        assertEquals("life-orb", model.uiState.value.members[0].item)
        assertEquals("jolly", model.uiState.value.members[0].nature)
        assertEquals(50, model.uiState.value.members[0].level)
        assertTrue(model.uiState.value.members[0].teraType.isBlank())
        assertEquals(32, model.uiState.value.members[0].evs.atk)
    }

    @Test
    fun applyUsageSetOnAFilledSlotAsksYesNoConfirmAndCancelLeavesTheSlot() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        model.updateMember(0) { it.copy(species = "pelipper") }
        advanceUntilIdle()

        model.applyUsageSet(slotIndex = 0, incoming = usageMember())
        advanceUntilIdle()

        assertNotNull(model.uiState.value.pendingApplyConfirm)
        assertEquals(0, model.uiState.value.pendingApplyConfirm?.slotIndex)
        assertEquals("pelipper", model.uiState.value.members[0].species)

        model.cancelApplySet()
        advanceUntilIdle()

        assertNull(model.uiState.value.pendingApplyConfirm)
        assertEquals("pelipper", model.uiState.value.members[0].species)
    }

    @Test
    fun confirmApplySetReplacesTheFilledSlotWithoutTera() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        model.updateMember(0) { it.copy(species = "pelipper", teraType = "water") }
        advanceUntilIdle()

        model.applyUsageSet(slotIndex = 0, incoming = usageMember())
        model.confirmApplySet()
        advanceUntilIdle()

        assertNull(model.uiState.value.pendingApplyConfirm)
        val slot = model.uiState.value.members[0]
        assertEquals("garchomp", slot.species)
        assertEquals("life-orb", slot.item)
        assertTrue(slot.teraType.isBlank())
        assertEquals(50, slot.level)
        assertEquals(listOf("earthquake", "dragon-claw", "stealth-rock", "swords-dance"), slot.moves.filter { it.isNotBlank() })
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
        assertFalse(model.canApplySet)

        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()
        assertEquals("incineroar", model.uiState.value.members[0].species)

        model.save()
        advanceUntilIdle()
        assertTrue(service.updateCalls.isEmpty())
        assertTrue(service.createCalls.isEmpty())

        model.applyUsageSet(0, usageMember())
        advanceUntilIdle()
        assertNull(model.uiState.value.pendingApplyConfirm)
        assertEquals("incineroar", model.uiState.value.members[0].species)
        assertEquals("not in the Champions roster", TeamEditorViewModel.OFF_ROSTER_LABEL)
    }
}
