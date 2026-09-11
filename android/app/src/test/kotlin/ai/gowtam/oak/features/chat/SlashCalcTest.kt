package ai.gowtam.oak.features.chat

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Sequential `/calc` slash slots — lockstep oracle (SD-US-10). */
class SlashCalcTest {
    private val garchomp = DexNameRow(DexNameKind.Pokemon, "garchomp", "Garchomp")
    private val gholdengo = DexNameRow(DexNameKind.Pokemon, "gholdengo", "Gholdengo")
    private val ironBundle = DexNameRow(DexNameKind.Pokemon, "ironbundle", "Iron Bundle")
    private val flutterMane = DexNameRow(DexNameKind.Pokemon, "fluttermane", "Flutter Mane")
    private val earthquake = DexNameRow(DexNameKind.Move, "earthquake", "Earthquake")
    private val playRough = DexNameRow(DexNameKind.Move, "playrough", "Play Rough")
    private val roster = listOf(garchomp, gholdengo, ironBundle, flutterMane, earthquake, playRough)

    private suspend fun search(kind: DexNameKind, query: String): List<DexNameRow> {
        val needle = query.lowercase()
        return roster.filter {
            it.kind == kind &&
                (it.displayName.lowercase() == needle || it.slug.lowercase() == needle)
        }
    }

    @Test
    fun `exports slot captions skip-move and empty lines`() {
        assertEquals("Pick attacker · or Send to open empty", CALC_CAPTION_ATTACKER)
        assertEquals("Pick move · or Send", CALC_CAPTION_MOVE)
        assertEquals("vs …", CALC_SKIP_MOVE)
        assertEquals("No Pokémon matches", EMPTY_CALC_SPECIES)
        assertTrue(showCalcSkipMove(CalcSlot.Move, ""))
        assertEquals(false, showCalcSkipMove(CalcSlot.Move, "earth"))
    }

    @Test
    fun `splitCalcRest handles vs versus and trailing vs`() {
        assertEquals(
            CalcRestSplit("garchomp earthquake", "gholdengo", true),
            splitCalcRest("garchomp earthquake vs gholdengo"),
        )
        assertEquals(
            CalcRestSplit("garchomp earthquake", "gholdengo", true),
            splitCalcRest("garchomp earthquake vs. gholdengo"),
        )
        assertEquals(
            CalcRestSplit("garchomp", "gholdengo", true),
            splitCalcRest("garchomp versus gholdengo"),
        )
        assertEquals(CalcRestSplit("Garchomp", "", true), splitCalcRest("Garchomp vs"))
        assertEquals(
            CalcRestSplit("garchomp earthquake", null, false),
            splitCalcRest("garchomp earthquake"),
        )
    }

    @Test
    fun `insert helpers build slot strings`() {
        assertEquals("/calc Garchomp ", insertCalcAttacker("Garchomp"))
        assertEquals("/calc Garchomp Earthquake vs ", insertCalcMove("Garchomp", "Earthquake"))
        assertEquals("/calc Garchomp vs ", insertCalcSkipMove("Garchomp"))
        assertEquals(
            "/calc Garchomp Earthquake vs Gholdengo",
            insertCalcDefender("Garchomp", "Earthquake", "Gholdengo"),
        )
        assertEquals(
            "/calc Garchomp vs Gholdengo",
            insertCalcDefender("Garchomp", null, "Gholdengo"),
        )
    }

    @Test
    fun `picker state walks attacker move defender slots`() {
        assertEquals(
            CalcPickerState(CalcSlot.Attacker, "", CalcBind(), false),
            calcPickerState("", null),
        )
        val bind = CalcBind(attacker = garchomp)
        assertEquals(
            CalcPickerState(CalcSlot.Move, "", bind, false),
            calcPickerState("Garchomp", bind),
        )
        assertEquals(
            CalcPickerState(CalcSlot.Move, "Earth", bind, false),
            calcPickerState("Garchomp Earth", bind),
        )
        assertEquals(
            CalcPickerState(CalcSlot.Defender, "Ghol", bind, true),
            calcPickerState("Garchomp vs Ghol", bind),
        )
    }

    @Test
    fun `resolve uses bind slugs and longest prefix for typed names`() = runBlocking {
        val bound = resolveCalcScenario(
            rest = "Garchomp Earthquake vs Gholdengo",
            bind = CalcBind(garchomp, earthquake, gholdengo),
            search = ::search,
        )
        assertEquals("garchomp", bound.attacker.species)
        assertEquals("earthquake", bound.move.slug)
        assertEquals("gholdengo", bound.defender.species)

        val multi = resolveCalcScenario(
            rest = "iron bundle play rough vs flutter mane",
            bind = null,
            search = ::search,
        )
        assertEquals("ironbundle", multi.attacker.species)
        assertEquals("playrough", multi.move.slug)
        assertEquals("fluttermane", multi.defender.species)

        val unresolved = resolveCalcScenario(
            rest = "not-a-species vs also-fake",
            bind = null,
            search = ::search,
        )
        assertNull(unresolved.attacker.species)
        assertNull(unresolved.move.slug)
        assertNull(unresolved.defender.species)
    }
}
