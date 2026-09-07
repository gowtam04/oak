package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatTurnItem
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.support.FakeChatService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.OakAnswer
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [ChatViewModel.loadResumed] and the [AppState.activeConversationId]
 * bookkeeping around it (implementation-plan.md P9 acceptance check 2; mirrors iOS
 * `ChatViewModelTests`' resume section): resuming a saved conversation seeds the
 * session id + scope + rehydrated turns and binds the app's active conversation;
 * starting a fresh conversation clears it again.
 */
class ChatViewModelResumeTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun answer(text: String) = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = text,
        reasoningMarkdown = "",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "gen9", fallback = false),
    )

    @Test
    fun loadResumedSeedsTheSessionScopeAndTurns() {
        val appState = AppState()
        val vm = ChatViewModel(chat = FakeChatService(), appState = appState)
        val turns = listOf(
            ChatTurn.User(id = "u1", content = "What's Garchomp's best moveset?"),
            ChatTurn.Assistant(id = "a1", answer = answer("Garchomp runs Choice Scarf.")),
        )

        vm.loadResumed(conversationId = "conv-1", format = Format.Gen7, turns = turns)

        val state = vm.uiState.value
        assertEquals(2, state.turns.size)
        assertTrue(state.turns[0] is ChatTurnItem.User)
        assertEquals("What's Garchomp's best moveset?", (state.turns[0] as ChatTurnItem.User).text)
        assertTrue(state.turns[1] is ChatTurnItem.Assistant)
        assertEquals("Garchomp runs Choice Scarf.", (state.turns[1] as ChatTurnItem.Assistant).answer.answerMarkdown)
        assertEquals(Format.Champions, state.displayFormat)
        assertNull(state.scopeSeed)
        assertEquals("conv-1", appState.activeConversationId.value)
    }

    @Test
    fun loadResumedClearsAnyPriorStreamingStateAndErrorBanner() {
        val appState = AppState()
        val vm = ChatViewModel(chat = FakeChatService(), appState = appState)

        vm.loadResumed(conversationId = "conv-1", format = Format.Champions, turns = emptyList())

        val state = vm.uiState.value
        assertTrue(state.turns.isEmpty())
        assertEquals("", state.streamingText)
        assertTrue(state.toolActivities.isEmpty())
        assertNull(state.errorBanner)
    }

    @Test
    fun startNewConversationClearsTheActiveConversationId() {
        val appState = AppState()
        appState.setActiveConversationId("conv-1")
        val vm = ChatViewModel(chat = FakeChatService(), appState = appState)

        vm.startNewConversation()

        assertNull(appState.activeConversationId.value)
    }

    @Test
    fun resumingThenStartingANewConversationRotatesTheSessionAwayFromTheResumedOne() = runTest {
        val appState = AppState()
        val vm = ChatViewModel(chat = FakeChatService(), appState = appState)
        vm.loadResumed(conversationId = "conv-1", format = Format.Champions, turns = emptyList())
        assertEquals("conv-1", appState.activeConversationId.value)

        vm.startNewConversation()

        assertNull(appState.activeConversationId.value)
        assertTrue(vm.uiState.value.turns.isEmpty())
    }
}
