package ai.gowtam.oak.wire

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Parity vectors for the four ported pure functions ([applyTeamPatch],
 * [blankTeamMember], [describeTeamPatch], [titleizeTeamSlug]) — the SAME cases
 * web's `schemas.test.ts` pins and iOS's `TeamsAssistantWireTests.swift`
 * mirrors, so the client-applied result equals the server-validated one on
 * every platform.
 */
class ApplyTeamPatchParityTest {

    /** A blank member tagged with [species] so slot identity is easy to assert. */
    private fun member(species: String): TeamMember = blankTeamMember().copy(species = species)

    @Test
    fun replacesOneSlotWithAFullReplacement() {
        val members = listOf(member("a"), member("b"))
        val patch = TeamPatch(name = null, slots = listOf(TeamPatchSlot(1, member("b2"))))
        val result = applyTeamPatch(members, patch)
        assertEquals(listOf("a", "b2"), result.map { it.species })
    }

    @Test
    fun removesASlotViaNullCompactingAndPreservingOrder() {
        val members = listOf(member("a"), member("b"), member("c"))
        val patch = TeamPatch(name = null, slots = listOf(TeamPatchSlot(1, null)))
        val result = applyTeamPatch(members, patch)
        assertEquals(listOf("a", "c"), result.map { it.species })
    }

    @Test
    fun padsGapsWhenTargetingASlotPastTheDraftLength() {
        val members = listOf(member("a"))
        val patch = TeamPatch(name = null, slots = listOf(TeamPatchSlot(2, member("c"))))
        val result = applyTeamPatch(members, patch)
        assertEquals(3, result.size)
        assertEquals("a", result[0].species)
        assertEquals(blankTeamMember(), result[1])
        assertEquals("c", result[2].species)
    }

    @Test
    fun resolvesEverySlotIndexAgainstThePrePatchDraft() {
        // slot 1 replace + slot 0 remove in the SAME patch: both indices refer to
        // the original [a, b, c] — the removal must not shift the replace's target.
        val members = listOf(member("a"), member("b"), member("c"))
        val patch = TeamPatch(
            name = null,
            slots = listOf(
                TeamPatchSlot(1, member("b2")),
                TeamPatchSlot(0, null),
            ),
        )
        val result = applyTeamPatch(members, patch)
        assertEquals(listOf("b2", "c"), result.map { it.species })
    }

    @Test
    fun capsTheResultAtSixMembers() {
        val members = listOf("a", "b", "c", "d", "e", "f").map(::member)
        // slot 6 bypasses the Zod 0..5 bound — exercise the defensive take(6).
        val patch = TeamPatch(name = null, slots = listOf(TeamPatchSlot(6, member("g"))))
        val result = applyTeamPatch(members, patch)
        assertEquals(6, result.size)
        assertEquals(listOf("a", "b", "c", "d", "e", "f"), result.map { it.species })
    }

    @Test
    fun appliesARenameFromThePatch() {
        val patch = TeamPatch(name = "Sun Squad", slots = emptyList())
        assertEquals("Sun Squad", patch.name)
        // The rename is applied by the editor bridge, not applyTeamPatch (members-only);
        // an empty-slots patch leaves members untouched.
        val members = listOf(member("a"), member("b"))
        assertEquals(listOf("a", "b"), applyTeamPatch(members, patch).map { it.species })
    }

    @Test
    fun describesRenameAndSlotEdits() {
        val patch = TeamPatch(
            name = "Sun Squad",
            slots = listOf(
                TeamPatchSlot(2, member("great-tusk")),
                TeamPatchSlot(4, null),
            ),
        )
        val lines = describeTeamPatch(patch)
        assertEquals(3, lines.size)
        assertEquals("Rename team to “Sun Squad”", lines[0])
        assertEquals(true, lines[1].startsWith("Slot 3: Great Tusk"))
        assertEquals("Slot 5: remove", lines[2])
    }

    @Test
    fun titleizesSlugsWithHyphensAndSpaces() {
        assertEquals("Great Tusk", titleizeTeamSlug("great-tusk"))
        assertEquals("Booster Energy", titleizeTeamSlug("booster-energy"))
    }
}
