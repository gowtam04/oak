package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatTurnItem
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.features.chat.HydrateBanner
import ai.gowtam.oak.support.FakeCalcService
import ai.gowtam.oak.support.FakeChatService
import ai.gowtam.oak.support.FakeVoiceHydrateService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.PinnedArtifactSummary
import ai.gowtam.oak.wire.VoiceHydrateStatus
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Phase 8 Chat VM verbs (P8 owns overlay dispatch; parser already landed in P5).
 *
 * Fails to compile until P8 extends [ChatViewModel] / [ChatUiState]:
 *
 *   ChatUiState.calcOverlay: CalcOverlayState?
 *     CalcOverlayState(scenario: CalcScenario, rest: String = "")
 *   ChatUiState.canAddToTeam / canPin              — signed-in only (AUTH-BR-1)
 *   ChatUiState.hydrateBanner: HydrateBanner?      — Finishing | Failed
 *   ChatUiState.pinnedArtifacts
 *   ChatTurnItem.Assistant.isVoiceOrigin           — answer.origin == "voice"
 *   send() on SlashCommand.Calc → open overlay, clear composer, **no** POST
 *   dismissCalculator() / expandCalculator() / explainCalculator()
 *   retryHydrate()                                 — POST /api/voice/hydrate
 *   loadResumed(..., hydrate, pinnedArtifacts)
 *
 * Android has **no** new mic session. Voice stories here only **render** a
 * hydrated card, the origin glyph, and finishing / Retry.
 *
 * New constructor extras are optional with defaults so existing ChatViewModel
 * tests keep compiling:
 *   calc: CalcService? = null
 *   hydrate: VoiceHydrateService? = null
 *
 * Requirement refs: CALC-US-2, CALC-US-3, CALC-US-8, CALC-AC-2.1, CALC-AC-2.3,
 * CALC-AC-2.4, CALC-AC-3.1–3.3, CALC-AC-8.1–8.2, CALC-BR-1, CALC-BR-4,
 * ADD-AC-1.2, PIN-AC-1.4, AUTH-BR-1, VOICE-US-1–3, VOICE-AC-1.2, VOICE-AC-2.1,
 * VOICE-AC-3.1, VOICE-BR-3, VOICE-BR-4.
 */
class ChatViewModelAnswerCardsTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun answer(
        markdown: String = "Garchomp is a Dragon/Ground type.",
        origin: String? = null,
        reasoning: String = "Resolved Garchomp.",
        citations: List<Citation> = emptyList(),
    ) = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = markdown,
        reasoningMarkdown = reasoning,
        citations = citations,
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "champions", fallback = false),
        origin = origin,
    )

    private fun newModel(
        chat: FakeChatService = FakeChatService(),
        appState: AppState = AppState(),
        calc: FakeCalcService = FakeCalcService(),
        hydrate: FakeVoiceHydrateService = FakeVoiceHydrateService(),
    ) = ChatViewModel(chat = chat, appState = appState, calc = calc, hydrate = hydrate)

    // -------------------------------------------------------------------
    // CALC-US-3 / CALC-BR-4 — /calc opens overlay, never POSTs chat
    // -------------------------------------------------------------------

    @Test
    fun bareCalcOpensTheOverlayOnTheCurrentScopeAndDoesNotPost() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.selectScope(Format.Gen7)
        vm.setComposerText("/calc")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertTrue(chat.sendRequestCalls.isEmpty())
        assertEquals("", vm.uiState.value.composerText)
        val overlay = vm.uiState.value.calcOverlay
        assertNotNull(overlay)
        assertEquals("", overlay!!.rest)
        assertEquals(Format.Gen7, overlay.scenario.format)
        assertNull(overlay.scenario.attacker.species)
        assertFalse(vm.uiState.value.isStreaming)
    }

    @Test
    fun calcWithArgsOpensTheOverlayCarryingRestAndDoesNotPost() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/calc garchomp earthquake vs gholdengo")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        val overlay = vm.uiState.value.calcOverlay
        assertNotNull(overlay)
        assertEquals("garchomp earthquake vs gholdengo", overlay!!.rest)
    }

    @Test
    fun unresolvedCalcTokensStillOpenTheOverlayWithNoErrorToast() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/calc zzzzz not-a-mon vs qqqqq")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertNotNull(vm.uiState.value.calcOverlay)
        assertNull(vm.uiState.value.errorBanner)
    }

    @Test
    fun dismissingTheOverlayDoesNotPostAndDoesNotChangeTheThread() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/calc")
        vm.send()
        advanceUntilIdle()
        assertNotNull(vm.uiState.value.calcOverlay)

        vm.dismissCalculator()

        assertNull(vm.uiState.value.calcOverlay)
        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertTrue(vm.uiState.value.turns.isEmpty())
    }

    @Test
    fun expandCalculatorRequestsTheFirstClassSurfaceAndDismissesTheOverlay() = runTest(mainDispatcherRule.dispatcher) {
        val appState = AppState()
        val vm = newModel(appState = appState)
        vm.selectScope(Format.Champions)
        vm.setComposerText("/calc")
        vm.send()
        advanceUntilIdle()

        vm.expandCalculator()

        assertNull(vm.uiState.value.calcOverlay)
        val request = appState.surfaceRequest.value
        assertTrue(request is AppState.SurfaceRequest.Calculator)
        val calc = request as AppState.SurfaceRequest.Calculator
        assertEquals(Format.Champions, calc.scenario?.format)
    }

    @Test
    fun explainCalculatorSendsATurnAndLeavesTheOverlayOpen() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/calc")
        vm.send()
        advanceUntilIdle()
        val overlay = requireNotNull(vm.uiState.value.calcOverlay)

        vm.explainCalculator()
        advanceUntilIdle()

        assertEquals(overlay.scenario, vm.uiState.value.calcOverlay?.scenario)
        assertEquals(1, chat.sendWithImagesCalls.size)
        val sent = chat.sendWithImagesCalls.single().message
        assertTrue(sent.startsWith("Explain this damage estimate") || sent.contains("Explain this"))
    }

    // -------------------------------------------------------------------
    // AUTH-BR-1 / ADD-AC-1.2 / PIN-AC-1.4 — guest hide Add / Pin
    // -------------------------------------------------------------------

    @Test
    fun aGuestDoesNotSeeAddToTeamOrPin() {
        val vm = newModel()
        assertFalse(vm.uiState.value.isSignedIn)
        assertFalse(vm.uiState.value.canAddToTeam)
        assertFalse(vm.uiState.value.canPin)
    }

    @Test
    fun aSignedInUserSeesAddToTeamAndPin() {
        val appState = AppState()
        appState.completeSignIn("ash@pallet.town")
        val vm = newModel(appState = appState)
        assertTrue(vm.uiState.value.isSignedIn)
        assertTrue(vm.uiState.value.canAddToTeam)
        assertTrue(vm.uiState.value.canPin)
    }

    // -------------------------------------------------------------------
    // VOICE-US-1–3 — render origin + finishing / Retry (no mic session)
    // -------------------------------------------------------------------

    @Test
    fun aVoiceOriginAnswerIsMarkedOnTheTurn() {
        val vm = newModel()
        vm.loadResumed(
            conversationId = "conv-1",
            format = Format.NationalDex,
            turns = listOf(
                ChatTurn.User(id = "u1", content = "What's Garchomp's Speed?"),
                ChatTurn.Assistant(id = "a1", answer = answer(origin = "voice")),
            ),
        )
        val assistant = vm.uiState.value.turns[1] as ChatTurnItem.Assistant
        assertTrue(assistant.isVoiceOrigin)
        assertEquals("voice", assistant.answer.origin)
        assertEquals("Garchomp is a Dragon/Ground type.", assistant.answer.answerMarkdown)
    }

    @Test
    fun aRunningHydrateShowsFinishingOnTheVoiceTurn() {
        val vm = newModel()
        vm.loadResumed(
            conversationId = "conv-1",
            format = Format.NationalDex,
            turns = listOf(
                ChatTurn.User(id = "u1", content = "spoken question"),
                ChatTurn.Assistant(id = "a1", answer = answer(origin = "voice")),
            ),
            hydrate = VoiceHydrateStatus(assistantMessageId = "a1", status = VoiceHydrateStatus.Status.Running),
        )
        assertEquals(HydrateBanner.Finishing, vm.uiState.value.hydrateBanner)
        assertFalse(vm.uiState.value.showsHydrateRetry)
        assertTrue((vm.uiState.value.turns[1] as ChatTurnItem.Assistant).isVoiceOrigin)
    }

    @Test
    fun aFailedHydrateKeepsTheSpokenCardAndOffersRetry() {
        val vm = newModel()
        vm.loadResumed(
            conversationId = "conv-1",
            format = Format.NationalDex,
            turns = listOf(
                ChatTurn.User(id = "u1", content = "spoken question"),
                ChatTurn.Assistant(id = "a1", answer = answer(origin = "voice")),
            ),
            hydrate = VoiceHydrateStatus(assistantMessageId = "a1", status = VoiceHydrateStatus.Status.Failed),
        )
        assertEquals(HydrateBanner.Failed, vm.uiState.value.hydrateBanner)
        assertTrue(vm.uiState.value.showsHydrateRetry)
        val assistant = vm.uiState.value.turns[1] as ChatTurnItem.Assistant
        assertTrue(assistant.isVoiceOrigin)
        assertEquals("Garchomp is a Dragon/Ground type.", assistant.answer.answerMarkdown)
    }

    @Test
    fun retryHydratePostsTheVoiceHydrateEndpointForAFailedCard() = runTest(mainDispatcherRule.dispatcher) {
        val hydrate = FakeVoiceHydrateService()
        val chat = FakeChatService()
        val vm = newModel(chat = chat, hydrate = hydrate)
        vm.loadResumed(
            conversationId = "conv-1",
            format = Format.NationalDex,
            turns = listOf(
                ChatTurn.User(id = "u1", content = "spoken"),
                ChatTurn.Assistant(id = "a1", answer = answer(origin = "voice")),
            ),
            hydrate = VoiceHydrateStatus(assistantMessageId = "a1", status = VoiceHydrateStatus.Status.Failed),
        )

        vm.retryHydrate()
        advanceUntilIdle()

        assertEquals(listOf("conv-1" to "a1"), hydrate.retryCalls)
        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(HydrateBanner.Finishing, vm.uiState.value.hydrateBanner)
    }

    @Test
    fun retryHydrateIsANoOpWhenThereIsNoFailedHydrate() = runTest(mainDispatcherRule.dispatcher) {
        val hydrate = FakeVoiceHydrateService()
        val vm = newModel(hydrate = hydrate)
        vm.loadResumed(
            conversationId = "conv-1",
            format = Format.NationalDex,
            turns = listOf(ChatTurn.User(id = "u1", content = "hi")),
        )

        vm.retryHydrate()
        advanceUntilIdle()

        assertTrue(hydrate.retryCalls.isEmpty())
    }

    @Test
    fun loadResumedCarriesPinnedArtifactsOntoTheStrip() {
        val pins = listOf(
            PinnedArtifactSummary(id = "p1", kind = "comparison", title = "Garchomp vs Dragapult", createdAt = 1L),
        )
        val vm = newModel()
        vm.loadResumed(
            conversationId = "conv-1",
            format = Format.ScarletViolet,
            turns = emptyList(),
            pinnedArtifacts = pins,
        )
        assertEquals(pins, vm.uiState.value.pinnedArtifacts)
    }
}
