package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Champions-first P8 — decode of `GET /api/usage` (api-design.md). 200 even when
 * unavailable. Ladder wire values are `doubles` / `singles`. Snake_case
 * `fetched_at` / `usage_pct`.
 *
 * Fails to compile until P8 adds [UsageLeaderboard] / [UsageLadder] /
 * [UsageLeaderboardRow] in `wire/Usage.kt`.
 *
 * Requirement refs: CF-USAGE-AC-1.2, CF-USAGE-AC-1.3, CF-USAGE-AC-1.6, ADR-5.
 */
class UsageWireTest {

    @Test
    fun decodesAnAvailableDoublesLeaderboard() {
        val json = """
            {
              "available": true,
              "ladder": "doubles",
              "season": "Current",
              "fetched_at": 1700000000000,
              "attribution": "championsbattledata.com",
              "rows": [
                {"rank": 1, "name": "Garchomp", "slug": "garchomp", "usage_pct": 18.4},
                {"rank": 2, "name": "Farigiraf", "slug": "farigiraf", "usage_pct": 9.1}
              ]
            }
        """.trimIndent()
        val board = OakJson.decodeFromString<UsageLeaderboard>(json)
        assertTrue(board.available)
        assertEquals(UsageLadder.Doubles, board.ladder)
        assertEquals("Current", board.season)
        assertEquals(1_700_000_000_000, board.fetchedAt)
        assertEquals(2, board.rows.size)
        assertEquals("garchomp", board.rows[0].slug)
        assertEquals(18.4, board.rows[0].usagePct!!, 0.001)
        assertFalse(board.rows.any { it.slug.contains("calyrex") })
    }

    @Test
    fun decodesUnavailableWithoutInventingRows() {
        val json = """
            {
              "available": false,
              "ladder": "doubles",
              "error": "upstream_unavailable",
              "rows": []
            }
        """.trimIndent()
        val board = OakJson.decodeFromString<UsageLeaderboard>(json)
        assertFalse(board.available)
        assertEquals(UsageLadder.Doubles, board.ladder)
        assertEquals("upstream_unavailable", board.error)
        assertTrue(board.rows.isEmpty())
        val blob = OakJson.decodeFromString<UsageLeaderboard>(json).toString().lowercase()
        assertFalse("smogon" in blob)
        assertFalse("gen9ou" in blob)
    }

    @Test
    fun decodesSinglesAndRankOnlyRowsWithoutInventingZeroUsage() {
        val json = """
            {
              "available": true,
              "ladder": "singles",
              "season": "Current",
              "fetched_at": 1,
              "rows": [
                {"rank": 1, "name": "Garchomp", "slug": "garchomp"},
                {"rank": 3, "name": "Farigiraf", "slug": "farigiraf"}
              ]
            }
        """.trimIndent()
        val board = OakJson.decodeFromString<UsageLeaderboard>(json)
        assertEquals(UsageLadder.Singles, board.ladder)
        assertTrue(board.rows.all { it.usagePct == null })
        assertNull(board.rows[0].usagePct)
    }
}
