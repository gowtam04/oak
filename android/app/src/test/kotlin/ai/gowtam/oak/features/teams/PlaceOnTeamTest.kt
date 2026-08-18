package ai.gowtam.oak.features.teams

import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.blankTeamMember
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 5 lockstep oracle — portable `placeSpeciesOnTeam`.
 *
 * Clones the TS helper in `web/src/data/teams/place-on-team.ts` (api-design.md).
 * Fails to compile until `PlaceOnTeam.kt` exists
 * (`features/teams/PlaceOnTeam.kt`).
 *
 * Expected API (web `placeSpeciesOnTeam`):
 *
 *   placeSpeciesOnTeam(members, incoming, target): PlaceOnTeamResult
 *     target = PlaceOnTeamTarget.FirstEmpty | PlaceOnTeamTarget.Replace(index)
 *     result = PlaceOnTeamResult.Ok(members, slotIndex) | PlaceOnTeamResult.Full
 *
 * First empty = lowest index `0..5` whose `species` is null/empty. A members
 * list shorter than 6 treats the next append index as empty. Full (six named
 * species) → [PlaceOnTeamResult.Full] so the client opens the replace sheet.
 * Do not auto-replace. Incoming is already species + copied named fields; the
 * rest is [blankTeamMember] (ADD-BR-2). Pure — does not mutate `members`.
 *
 * Requirement refs: ADD-BR-1, ADD-BR-2, ADD-US-3 / ADD-AC-3.1.
 */
class PlaceOnTeamTest {

    private fun speciesOnly(species: String): TeamMember =
        blankTeamMember().copy(species = species)

    private fun namedIncoming(): TeamMember = blankTeamMember().copy(
        species = "garchomp",
        ability = "rough-skin",
        item = "life-orb",
        moves = listOf("earthquake", "dragon-claw"),
        nature = "jolly",
        evs = StatSpread(hp = 0, atk = 252, def = 0, spa = 0, spd = 4, spe = 252),
        ivs = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
        teraType = "ground",
        level = 50,
    )

    // ADD-BR-1 — first empty 0..5

    @Test
    fun placesIntoTheLowestEmptySlot() {
        val members = listOf(speciesOnly("great-tusk"), blankTeamMember(), speciesOnly("flutter-mane"))
        val incoming = speciesOnly("garchomp")
        val result = placeSpeciesOnTeam(members, incoming, PlaceOnTeamTarget.FirstEmpty)
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(1, ok.slotIndex)
        assertEquals(3, ok.members.size)
        assertEquals(incoming, ok.members[1])
        assertEquals("great-tusk", ok.members[0].species)
        assertEquals("flutter-mane", ok.members[2].species)
    }

    @Test
    fun treatsNullAndEmptySpeciesAsEmpty() {
        val members = listOf(speciesOnly("great-tusk"), blankTeamMember().copy(species = ""))
        val result = placeSpeciesOnTeam(members, speciesOnly("garchomp"), PlaceOnTeamTarget.FirstEmpty)
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(1, ok.slotIndex)
    }

    @Test
    fun appendsWhenEveryExistingMemberHasASpecies() {
        val members = listOf(speciesOnly("great-tusk"), speciesOnly("flutter-mane"))
        val result = placeSpeciesOnTeam(members, speciesOnly("garchomp"), PlaceOnTeamTarget.FirstEmpty)
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(2, ok.slotIndex)
        assertEquals(listOf("great-tusk", "flutter-mane", "garchomp"), ok.members.map { it.species })
    }

    @Test
    fun placesIntoSlotZeroOnAnEmptyTeam() {
        val incoming = speciesOnly("garchomp")
        val result = placeSpeciesOnTeam(emptyList(), incoming, PlaceOnTeamTarget.FirstEmpty)
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(0, ok.slotIndex)
        assertEquals(listOf(incoming), ok.members)
    }

    @Test
    fun fillsTheLastSlotWhenFiveAreOccupied() {
        val members = (0 until 5).map { speciesOnly("slot-$it") }
        val result = placeSpeciesOnTeam(members, speciesOnly("garchomp"), PlaceOnTeamTarget.FirstEmpty)
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(5, ok.slotIndex)
        assertEquals(6, ok.members.size)
        assertEquals("garchomp", ok.members[5].species)
    }

    // ADD-BR-1 / ADD-US-3 — full does not auto-replace

    @Test
    fun returnsFullWhenAllSixSlotsHaveASpecies() {
        val members = (0 until 6).map { speciesOnly("slot-$it") }
        val result = placeSpeciesOnTeam(members, speciesOnly("garchomp"), PlaceOnTeamTarget.FirstEmpty)
        assertEquals(PlaceOnTeamResult.Full, result)
        assertFalse(result is PlaceOnTeamResult.Ok)
    }

    @Test
    fun doesNotMutateTheInputOnFull() {
        val members = (0 until 6).map { speciesOnly("slot-$it") }.toMutableList()
        val snapshot = members.toList()
        placeSpeciesOnTeam(members, speciesOnly("garchomp"), PlaceOnTeamTarget.FirstEmpty)
        assertEquals(snapshot, members)
    }

    // replace index

    @Test
    fun replaceOverwritesTheNamedIndexOnly() {
        val members = (0 until 6).map { speciesOnly("slot-$it") }
        val incoming = speciesOnly("garchomp")
        val result = placeSpeciesOnTeam(members, incoming, PlaceOnTeamTarget.Replace(index = 3))
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(3, ok.slotIndex)
        assertEquals(6, ok.members.size)
        assertEquals(incoming, ok.members[3])
        assertEquals("slot-2", ok.members[2].species)
        assertEquals("slot-4", ok.members[4].species)
        assertFalse(ok.members.map { it.species }.contains("slot-3"))
    }

    // ADD-BR-2 — copy species + named fields only

    @Test
    fun speciesOnlyIncomingKeepsBlankMemberDefaults() {
        val incoming = speciesOnly("garchomp")
        val result = placeSpeciesOnTeam(emptyList(), incoming, PlaceOnTeamTarget.FirstEmpty)
        val placed = (result as PlaceOnTeamResult.Ok).members[0]
        val blank = blankTeamMember()
        assertEquals("garchomp", placed.species)
        assertEquals(blank.ability, placed.ability)
        assertEquals(blank.item, placed.item)
        assertEquals(blank.moves, placed.moves)
        assertEquals(blank.nature, placed.nature)
        assertEquals(blank.evs, placed.evs)
        assertEquals(blank.ivs, placed.ivs)
        assertEquals(blank.teraType, placed.teraType)
        assertEquals(blank.level, placed.level)
        assertTrue(placed.moves.isEmpty())
        assertNull(placed.item)
    }

    @Test
    fun copiesNamedFieldsAndDoesNotInventTheRest() {
        val incoming = namedIncoming()
        val result = placeSpeciesOnTeam(listOf(blankTeamMember()), incoming, PlaceOnTeamTarget.FirstEmpty)
        val ok = result as PlaceOnTeamResult.Ok
        assertEquals(0, ok.slotIndex)
        assertEquals(incoming, ok.members[0])
        assertEquals("rough-skin", ok.members[0].ability)
        assertEquals("life-orb", ok.members[0].item)
        assertEquals(listOf("earthquake", "dragon-claw"), ok.members[0].moves)
        assertEquals("jolly", ok.members[0].nature)
        assertEquals("ground", ok.members[0].teraType)
        assertNull(ok.members[0].nickname)
        assertNull(ok.members[0].gender)
        assertNull(ok.members[0].shiny)
    }

    @Test
    fun isPureTheInputListIsUnchanged() {
        val members = mutableListOf(speciesOnly("great-tusk"))
        val snapshot = members.toList()
        placeSpeciesOnTeam(members, speciesOnly("garchomp"), PlaceOnTeamTarget.FirstEmpty)
        assertEquals(snapshot, members)
    }
}
