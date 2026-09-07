package ai.gowtam.oak.features.usage

import ai.gowtam.oak.services.UsageService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboard
import ai.gowtam.oak.wire.UsageLeaderboardRow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Champions-first P8 — Usage leaderboard VM (ADR-6 Dex section, same API as
 * iOS Usage). Doubles is the default; fail-soft when the live ladder is down.
 * Public (no sign-in). Never falls back to Smogon OU.
 *
 * Fails to compile until P8 adds:
 *
 *   wire/Usage.kt
 *     UsageLadder { Doubles, Singles }          // wire "doubles" | "singles"
 *     UsageLeaderboardRow(rank, name, slug, usagePct?, sprite?)
 *     UsageLeaderboard(available, ladder, season?, fetchedAt?, attribution?,
 *                      error?, rows)
 *
 *   services/UsageService.kt
 *     suspend fun leaderboard(ladder = Doubles): UsageLeaderboard  // never-throw
 *
 *   features/usage/UsageLeaderboardViewModel.kt
 *     UsageLeaderboardViewModel(usage)
 *     start() / setLadder(ladder)
 *     UiState: ladder, available, rows, season, fetchedAt, attribution,
 *              errorMessage, isLoading
 *
 * Requirement refs: CF-USAGE-US-1, CF-USAGE-AC-1.1–1.3, CF-USAGE-AC-1.5–1.6,
 * CF-UI-AC-6.1–6.4, CF-AS-1, CF-AS-2, CF-INT-BR-5–7, CF-OPS-BR-1, ADR-5, ADR-6.
 */
class UsageLeaderboardViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun available(
        ladder: UsageLadder = UsageLadder.Doubles,
        rows: List<UsageLeaderboardRow> = listOf(
            UsageLeaderboardRow(rank = 1, name = "Garchomp", slug = "garchomp", usagePct = 18.4),
            UsageLeaderboardRow(rank = 2, name = "Farigiraf", slug = "farigiraf", usagePct = 9.1),
        ),
    ) = UsageLeaderboard(
        available = true,
        ladder = ladder,
        season = "Current",
        fetchedAt = 1_700_000_000_000,
        attribution = "championsbattledata.com",
        rows = rows,
    )

    private fun unavailable(ladder: UsageLadder = UsageLadder.Doubles) = UsageLeaderboard(
        available = false,
        ladder = ladder,
        error = "upstream_unavailable",
        rows = emptyList(),
    )

    @Test
    fun opensOnDoublesWithoutSigningIn() = runTest(mainDispatcherRule.dispatcher) {
        val usage = FakeUsageService(leaderboardResult = available())
        val vm = UsageLeaderboardViewModel(usage)

        vm.start()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(UsageLadder.Doubles, state.ladder)
        assertTrue(state.available)
        assertEquals(listOf("garchomp", "farigiraf"), state.rows.map { it.slug })
        assertEquals("Current", state.season)
        assertEquals(1_700_000_000_000, state.fetchedAt)
        assertTrue(state.attribution!!.contains("champions", ignoreCase = true) || state.attribution!!.isNotBlank())
        assertEquals(listOf(UsageLadder.Doubles), usage.leaderboardCalls)
        assertFalse(state.isLoading)
    }

    @Test
    fun switchingToSinglesRefetchesThatLadder() = runTest(mainDispatcherRule.dispatcher) {
        val usage = FakeUsageService(leaderboardResult = available())
        val vm = UsageLeaderboardViewModel(usage)
        vm.start()
        advanceUntilIdle()

        usage.leaderboardResult = available(ladder = UsageLadder.Singles)
        vm.setLadder(UsageLadder.Singles)
        advanceUntilIdle()

        assertEquals(UsageLadder.Singles, vm.uiState.value.ladder)
        assertEquals(UsageLadder.Singles, usage.leaderboardCalls.last())
    }

    @Test
    fun aNewVisitDefaultsToDoublesAndDoesNotRequirePersistingTheLadder() = runTest(mainDispatcherRule.dispatcher) {
        val usage = FakeUsageService(leaderboardResult = available(UsageLadder.Singles))
        val first = UsageLeaderboardViewModel(usage)
        first.start()
        first.setLadder(UsageLadder.Singles)
        advanceUntilIdle()

        val second = UsageLeaderboardViewModel(FakeUsageService(leaderboardResult = available()))
        second.start()
        advanceUntilIdle()
        assertEquals(UsageLadder.Doubles, second.uiState.value.ladder)
    }

    @Test
    fun failSoftWhenUsageIsDownDoesNotInventAnOuBoard() = runTest(mainDispatcherRule.dispatcher) {
        val usage = FakeUsageService(leaderboardResult = unavailable())
        val vm = UsageLeaderboardViewModel(usage)
        vm.start()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.available)
        assertTrue(state.rows.isEmpty())
        assertEquals(UsageLadder.Doubles, state.ladder)
        val err = state.errorMessage.orEmpty()
        assertTrue(err.contains("unavailable", ignoreCase = true) || err == "upstream_unavailable")
        val blob = listOfNotNull(state.errorMessage, state.attribution, state.season).joinToString()
        assertFalse(blob.contains("smogon", ignoreCase = true))
        assertFalse(blob.contains("gen9ou", ignoreCase = true))
    }

    @Test
    fun emptyRowsAreAnHonestEmptyStateNotAFakeBoard() = runTest(mainDispatcherRule.dispatcher) {
        val usage = FakeUsageService(
            leaderboardResult = available(rows = emptyList()),
        )
        val vm = UsageLeaderboardViewModel(usage)
        vm.start()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.available)
        assertTrue(vm.uiState.value.rows.isEmpty())
        assertNull(vm.uiState.value.rows.firstOrNull())
    }
}

/**
 * Test double for [UsageService]. Never throws — configure [leaderboardResult].
 */
class FakeUsageService(
    var leaderboardResult: UsageLeaderboard,
) : UsageService {
    val leaderboardCalls = mutableListOf<UsageLadder>()

    override suspend fun leaderboard(ladder: UsageLadder): UsageLeaderboard {
        leaderboardCalls += ladder
        return leaderboardResult
    }
}
