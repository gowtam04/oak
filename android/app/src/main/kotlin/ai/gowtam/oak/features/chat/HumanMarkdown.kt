package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.chat.answercard.uncertaintyFlagLabel
import ai.gowtam.oak.ui.MarkdownBlocks
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.JsonScalar
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.titleizeTeamSlug

/**
 * Distill a finalized [OakAnswer] into human-readable markdown for Discord /
 * Notes / Reddit ("Copy as human text" — COPY-US-1 / ADR-9).
 *
 * Pure: no clipboard, no mutation. Distinct from [oakAnswerAgentMarkdown].
 * Lockstep with `web/src/lib/oak-answer-human-md.ts`.
 */
fun oakAnswerHumanMarkdown(answer: OakAnswer): String {
    val sections = mutableListOf<String>()
    val prose = MarkdownBlocks.stripHtmlComments(answer.answerMarkdown).trim()
    if (prose.isNotEmpty()) sections += prose
    formatCandidateTable(answer)?.let { sections += it }
    formatCaveats(answer)?.let { sections += it }
    formatProposedTeam(answer)?.let { sections += it }
    return sections.joinToString("\n\n")
}

private val STAT_ORDER = listOf("hp", "attack", "defense", "special_attack", "special_defense", "speed")
private val STAT_LABELS = mapOf(
    "hp" to "HP",
    "attack" to "Attack",
    "defense" to "Defense",
    "special_attack" to "SpA",
    "special_defense" to "SpD",
    "speed" to "Speed",
)

private fun formatCandidateTable(answer: OakAnswer): String? {
    val shown = answer.candidates?.shown ?: return null
    if (shown.isEmpty()) return null

    val hasBase = shown.any { it.baseStats != null }
    val keyStatKeys = collectKeyStatKeys(shown)
    val hasKeyStats = !hasBase && keyStatKeys.isNotEmpty()

    val headers = mutableListOf("Name", "Types")
    if (hasBase) {
        headers += STAT_ORDER.map { STAT_LABELS.getValue(it) }
    } else if (hasKeyStats) {
        headers += keyStatKeys.map { statHeader(it) }
    }

    val body = shown.map { row ->
        val cells = mutableListOf(row.name, row.types.joinToString("/"))
        if (hasBase) {
            val stats = row.baseStats
            cells += STAT_ORDER.map { key ->
                if (stats == null) "" else baseStatValue(stats, key)
            }
        } else if (hasKeyStats) {
            cells += keyStatKeys.map { key ->
                row.keyStats?.get(key)?.let { scalarText(it) } ?: ""
            }
        }
        cells
    }
    return toGfm(headers, body)
}

private fun baseStatValue(stats: ai.gowtam.oak.wire.BaseStats, key: String): String = when (key) {
    "hp" -> stats.hp.toString()
    "attack" -> stats.atk.toString()
    "defense" -> stats.def.toString()
    "special_attack" -> stats.spa.toString()
    "special_defense" -> stats.spd.toString()
    "speed" -> stats.spe.toString()
    else -> ""
}

private fun collectKeyStatKeys(rows: List<CandidateRow>): List<String> {
    val keys = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    for (row in rows) {
        val stats = row.keyStats ?: continue
        for (key in stats.keys) {
            if (seen.add(key)) keys += key
        }
    }
    return keys
}

private fun formatCaveats(answer: OakAnswer): String? {
    val lines = mutableListOf<String>()
    val basis = answer.generationBasis
    if (basis.fallback) {
        lines += basis.note
            ?: "Based on ${basis.generation} data — this Pokémon is not in Gen 9."
    }
    for (flag in answer.uncertaintyFlags.orEmpty()) {
        lines += uncertaintyFlagLabel(flag)
    }
    if (lines.isEmpty()) return null
    return lines.joinToString("\n")
}

/** Showdown paste of a proposed roster — the roster only, not the team name (PASTE-US-1). */
fun proposedTeamToShowdownPaste(team: ProposedTeam): String =
    serializeShowdown(team.members.mapNotNull { memberToSet(it) })

private fun formatProposedTeam(answer: OakAnswer): String? {
    val team = answer.proposedTeam ?: return null
    val paste = proposedTeamToShowdownPaste(team)
    return when {
        team.name.isBlank() && paste.isBlank() -> null
        paste.isBlank() -> team.name
        team.name.isBlank() -> paste
        else -> "${team.name}\n\n$paste"
    }
}

private data class ShowdownSet(
    val name: String,
    val species: String,
    val item: String,
    val ability: String,
    val moves: List<String>,
    val nature: String,
    val gender: String,
    val evs: StatSpread,
    val ivs: StatSpread,
    val level: Int,
    val teraType: String? = null,
    val shiny: Boolean = false,
)

private fun memberToSet(member: TeamMember): ShowdownSet? {
    val species = member.species ?: return null
    return ShowdownSet(
        name = member.nickname.orEmpty(),
        species = titleizeTeamSlug(species),
        item = member.item?.let { titleizeTeamSlug(it) }.orEmpty(),
        ability = member.ability?.let { titleizeTeamSlug(it) }.orEmpty(),
        moves = member.moves.map { titleizeTeamSlug(it) },
        nature = member.nature?.let { titleizeTeamSlug(it) }.orEmpty(),
        gender = when (member.gender) {
            TeamMember.Gender.MALE -> "M"
            TeamMember.Gender.FEMALE -> "F"
            TeamMember.Gender.NEUTRAL -> "N"
            null -> ""
        },
        evs = member.evs,
        ivs = member.ivs,
        level = member.level,
        teraType = member.teraType?.let { titleizeTeamSlug(it) },
        shiny = member.shiny == true,
    )
}

/**
 * Compact Showdown paste. Matches `@pkmn` export enough for COPY-AC-1.1:
 * species, item, ability, level (when not 100), nature, non-zero EVs, moves.
 * Default 31 IVs and 0 EVs are omitted.
 */
private fun serializeShowdown(sets: List<ShowdownSet>): String {
    if (sets.isEmpty()) return ""
    return sets.joinToString("\n\n") { set ->
        buildString {
            val headerName = set.name.ifBlank { set.species }
            if (set.item.isNotBlank()) {
                appendLine("$headerName @ ${set.item}")
            } else {
                appendLine(headerName)
            }
            if (set.ability.isNotBlank()) appendLine("Ability: ${set.ability}")
            if (set.level != 100) appendLine("Level: ${set.level}")
            set.teraType?.takeIf { it.isNotBlank() }?.let { appendLine("Tera Type: $it") }
            if (set.shiny) appendLine("Shiny: Yes")
            evLine(set.evs)?.let { appendLine(it) }
            if (set.nature.isNotBlank()) appendLine("${set.nature} Nature")
            for (move in set.moves) {
                if (move.isNotBlank()) appendLine("- $move")
            }
        }.trimEnd()
    }
}

private fun evLine(evs: StatSpread): String? {
    val parts = buildList {
        if (evs.hp != 0) add("${evs.hp} HP")
        if (evs.atk != 0) add("${evs.atk} Atk")
        if (evs.def != 0) add("${evs.def} Def")
        if (evs.spa != 0) add("${evs.spa} SpA")
        if (evs.spd != 0) add("${evs.spd} SpD")
        if (evs.spe != 0) add("${evs.spe} Spe")
    }
    if (parts.isEmpty()) return null
    return "EVs: ${parts.joinToString(" / ")}"
}

private fun toGfm(headers: List<String>, rows: List<List<String>>): String {
    val head = "| ${headers.joinToString(" | ")} |"
    val sep = "| ${headers.joinToString(" | ") { "---" }} |"
    val body = rows.joinToString("\n") { row -> "| ${row.joinToString(" | ")} |" }
    return "$head\n$sep\n$body"
}

private fun statHeader(key: String): String = if (key == "hp") "HP" else titleizeTeamSlug(key)

private fun scalarText(value: JsonScalar): String = when (value) {
    is JsonScalar.Str -> value.v
    is JsonScalar.IntVal -> value.v.toString()
    is JsonScalar.DoubleVal -> value.v.toString()
    is JsonScalar.BoolVal -> value.v.toString()
    JsonScalar.Null -> ""
}
