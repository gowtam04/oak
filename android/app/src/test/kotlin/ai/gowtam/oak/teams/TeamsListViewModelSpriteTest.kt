package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamsListViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.services.EmptyDexLookupService
import ai.gowtam.oak.support.FakeDexLookupService
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.SearchMatch
import ai.gowtam.oak.wire.TeamSummary
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Verifies that [TeamsListViewModel] hydrates sprite refs after a successful reload,
 * degrades silently when the sprite fetch fails, and omits refs for unknown species.
 */
class TeamsListViewModelSpriteTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun fakeRef(slug: String) = DexSpriteRef(
        displayName = slug,
        spriteUrl = "https://example.com/sprites/$slug.png",
        dexNumber = 1,
        types = listOf("Normal"),
        baseStats = BaseStats(hp = 45, atk = 49, def = 49, spa = 65, spd = 65, spe = 45),
    )

    private fun summary(id: String, species: List<String>, format: Format = Format.Champions) =
        TeamSummary(
            id = id,
            name = "Team $id",
            format = format,
            memberCount = species.size,
            incomplete = false,
            species = species,
            updatedAt = 0L,
        )

    @Test
    fun spriteRefsPopulatedAfterLoad() = runTest(mainDispatcherRule.dispatcher) {
        val garchomp = fakeRef("garchomp")
        val dragonite = fakeRef("dragonite")
        val dex = FakeDexLookupService(
            spritesResult = mapOf("garchomp" to garchomp, "dragonite" to dragonite),
        )
        val teams = listOf(
            summary("t1", listOf("garchomp", "dragonite")),
        )
        val service = FakeTeamService(listResult = teams)
        val model = TeamsListViewModel(service, dex)

        model.reload()
        advanceUntilIdle()

        val refs = model.uiState.value.spriteRefs
        assertEquals(garchomp, refs["garchomp"])
        assertEquals(dragonite, refs["dragonite"])
        assertNull(model.uiState.value.errorMessage)
    }

    @Test
    fun spriteFetchFailureDegradesSilentlyToDots() = runTest(mainDispatcherRule.dispatcher) {
        val throwingDex = object : DexLookupService {
            override suspend fun search(kind: EntityKind, query: String, format: Format): List<SearchMatch> = emptyList()
            override suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove> = emptyList()
            override suspend fun sprites(names: List<String>, format: Format): Map<String, DexSpriteRef> =
                throw OakError.Transport("sprite_fail")
        }
        val teams = listOf(summary("t1", listOf("pikachu")))
        val service = FakeTeamService(listResult = teams)
        val model = TeamsListViewModel(service, throwingDex)

        model.reload()
        advanceUntilIdle()

        assertTrue(model.uiState.value.spriteRefs.isEmpty())
        assertNull(model.uiState.value.errorMessage)
        assertEquals(1, model.uiState.value.teams.size)
    }

    @Test
    fun missingSpeciesHasNoRef() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(
            spritesResult = mapOf("garchomp" to fakeRef("garchomp")),
        )
        val teams = listOf(
            summary("t1", listOf("garchomp", "unknownmon")),
        )
        val service = FakeTeamService(listResult = teams)
        val model = TeamsListViewModel(service, dex)

        model.reload()
        advanceUntilIdle()

        val refs = model.uiState.value.spriteRefs
        assertNotNull(refs["garchomp"])
        assertNull(refs["unknownmon"])
    }
}
