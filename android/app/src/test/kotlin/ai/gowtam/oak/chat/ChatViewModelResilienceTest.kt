package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatViewModel
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
 * Exercises [ChatViewModel]'s stop + wake-lock behavior under the durable
 * background-turns model (background-turns/design.md §6.3; mirrors iOS
 * `ChatViewModelTests`' stop section): quick-stop vs. late-stop, an explicit stop
 * calling the stop endpoint (BT-4), an in-band `error` event never reattaching, and
 * [ChatViewModel.keepScreenOn] released on every terminal/stop/detach path. The
 * reattach/detach/pending-turn state machine lives in [ChatViewModelReattachTest].
 *
 * All cases use [MainDispatcherRule]'s [kotlinx.coroutines.test.StandardTestDispatcher]
 * so a `viewModelScope.launch`ed stream consumer / stop call is only SCHEDULED at the
 * triggering call and only runs at an explicit `advanceUntilIdle()`.
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
    // Quick-stop vs. late-stop
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

            // The durable turn is discarded server-side (BT-4).
            advanceUntilIdle()
            assertEquals(1, chat.stopCalls.size)

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

            advanceUntilIdle()
            assertEquals(1, chat.stopCalls.size) // the endpoint is hit either way
        }

    // -------------------------------------------------------------------
    // In-band error is terminal — never reattached
    // -------------------------------------------------------------------

    @Test
    fun anInBandErrorEventSurfacesABannerAndClearsThePendingTurnWithoutReattaching() =
        runTest(mainDispatcherRule.dispatcher) {
            val chat = FakeChatService(
                scriptedEvents = listOf(
                    SseEvent.Turn("turn-1"),
                    SseEvent.Error(code = "model_unavailable", message = "down", status = 503),
                ),
            )
            val appState = AppState()
            appState.setActiveConversationId("conv-1") // pin the session id so we can query the map
            val vm = ChatViewModel(chat = chat, appState = appState)
            vm.setComposerText("hi")

            vm.send()
            advanceUntilIdle()

            val state = vm.uiState.value
            assertNotNull(state.errorBanner)
            assertFalse(state.isStreaming)
            assertFalse(state.reconnecting)
            // A real model/agent fault is not a connection drop — never reattached.
            assertEquals(0, chat.resumeCalls.size)
            // The dead turn's pending pointer is cleared.
            assertNull(appState.pendingTurn("conv-1"))
        }

    // -------------------------------------------------------------------
    // keepScreenOn released on every terminal/stop/detach path
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
    fun keepScreenOnIsReleasedOnDetach() = runTest(mainDispatcherRule.dispatcher) {
        val chat = NeverCompletingChatService()
        val vm = ChatViewModel(chat = chat, appState = AppState())
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()
        assertTrue(vm.keepScreenOn.value)

        vm.detach()
        assertFalse(vm.keepScreenOn.value)
    }
}

// ---------------------------------------------------------------------------
// Test-only ChatService double: emits its turn id then suspends indefinitely, so
// the stop/quick-stop tests can drive the decision on a virtual clock while a
// durable turn id is already recorded.
// ---------------------------------------------------------------------------

private class NeverCompletingChatService : ChatService {
    val sentSessionIds = mutableListOf<String>()
    val stopCalls = mutableListOf<Pair<String, String>>()
    private var counter = 0

    override fun send(sessionId: String, message: String, images: List<SourceImage>, scopeSeed: Format?): Flow<SseEvent> {
        sentSessionIds += sessionId
        val id = "turn-${++counter}"
        return flow {
            emit(SseEvent.Turn(id))
            awaitCancellation()
        }
    }

    override fun send(request: ChatRequest): Flow<SseEvent> = throw NotImplementedError("not used by ChatViewModel")

    override fun resume(turnId: String, sessionId: String): Flow<SseEvent> = flow {
        emit(SseEvent.Turn(turnId))
        awaitCancellation()
    }

    override suspend fun stop(turnId: String, sessionId: String) {
        stopCalls += turnId to sessionId
    }
}
