package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatTurnItem
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.features.chat.FollowUpChip
import ai.gowtam.oak.features.chat.deriveFollowUpChips
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.support.FakeChatService
import ai.gowtam.oak.support.FakeScopeService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SseEvent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — chat chrome is a **regulation chip**, not a generation
 * picker, and the client never sends other-format `scope_seed`s (CF-CHAT-AC-1.1,
 * CF-CHAT-AC-1.2, CF-UI-US-2, ADR-3). Empty-desk copy is Champions-oriented
 * (CF-UI-AC-3.1). Do not add a Voice mic (CF-UI-BR-5).
 *
 * [ChatViewModel.selectScope] is a no-op for other games (or is removed);
 * [displayFormat] is always Champions. `scope_seed` is omitted on send.
 * Empty-desk copy is pinned in [ChatEmptyCopyTest].
 *
 * Requirement refs: CF-CHAT-US-1, CF-CHAT-AC-1.1–1.4, CF-CHAT-AC-3.1–3.3,
 * CF-UI-US-1–3, CF-UI-AC-1.1, CF-UI-AC-2.1–2.2, CF-UI-AC-3.1, CF-DATA-BR-7,
 * CF-DATA-BR-21, CF-OPS-BR-4, CF-UI-BR-5, ADR-3.
 */
class ChatChampionsFirstTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun answer(markdown: String = "Garchomp is a Dragon/Ground pseudo-legendary.") = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = markdown,
        reasoningMarkdown = "Resolved Garchomp and read its base stats.",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "champions", fallback = false),
    )

    private fun newModel(
        chat: FakeChatService = FakeChatService(),
        appState: AppState = AppState(),
        scope: FakeScopeService? = null,
    ) = ChatViewModel(chat = chat, appState = appState, scope = scope)

    @Test
    fun displayFormatIsAlwaysChampionsNotNationalDexOrAPickedGen() {
        val vm = newModel()
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)

        vm.selectScope(Format.Gen7)
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)
        assertNull(vm.uiState.value.scopeSeed)

        vm.selectScope(Format.NationalDex)
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)
    }

    @Test
    fun selectScopeDoesNotSendOtherFormatSeeds() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService(
            scriptedEvents = listOf(
                SseEvent.Scope(Format.Champions, ScopeSource.Default),
                SseEvent.AnswerStart,
                SseEvent.AnswerDelta("ok"),
                SseEvent.Answer(answer("ok")),
            ),
        )
        val scope = FakeScopeService()
        val vm = newModel(chat, scope = scope)
        vm.selectScope(Format.Gen7)
        vm.setComposerText("What's Garchomp's Speed?")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isNotEmpty())
        val seed = chat.sendWithImagesCalls.last().scopeSeed
        assertTrue("scope_seed must be omitted or champions, not gen-7", seed == null || seed == Format.Champions)
        assertTrue(scope.persistCalls.none { it.first != Format.Champions })
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)
    }

    @Test
    fun aScriptedOtherGameScopeEventDoesNotRelabelTheChip() {
        val vm = newModel()
        vm.apply(SseEvent.Scope(Format.Gen5, ScopeSource.Conversation))
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)
        vm.apply(SseEvent.Scope(Format.ScarletViolet, ScopeSource.Message))
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)
    }

    @Test
    fun lastUsedScopeGen7DoesNotReopenAnotherGame() {
        val appState = AppState()
        appState.setLastUsedScope(Format.Gen7)
        val vm = newModel(appState = appState)
        assertEquals(Format.Champions, vm.uiState.value.displayFormat)
    }

    @Test
    fun followUpChipsNeverOfferSwitchingToAnotherGame() {
        val chips = deriveFollowUpChips(
            answer = answer(),
            impliedFormat = Format.ScarletViolet,
        )
        assertEquals(0, chips.count { it.kind == FollowUpChip.Kind.Scope })
        assertTrue(chips.none { it.label.contains("Switch to", ignoreCase = true) })
        assertTrue(chips.none { it.target == "gen-7" || it.target == "scarlet-violet" })
    }

    @Test
    fun storedTurnsOnAnOldThreadStillRenderWhenResumed() {
        val vm = newModel()
        vm.loadResumed(
            conversationId = "conv-old",
            format = Format.Gen7,
            turns = listOf(
                ChatTurn.User(id = "u1", content = "In Gen 7, what's Garchomp's Speed?"),
                ChatTurn.Assistant(id = "a1", answer = answer("Old written answer.")),
            ),
        )
        val state = vm.uiState.value
        assertEquals(2, state.turns.size)
        assertEquals("Old written answer.", (state.turns[1] as ChatTurnItem.Assistant).answer.answerMarkdown)
        assertEquals(Format.Champions, state.displayFormat)
        assertEquals(AuthState.Guest, AppState().authState.value)
    }
}
