package ai.gowtam.oak.wire

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
private data class TeamEnvelope(val team: Team, val validation: List<TeamWarning>)

@Serializable
private data class TeamsListEnvelope(val teams: List<Team>)

/**
 * [TeamMember] round-trip (asymmetric null/omit encoding), [TeamWarning.Code]
 * tolerant decode (all 12 codes incl. `item_missing` and `learnset_unavailable`,
 * plus an unrecognized 13th), and the `team`/`teams` envelope fixtures.
 */
class TeamDecodeTest {

    @Test
    fun teamEnvelopeDecodesMembersAndFlatValidation() {
        val envelope = OakJson.decodeFromString<TeamEnvelope>(Fixtures.string("team.json"))
        assertEquals("team_abc123", envelope.team.id)
        assertEquals(Format.ScarletViolet, envelope.team.format)
        assertEquals(2, envelope.team.members.size)

        val garchomp = envelope.team.members[0]
        assertEquals("garchomp", garchomp.species)
        assertEquals("Chompy", garchomp.nickname)
        assertEquals(TeamMember.Gender.MALE, garchomp.gender)
        assertEquals(false, garchomp.shiny)
        assertEquals(252, garchomp.evs.atk)

        val dragapult = envelope.team.members[1]
        assertNull(dragapult.item)
        assertNull(dragapult.nature)
        assertNull(dragapult.teraType)
        // Cosmetic keys absent entirely on this member — must still decode to null, not throw.
        assertNull(dragapult.nickname)
        assertNull(dragapult.gender)
        assertNull(dragapult.shiny)

        assertEquals(2, envelope.validation.size)
        assertEquals(TeamWarning.Code.Incomplete, envelope.validation[0].code)
        assertEquals(TeamWarning.Code.MoveNotInLearnset, envelope.validation[1].code)
        assertEquals(1, envelope.validation[1].slot)
        assertEquals("moves[2]", envelope.validation[1].field)
    }

    @Test
    fun teamsListDecodesAnEmptyMembersTeam() {
        val list = OakJson.decodeFromString<TeamsListEnvelope>(Fixtures.string("teams_list.json"))
        assertEquals(2, list.teams.size)
        assertTrue(list.teams[1].members.isEmpty())
        assertEquals(Format.Champions, list.teams[1].format)
    }

    // -- TeamMember encode: nullable-required keys explicit, optional cosmetics omitted --

    @Test
    fun encodingEmitsExplicitNullForNullableRequiredKeysAndOmitsAbsentCosmetics() {
        val member = blankTeamMember()
        val element = OakJson.encodeToString(TeamMember.serializer(), member)
        val obj = Json.parseToJsonElement(element).jsonObject

        // Nullable-required: key present with explicit null.
        for (key in listOf("species", "ability", "item", "nature", "tera_type")) {
            assertTrue("expected key \"$key\" present", obj.containsKey(key))
            assertEquals(JsonNull, obj.getValue(key))
        }
        // Optional cosmetics: key absent entirely when null.
        for (key in listOf("nickname", "gender", "shiny")) {
            assertFalse("expected key \"$key\" absent", obj.containsKey(key))
        }
        assertEquals(50, obj.getValue("level").toString().toInt())
    }

    @Test
    fun encodingIncludesCosmeticsWhenPresent() {
        val member = blankTeamMember().copy(
            species = "garchomp",
            nickname = "Chompy",
            gender = TeamMember.Gender.MALE,
            shiny = true,
        )
        val element = OakJson.encodeToString(TeamMember.serializer(), member)
        val obj = Json.parseToJsonElement(element).jsonObject
        assertEquals("\"Chompy\"", obj.getValue("nickname").toString())
        assertEquals("\"M\"", obj.getValue("gender").toString())
        assertEquals("true", obj.getValue("shiny").toString())
        assertEquals("\"garchomp\"", obj.getValue("species").toString())
    }

    @Test
    fun teamMemberRoundTripsThroughEncodeAndDecode() {
        val original = blankTeamMember().copy(species = "great-tusk", teraType = "ground", level = 77)
        val encoded = OakJson.encodeToString(TeamMember.serializer(), original)
        val decoded = OakJson.decodeFromString(TeamMember.serializer(), encoded)
        assertEquals(original, decoded)
    }

    @Test
    fun teamMemberDecodeToleratesAbsentAndExplicitNullTheSame() {
        val withNulls = """{"species":null,"ability":null,"item":null,"moves":[],"nature":null,
            |"evs":{"hp":0,"atk":0,"def":0,"spa":0,"spd":0,"spe":0},
            |"ivs":{"hp":31,"atk":31,"def":31,"spa":31,"spd":31,"spe":31},
            |"tera_type":null,"level":50,"nickname":null,"gender":null,"shiny":null}
        """.trimMargin()
        val withoutOptionals = """{"species":null,"ability":null,"item":null,"moves":[],"nature":null,
            |"evs":{"hp":0,"atk":0,"def":0,"spa":0,"spd":0,"spe":0},
            |"ivs":{"hp":31,"atk":31,"def":31,"spa":31,"spd":31,"spe":31},
            |"tera_type":null,"level":50}
        """.trimMargin()
        val a = OakJson.decodeFromString(TeamMember.serializer(), withNulls)
        val b = OakJson.decodeFromString(TeamMember.serializer(), withoutOptionals)
        assertEquals(a, b)
        assertEquals(blankTeamMember(), a)
    }

    // -- TeamWarning.Code: all 12 known codes + tolerant Unknown --

    @Test
    fun itemMissingDecodesEvenThoughIOSPortIsMissingIt() {
        val json = """{"code":"item_missing","message":"No held item."}"""
        val warning = OakJson.decodeFromString(TeamWarning.serializer(), json)
        assertEquals(TeamWarning.Code.ItemMissing, warning.code)
    }

    @Test
    fun everyKnownWarningCodeRoundTripsFromRaw() {
        val known = mapOf(
            "incomplete" to TeamWarning.Code.Incomplete,
            "ev_total_exceeded" to TeamWarning.Code.EvTotalExceeded,
            "ev_stat_exceeded" to TeamWarning.Code.EvStatExceeded,
            "iv_out_of_range" to TeamWarning.Code.IvOutOfRange,
            "species_illegal" to TeamWarning.Code.SpeciesIllegal,
            "ability_not_for_species" to TeamWarning.Code.AbilityNotForSpecies,
            "item_illegal" to TeamWarning.Code.ItemIllegal,
            "item_missing" to TeamWarning.Code.ItemMissing,
            "move_not_in_learnset" to TeamWarning.Code.MoveNotInLearnset,
            "learnset_unavailable" to TeamWarning.Code.LearnsetUnavailable,
            "duplicate_species" to TeamWarning.Code.DuplicateSpecies,
            "duplicate_item" to TeamWarning.Code.DuplicateItem,
        )
        assertEquals(12, known.size)
        for ((raw, expected) in known) {
            assertEquals(expected, TeamWarning.Code.fromRaw(raw))
            assertEquals(raw, expected.rawValue)
        }
    }

    @Test
    fun unrecognizedWarningCodeDegradesToUnknownWithoutFailingTheParent() {
        val json = """{"code":"future_code_v2","message":"A future warning this build doesn't know."}"""
        val warning = OakJson.decodeFromString(TeamWarning.serializer(), json)
        assertEquals(TeamWarning.Code.Unknown("future_code_v2"), warning.code)
    }

    @Test
    fun hardViolationCodesExcludeItemMissing() {
        assertFalse(TeamWarning.Code.ItemMissing in HARD_VIOLATION_CODES)
        assertTrue(TeamWarning.Code.SpeciesIllegal in HARD_VIOLATION_CODES)
        assertEquals(6, HARD_VIOLATION_CODES.size)
    }

    @Test
    fun learnsetUnavailableDecodesAsNamedCodeNotUnknown() {
        val json =
            """{"code":"learnset_unavailable","message":"Learnset unavailable for this form in this scope; species kept because you named it."}"""
        val warning = OakJson.decodeFromString(TeamWarning.serializer(), json)
        assertEquals(TeamWarning.Code.LearnsetUnavailable, warning.code)
        assertEquals("learnset_unavailable", TeamWarning.Code.LearnsetUnavailable.rawValue)
        assertEquals(
            TeamWarning.Code.LearnsetUnavailable,
            TeamWarning.Code.fromRaw("learnset_unavailable"),
        )
        assertFalse(warning.code is TeamWarning.Code.Unknown)
    }

    @Test
    fun hardViolationCodesExcludeLearnsetUnavailableAndStaySizeSix() {
        assertFalse(TeamWarning.Code.LearnsetUnavailable in HARD_VIOLATION_CODES)
        assertEquals(6, HARD_VIOLATION_CODES.size)
    }
}
