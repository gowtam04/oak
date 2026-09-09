package ai.gowtam.oak.chat

import ai.gowtam.oak.app.AppState
import ai.gowtam.oak.features.chat.ChatViewModel
import ai.gowtam.oak.features.chat.DexNameKind
import ai.gowtam.oak.features.chat.DexNameRow
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.support.FakeChatService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.ChatRecovery
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ScopeSource
import ai.gowtam.oak.wire.SearchMatch
import ai.gowtam.oak.wire.SseEvent
import android.graphics.Bitmap
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Slash-discovery P4 Android hops via [ChatViewModel.send] + [AppState] surface
 * requests. Clones the iOS `SlashDiscoveryViewModelTests` cases for help/bare,
 * usage slug, dex kind, images kept, and edit-last non-intercept.
 *
 * Expected production seams (implementer must land these; tests compile-fail
 * until they exist):
 *
 *   AppState.SurfaceRequest.Usage(val slug: String? = null)
 *     — replaces `data object Usage`
 *   AppState.requestUsage(slug: String? = null)
 *   ChatViewModel(..., dexLookup: DexLookupService? = null)
 *     — send-time Dex/Usage name resolve via `DexLookupService.search`
 *   send() intercepts Help/Bare only when **not** editing last (SD-AC-2.5)
 *
 * `requestDex(query, kind)` already exists — slash must pass [kind] when the
 * name resolves; `/dex` with no arg uses `query = null`. Unmatched names hop
 * to that surface's index (`requestDex(null)` / `requestUsage(null)`), never a
 * guessed slug.
 *
 * Today Android `send()` intercepts handled slashes even during edit last —
 * [editLastDoesNotInterceptAHandledSlash] must fail until P4 adds the guard.
 *
 * Requirement refs: SD-US-1..7, SD-AC-2.5, SD-AC-4.3, SD-AC-5.2, SD-AC-5.3,
 * SD-AC-5.4, SD-AC-5.6, SD-AC-5.7, SD-AC-5.9, SD-AC-7.1, SD-AC-8.6, SD-AC-9.1,
 * SD-BR-2, SD-BR-8, SD-BR-11, SD-BR-12.
 */
class SlashDiscoveryViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun answer(
        markdown: String = "Garchomp is a Dragon/Ground type.",
    ) = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = markdown,
        reasoningMarkdown = "Resolved Garchomp.",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "champions", fallback = false),
    )

    private fun newModel(
        chat: FakeChatService = FakeChatService(),
        appState: AppState = AppState(),
        dexLookup: DexLookupService? = null,
    ) = ChatViewModel(chat = chat, appState = appState, dexLookup = dexLookup)

    // -------------------------------------------------------------------
    // SD-AC-4.3 / SD-AC-7.1 / SD-BR-2 — /help and bare / do not POST
    // -------------------------------------------------------------------

    @Test
    fun slashHelpDoesNotPostAndPrefillsComposerSlash() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/help")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertTrue(chat.sendRequestCalls.isEmpty())
        assertEquals("/", vm.uiState.value.composerText)
        assertTrue(vm.uiState.value.turns.isEmpty())
        assertFalse(vm.uiState.value.isStreaming)
    }

    @Test
    fun slashHelpWithExtraWordsStillDoesNotPost() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/help extra words")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals("/", vm.uiState.value.composerText)
    }

    @Test
    fun bareSlashDoesNotPostAndKeepsComposerSlash() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText("/")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertTrue(chat.sendRequestCalls.isEmpty())
        assertEquals("/", vm.uiState.value.composerText)
        assertTrue(vm.uiState.value.turns.isEmpty())
        assertFalse(vm.uiState.value.isStreaming)
    }

    @Test
    fun bareSlashWithSurroundingWhitespaceDoesNotPost() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.setComposerText(" / ")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals("/", vm.uiState.value.composerText)
    }

    // -------------------------------------------------------------------
    // SD-AC-5.7 / SD-AC-5.6 / SD-BR-12 — Usage slug vs index
    // -------------------------------------------------------------------

    @Test
    fun slashUsageGarchompRequestsUsageWithSpeciesSlug() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val dex = ScriptedDexLookup(
            mapOf(EntityKind.POKEMON to listOf(garchompMatch)),
        )
        val vm = newModel(chat = chat, appState = appState, dexLookup = dex)
        vm.setComposerText("/usage garchomp")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(
            AppState.SurfaceRequest.Usage(slug = "garchomp"),
            appState.surfaceRequest.value,
        )
        assertTrue(vm.uiState.value.turns.isEmpty())
        assertTrue(
            dex.searchCalls.any { (kind, query, _) ->
                kind == EntityKind.POKEMON && query.equals("garchomp", ignoreCase = true)
            },
        )
    }

    @Test
    fun unmatchedUsageNameRequestsUsageIndex() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val vm = newModel(
            chat = chat,
            appState = appState,
            dexLookup = ScriptedDexLookup(),
        )
        vm.setComposerText("/usage zzq")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(
            AppState.SurfaceRequest.Usage(slug = null),
            appState.surfaceRequest.value,
        )
    }

    @Test
    fun usageArgThatIsAMoveNotASpeciesRequestsUsageIndex() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val dex = ScriptedDexLookup(
            mapOf(EntityKind.MOVE to listOf(earthquakeMatch)),
        )
        val vm = newModel(chat = chat, appState = appState, dexLookup = dex)
        vm.setComposerText("/usage earthquake")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(
            AppState.SurfaceRequest.Usage(slug = null),
            appState.surfaceRequest.value,
        )
    }

    @Test
    fun slashUsageWithNoArgRequestsUsageIndex() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val vm = newModel(chat = chat, appState = appState)
        vm.setComposerText("/usage")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(
            AppState.SurfaceRequest.Usage(slug = null),
            appState.surfaceRequest.value,
        )
    }

    // -------------------------------------------------------------------
    // SD-AC-5.2 / SD-AC-5.3 / SD-AC-5.4 — Dex kind hops
    // -------------------------------------------------------------------

    @Test
    fun slashDexWithNoArgRequestsDexIndex() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val vm = newModel(chat = chat, appState = appState)
        vm.setComposerText("/dex")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        val req = appState.surfaceRequest.value as AppState.SurfaceRequest.Dex
        assertEquals(null, req.query)
        assertEquals(null, req.kind)
    }

    @Test
    fun slashDexGarchompRequestsDexWithPokemonKind() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val dex = ScriptedDexLookup(
            mapOf(EntityKind.POKEMON to listOf(garchompMatch)),
        )
        val vm = newModel(chat = chat, appState = appState, dexLookup = dex)
        vm.setComposerText("/dex garchomp")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        val req = appState.surfaceRequest.value as AppState.SurfaceRequest.Dex
        assertEquals("garchomp", req.query)
        assertEquals(EntityKind.POKEMON, req.kind)
    }

    @Test
    fun slashDexEarthquakeRequestsDexWithMoveKind() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val dex = ScriptedDexLookup(
            mapOf(EntityKind.MOVE to listOf(earthquakeMatch)),
        )
        val vm = newModel(chat = chat, appState = appState, dexLookup = dex)
        vm.setComposerText("/dex Earthquake")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        val req = appState.surfaceRequest.value as AppState.SurfaceRequest.Dex
        assertEquals("earthquake", req.query)
        assertEquals(EntityKind.MOVE, req.kind)
    }

    @Test
    fun slashDexMetronomeBindOpensPickedKind() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val dex = ScriptedDexLookup(
            mapOf(
                EntityKind.MOVE to listOf(metronomeMoveMatch),
                EntityKind.ITEM to listOf(metronomeItemMatch),
            ),
        )
        val vm = newModel(chat = chat, appState = appState, dexLookup = dex)
        vm.setComposerText("/dex ")
        vm.insertSlashName(
            DexNameRow(
                kind = DexNameKind.Item,
                slug = "metronome",
                displayName = "Metronome",
            ),
        )

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        val req = appState.surfaceRequest.value as AppState.SurfaceRequest.Dex
        assertEquals("metronome", req.query)
        assertEquals(EntityKind.ITEM, req.kind)
    }

    @Test
    fun unmatchedDexNameRequestsDexIndexNotAGuessedSlug() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val vm = newModel(
            chat = chat,
            appState = appState,
            dexLookup = ScriptedDexLookup(),
        )
        vm.setComposerText("/dex zzq")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        val req = appState.surfaceRequest.value as AppState.SurfaceRequest.Dex
        assertEquals(null, req.query)
        assertEquals(null, req.kind)
    }

    // -------------------------------------------------------------------
    // SD-AC-5.9 — images stay on the composer for handled hops
    // -------------------------------------------------------------------

    @Test
    fun slashHelpKeepsPendingImages() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        val bitmap = stubBitmap()
        vm.attachImages(listOf(bitmap))
        vm.setComposerText("/help")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(1, vm.uiState.value.pendingImages.size)
        assertEquals("/", vm.uiState.value.composerText)
    }

    @Test
    fun bareSlashKeepsPendingImages() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val vm = newModel(chat)
        vm.attachImages(listOf(stubBitmap()))
        vm.setComposerText("/")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(1, vm.uiState.value.pendingImages.size)
        assertEquals("/", vm.uiState.value.composerText)
    }

    @Test
    fun slashDexHopKeepsPendingImages() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val vm = newModel(chat = chat, appState = appState)
        vm.attachImages(listOf(stubBitmap()))
        vm.setComposerText("/dex")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(1, vm.uiState.value.pendingImages.size)
        val req = appState.surfaceRequest.value as AppState.SurfaceRequest.Dex
        assertEquals(null, req.query)
    }

    @Test
    fun slashUsageHopKeepsPendingImages() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService()
        val appState = AppState()
        val dex = ScriptedDexLookup(
            mapOf(EntityKind.POKEMON to listOf(garchompMatch)),
        )
        val vm = newModel(chat = chat, appState = appState, dexLookup = dex)
        vm.attachImages(listOf(stubBitmap()))
        vm.setComposerText("/usage garchomp")

        vm.send()
        advanceUntilIdle()

        assertTrue(chat.sendWithImagesCalls.isEmpty())
        assertEquals(1, vm.uiState.value.pendingImages.size)
        assertEquals(
            AppState.SurfaceRequest.Usage(slug = "garchomp"),
            appState.surfaceRequest.value,
        )
    }

    // -------------------------------------------------------------------
    // SD-AC-7.2 / SD-BR-3 — unknown slash still POSTs
    // -------------------------------------------------------------------

    @Test
    fun unknownSlashFooStillPostsAChatTurn() = runTest(mainDispatcherRule.dispatcher) {
        val chat = FakeChatService(
            scriptedEvents = listOf(
                SseEvent.Scope(Format.Champions, ScopeSource.Default),
                SseEvent.AnswerStart,
                SseEvent.AnswerDelta("ok"),
                SseEvent.Answer(answer("ok")),
            ),
        )
        val vm = newModel(chat)
        vm.setComposerText("/foo")

        vm.send()
        advanceUntilIdle()

        assertEquals(1, chat.sendWithImagesCalls.size)
        assertEquals("/foo", chat.sendWithImagesCalls.single().message)
    }

    // -------------------------------------------------------------------
    // SD-AC-2.5 / SD-BR-8 — edit last does not intercept
    // -------------------------------------------------------------------

    @Test
    fun editLastDoesNotInterceptAHandledSlash() = runTest(mainDispatcherRule.dispatcher) {
        val finalAnswer = answer()
        val chat = FakeChatService(
            scriptedEvents = listOf(
                SseEvent.AnswerStart,
                SseEvent.AnswerDelta(finalAnswer.answerMarkdown),
                SseEvent.Answer(finalAnswer),
            ),
        )
        val vm = newModel(chat)
        vm.setComposerText("hello")
        vm.send()
        advanceUntilIdle()
        assertEquals(1, chat.sendWithImagesCalls.size)

        vm.beginEditLast()
        assertTrue(vm.uiState.value.editingLast)
        vm.setComposerText("/new")

        vm.send()
        advanceUntilIdle()

        assertEquals(2, chat.sendWithImagesCalls.size)
        val edited = chat.sendWithImagesCalls.last()
        assertEquals("/new", edited.message)
        assertEquals(ChatRecovery.Edit, edited.recovery)
    }

    /**
     * JVM unit tests stub `android.graphics.Bitmap`. [ChatViewModel.attachImages]
     * only retains the list on hops (SD-AC-5.9) — pixels are never read.
     */
    private fun stubBitmap(): Bitmap {
        val created = runCatching {
            Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }.getOrNull()
        if (created != null) return created

        val ctor = Bitmap::class.java.declaredConstructors.minByOrNull { it.parameterCount }
            ?: error("android.graphics.Bitmap has no constructors")
        ctor.isAccessible = true
        val args = ctor.parameterTypes.map { type ->
            when (type) {
                java.lang.Boolean.TYPE -> false
                java.lang.Byte.TYPE -> 0.toByte()
                java.lang.Short.TYPE -> 0.toShort()
                java.lang.Integer.TYPE -> 0
                java.lang.Long.TYPE -> 0L
                java.lang.Float.TYPE -> 0f
                java.lang.Double.TYPE -> 0.0
                java.lang.Character.TYPE -> '\u0000'
                else -> null
            }
        }.toTypedArray()
        return ctor.newInstance(*args) as Bitmap
    }

    private class ScriptedDexLookup(
        private val byKind: Map<EntityKind, List<SearchMatch>> = emptyMap(),
    ) : DexLookupService {
        val searchCalls = mutableListOf<Triple<EntityKind, String, Format>>()

        override suspend fun search(
            kind: EntityKind,
            query: String,
            format: Format,
        ): List<SearchMatch> {
            searchCalls += Triple(kind, query, format)
            return byKind[kind].orEmpty()
        }

        override suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove> =
            emptyList()

        override suspend fun sprites(
            names: List<String>,
            format: Format,
        ): Map<String, DexSpriteRef> = emptyMap()
    }

    private companion object {
        val garchompMatch = SearchMatch(
            slug = "garchomp",
            displayName = "Garchomp",
            kind = EntityKind.POKEMON,
        )
        val earthquakeMatch = SearchMatch(
            slug = "earthquake",
            displayName = "Earthquake",
            kind = EntityKind.MOVE,
        )
        val metronomeMoveMatch = SearchMatch(
            slug = "metronome",
            displayName = "Metronome",
            kind = EntityKind.MOVE,
        )
        val metronomeItemMatch = SearchMatch(
            slug = "metronome",
            displayName = "Metronome",
            kind = EntityKind.ITEM,
        )
    }
}
