package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.AssistantStatus
import ai.gowtam.oak.features.teams.TeamEditorViewModel
import ai.gowtam.oak.features.teams.TeamsAssistantViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.TeamsAssistantService
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.FakeTeamsAssistantService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.BuilderAnswer
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.TeamPatch
import ai.gowtam.oak.wire.TeamPatchSlot
import ai.gowtam.oak.wire.TeamsAssistantDraft
import ai.gowtam.oak.wire.applyTeamPatch
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** A [TeamsAssistantService] whose stream emits a couple of in-progress events and then
 * suspends forever (until its collecting coroutine is cancelled) — for exercising
 * "still thinking" / mid-stream-dismiss states, which a fixed, eagerly-completing
 * scripted [FakeTeamsAssistantService] can't represent. */
private class NeverCompletingTeamsAssistantService : TeamsAssistantService {
    override fun send(sessionId: String, message: String, draft: TeamsAssistantDraft): Flow<BuilderSseEvent> = flow {
        emit(BuilderSseEvent.AnswerStart)
        emit(BuilderSseEvent.AnswerDelta("partial"))
        awaitCancellation()
    }
}

/**
 * Exercises [TeamsAssistantViewModel] against [FakeTeamsAssistantService] and a real
 * [TeamEditorViewModel] draft (implementation-plan.md P10 acceptance check 4; mirrors
 * iOS `TeamsAssistantViewModelTests`): the live draft rides every `send` (including
 * after manual edits between turns), the reducer folds tool-activity/delta/answer
 * events, apply/undo snapshot semantics (parity note: a further APPLY forecloses the
 * previous one's Undo; Undo always restores the exact pre-apply snapshot, so a manual
 * edit made after an Apply is discarded by a subsequent Undo even though it doesn't
 * itself revoke the Undo affordance — see the view model's doc for the parity
 * rationale), inline error + Retry, and mid-stream-dismiss status reset.
 */
class TeamsAssistantViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun editor(format: Format = Format.Champions) = TeamEditorViewModel(FakeTeamService(), format = format)

    private fun answerWithPatch(markdown: String = "Here's a fix.", slot: Int = 0, species: String = "garchomp"): BuilderAnswer {
        val patch = TeamPatch(
            name = null,
            slots = listOf(
                TeamPatchSlot(
                    slot = slot,
                    member = ai.gowtam.oak.wire.TeamMember(
                        species = species, ability = null, item = null, moves = emptyList(), nature = null,
                        evs = ai.gowtam.oak.wire.StatSpread(0, 0, 0, 0, 0, 0),
                        ivs = ai.gowtam.oak.wire.StatSpread(31, 31, 31, 31, 31, 31),
                        teraType = null, level = 50,
                    ),
                ),
            ),
        )
        return BuilderAnswer(answerMarkdown = markdown, teamPatch = patch)
    }

    // -------------------------------------------------------------------
    // send() carries the LIVE draft
    // -------------------------------------------------------------------

    @Test
    fun sendCarriesTheEditorsCurrentDraftIncludingFormatAndName() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor(Format.Gen5)
        editorVm.setName("My Squad")
        editorVm.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()

        val service = FakeTeamsAssistantService()
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("fill slot 2")
        advanceUntilIdle()

        val (_, message, draft) = service.sendCalls.single()
        assertEquals("fill slot 2", message)
        assertEquals("My Squad", draft.name)
        assertEquals(Format.Gen5, draft.format)
        assertEquals("garchomp", draft.members[0].species)
    }

    @Test
    fun aManualEditBetweenTurnsIsReflectedInTheNextSendsDraft() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor()
        val service = FakeTeamsAssistantService()
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("first turn")
        advanceUntilIdle()

        // A manual edit made in the editor AFTER the first assistant turn.
        editorVm.updateMember(0) { it.copy(species = "landorus-therian") }
        advanceUntilIdle()

        assistant.send("second turn")
        advanceUntilIdle()

        assertEquals(2, service.sendCalls.size)
        assertEquals("landorus-therian", service.sendCalls[1].third.members[0].species)
    }

    @Test
    fun sendIsANoOpWhileAlreadyThinkingOrWhenTheMessageIsBlank() = runTest(mainDispatcherRule.dispatcher) {
        val assistant = TeamsAssistantViewModel(NeverCompletingTeamsAssistantService(), editor())

        assistant.send("  ")
        advanceUntilIdle()
        assertTrue(assistant.uiState.value.turns.isEmpty())

        assistant.send("go")
        advanceUntilIdle()
        assertEquals(AssistantStatus.THINKING, assistant.uiState.value.status)

        assistant.send("another")
        advanceUntilIdle()
        // Still exactly one turn — the second call was a no-op while thinking.
        assertEquals(1, assistant.uiState.value.turns.size)
    }

    // -------------------------------------------------------------------
    // Reducer: tool activity / streamed markdown / terminal answer
    // -------------------------------------------------------------------

    @Test
    fun theReducerFoldsToolActivityAndStreamedMarkdownThenCommitsTheTerminalAnswer() = runTest(mainDispatcherRule.dispatcher) {
        val answer = BuilderAnswer(answerMarkdown = "All set.", teamPatch = null)
        val service = FakeTeamsAssistantService(
            scriptedEvents = listOf(
                BuilderSseEvent.ToolActivity(tool = "get_learnset", label = "Checking Garchomp's moves…"),
                BuilderSseEvent.AnswerStart,
                BuilderSseEvent.AnswerDelta("All "),
                BuilderSseEvent.AnswerDelta("set."),
                BuilderSseEvent.Answer(answer),
            ),
        )
        val assistant = TeamsAssistantViewModel(service, editor())

        assistant.send("check coverage")
        advanceUntilIdle()

        assertEquals(AssistantStatus.IDLE, assistant.uiState.value.status)
        assertEquals("", assistant.uiState.value.streamingMarkdown)
        assertEquals(1, assistant.uiState.value.turns.size)
        assertEquals(answer, assistant.uiState.value.turns.single().answer)
    }

    // -------------------------------------------------------------------
    // Apply / Undo
    // -------------------------------------------------------------------

    @Test
    fun applyRunsApplyTeamPatchOnTheDraftAndMarksTheTurnApplied() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor()
        val answer = answerWithPatch(species = "garchomp")
        val service = FakeTeamsAssistantService(scriptedEvents = listOf(BuilderSseEvent.Answer(answer)))
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("fill slot 1")
        advanceUntilIdle()
        val turn = assistant.uiState.value.turns.single()

        assistant.apply(turn)
        advanceUntilIdle()

        // Applied result matches applying the SAME pure function directly — the
        // client-applied result and the server-validated one can never diverge.
        val expected = applyTeamPatch(editor().draftWireMembers(), answer.teamPatch!!)
        assertEquals(expected.map { it.species }, editorVm.draftWireMembers().map { it.species })
        assertEquals("garchomp", editorVm.uiState.value.members[0].species)
        assertTrue(turn.id in assistant.uiState.value.appliedTurnIds)
        assertEquals(turn.id, assistant.uiState.value.lastAppliedTurnId)
    }

    @Test
    fun undoRestoresThePreApplySnapshotAndUnmarksTheTurn() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor()
        editorVm.setName("Before")
        val answer = answerWithPatch(species = "garchomp")
        val service = FakeTeamsAssistantService(scriptedEvents = listOf(BuilderSseEvent.Answer(answer)))
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("fill slot 1")
        advanceUntilIdle()
        val turn = assistant.uiState.value.turns.single()
        assistant.apply(turn)
        advanceUntilIdle()
        assertEquals("garchomp", editorVm.uiState.value.members[0].species)

        assistant.undo()
        advanceUntilIdle()

        assertEquals("Before", editorVm.uiState.value.name)
        assertEquals("", editorVm.uiState.value.members[0].species)
        assertFalse(turn.id in assistant.uiState.value.appliedTurnIds)
        assertNull(assistant.uiState.value.lastAppliedTurnId)
    }

    @Test
    fun aSecondApplyForecloseesUndoOfTheFirst() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor()
        editorVm.addMember() // two slots so the second patch targets a distinct one
        val firstAnswer = answerWithPatch(slot = 0, species = "garchomp")
        val secondAnswer = answerWithPatch(slot = 1, species = "landorus-therian")
        val service = FakeTeamsAssistantService(scriptedEvents = listOf(BuilderSseEvent.Answer(firstAnswer)))
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("first")
        advanceUntilIdle()
        val firstTurn = assistant.uiState.value.turns.single()
        assistant.apply(firstTurn)
        advanceUntilIdle()

        service.scriptedEvents = listOf(BuilderSseEvent.Answer(secondAnswer))
        assistant.send("second")
        advanceUntilIdle()
        val secondTurn = assistant.uiState.value.turns.last { it.id != firstTurn.id }
        assistant.apply(secondTurn)
        advanceUntilIdle()

        // Only the SECOND apply's turn is still undoable — the first is foreclosed.
        assertEquals(secondTurn.id, assistant.uiState.value.lastAppliedTurnId)
        assertTrue(firstTurn.id in assistant.uiState.value.appliedTurnIds)
        assertTrue(secondTurn.id in assistant.uiState.value.appliedTurnIds)

        // Undo now only reverts the SECOND apply's snapshot (taken after the first apply
        // already landed) — the first apply's edit survives, per the parity note.
        assistant.undo()
        advanceUntilIdle()
        assertEquals("garchomp", editorVm.uiState.value.members[0].species)
        assertEquals("", editorVm.uiState.value.members[1].species)
        assertNull(assistant.uiState.value.lastAppliedTurnId)
    }

    @Test
    fun undoAlwaysRestoresTheExactPreApplySnapshotDiscardingAnyManualEditMadeAfterApply() = runTest(mainDispatcherRule.dispatcher) {
        // Documents the parity nuance called out on the view model: a manual edit made
        // after an Apply doesn't itself revoke the Undo affordance, but Undo still wipes
        // it out because it restores the pre-apply draft wholesale (matches the shipped
        // web `TeamsAssistantPanel.tsx` / iOS behavior exactly).
        val editorVm = editor()
        editorVm.setName("Before")
        val answer = answerWithPatch(species = "garchomp")
        val service = FakeTeamsAssistantService(scriptedEvents = listOf(BuilderSseEvent.Answer(answer)))
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("fill slot 1")
        advanceUntilIdle()
        val turn = assistant.uiState.value.turns.single()
        assistant.apply(turn)
        advanceUntilIdle()

        // A manual edit after the apply — the Undo affordance is still offered (it is
        // not foreclosed by a manual edit, only by a further apply).
        editorVm.setName("Manually renamed")
        assertEquals(turn.id, assistant.uiState.value.lastAppliedTurnId)

        assistant.undo()
        advanceUntilIdle()

        // The manual rename is gone — Undo restored the wholesale pre-apply snapshot.
        assertEquals("Before", editorVm.uiState.value.name)
        assertEquals("", editorVm.uiState.value.members[0].species)
    }

    @Test
    fun undoIsANoOpWhenNothingHasBeenApplied() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor()
        editorVm.setName("Untouched")
        val assistant = TeamsAssistantViewModel(FakeTeamsAssistantService(), editorVm)

        assistant.undo()

        assertEquals("Untouched", editorVm.uiState.value.name)
        assertNull(assistant.uiState.value.lastAppliedTurnId)
    }

    @Test
    fun applyIsANoOpForATurnWithNoPatch() = runTest(mainDispatcherRule.dispatcher) {
        val editorVm = editor()
        val answer = BuilderAnswer(answerMarkdown = "Just advice, no changes.", teamPatch = null)
        val service = FakeTeamsAssistantService(scriptedEvents = listOf(BuilderSseEvent.Answer(answer)))
        val assistant = TeamsAssistantViewModel(service, editorVm)

        assistant.send("any suggestions?")
        advanceUntilIdle()
        val turn = assistant.uiState.value.turns.single()

        assistant.apply(turn)
        advanceUntilIdle()

        assertFalse(turn.id in assistant.uiState.value.appliedTurnIds)
        assertNull(assistant.uiState.value.lastAppliedTurnId)
    }

    // -------------------------------------------------------------------
    // Error + Retry
    // -------------------------------------------------------------------

    @Test
    fun aThrownTransportFaultDropsTheHalfFinishedTurnAndSurfacesAnErrorWithRetry() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamsAssistantService(error = OakError.Transport("boom"))
        val assistant = TeamsAssistantViewModel(service, editor())

        assistant.send("hello")
        advanceUntilIdle()

        assertTrue(assistant.uiState.value.turns.isEmpty())
        assertEquals(AssistantStatus.ERROR, assistant.uiState.value.status)
        assertNotNull(assistant.uiState.value.errorMessage)

        // Retry re-sends the same message cleanly.
        service.error = null
        service.scriptedEvents = listOf(BuilderSseEvent.Answer(BuilderAnswer(answerMarkdown = "Recovered.", teamPatch = null)))
        assistant.retry()
        advanceUntilIdle()

        assertEquals(1, assistant.uiState.value.turns.size)
        assertEquals("hello", assistant.uiState.value.turns.single().user)
        assertEquals(AssistantStatus.IDLE, assistant.uiState.value.status)
        assertNull(assistant.uiState.value.errorMessage)
    }

    @Test
    fun anInBandErrorEventWithNoTerminalAnswerAlsoDropsTheTurnAndSurfacesTheMessage() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamsAssistantService(
            scriptedEvents = listOf(BuilderSseEvent.Error(code = "model_unavailable", message = "Try again shortly.", status = null)),
        )
        val assistant = TeamsAssistantViewModel(service, editor())

        assistant.send("hello")
        advanceUntilIdle()

        assertTrue(assistant.uiState.value.turns.isEmpty())
        assertEquals("Try again shortly.", assistant.uiState.value.errorMessage)
        assertEquals(AssistantStatus.ERROR, assistant.uiState.value.status)
    }

    // -------------------------------------------------------------------
    // Mid-stream dismiss (cancel) resets status
    // -------------------------------------------------------------------

    @Test
    fun cancelMidStreamDropsTheHalfFinishedTurnAndResetsStatusToIdle() = runTest(mainDispatcherRule.dispatcher) {
        val assistant = TeamsAssistantViewModel(NeverCompletingTeamsAssistantService(), editor())

        assistant.send("hello")
        advanceUntilIdle()
        assertEquals(AssistantStatus.THINKING, assistant.uiState.value.status)
        assertEquals(1, assistant.uiState.value.turns.size)

        assistant.cancel()

        assertEquals(AssistantStatus.IDLE, assistant.uiState.value.status)
        assertTrue(assistant.uiState.value.turns.isEmpty())
        assertEquals("", assistant.uiState.value.streamingMarkdown)
        assertNull(assistant.uiState.value.activity)
    }

    @Test
    fun cancelWhenIdleIsANoOp() = runTest(mainDispatcherRule.dispatcher) {
        val assistant = TeamsAssistantViewModel(FakeTeamsAssistantService(), editor())
        assistant.cancel()
        assertEquals(AssistantStatus.IDLE, assistant.uiState.value.status)
    }
}
