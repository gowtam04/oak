package ai.gowtam.oak.features.teams

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamSummary
import ai.gowtam.oak.wire.blankTeamMember
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Phase 8 VM for the Add-to-team picker / replace sheet (ADD-US-1–4).
 *
 * Fails to compile until P8 adds:
 *
 *   features/teams/AddToTeamSheet.kt  — `AddToTeamViewModel`
 *     AddToTeamViewModel(teams, incoming, conversationFormat)
 *     phase: StateFlow<Phase>
 *       Loading | Picker(teams) | Replace(team) | Done(teamId, slotIndex) | Failed(message)
 *     load() / pickTeam(id) / createNew(name?) / replaceSlot(index) / cancelReplace() / dismiss()
 *
 * Guest hide lives on the caller (AUTH-BR-1 / ADD-AC-1.2) — this VM is signed-in
 * only. Writes go through existing [TeamService] + [placeSpeciesOnTeam].
 *
 * Requirement refs: ADD-US-1, ADD-US-2, ADD-US-3, ADD-US-4,
 * ADD-AC-1.1, ADD-AC-1.3, ADD-AC-2.1, ADD-AC-2.2, ADD-AC-2.3, ADD-AC-2.4,
 * ADD-AC-3.1, ADD-AC-3.2, ADD-AC-3.3, ADD-AC-4.1,
 * ADD-BR-1, ADD-BR-2, ADD-BR-3, ADD-BR-4, ADD-BR-5, ADD-BR-6, AUTH-BR-1.
 */
class AddToTeamSheetTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun incomingNamed() = blankTeamMember().copy(
        species = "garchomp",
        ability = "rough-skin",
        item = "life-orb",
        moves = listOf("earthquake", "dragon-claw"),
        nature = "jolly",
        evs = StatSpread(hp = 0, atk = 252, def = 0, spa = 0, spd = 4, spe = 252),
        teraType = "ground",
        level = 50,
    )

    private fun summary(
        id: String,
        name: String,
        memberCount: Int,
        format: Format = Format.Champions,
        species: List<String> = emptyList(),
    ) = TeamSummary(
        id = id,
        name = name,
        format = format,
        memberCount = memberCount,
        incomplete = memberCount < 6,
        species = species,
        updatedAt = 0L,
    )

    private fun teamWith(id: String, members: List<TeamMember>, format: Format = Format.Champions) = Team(
        id = id,
        name = "Sun Team",
        format = format,
        members = members,
        createdAt = 0L,
        updatedAt = 0L,
    )

    private fun sixMembers(): List<TeamMember> =
        (1..6).map { blankTeamMember().copy(species = "slot-$it") }

    // -------------------------------------------------------------------
    // ADD-US-2 / ADD-AC-2.1 / ADD-AC-2.3 — picker
    // -------------------------------------------------------------------

    @Test
    fun loadOpensThePickerWithTheCallersTeams() = runTest(mainDispatcherRule.dispatcher) {
        val teams = FakeTeamService(
            listResult = listOf(
                summary("t1", "Rain", memberCount = 2, species = listOf("pelipper", "barraskewda")),
                summary("t2", "Full Six", memberCount = 6, species = listOf("a", "b", "c", "d", "e", "f")),
            ),
        )
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()

        val picker = vm.phase.value as AddToTeamViewModel.Phase.Picker
        assertEquals(2, picker.teams.size)
        assertEquals("t1", picker.teams[0].id)
        assertEquals(2, picker.teams[0].memberCount)
        assertEquals(6, picker.teams[1].memberCount)
        assertEquals(listOf(null), teams.listCalls)
    }

    @Test
    fun zeroSavedTeamsStillOpensThePickerSoCreateNewIsAvailable() = runTest(mainDispatcherRule.dispatcher) {
        val teams = FakeTeamService(listResult = emptyList())
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.Gen5)
        vm.load()
        advanceUntilIdle()

        val picker = vm.phase.value as AddToTeamViewModel.Phase.Picker
        assertTrue(picker.teams.isEmpty())
    }

    @Test
    fun dismissWithoutChoosingWritesNothing() = runTest(mainDispatcherRule.dispatcher) {
        val teams = FakeTeamService(listResult = listOf(summary("t1", "Rain", 2)))
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()

        vm.dismiss()

        assertTrue(teams.updateCalls.isEmpty())
        assertTrue(teams.createCalls.isEmpty())
    }

    // -------------------------------------------------------------------
    // ADD-US-1 / ADD-BR-1 — first empty slot
    // -------------------------------------------------------------------

    @Test
    fun pickingATeamWithAnEmptySlotWritesTheFirstEmptyAndNavigates() = runTest(mainDispatcherRule.dispatcher) {
        val members = listOf(blankTeamMember().copy(species = "great-tusk"), blankTeamMember())
        val saved = teamWith("t1", members)
        val teams = FakeTeamService(
            listResult = listOf(summary("t1", "Rain", 1, species = listOf("great-tusk"))),
            teamResult = saved to emptyList(),
        )
        val incoming = incomingNamed()
        val vm = AddToTeamViewModel(teams, incoming, Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()

        vm.pickTeam("t1")
        advanceUntilIdle()

        val done = vm.phase.value as AddToTeamViewModel.Phase.Done
        assertEquals("t1", done.teamId)
        assertEquals(1, done.slotIndex)
        assertEquals(1, teams.getCalls.size)
        assertEquals(1, teams.updateCalls.size)
        val written = teams.updateCalls.single()
        assertEquals("t1", written.first)
        assertEquals(incoming, written.third!![1])
        assertEquals("great-tusk", written.third!![0].species)
    }

    @Test
    fun namedSetFieldsAreCopiedAndUnnamedStayBlank() = runTest(mainDispatcherRule.dispatcher) {
        val teams = FakeTeamService(
            listResult = listOf(summary("t1", "Rain", 0)),
            teamResult = teamWith("t1", emptyList()) to emptyList(),
        )
        val incoming = incomingNamed()
        val vm = AddToTeamViewModel(teams, incoming, Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()
        vm.pickTeam("t1")
        advanceUntilIdle()

        val written = teams.updateCalls.single().third!!.single { it.species == "garchomp" }
        assertEquals("rough-skin", written.ability)
        assertEquals("life-orb", written.item)
        assertEquals(listOf("earthquake", "dragon-claw"), written.moves)
        assertEquals("jolly", written.nature)
        assertEquals("ground", written.teraType)
        assertEquals(50, written.level)
    }

    // -------------------------------------------------------------------
    // ADD-US-3 / ADD-BR-6 — full team offers replace, never auto-overwrite
    // -------------------------------------------------------------------

    @Test
    fun aFullTeamOpensTheReplaceSheetAndDoesNotWriteYet() = runTest(mainDispatcherRule.dispatcher) {
        val full = teamWith("t-full", sixMembers())
        val teams = FakeTeamService(
            listResult = listOf(summary("t-full", "Full Six", 6)),
            teamResult = full to emptyList(),
        )
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.Champions)
        vm.load()
        advanceUntilIdle()

        vm.pickTeam("t-full")
        advanceUntilIdle()

        val replace = vm.phase.value as AddToTeamViewModel.Phase.Replace
        assertEquals("t-full", replace.team.id)
        assertEquals(6, replace.team.members.size)
        assertTrue(teams.updateCalls.isEmpty())
    }

    @Test
    fun confirmingAReplaceOverwritesThatSlotAndNavigates() = runTest(mainDispatcherRule.dispatcher) {
        val full = teamWith("t-full", sixMembers())
        val teams = FakeTeamService(
            listResult = listOf(summary("t-full", "Full Six", 6)),
            teamResult = full to emptyList(),
        )
        val incoming = incomingNamed()
        val vm = AddToTeamViewModel(teams, incoming, Format.Champions)
        vm.load()
        advanceUntilIdle()
        vm.pickTeam("t-full")
        advanceUntilIdle()

        vm.replaceSlot(2)
        advanceUntilIdle()

        val done = vm.phase.value as AddToTeamViewModel.Phase.Done
        assertEquals("t-full", done.teamId)
        assertEquals(2, done.slotIndex)
        val written = teams.updateCalls.single().third!!
        assertEquals(incoming, written[2])
        assertEquals("slot-1", written[0].species)
    }

    @Test
    fun cancelingReplaceLeavesTheTeamUnchanged() = runTest(mainDispatcherRule.dispatcher) {
        val full = teamWith("t-full", sixMembers())
        val teams = FakeTeamService(
            listResult = listOf(summary("t-full", "Full Six", 6)),
            teamResult = full to emptyList(),
        )
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.Champions)
        vm.load()
        advanceUntilIdle()
        vm.pickTeam("t-full")
        advanceUntilIdle()

        vm.cancelReplace()
        advanceUntilIdle()

        assertTrue(vm.phase.value is AddToTeamViewModel.Phase.Picker)
        assertTrue(teams.updateCalls.isEmpty())
        assertTrue(teams.createCalls.isEmpty())
    }

    // -------------------------------------------------------------------
    // ADD-US-2 / ADD-BR-4 — create new uses conversation scope
    // -------------------------------------------------------------------

    @Test
    fun createNewWritesSlot1OnATeamInTheConversationFormat() = runTest(mainDispatcherRule.dispatcher) {
        val created = fakeTeam("new-1").copy(format = Format.Gen5, members = listOf(incomingNamed()))
        val teams = FakeTeamService(
            listResult = emptyList(),
            teamResult = created to emptyList(),
        )
        val incoming = incomingNamed()
        val vm = AddToTeamViewModel(teams, incoming, Format.Gen5)
        vm.load()
        advanceUntilIdle()

        vm.createNew(name = null)
        advanceUntilIdle()

        val done = vm.phase.value as AddToTeamViewModel.Phase.Done
        assertEquals("new-1", done.teamId)
        assertEquals(0, done.slotIndex)
        val createdCall = teams.createCalls.single()
        assertEquals(Format.Gen5, createdCall.first)
        assertEquals(incoming, createdCall.third!!.first())
    }

    // -------------------------------------------------------------------
    // ADD-US-4 / ADD-BR-3 — format mismatch warns, does not block
    // -------------------------------------------------------------------

    @Test
    fun aFormatMismatchStillWrites() = runTest(mainDispatcherRule.dispatcher) {
        val gen5 = teamWith("g5", emptyList(), format = Format.Gen5)
        val teams = FakeTeamService(
            listResult = listOf(summary("g5", "BW", 0, format = Format.Gen5)),
            teamResult = gen5 to emptyList(),
        )
        val miraidon = blankTeamMember().copy(species = "miraidon")
        val vm = AddToTeamViewModel(teams, miraidon, Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()

        vm.pickTeam("g5")
        advanceUntilIdle()

        val done = vm.phase.value as AddToTeamViewModel.Phase.Done
        assertEquals("g5", done.teamId)
        assertEquals("miraidon", teams.updateCalls.single().third!!.first().species)
    }

    // -------------------------------------------------------------------
    // Edge: write / gone
    // -------------------------------------------------------------------

    @Test
    fun aWriteFailureStaysOnThePickerWithAnHonestMessage() = runTest(mainDispatcherRule.dispatcher) {
        val teams = FakeTeamService(
            listResult = listOf(summary("t1", "Rain", 0)),
            teamResult = teamWith("t1", emptyList()) to emptyList(),
        )
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()
        // list already ran; fail the subsequent get/update
        teams.error = OakError.Http(500, "unknown", "boom")

        vm.pickTeam("t1")
        advanceUntilIdle()

        val failed = vm.phase.value as AddToTeamViewModel.Phase.Failed
        assertTrue(failed.message.isNotBlank())
        assertTrue(vm.phase.value !is AddToTeamViewModel.Phase.Done)
    }

    @Test
    fun aDeletedTeamIsAnHonestGoneStateAndDoesNotWrite() = runTest(mainDispatcherRule.dispatcher) {
        val teams = FakeTeamService(listResult = listOf(summary("gone", "Old", 1)))
        val vm = AddToTeamViewModel(teams, incomingNamed(), Format.ScarletViolet)
        vm.load()
        advanceUntilIdle()
        teams.error = OakError.Http(404, "not_found", "Team is gone")

        vm.pickTeam("gone")
        advanceUntilIdle()

        val failed = vm.phase.value as AddToTeamViewModel.Phase.Failed
        assertTrue(failed.message.contains("gone", ignoreCase = true) || failed.message.contains("couldn't", ignoreCase = true))
        assertTrue(teams.updateCalls.isEmpty())
    }
}
