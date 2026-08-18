package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.wire.Abilities
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DefensiveProfile
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.MovepoolGroup
import ai.gowtam.oak.wire.MovepoolMove
import ai.gowtam.oak.wire.OffensiveProfile
import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.blankTeamMember
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 5 lockstep oracle — `diffPokemonProfiles` (CMP-US-2 / CMP-US-3).
 *
 * Clones `web/src/lib/pokemon-compare.ts`. Fails to compile until
 * `PokemonCompare.kt` exists (`features/artifact/PokemonCompare.kt`).
 *
 * Expected API:
 *
 *   fun diffPokemonProfiles(left: PokemonCompareSubject, right: PokemonCompareSubject): PokemonCompareDiff
 *
 *   PokemonCompareSubject(format, profile, set, offensive)
 *   PokemonCompareDiff
 *     left / right — `{ format, displayName }` (cross-scope tags, not unified)
 *     stats — `{ left: BaseStats, right: BaseStats }`
 *     types / abilities / movepool — PokemonCompareSetDiff
 *     speed — `{ leftValue, rightValue, defaultLevel, usedSetLeft, usedSetRight }`
 *     matchups — `{ weakTo, resists, immuneTo, offensiveSuperEffective }` each a set-diff
 *   PokemonCompareSetDiff(onlyLeft, onlyRight, shared)
 *
 * Movepool slugs are flattened across learn-method groups. Ability slugs are
 * the non-null slot1 / slot2 / hidden values. Offensive matchup-diff reads
 * `subject.offensive` (do not invent a type-chart port). Speed uses a stated
 * default level unless `set` is present (CMP-AC-3.2); this suite pins the
 * flags, not computed-stat numbers.
 *
 * Requirement refs: CMP-US-2, CMP-AC-2.1–2.3, CMP-US-3, CMP-AC-3.1–3.4,
 * CMP-BR-2.
 */
class PokemonCompareTest {

    private val garchompStats = BaseStats(hp = 108, atk = 130, def = 95, spa = 80, spd = 85, spe = 102)
    private val dragapultStats = BaseStats(hp = 88, atk = 120, def = 75, spa = 100, spd = 75, spe = 142)

    private fun move(slug: String, type: String) =
        MovepoolMove(slug = slug, displayName = slug, type = type)

    private fun profile(
        name: String,
        types: List<String>,
        abilities: Abilities,
        stats: BaseStats,
        matchups: DefensiveProfile,
        movepool: List<MovepoolGroup>,
    ) = PokemonArtifactData(
        displayName = name,
        nationalDexNumber = 445,
        types = types,
        abilities = abilities,
        baseStats = stats,
        baseStatTotal = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe,
        spriteUrl = "s",
        artworkUrl = "a",
        forms = listOf(name.lowercase()),
        isGen9Native = true,
        matchups = matchups,
        movepool = movepool,
    )

    private fun garchompGen4() = profile(
        name = "Garchomp",
        types = listOf("dragon", "ground"),
        abilities = Abilities(slot1 = "sand-veil"),
        stats = garchompStats,
        matchups = DefensiveProfile(
            weakTo = listOf("ice", "dragon"),
            resists = listOf("rock", "fire", "poison"),
            immuneTo = listOf("electric"),
            quadWeakTo = listOf("ice"),
        ),
        movepool = listOf(
            MovepoolGroup("level-up", listOf(move("outrage", "dragon"), move("dragon-claw", "dragon"))),
            MovepoolGroup("machine", listOf(move("earthquake", "ground"))),
        ),
    )

    private fun garchompGen9() = profile(
        name = "Garchomp",
        types = listOf("dragon", "ground"),
        abilities = Abilities(slot1 = "sand-veil", hidden = "rough-skin"),
        stats = garchompStats,
        matchups = DefensiveProfile(
            weakTo = listOf("ice", "dragon", "fairy"),
            resists = listOf("rock", "fire", "poison"),
            immuneTo = listOf("electric"),
            quadWeakTo = listOf("ice"),
        ),
        movepool = listOf(
            MovepoolGroup("level-up", listOf(move("dragon-claw", "dragon"), move("scaleshot", "dragon"))),
            MovepoolGroup("machine", listOf(move("earthquake", "ground"))),
        ),
    )

    private fun dragapultChampions() = profile(
        name = "Dragapult",
        types = listOf("dragon", "ghost"),
        abilities = Abilities(slot1 = "clear-body", slot2 = "infiltrator", hidden = "cursed-body"),
        stats = dragapultStats,
        matchups = DefensiveProfile(
            weakTo = listOf("ice", "dragon", "ghost", "dark", "fairy"),
            resists = listOf("fire", "water", "grass", "electric", "poison", "bug"),
            immuneTo = listOf("normal", "fighting"),
        ),
        movepool = listOf(
            MovepoolGroup("level-up", listOf(move("dragon-darts", "dragon"))),
            MovepoolGroup("machine", listOf(move("shadow-ball", "ghost"))),
        ),
    )

    @Test
    fun tagsEachColumnWithItsOwnFormatAndDoesNotUnifyScope() {
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.Gen4, garchompGen4(), set = null, offensive = null),
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = null, offensive = null),
        )
        assertEquals(Format.Gen4, diff.left.format)
        assertEquals(Format.ScarletViolet, diff.right.format)
        assertNotEquals(diff.left.format, diff.right.format)
        assertEquals("Garchomp", diff.left.displayName)
        assertEquals("Garchomp", diff.right.displayName)
    }

    @Test
    fun allowsDifferentSpeciesInDifferentScopes() {
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = null, offensive = null),
            PokemonCompareSubject(Format.Champions, dragapultChampions(), set = null, offensive = null),
        )
        assertEquals(Format.ScarletViolet, diff.left.format)
        assertEquals(Format.Champions, diff.right.format)
        assertEquals("Garchomp", diff.left.displayName)
        assertEquals("Dragapult", diff.right.displayName)
    }

    @Test
    fun diffsStatsTypesAndAbilities() {
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.Gen4, garchompGen4(), set = null, offensive = null),
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = null, offensive = null),
        )
        assertEquals(garchompStats, diff.stats.left)
        assertEquals(garchompStats, diff.stats.right)
        assertEquals(setOf("dragon", "ground"), diff.types.shared.toSet())
        assertTrue(diff.types.onlyLeft.isEmpty())
        assertTrue(diff.types.onlyRight.isEmpty())
        assertEquals(setOf("sand-veil"), diff.abilities.shared.toSet())
        assertTrue(diff.abilities.onlyLeft.isEmpty())
        assertEquals(setOf("rough-skin"), diff.abilities.onlyRight.toSet())
    }

    @Test
    fun diffsTypesAcrossSpecies() {
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = null, offensive = null),
            PokemonCompareSubject(Format.Champions, dragapultChampions(), set = null, offensive = null),
        )
        assertEquals(setOf("dragon"), diff.types.shared.toSet())
        assertEquals(setOf("ground"), diff.types.onlyLeft.toSet())
        assertEquals(setOf("ghost"), diff.types.onlyRight.toSet())
        assertEquals(102, diff.stats.left.spe)
        assertEquals(142, diff.stats.right.spe)
    }

    @Test
    fun speedFlagsASuppliedSetAndStatesADefaultLevel() {
        val set = blankTeamMember().copy(
            species = "garchomp",
            ability = "rough-skin",
            nature = "jolly",
            evs = StatSpread(hp = 0, atk = 0, def = 0, spa = 0, spd = 0, spe = 252),
            level = 50,
        )
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.Gen4, garchompGen4(), set = null, offensive = null),
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = set, offensive = null),
        )
        assertFalse(diff.speed.usedSetLeft)
        assertTrue(diff.speed.usedSetRight)
        assertTrue(diff.speed.defaultLevel > 0)
    }

    @Test
    fun movepoolIsASetDiffNotTwoFullDumps() {
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.Gen4, garchompGen4(), set = null, offensive = null),
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = null, offensive = null),
        )
        assertEquals(setOf("outrage"), diff.movepool.onlyLeft.toSet())
        assertEquals(setOf("scaleshot"), diff.movepool.onlyRight.toSet())
        assertEquals(setOf("earthquake", "dragon-claw"), diff.movepool.shared.toSet())
        val leftPool = setOf("outrage", "dragon-claw", "earthquake")
        assertNotEquals(leftPool, diff.movepool.onlyLeft.toSet())
        assertTrue(diff.movepool.onlyLeft.toSet().intersect(diff.movepool.shared.toSet()).isEmpty())
        assertTrue(diff.movepool.onlyRight.toSet().intersect(diff.movepool.shared.toSet()).isEmpty())
        assertTrue(diff.movepool.onlyLeft.toSet().intersect(diff.movepool.onlyRight.toSet()).isEmpty())
    }

    @Test
    fun diffsDefensiveAndOffensiveMatchups() {
        val leftOffensive = OffensiveProfile(
            superEffectiveAgainst = listOf("dragon"),
            notVeryEffectiveAgainst = listOf("steel"),
            noEffectAgainst = listOf("fairy"),
        )
        val rightOffensive = OffensiveProfile(
            superEffectiveAgainst = listOf("dragon", "ghost"),
            notVeryEffectiveAgainst = listOf("steel"),
            noEffectAgainst = emptyList(),
        )
        val diff = diffPokemonProfiles(
            PokemonCompareSubject(Format.Gen4, garchompGen4(), set = null, offensive = leftOffensive),
            PokemonCompareSubject(Format.ScarletViolet, garchompGen9(), set = null, offensive = rightOffensive),
        )
        assertEquals(setOf("ice", "dragon"), diff.matchups.weakTo.shared.toSet())
        assertTrue(diff.matchups.weakTo.onlyLeft.isEmpty())
        assertEquals(setOf("fairy"), diff.matchups.weakTo.onlyRight.toSet())
        assertEquals(setOf("rock", "fire", "poison"), diff.matchups.resists.shared.toSet())
        assertEquals(setOf("electric"), diff.matchups.immuneTo.shared.toSet())
        assertEquals(setOf("dragon"), diff.matchups.offensiveSuperEffective.shared.toSet())
        assertTrue(diff.matchups.offensiveSuperEffective.onlyLeft.isEmpty())
        assertEquals(setOf("ghost"), diff.matchups.offensiveSuperEffective.onlyRight.toSet())
    }
}
