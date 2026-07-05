package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatTurnItem
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TurnInProgressSignal
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [ChatViewModel]'s durable-turn reattach state machine
 * (background-turns/design.md §6.3): recording the pending turn, `detach` (keep the
 * turn running) vs. `stop` (discard it server-side), reattaching on return / after a
 * transport drop / on a 409 conflict, the resume-404 dead-turn path, the bounded
 * reattach budget, and `active_turn`-seeded reattach on thread open.
 */
class ChatViewModelReattachTest {

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

    /** An [AppState] whose active conversation id is pinned so tests can query the
     * pending-turn map under a known session id. */
    private fun pinnedAppState(id: String = "conv-1") = AppState().apply { setActiveConversationId(id) }

    // -------------------------------------------------------------------
    // Pending-turn recording + detach vs stop
    // -------------------------------------------------------------------

    @Test
    fun theTurnFrameRecordsThePendingTurnInAppState() = runTest(mainDispatcherRule.dispatcher) {
        val appState = pinnedAppState()
        val vm = ChatViewModel(chat = TurnThenAwaitChatService("turn-1"), appState = appState)
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()

        assertEquals("turn-1", appState.pendingTurn("conv-1"))
        assertTrue(vm.uiState.value.isStreaming)
    }

    @Test
    fun detachKeepsThePendingTurnAndNeverStopsTheServer() = runTest(mainDispatcherRule.dispatcher) {
        val appState = pinnedAppState()
        val chat = TurnThenAwaitChatService("turn-1")
        val vm = ChatViewModel(chat = chat, appState = appState)
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()
        vm.detach()
        advanceUntilIdle()

        // The durable turn keeps running server-side: pending pointer retained, no stop.
        assertEquals("turn-1", appState.pendingTurn("conv-1"))
        assertTrue(chat.stopCalls.isEmpty())
        assertFalse(vm.keepScreenOn.value)
    }

    @Test
    fun stopCallsTheStopEndpointAndClearsThePendingTurn() = runTest(mainDispatcherRule.dispatcher) {
        var clock = 0L
        val appState = pinnedAppState()
        val chat = TurnThenAwaitChatService("turn-1")
        val vm = ChatViewModel(chat = chat, appState = appState, now = { clock })
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()

        clock = ChatViewModel.QUICK_STOP_MS + 1 // a late stop — no thread wipe
        vm.performStop(clock)
        advanceUntilIdle()

        assertEquals(listOf("turn-1" to "conv-1"), chat.stopCalls)
        assertNull(appState.pendingTurn("conv-1"))
        assertFalse(vm.uiState.value.isStreaming)
    }

    // -------------------------------------------------------------------
    // Reattach: from the pending pointer, and rebuilding the in-flight UI
    // -------------------------------------------------------------------

    @Test
    fun reattachIfPendingReplaysTheTurnAndResolvesTheAnswer() = runTest(mainDispatcherRule.dispatcher) {
        val appState = pinnedAppState()
        appState.setPendingTurn("conv-1", "turn-1")
        val chat = FakeChatService(
            resumeEvents = listOf(SseEvent.Turn("turn-1"), SseEvent.AnswerStart, SseEvent.Answer(answer())),
        )
        val vm = ChatViewModel(chat = chat, appState = appState)

        vm.reattachIfPending()
        advanceUntilIdle()

        assertEquals(listOf("turn-1" to "conv-1"), chat.resumeCalls)
        val turns = vm.uiState.value.turns
        assertEquals(1, turns.size)
        assertTrue(turns.single() is ChatTurnItem.Assistant)
        assertFalse(vm.uiState.value.isStreaming)
        assertNull(appState.pendingTurn("conv-1"))
    }

    @Test
    fun theTurnFrameRebuildsTheInFlightUiFromScratch() = runTest(mainDispatcherRule.dispatcher) {
        val vm = ChatViewModel(chat = FakeChatService(), appState = pinnedAppState())

        // A stale partial from a previous subscription…
        vm.apply(SseEvent.ToolActivity("resolve_entity", "Resolving"))
        vm.apply(SseEvent.AnswerDelta("stale partial"))
        assertEquals("stale partial", vm.uiState.value.streamingText)

        // …is wiped when the resume replay opens with the `turn` frame.
        vm.apply(SseEvent.Turn("turn-1"))
        assertEquals("", vm.uiState.value.streamingText)
        assertTrue(vm.uiState.value.toolActivities.isEmpty())
    }

    @Test
    fun reattachIfPendingIsANoOpWithoutAPendingTurn() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = ChatViewModel(chat = chat, appState = pinnedAppState())

        vm.reattachIfPending()
        advanceUntilIdle()

        assertTrue(chat.resumeCalls.isEmpty())
        assertFalse(vm.uiState.value.isStreaming)
    }

    // -------------------------------------------------------------------
    // Transport-drop reattach (foreground + deferred to foreground)
    // -------------------------------------------------------------------

    @Test
    fun aForegroundDropAfterTheTurnFrameReattachesViaResumeAndCompletes() =
        runTest(mainDispatcherRule.dispatcher) {
            val chat = DropAfterTurnChatService(resumeScript = listOf(SseEvent.Turn("turn-1"), SseEvent.Answer(answer())))
            val vm = ChatViewModel(chat = chat, appState = pinnedAppState())
            vm.setComposerText("hi")

            vm.send()
            advanceUntilIdle()

            assertEquals(1, chat.sendCount)
            assertEquals(1, chat.resumeCalls.size) // reattached, not re-sent
            val turns = vm.uiState.value.turns
            assertEquals(2, turns.size) // user + recovered answer
            assertTrue(turns.last() is ChatTurnItem.Assistant)
            assertFalse(vm.uiState.value.isStreaming)
            assertNull(vm.uiState.value.errorBanner)
        }

    @Test
    fun aBackgroundedDropDefersReattachUntilForeground() = runTest(mainDispatcherRule.dispatcher) {
        val chat = DropAfterTurnChatService(resumeScript = listOf(SseEvent.Turn("turn-1"), SseEvent.Answer(answer())))
        val vm = ChatViewModel(chat = chat, appState = pinnedAppState())
        vm.setComposerText("hi")
        vm.onEnterBackground()

        vm.send()
        advanceUntilIdle()

        // Drop noticed while backgrounded: no reattach yet, turn shown as reconnecting.
        assertTrue(vm.uiState.value.isStreaming)
        assertTrue(vm.uiState.value.reconnecting)
        assertEquals(0, chat.resumeCalls.size)

        vm.onEnterForeground()
        advanceUntilIdle()

        assertEquals(1, chat.resumeCalls.size)
        assertFalse(vm.uiState.value.isStreaming)
        assertFalse(vm.uiState.value.reconnecting)
        assertEquals(2, vm.uiState.value.turns.size)
    }

    // -------------------------------------------------------------------
    // 409 conflict, resume 404, bounded reattach, active_turn seeding
    // -------------------------------------------------------------------

    @Test
    fun a409TurnInProgressOnSendReattachesToTheReturnedTurn() = runTest(mainDispatcherRule.dispatcher) {
        val chat = Conflict409ChatService(conflictTurnId = "turn-9", answer = answer())
        val vm = ChatViewModel(chat = chat, appState = pinnedAppState())
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()

        assertEquals(listOf("turn-9" to "conv-1"), chat.resumeCalls)
        assertEquals(2, vm.uiState.value.turns.size) // user + reattached answer
        assertNull(vm.uiState.value.errorBanner)
    }

    @Test
    fun aResume404SurfacesTheInterruptedBannerAndClearsPending() = runTest(mainDispatcherRule.dispatcher) {
        val appState = pinnedAppState()
        appState.setPendingTurn("conv-1", "turn-gone")
        val chat = FakeChatService(resumeError = OakError.Http(404, "not_found", "Turn not found."))
        val vm = ChatViewModel(chat = chat, appState = appState)

        vm.reattachIfPending()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertNotNull(state.errorBanner)
        assertFalse(state.isStreaming)
        assertNull(appState.pendingTurn("conv-1"))
        // No last request was retained (app-relaunch reattach), so Retry isn't offered.
        assertFalse(state.errorBanner!!.isRetryable)
    }

    @Test
    fun repeatedDropsGiveTheTurnUpAfterTheReattachBudget() = runTest(mainDispatcherRule.dispatcher) {
        val appState = pinnedAppState()
        val chat = DropAfterTurnChatService(resumeAlwaysDrops = true)
        val vm = ChatViewModel(chat = chat, appState = appState)
        vm.setComposerText("hi")

        vm.send()
        advanceUntilIdle()

        // The initial POST drop schedules reattach #1; each resume keeps dropping until
        // the MAX_REATTACH budget is spent, then the turn is given up as interrupted.
        assertEquals(ChatViewModel.MAX_REATTACH, chat.resumeCalls.size)
        val state = vm.uiState.value
        assertNotNull(state.errorBanner)
        assertFalse(state.isStreaming)
        assertNull(appState.pendingTurn("conv-1"))
    }

    @Test
    fun loadResumedWithAnActiveTurnReattaches() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService(resumeEvents = listOf(SseEvent.Turn("turn-7"), SseEvent.Answer(answer())))
        val vm = ChatViewModel(chat = chat, appState = AppState())

        vm.loadResumed(conversationId = "conv-1", format = Format.Champions, turns = emptyList(), activeTurnId = "turn-7")
        advanceUntilIdle()

        assertEquals(listOf("turn-7" to "conv-1"), chat.resumeCalls)
        assertEquals(1, vm.uiState.value.turns.size)
        assertTrue(vm.uiState.value.turns.single() is ChatTurnItem.Assistant)
    }
}

// ---------------------------------------------------------------------------
// Test-only ChatService doubles
// ---------------------------------------------------------------------------

/** Emits a `turn` frame then suspends — a durable turn that never completes on its own. */
private class TurnThenAwaitChatService(private val turnId: String) : ChatService {
    val stopCalls = mutableListOf<Pair<String, String>>()

    override fun send(sessionId: String, message: String, images: List<SourceImage>, scopeSeed: Format?): Flow<SseEvent> =
        flow { emit(SseEvent.Turn(turnId)); awaitCancellation() }

    override fun send(request: ChatRequest): Flow<SseEvent> = throw NotImplementedError("unused")

    override fun resume(turnId: String, sessionId: String): Flow<SseEvent> =
        flow { emit(SseEvent.Turn(turnId)); awaitCancellation() }

    override suspend fun stop(turnId: String, sessionId: String) {
        stopCalls += turnId to sessionId
    }
}

/** `send` emits a `turn` frame then a transport drop; `resume` replays [resumeScript]
 * (or keeps dropping when [resumeAlwaysDrops]) so reattach can be exercised. */
private class DropAfterTurnChatService(
    private val turnId: String = "turn-1",
    private val resumeAlwaysDrops: Boolean = false,
    private val resumeScript: List<SseEvent> = emptyList(),
) : ChatService {
    var sendCount = 0
        private set
    val resumeCalls = mutableListOf<Pair<String, String>>()

    override fun send(sessionId: String, message: String, images: List<SourceImage>, scopeSeed: Format?): Flow<SseEvent> {
        sendCount += 1
        return flow {
            emit(SseEvent.Turn(turnId))
            throw OakError.Transport("drop")
        }
    }

    override fun send(request: ChatRequest): Flow<SseEvent> = throw NotImplementedError("unused")

    override fun resume(turnId: String, sessionId: String): Flow<SseEvent> = flow {
        resumeCalls += turnId to sessionId
        if (resumeAlwaysDrops) throw OakError.Transport("drop")
        resumeScript.forEach { emit(it) }
    }

    override suspend fun stop(turnId: String, sessionId: String) = Unit
}

/** `send` immediately signals a 409 turn-in-progress; `resume` replays a turn + answer. */
private class Conflict409ChatService(
    private val conflictTurnId: String,
    private val answer: OakAnswer,
) : ChatService {
    val resumeCalls = mutableListOf<Pair<String, String>>()

    override fun send(sessionId: String, message: String, images: List<SourceImage>, scopeSeed: Format?): Flow<SseEvent> =
        flow { throw TurnInProgressSignal(conflictTurnId) }

    override fun send(request: ChatRequest): Flow<SseEvent> = throw NotImplementedError("unused")

    override fun resume(turnId: String, sessionId: String): Flow<SseEvent> = flow {
        resumeCalls += turnId to sessionId
        emit(SseEvent.Turn(turnId))
        emit(SseEvent.Answer(answer))
    }

    override suspend fun stop(turnId: String, sessionId: String) = Unit
}
