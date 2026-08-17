package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.wire.Abilities
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OffensiveProfile
import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.TeamMember

/**
 * Client-side two-subject Pokémon compare (ADR-11).
 *
 * No compare endpoint — the caller fetches both `/api/entity` profiles
 * and this helper diffs them. Cross-scope pairs keep both format tags
 * (CMP-BR-2). Not a chat turn (CMP-BR-4).
 */

/** Stated default when neither subject carries a set (CMP-AC-3.2). */
private const val DEFAULT_SPEED_LEVEL = 50

data class PokemonCompareSubject(
    val format: Format,
    val profile: PokemonArtifactData,
    val set: TeamMember? = null,
    val offensive: OffensiveProfile? = null,
)

data class PokemonCompareSetDiff(
    val onlyLeft: List<String>,
    val onlyRight: List<String>,
    val shared: List<String>,
)

data class PokemonCompareSide(
    val format: Format,
    val displayName: String,
)

data class PokemonCompareStatsPair(
    val left: BaseStats,
    val right: BaseStats,
)

data class PokemonCompareSpeed(
    val leftValue: Int,
    val rightValue: Int,
    val defaultLevel: Int,
    val usedSetLeft: Boolean,
    val usedSetRight: Boolean,
)

data class PokemonCompareMatchups(
    val weakTo: PokemonCompareSetDiff,
    val resists: PokemonCompareSetDiff,
    val immuneTo: PokemonCompareSetDiff,
    val offensiveSuperEffective: PokemonCompareSetDiff,
)

data class PokemonCompareDiff(
    val left: PokemonCompareSide,
    val right: PokemonCompareSide,
    val stats: PokemonCompareStatsPair,
    val types: PokemonCompareSetDiff,
    val abilities: PokemonCompareSetDiff,
    val speed: PokemonCompareSpeed,
    val movepool: PokemonCompareSetDiff,
    val matchups: PokemonCompareMatchups,
)

/** Diff two portable profiles. Does not mutate inputs. */
fun diffPokemonProfiles(
    left: PokemonCompareSubject,
    right: PokemonCompareSubject,
): PokemonCompareDiff {
    val leftAbilities = abilitySlugs(left.profile.abilities)
    val rightAbilities = abilitySlugs(right.profile.abilities)
    val usedSetLeft = left.set != null
    val usedSetRight = right.set != null

    return PokemonCompareDiff(
        left = PokemonCompareSide(format = left.format, displayName = left.profile.displayName),
        right = PokemonCompareSide(format = right.format, displayName = right.profile.displayName),
        stats = PokemonCompareStatsPair(
            left = left.profile.baseStats,
            right = right.profile.baseStats,
        ),
        types = setDiff(left.profile.types, right.profile.types),
        abilities = setDiff(leftAbilities, rightAbilities),
        speed = PokemonCompareSpeed(
            leftValue = left.profile.baseStats.spe,
            rightValue = right.profile.baseStats.spe,
            defaultLevel = DEFAULT_SPEED_LEVEL,
            usedSetLeft = usedSetLeft,
            usedSetRight = usedSetRight,
        ),
        movepool = setDiff(movepoolSlugs(left.profile), movepoolSlugs(right.profile)),
        matchups = PokemonCompareMatchups(
            weakTo = setDiff(left.profile.matchups.weakTo, right.profile.matchups.weakTo),
            resists = setDiff(left.profile.matchups.resists, right.profile.matchups.resists),
            immuneTo = setDiff(left.profile.matchups.immuneTo, right.profile.matchups.immuneTo),
            offensiveSuperEffective = setDiff(
                left.offensive?.superEffectiveAgainst.orEmpty(),
                right.offensive?.superEffectiveAgainst.orEmpty(),
            ),
        ),
    )
}

private fun abilitySlugs(abilities: Abilities): List<String> {
    val slugs = mutableListOf<String>()
    if (abilities.slot1.isNotEmpty()) slugs += abilities.slot1
    abilities.slot2?.takeIf { it.isNotEmpty() }?.let { slugs += it }
    abilities.hidden?.takeIf { it.isNotEmpty() }?.let { slugs += it }
    return slugs
}

private fun movepoolSlugs(profile: PokemonArtifactData): List<String> =
    profile.movepool.flatMap { group -> group.moves.map { it.slug } }

private fun setDiff(left: List<String>, right: List<String>): PokemonCompareSetDiff {
    val leftSet = left.toSet()
    val rightSet = right.toSet()
    val onlyLeft = mutableListOf<String>()
    val onlyRight = mutableListOf<String>()
    val shared = mutableListOf<String>()
    val seen = mutableSetOf<String>()

    for (item in left) {
        if (!seen.add(item)) continue
        if (item in rightSet) shared += item else onlyLeft += item
    }
    for (item in right) {
        if (item in seen || item in leftSet) continue
        seen += item
        onlyRight += item
    }
    return PokemonCompareSetDiff(onlyLeft = onlyLeft, onlyRight = onlyRight, shared = shared)
}
