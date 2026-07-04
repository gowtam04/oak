package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.ChatService
import ai.gowtam.oak.services.SourceImage
import ai.gowtam.oak.support.FakeChatService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.SseEvent
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [ChatViewModel]'s stream-resilience state machine (DADR-13;
 * implementation-plan.md P6 acceptance checks 3–4; mirrors iOS
 * `ChatViewModelTests`' resilience section): quick-stop vs. late-stop, the
 * screen-off auto-reconnect (armed by [ChatViewModel.onEnterBackground], fired by
 * [ChatViewModel.onEnterForeground]), an in-band `error` event never auto-retrying,
 * and [ChatViewModel.keepScreenOn] being released on every terminal/stop/cancel path.
 *
 * All cases use [MainDispatcherRule]'s [kotlinx.coroutines.test.StandardTestDispatcher]
 * (not an unconfined one) so a `viewModelScope.launch`ed stream consumer is only
 * SCHEDULED at `send()`/`fireRetry()` and only actually runs at an explicit
 * `advanceUntilIdle()` — the same launch-then-continue ordering the state machine
 * relies on in production (e.g. `fireRetry()`'s `reconnecting = true` line running
 * before the retried stream has had a chance to clear it again).
 */
class ChatViewModelResilienceTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun answer(markdown: String = "An answer.") = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = markdown,
        reasoningMarkdown = "",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "champions", fallback = false),
    )

    // -------------------------------------------------------------------
    // Quick-stop vs. late-stop (acceptance check 3)
    // -------------------------------------------------------------------

    @Test
    fun quickStopWithinTheWindowWipesTheThreadRotatesTheSessionAndRestoresTheComposer() =
        runTest(mainDispatcherRule.dispatcher) {
            var clock = 0L
            val chat = NeverCompletingChatService()
            val appState = AppState()
            val vm = ChatViewModel(chat = chat, appState = appState, now = { clock })
            vm.setComposerText("Who outspeeds Dragapult?")

            vm.send()
            advanceUntilIdle()
            assertTrue(vm.uiState.value.isStreaming)

            clock = 500L // well within QUICK_STOP_MS (2000)
            vm.performStop(clock)

            val state = vm.uiState.value
            assertTrue(state.turns.isEmpty())
            assertEquals("Who outspeeds Dragapult?", state.composerText)
            assertFalse(state.isStreaming)
            assertNull(state.errorBanner)
            assertTrue(appState.guestThread.value.isEmpty())

            // Redo after a quick stop uses a rotated session id — a fresh thread, no
            // prior context.
            vm.send()
            advanceUntilIdle()
            assertEquals(2, chat.sentSessionIds.size)
            assertNotEquals(chat.sentSessionIds[0], chat.sentSessionIds[1])
        }

    @Test
    fun aLateStopKeepsTheAnswerlessUserTurnInTheThreadAndDoesNotRestoreTheComposer() =
        runTest(mainDispatcherRule.dispatcher) {
            var clock = 0L
            val chat = NeverCompletingChatService()
            val vm = ChatViewModel(chat = chat, appState = AppState(), now = { clock })
            vm.setComposerText("Explain Intimidate vs Defiant")

            vm.send()
            advanceUntilIdle()

            clock = ChatViewModel.QUICK_STOP_MS // at/after the boundary => NOT a quick stop
            vm.performStop(clock)

            val state = vm.uiState.value
            assertEquals(1, state.turns.size)
            assertTrue(state.turns.single() is ai.gowtam.oak.features.chat.ChatTurnItem.User)
            assertEquals("", state.composerText)
            assertFalse(state.isStreaming)
        }

    // -------------------------------------------------------------------
    // Screen-off auto-reconnect (acceptance check 4)
    // -------------------------------------------------------------------

    @Test
    fun aTransportDropWhileBackgroundedRetriesOnceAndShowsReconnectingUntilItCompletes() =
        runTest(mainDispatcherRule.dispatcher) {
            lateinit var vm: ChatViewModel
            val finalAnswer = answer("Garchomp outspeeds most of the unboosted metagame.")
            val chat = BackgroundingThenSucceedingChatService(
                onFirstAttempt = { vm.onEnterBackground() },
                secondAttemptAnswer = finalAnswer,
            )
            vm = ChatViewModel(chat = chat, appState = AppState())
            vm.setComposerText("Who outspeeds Dragapult?")

            vm.send()
            advanceUntilIdle()

            // The drop happened while backgrounded: the turn stays "in flight" showing
            // Reconnecting…, not a dead-end error banner.
            var state = vm.uiState.value
            assertTrue(state.isStreaming)
            assertTrue(state.reconnecting)
            assertNull(state.errorBanner)
            assertEquals(1, chat.attempts)

            vm.onEnterForeground()
            advanceUntilIdle()

            state = vm.uiState.value
            assertEquals(2, chat.attempts)
            assertFalse(state.isStreaming)
            assertFalse(state.reconnecting)
            assertEquals(2, state.turns.size) // the user turn + the recovered answer
            assertNull(state.errorBanner)
        }

    @Test
    fun anInBandErrorEventIsNeverAutoRetriedEvenIfTheAppIsBackgrounded() =
        runTest(mainDispatcherRule.dispatcher) {
            val chat = FakeChatService(
                scriptedEvents = listOf(SseEvent.Error(code = "model_unavailable", message = "down", status = 503)),
            )
            val vm = ChatViewModel(chat = chat, appState = AppState())
            vm.setComposerText("hi")
            vm.onEnterBackground()

            vm.send()
            advanceUntilIdle()

            val state = vm.uiState.value
            assertNotNull(state.errorBanner)
            assertFalse(state.isStreaming)
            assertFalse(state.reconnecting)
            // No second attempt — an in-band `error` frame is a real model/agent fault,
            // not a connection drop, so it is surfaced rather than retried.
            assertEquals(1, chat.sendWithImagesCalls.size)
        }

    // -------------------------------------------------------------------
    // keepScreenOn released on every terminal/stop/cancel path
    // -------------------------------------------------------------------

    @Test
    fun keepScreenOnIsReleasedOnTheTerminalAnswerPath() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService(scriptedEvents = listOf(SseEvent.AnswerStart, SseEvent.Answer(answer())))
        val vm = ChatViewModel(chat = chat, appState = AppState())
        vm.setComposerText("hi")

        vm.send()
        assertTrue(vm.keepScreenOn.value)
        advanceUntilIdle()
        assertFalse(vm.keepScreenOn.value)
    }

    @Test
    fun keepScreenOnIsReleasedOnTheInBandErrorPath() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService(scriptedEvents = listOf(SseEvent.Error("boom", "boom", null)))
        val vm = ChatViewModel(chat = chat, appState = AppState())
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()
        assertFalse(vm.keepScreenOn.value)
    }

    @Test
    fun keepScreenOnIsReleasedOnAUserStop() = runTest(mainDispatcherRule.dispatcher) {
        val chat = NeverCompletingChatService()
        val vm = ChatViewModel(chat = chat, appState = AppState())
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()
        assertTrue(vm.keepScreenOn.value)

        vm.stopStreaming()
        assertFalse(vm.keepScreenOn.value)
    }

    @Test
    fun keepScreenOnIsReleasedOnCancelStreaming() = runTest(mainDispatcherRule.dispatcher) {
        val chat = NeverCompletingChatService()
        val vm = ChatViewModel(chat = chat, appState = AppState())
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()
        assertTrue(vm.keepScreenOn.value)

        vm.cancelStreaming()
        assertFalse(vm.keepScreenOn.value)
    }
}

// ---------------------------------------------------------------------------
// Test-only ChatService doubles (need behavior FakeChatService's single
// scripted-events list can't express: an indefinitely-suspended stream, or a
// side-effecting first attempt).
// ---------------------------------------------------------------------------

/** A stream that never completes until cancelled — keeps a turn "streaming" so the
 * stop-handling tests can exercise the quick-stop/late-stop decision deterministically. */
private class NeverCompletingChatService : ChatService {
    val sentSessionIds = mutableListOf<String>()

    override fun send(sessionId: String, message: String, images: List<SourceImage>, scopeSeed: Format?): Flow<SseEvent> {
        sentSessionIds += sessionId
        return flow { awaitCancellation() }
    }

    override fun send(request: ChatRequest): Flow<SseEvent> = throw NotImplementedError("not used by ChatViewModel")
}

/** First attempt runs [onFirstAttempt] (to simulate backgrounding mid-stream) then
 * throws a transport fault; every subsequent attempt succeeds with [secondAttemptAnswer]. */
private class BackgroundingThenSucceedingChatService(
    private val onFirstAttempt: () -> Unit,
    private val secondAttemptAnswer: OakAnswer,
) : ChatService {
    var attempts = 0
        private set

    override fun send(sessionId: String, message: String, images: List<SourceImage>, scopeSeed: Format?): Flow<SseEvent> {
        attempts += 1
        val isFirstAttempt = attempts == 1
        return flow {
            if (isFirstAttempt) {
                onFirstAttempt()
                throw OakError.Transport("connection dropped")
            } else {
                emit(SseEvent.AnswerStart)
                emit(SseEvent.Answer(secondAttemptAnswer))
            }
        }
    }

    override fun send(request: ChatRequest): Flow<SseEvent> = throw NotImplementedError("not used by ChatViewModel")
}
