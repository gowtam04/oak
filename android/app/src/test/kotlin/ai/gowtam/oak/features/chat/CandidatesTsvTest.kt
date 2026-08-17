package ai.gowtam.oak.features.chat

import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.CandidateRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 5 lockstep oracle — visible candidate rows → TSV (TBL-US-4).
 *
 * Clones `web/src/lib/candidates-tsv.ts`. Fails to compile until
 * `CandidatesTsv.kt` exists (`features/chat/CandidatesTsv.kt`).
 *
 * Expected API:
 *
 *   fun candidatesToTsv(visibleRows: List<CandidateRow>): String
 *
 * The helper serializes the **already-visible** set only (after sort / filter
 * / in-table pin). It does not fetch hidden remainder (`N` of `M` stays
 * honest — TBL-BR-1). Empty input → empty string (UI explains; TBL-AC-4.4).
 *
 * Portable column contract (spreadsheet paste, TBL-AC-4.1):
 *   `Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe[\tAbility]`
 * Types join with `/`. Ability column is present only when any visible row
 * names an ability. `\n` line endings. Header first, then one line per row
 * in the given order.
 *
 * Requirement refs: TBL-US-4, TBL-AC-4.1, TBL-AC-4.4, TBL-BR-1, TBL-BR-3.
 */
class CandidatesTsvTest {

    private fun row(
        name: String,
        types: List<String> = listOf("dragon"),
        stats: BaseStats? = null,
        ability: String? = null,
    ) = CandidateRow(
        name = name,
        types = types,
        baseStats = stats,
        ability = ability,
    )

    private val garchompStats = BaseStats(hp = 108, atk = 130, def = 95, spa = 80, spd = 85, spe = 102)
    private val dragoniteStats = BaseStats(hp = 91, atk = 134, def = 95, spa = 100, spd = 100, spe = 80)

    @Test
    fun serializesOnlyTheRowsItIsGiven() {
        val visible = listOf(
            row("Garchomp", listOf("dragon", "ground"), garchompStats, "rough-skin"),
            row("Dragonite", listOf("dragon", "flying"), dragoniteStats, "multiscale"),
        )
        val tsv = candidatesToTsv(visible)
        assertTrue(tsv.contains("Garchomp"))
        assertTrue(tsv.contains("Dragonite"))
        assertFalse(tsv.contains("Excadrill"))
        assertFalse(tsv.contains("Metagross"))
    }

    @Test
    fun preservesTheGivenVisibleOrderIncludingAPinnedRow() {
        val visible = listOf(
            row("Garchomp", listOf("dragon", "ground"), garchompStats),
            row("Dragonite", listOf("dragon", "flying"), dragoniteStats),
        )
        val lines = candidatesToTsv(visible).split('\n')
        assertTrue(lines.size >= 3)
        assertTrue(lines[1].contains("Garchomp"))
        assertTrue(lines[2].contains("Dragonite"))
    }

    @Test
    fun emitsAHeaderAndTabSeparatedStatColumns() {
        val tsv = candidatesToTsv(
            listOf(row("Garchomp", listOf("dragon", "ground"), garchompStats, "rough-skin")),
        )
        val lines = tsv.split('\n')
        assertEquals("Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe\tAbility", lines.first())
        assertTrue(lines.contains("Garchomp\tdragon/ground\t108\t130\t95\t80\t85\t102\trough-skin"))
        assertTrue(tsv.contains("\t"))
        assertFalse(tsv.contains(","))
    }

    @Test
    fun omitsTheAbilityColumnWhenNoVisibleRowNamesOne() {
        val tsv = candidatesToTsv(
            listOf(row("Garchomp", listOf("dragon", "ground"), garchompStats)),
        )
        val header = tsv.split('\n').first()
        assertEquals("Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe", header)
        assertFalse(header.contains("Ability"))
    }

    @Test
    fun emptyVisibleSetIsAnEmptyString() {
        assertEquals("", candidatesToTsv(emptyList()))
    }

    @Test
    fun doesNotInventHiddenRemainderRows() {
        val tsv = candidatesToTsv(listOf(row("Kartana", listOf("steel", "grass"))))
        assertTrue(tsv.contains("Kartana"))
        assertFalse(tsv.contains("Bisharp"))
        assertFalse(tsv.contains("Excadrill"))
    }
}
