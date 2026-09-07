package ai.gowtam.oak.wire

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
private data class ArchivedTeamWire(val team: Team)

/**
 * Champions-first P8 — [Format] stays a stored-value union for JSON decode
 * (ADR-3) but living work is Champions only. An old `gen-7` team is
 * **archived**; `champions` is living. Pickers must not list other games.
 *
 * Fails to compile until P8 adds on [Format]:
 *
 *   val isArchived: Boolean   // `this != Champions` (Unknown included)
 *   val isLiving: Boolean     // `this == Champions`
 *   val pickerCases: List<Format> = listOf(Champions)
 *
 * [knownCases] still names every historical format so archived rows decode.
 *
 * Requirement refs: CF-DATA-BR-12, CF-TEAM-US-5, CF-TEAM-AC-5.1, CF-UI-AC-1.1,
 * CF-CHAT-AC-1.1, ADR-3.
 */
class FormatChampionsFirstTest {

    @Test
    fun decodesAnOldGen7TeamAsArchivedNotLiving() {
        val json = """
            {"team":{"id":"t-usum","name":"USUM Rain","format":"gen-7",
             "members":[],"createdAt":1,"updatedAt":2}}
        """.trimIndent()
        val team = OakJson.decodeFromString<ArchivedTeamWire>(json).team
        assertEquals(Format.Gen7, team.format)
        assertEquals("gen-7", team.format.rawValue)
        assertTrue(team.format.isArchived)
        assertFalse(team.format.isLiving)
        assertTrue(team.isArchived)
    }

    @Test
    fun decodesAChampionsTeamAsLivingNotArchived() {
        val json = """
            {"team":{"id":"t-live","name":"Reg rain","format":"champions",
             "members":[],"createdAt":1,"updatedAt":2}}
        """.trimIndent()
        val team = OakJson.decodeFromString<ArchivedTeamWire>(json).team
        assertEquals(Format.Champions, team.format)
        assertFalse(team.format.isArchived)
        assertTrue(team.format.isLiving)
        assertFalse(team.isArchived)
    }

    @Test
    fun everyNonChampionsKnownFormatIsArchivedIncludingNationalDexAndUnknown() {
        val archived = listOf(
            Format.NationalDex, Format.ScarletViolet,
            Format.Gen8, Format.Gen7, Format.Gen6, Format.Gen5,
            Format.Gen4, Format.Gen3, Format.Gen2, Format.Gen1,
            Format.Unknown("gen-99-mystery"),
        )
        for (format in archived) {
            assertTrue("$format should be archived", format.isArchived)
            assertFalse("$format should not be living", format.isLiving)
        }
        assertTrue(Format.Champions.isLiving)
        assertFalse(Format.Champions.isArchived)
    }

    @Test
    fun knownCasesStillDecodeHistoricalFormatsButPickersOnlyOfferChampions() {
        assertEquals(Format.Gen7, Format.fromRaw("gen-7"))
        assertEquals(Format.NationalDex, Format.fromRaw("national-dex"))
        assertTrue(Format.knownCases.contains(Format.Gen7))
        assertTrue(Format.knownCases.contains(Format.Champions))
        assertEquals(listOf(Format.Champions), Format.pickerCases)
        assertTrue(Format.pickerCases.none { it.isArchived })
        for (other in listOf(
            Format.NationalDex, Format.ScarletViolet,
            Format.Gen1, Format.Gen5, Format.Gen7, Format.Gen8,
        )) {
            assertFalse("$other must not appear in pickers", other in Format.pickerCases)
        }
    }

    @Test
    fun summaryRowsCarryFormatSoArchiveCanLabelOrigin() {
        val json = """
            {"id":"s1","name":"BW Offense","format":"gen-5","memberCount":4,
             "incomplete":true,"species":["excadrill"],"updatedAt":9}
        """.trimIndent()
        val summary = OakJson.decodeFromString<TeamSummary>(json)
        assertEquals(Format.Gen5, summary.format)
        assertTrue(summary.format.isArchived)
        assertTrue(summary.isArchived)
        assertEquals("Gen 5", summary.format.shortLabel)
    }
}
