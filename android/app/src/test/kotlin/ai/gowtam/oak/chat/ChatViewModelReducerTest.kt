package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.app.GuestTurn
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.features.chat.ErrorBanner
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.support.FakeChatService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SseEvent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [ChatViewModel]'s SSE reducer (implementation-plan.md P6 acceptance
 * checks 1–2; mirrors iOS `ChatViewModelTests`' reducer section): `tool_activity`
 * appends, `answer_start` resets the buffer but keeps tool history, `answer_delta`
 * appends, the terminal `answer` commits and stops, a non-`answered` status renders
 * as a normal answer (never an error), an `error` event becomes a recoverable banner,
 * and `scope` adoption clears a pending seed. Most cases drive [ChatViewModel.apply]
 * directly (it is synchronous — no coroutine involved); the full-loop cases go
 * through [ChatViewModel.send] against [FakeChatService] and need the
 * [MainDispatcherRule] because `send` launches on `viewModelScope`.
 */
class ChatViewModelReducerTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun answer(
        markdown: String = "Garchomp is a Dragon/Ground pseudo-legendary.",
        status: OakAnswer.Status = OakAnswer.Status.Answered,
        generation: String = "champions",
    ) = OakAnswer(
        status = status,
        answerMarkdown = markdown,
        reasoningMarkdown = "Resolved Garchomp and read its base stats.",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = generation, fallback = false),
    )

    private fun newModel(chat: FakeChatService = FakeChatService()) =
        ChatViewModel(chat = chat, appState = AppState())

    // -------------------------------------------------------------------
    // Direct apply() transitions (acceptance check 1)
    // -------------------------------------------------------------------

    @Test
    fun toolActivityAppendsToTheListInOrder() {
        val vm = newModel()
        vm.apply(SseEvent.ToolActivity("resolve_entity", "Resolving \"Garchomp\""))
        vm.apply(SseEvent.ToolActivity("get_pokemon", "Reading Garchomp"))

        val activities = vm.uiState.value.toolActivities
        assertEquals(2, activities.size)
        assertEquals("resolve_entity", activities[0].tool)
        assertEquals("get_pokemon", activities[1].tool)
    }

    @Test
    fun answerStartClearsTheStreamedBufferButKeepsToolActivityHistory() {
        val vm = newModel()
        vm.apply(SseEvent.ToolActivity("resolve_entity", "Resolving \"Garchomp\""))
        vm.apply(SseEvent.AnswerDelta("partial answer that should be discarded"))

        vm.apply(SseEvent.AnswerStart)

        assertEquals("", vm.uiState.value.streamingText)
        assertEquals(1, vm.uiState.value.toolActivities.size)
    }

    @Test
    fun answerDeltaAppendsOntoTheStreamedBuffer() {
        val vm = newModel()
        vm.apply(SseEvent.AnswerStart)
        vm.apply(SseEvent.AnswerDelta("Garchomp is "))
        vm.apply(SseEvent.AnswerDelta("a Dragon/Ground type."))

        assertEquals("Garchomp is a Dragon/Ground type.", vm.uiState.value.streamingText)
    }

    @Test
    fun terminalAnswerCommitsTheAuthoritativeAnswerAndStopsTheTurn() {
        val vm = newModel()
        vm.apply(SseEvent.AnswerStart)
        vm.apply(SseEvent.AnswerDelta("draft text"))

        val final = answer(markdown = "The authoritative answer.")
        vm.apply(SseEvent.Answer(final))

        val state = vm.uiState.value
        assertEquals(1, state.turns.size)
        val committed = state.turns.single() as ChatTurnItemAssistant
        assertEquals(final, committed.answer)
        assertEquals("", state.streamingText)
        assertTrue(state.toolActivities.isEmpty())
        assertFalse(state.isStreaming)
    }

    @Test
    fun aNonAnsweredStatusRendersAsANormalAnswerNeverAnError() {
        val vm = newModel()
        val clarification = answer(status = OakAnswer.Status.ClarificationNeeded)

        vm.apply(SseEvent.Answer(clarification))

        val state = vm.uiState.value
        assertEquals(1, state.turns.size)
        assertNull(state.errorBanner)
    }

    @Test
    fun anErrorEventBecomesARecoverableBannerAndClearsAnyPartialAnswer() {
        val vm = newModel()
        vm.apply(SseEvent.AnswerStart)
        vm.apply(SseEvent.AnswerDelta("half-written"))

        vm.apply(SseEvent.Error(code = "model_unavailable", message = "ignored", status = 503))

        val state = vm.uiState.value
        assertEquals(ChatViewModel.bannerMessage("model_unavailable", "ignored"), state.errorBanner?.message)
        assertTrue(state.errorBanner!!.isRetryable)
        assertEquals("", state.streamingText)
        assertFalse(state.isStreaming)
        // The turn stays absent — an in-band error never leaves a half-rendered answer.
        assertTrue(state.turns.isEmpty())
    }

    @Test
    fun scopeAdoptionSetsResolvedScopeAndClearsAPendingSeed() {
        val vm = newModel()
        vm.selectScope(Format.Gen7)
        assertEquals(Format.Gen7, vm.uiState.value.displayFormat)

        vm.apply(SseEvent.Scope(Format.ScarletViolet, ScopeSource.Message))

        val state = vm.uiState.value
        assertEquals(Format.ScarletViolet, state.resolvedScope)
        assertNull(state.scopeSeed)
        // scope_seed is retired — the resolved scope now drives the displayed chip.
        assertEquals(Format.ScarletViolet, state.displayFormat)
    }

    @Test
    fun displayFormatFallsBackToNationalDexWithNoSeedOrResolvedScope() {
        val vm = newModel()
        assertEquals(Format.NationalDex, vm.uiState.value.displayFormat)
    }

    // -------------------------------------------------------------------
    // Full-loop cases via send() (acceptance checks 1–2)
    // -------------------------------------------------------------------

    @Test
    fun theSingleDeltaGrokStreamRendersFullyThroughSend() = runTest(mainDispatcherRule.dispatcher) {
        val finalAnswer = answer(markdown = "Garchomp's best set runs Choice Scarf.")
        val chat = FakeChatService(
            scriptedEvents = listOf(
                SseEvent.Scope(Format.Champions, ScopeSource.Default),
                SseEvent.ToolActivity("resolve_entity", "Resolving \"Garchomp\""),
                SseEvent.AnswerStart,
                // Grok delivers the whole answer in ONE delta — the reducer must not
                // assume many chunks arrive.
                SseEvent.AnswerDelta(finalAnswer.answerMarkdown),
                SseEvent.Answer(finalAnswer),
            ),
        )
        val vm = newModel(chat)
        vm.setComposerText("What's Garchomp's best moveset?")

        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(2, state.turns.size) // the user turn + the committed answer
        assertFalse(state.isStreaming)
        assertEquals(Format.Champions, state.resolvedScope)
        assertEquals("", state.composerText)
        assertEquals(1, chat.sendWithImagesCalls.size)
    }

    @Test
    fun scopeSeedRidesTheNextChatRequest() = runTest(mainDispatcherRule.dispatcher) {
        val finalAnswer = answer()
        val chat = FakeChatService(
            // No Scope event scripted — the seed must ride through untouched.
            scriptedEvents = listOf(
                SseEvent.AnswerStart,
                SseEvent.AnswerDelta(finalAnswer.answerMarkdown),
                SseEvent.Answer(finalAnswer),
            ),
        )
        val vm = newModel(chat)
        vm.selectScope(Format.Gen7)
        vm.setComposerText("What's strong against Garchomp in Gen 7?")

        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        assertEquals(Format.Gen7, chat.sendWithImagesCalls.last().scopeSeed)
    }

    @Test
    fun scopeSeedIsClearedAfterScopeEventSoTheNextTurnSendsNull() = runTest(mainDispatcherRule.dispatcher) {
        val finalAnswer = answer()
        val chat = FakeChatService(
            scriptedEvents = listOf(
                SseEvent.Scope(Format.Gen7, ScopeSource.Message),
                SseEvent.AnswerStart,
                SseEvent.AnswerDelta(finalAnswer.answerMarkdown),
                SseEvent.Answer(finalAnswer),
            ),
        )
        val vm = newModel(chat)
        vm.selectScope(Format.Gen7)
        vm.setComposerText("first turn")

        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        // Sanity: the first turn did carry the seed, and the scope event adopted it.
        assertEquals(Format.Gen7, chat.sendWithImagesCalls.first().scopeSeed)
        assertEquals(Format.Gen7, vm.uiState.value.resolvedScope)
        assertNull(vm.uiState.value.scopeSeed)

        vm.setComposerText("second turn")
        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        assertNull(chat.sendWithImagesCalls.last().scopeSeed)
    }

    @Test
    fun aCompletedTurnMirrorsIntoTheGuestThreadWithItsResolvedScope() = runTest(mainDispatcherRule.dispatcher) {
        val finalAnswer = answer()
        val chat = FakeChatService(
            scriptedEvents = listOf(
                SseEvent.Scope(Format.Gen5, ScopeSource.Conversation),
                SseEvent.AnswerStart,
                SseEvent.AnswerDelta(finalAnswer.answerMarkdown),
                SseEvent.Answer(finalAnswer),
            ),
        )
        val appState = AppState()
        val vm = ChatViewModel(chat = chat, appState = appState)
        vm.setComposerText("hello")

        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        assertEquals(AuthState.Guest, appState.authState.value)
        assertEquals(2, appState.guestThread.value.size)
        assertTrue(appState.guestThread.value[0].content is GuestTurn.Content.User)
        assertTrue(appState.guestThread.value[1].content is GuestTurn.Content.Assistant)
        assertEquals(Format.Gen5, appState.guestThreadScope.value)
    }

    // -------------------------------------------------------------------
    // CALC-US-3 / CALC-BR-4 — /calc is not a chat turn (P8 overlay dispatch)
    // Compiles today (parser already classifies Calc) and fails until send()
    // stops falling through to POST. Overlay fields live in ChatViewModelAnswerCardsTest.
    // -------------------------------------------------------------------

    @Test
    fun slashCalcDoesNotPostAChatTurn() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/calc")

        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertTrue(chat.sendRequestCalls.isEmpty())
        assertEquals("", vm.uiState.value.composerText)
        assertTrue(vm.uiState.value.turns.isEmpty())
        assertFalse(vm.uiState.value.isStreaming)
    }

    @Test
    fun slashCalcWithArgsStillDoesNotPostAChatTurn() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/calc garchomp earthquake vs gholdengo")

        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertTrue(vm.uiState.value.turns.isEmpty())
    }

    // -------------------------------------------------------------------
    // Spend-control banners (SC-AC-5.4 / SC-AC-6.5 / SC-BR-14)
    // Pre-stream HTTP refusals: 403 account_denied, 429 daily_limit (Http,
    // not RateLimited), 429 rate_limited (RateLimited). Denied/cap hide
    // Retry and must not append the guest per-minute sign-in hint.
    // -------------------------------------------------------------------

    @Test
    fun accountDeniedBannerShowsServerMessageAndIsNotRetryable() =
        runTest(mainDispatcherRule.dispatcher) {
            val banner = bannerAfterSend(
                error = OakError.Http(403, "account_denied", ACCOUNT_DENIED_MESSAGE),
                signedIn = true,
            )
            assertEquals(ACCOUNT_DENIED_MESSAGE, banner.message)
            assertFalse("account_denied must hide Retry", banner.isRetryable)
            assertFalse(banner.message.contains(GUEST_SIGN_IN_HINT))
        }

    @Test
    fun dailyLimitBannerShowsServerMessageIsNotRetryableAndOmitsGuestSignInHint() =
        runTest(mainDispatcherRule.dispatcher) {
            // Guests hit the IP daily cap; the per-minute guest hint must not
            // ride this banner (signing in does not bypass a denylist, and
            // the daily-cap copy is already distinct).
            val banner = bannerAfterSend(
                error = OakError.Http(429, "daily_limit", DAILY_LIMIT_MESSAGE),
            )
            assertEquals(DAILY_LIMIT_MESSAGE, banner.message)
            assertFalse("daily_limit must hide Retry", banner.isRetryable)
            assertFalse(banner.message.contains(GUEST_SIGN_IN_HINT))
        }

    @Test
    fun rateLimitedGuestBannerIsRetryableAndAddsSignInHint() =
        runTest(mainDispatcherRule.dispatcher) {
            val banner = bannerAfterSend(error = OakError.RateLimited(retryAfterSeconds = 30))
            val expected = ChatViewModel.rateLimitMessage(30) + GUEST_SIGN_IN_HINT
            assertEquals(expected, banner.message)
            assertTrue(banner.isRetryable)
        }

    @Test
    fun spendControlBannersAreThreeDistinctReasons() = runTest(mainDispatcherRule.dispatcher) {
        val denied = bannerAfterSend(
            error = OakError.Http(403, "account_denied", ACCOUNT_DENIED_MESSAGE),
            signedIn = true,
        )
        val cap = bannerAfterSend(
            error = OakError.Http(429, "daily_limit", DAILY_LIMIT_MESSAGE),
        )
        val perMinute = bannerAfterSend(error = OakError.RateLimited(retryAfterSeconds = null))

        assertNotEquals(denied.message, cap.message)
        assertNotEquals(denied.message, perMinute.message)
        assertNotEquals(cap.message, perMinute.message)
        assertFalse("account_denied must hide Retry", denied.isRetryable)
        assertFalse("daily_limit must hide Retry", cap.isRetryable)
        assertTrue(perMinute.isRetryable)
    }

    private fun bannerAfterSend(error: OakError, signedIn: Boolean = false): ErrorBanner {
        val appState = AppState()
        if (signedIn) appState.completeSignIn("ash@pallet.town")
        val vm = ChatViewModel(chat = FakeChatService(error = error), appState = appState)
        vm.setComposerText("hello")
        vm.send()
        mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()
        val state = vm.uiState.value
        assertFalse(state.isStreaming)
        return checkNotNull(state.errorBanner)
    }

    private companion object {
        const val ACCOUNT_DENIED_MESSAGE = "This account can't use chat."
        const val DAILY_LIMIT_MESSAGE =
            "Daily limit reached. Try again tomorrow (resets at 2026-09-07T00:00:00.000Z UTC)."
        const val GUEST_SIGN_IN_HINT = " Sign in to raise the limit."
    }
}

/** Local alias so the test reads naturally without importing the sealed type's cases individually. */
private typealias ChatTurnItemAssistant = ai.gowtam.oak.features.chat.ChatTurnItem.Assistant
