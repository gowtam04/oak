package ai.gowtam.oak.features.teams

import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.blankTeamMember

/** Named-set incoming member for Add-to-team (ADD-BR-2). */
fun incomingMemberFromSpecies(
    species: String,
    ability: String? = null,
    item: String? = null,
    moves: List<String> = emptyList(),
    nature: String? = null,
    teraType: String? = null,
    level: Int? = null,
): TeamMember = blankTeamMember().copy(
    species = slugifySpecies(species),
    ability = ability,
    item = item,
    moves = moves,
    nature = nature,
    teraType = teraType,
    level = level ?: 50,
)

fun incomingMemberFromSubject(subject: Subject): TeamMember =
    incomingMemberFromSpecies(subject.name)

fun incomingMemberFromProfile(profile: PokemonArtifactData, slug: String = profile.displayName): TeamMember =
    incomingMemberFromSpecies(
        species = slug,
        ability = profile.abilities.slot1,
    )

private fun slugifySpecies(raw: String): String =
    raw.trim().lowercase().replace(Regex("\\s+"), "-")
