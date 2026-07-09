package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Decode coverage for [TeamAnalysis] — the `POST /api/teams/analyze` response mirror
 * of `web/src/lib/teams/team-analysis.ts`: the `ok` body (found + not-found members,
 * the defensive/offensive matrices, speed tiers, notes), unknown-key tolerance, and the
 * `unavailable` arm.
 */
class TeamAnalysisDecodeTest {

    @Test
    fun okBodyDecodesMembersMatricesSpeedAndNotes() {
        val json = """
            {"status":"ok","format":"champions",
             "members":[
               {"slug":"garchomp","found":true,"display_name":"Garchomp","types":["dragon","ground"],
                "bst":600,"stats":{"hp":183,"atk":182,"def":115,"spa":100,"spd":105,"spe":169},
                "level":50,"nature":"jolly"},
               {"slug":"not-a-mon","found":false}
             ],
             "defense":[
               {"type":"ice","weak":["garchomp"],"resists":[],"immune":[]},
               {"type":"electric","weak":[],"resists":[],"immune":["garchomp"]}
             ],
             "offense":{"covered":[{"type":"steel","by":[{"member":"garchomp","move":"earthquake"}]}],
                        "uncovered":["ghost","flying"]},
             "speed_tiers":[{"member":"garchomp","speed":169}],
             "notes":["Coverage is type-based only."]}
        """.trimIndent()

        val ok = OakJson.decodeFromString<TeamAnalysis>(json) as TeamAnalysis.Ok
        assertEquals(Format.Champions, ok.v.format)

        // Found member carries its full readout; the unresolved one degrades per-member.
        val found = ok.v.members[0] as AnalyzedMember.Found
        assertEquals("Garchomp", found.displayName)
        assertEquals(600, found.bst)
        assertEquals(169, found.stats.spe)
        assertEquals("jolly", found.nature)
        val missing = ok.v.members[1] as AnalyzedMember.NotFound
        assertEquals("not-a-mon", missing.slug)

        // Defensive matrix carries member-slug arrays (counts derive from lengths).
        assertEquals(listOf("garchomp"), ok.v.defense.first { it.type == "ice" }.weak)
        assertEquals(listOf("garchomp"), ok.v.defense.first { it.type == "electric" }.immune)

        // Offensive coverage + speed tiers + notes.
        assertEquals("garchomp", ok.v.offense.covered.single().by.single().member)
        assertEquals("earthquake", ok.v.offense.covered.single().by.single().move)
        assertEquals(listOf("ghost", "flying"), ok.v.offense.uncovered)
        assertEquals(169, ok.v.speedTiers.single().speed)
        assertEquals(listOf("Coverage is type-based only."), ok.v.notes)
    }

    // A found member with a stat the server couldn't compute (`null`) and a wire field the
    // client doesn't know about both decode gracefully (tolerant [OakJson]).
    @Test
    fun okBodyToleratesNullStatsAndUnknownKeys() {
        val json = """
            {"status":"ok","format":"gen-1","future_field":true,
             "members":[{"slug":"mew","found":true,"display_name":"Mew","types":["psychic"],
                         "bst":600,"stats":{"hp":200,"atk":150,"def":150,"spa":null,"spd":150,"spe":150},
                         "level":100,"nature":null,"extra":"ignored"}],
             "defense":[],"offense":{"covered":[],"uncovered":[]},"speed_tiers":[],"notes":[]}
        """.trimIndent()

        val ok = OakJson.decodeFromString<TeamAnalysis>(json) as TeamAnalysis.Ok
        assertEquals(Format.Gen1, ok.v.format)
        val found = ok.v.members.single() as AnalyzedMember.Found
        assertNull(found.stats.spa)
        assertNull(found.nature)
        assertEquals(200, found.stats.hp)
    }

    @Test
    fun unavailableArmDecodesFormatOnly() {
        val json = """{"status":"unavailable","format":"scarlet-violet"}"""
        val unavailable = OakJson.decodeFromString<TeamAnalysis>(json) as TeamAnalysis.Unavailable
        assertEquals(Format.ScarletViolet, unavailable.format)
    }

    // A `status` the wire adds later degrades to Unsupported rather than failing the decode.
    @Test
    fun unknownStatusDegradesToUnsupported() {
        val json = """{"status":"queued","format":"champions"}"""
        val unsupported = OakJson.decodeFromString<TeamAnalysis>(json) as TeamAnalysis.Unsupported
        assertEquals("queued", unsupported.rawStatus)
        assertTrue(true)
    }
}
