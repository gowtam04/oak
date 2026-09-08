package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.services.UsageService
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboard
import ai.gowtam.oak.wire.UsageSpecies
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PokemonUsageLoaderTest {

    @Test
    fun loadFetchesDoublesByDefault() = runTest {
        val usage = RecordingUsageService(
            speciesResult = foundSpecies(),
        )
        val loader = PokemonUsageLoader(usage)
        loader.load("garchomp")
        assertEquals(listOf("garchomp" to UsageLadder.Doubles), usage.speciesCalls)
        assertEquals(true, loader.state.value.detail?.found)
        assertEquals("Garchomp", loader.state.value.detail?.savedName)
        assertFalse(loader.state.value.loading)
    }

    @Test
    fun loadSinglesUsesThatLadder() = runTest {
        val usage = RecordingUsageService(speciesResult = foundSpecies())
        val loader = PokemonUsageLoader(usage)
        loader.load("garchomp", UsageLadder.Singles)
        assertEquals(UsageLadder.Singles, usage.speciesCalls.single().second)
        assertEquals(UsageLadder.Singles, loader.state.value.ladder)
    }

    @Test
    fun blankSlugIsUnavailableWithoutCallingTheService() = runTest {
        val usage = RecordingUsageService(speciesResult = foundSpecies())
        val loader = PokemonUsageLoader(usage)
        loader.load("  ")
        assertTrue(usage.speciesCalls.isEmpty())
        assertFalse(loader.state.value.detail?.available ?: true)
    }

    private fun foundSpecies() = UsageSpecies(
        available = true,
        found = true,
        slug = "garchomp",
        savedName = "Garchomp",
        season = "Current",
        fetchedAt = 1_700_000_000_000,
        attribution = "championsbattledata.com",
        moves = emptyList(),
        items = emptyList(),
        abilities = emptyList(),
        natures = emptyList(),
        spreads = emptyList(),
        teammates = emptyList(),
    )
}

private class RecordingUsageService(
    var speciesResult: UsageSpecies,
) : UsageService {
    val speciesCalls = mutableListOf<Pair<String, UsageLadder>>()

    override suspend fun leaderboard(ladder: UsageLadder): UsageLeaderboard {
        return UsageLeaderboard(available = false, ladder = ladder, error = "unused")
    }

    override suspend fun species(slug: String, ladder: UsageLadder): UsageSpecies {
        speciesCalls += slug to ladder
        return speciesResult
    }
}
