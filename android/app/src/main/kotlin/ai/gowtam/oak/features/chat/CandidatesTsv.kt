package ai.gowtam.oak.features.chat

import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.JsonScalar

/**
 * Visible candidate rows → tab-separated values (TBL-US-4).
 *
 * The caller passes the already-visible set (after sort / filter /
 * in-table pin). Hidden remainder is never included (TBL-BR-1).
 * Empty input → empty string (TBL-AC-4.4).
 */

private val STAT_ORDER = listOf("hp", "attack", "defense", "special_attack", "special_defense", "speed")

/** Spreadsheet-paste labels — match the candidate table (Atk/Def/Spe). */
private val STAT_LABELS = mapOf(
    "hp" to "HP",
    "attack" to "Atk",
    "defense" to "Def",
    "special_attack" to "SpA",
    "special_defense" to "SpD",
    "speed" to "Spe",
)

/** Spreadsheet paste of the currently visible candidate table. */
fun candidatesToTsv(visibleRows: List<CandidateRow>): String {
    if (visibleRows.isEmpty()) return ""

    val hasBase = visibleRows.any { it.baseStats != null }
    val keyStatKeys = collectKeyStatKeys(visibleRows)
    val hasKeyStats = !hasBase && keyStatKeys.isNotEmpty()
    val hasAbility = visibleRows.any { !it.ability.isNullOrEmpty() }

    val headers = mutableListOf("Name", "Types")
    if (hasBase) {
        headers += STAT_ORDER.map { STAT_LABELS.getValue(it) }
    } else if (hasKeyStats) {
        headers += keyStatKeys.map { statHeader(it) }
    }
    if (hasAbility) headers += "Ability"

    val body = visibleRows.map { row ->
        val cells = mutableListOf(row.name, row.types.joinToString("/"))
        if (hasBase) {
            val stats = row.baseStats
            for (key in STAT_ORDER) {
                cells += if (stats != null) baseStatValue(stats, key) else ""
            }
        } else if (hasKeyStats) {
            for (key in keyStatKeys) {
                val value = row.keyStats?.get(key)
                cells += if (value == null) "" else scalarText(value)
            }
        }
        if (hasAbility) cells += row.ability.orEmpty()
        cells.joinToString("\t")
    }

    return (listOf(headers.joinToString("\t")) + body).joinToString("\n")
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

private fun statHeader(key: String): String {
    if (key == "hp") return "HP"
    return key.split("-").joinToString(" ") { word ->
        if (word.isEmpty()) word else word[0].uppercaseChar() + word.substring(1)
    }
}

private fun baseStatValue(stats: BaseStats, key: String): String = when (key) {
    "hp" -> stats.hp.toString()
    "attack" -> stats.atk.toString()
    "defense" -> stats.def.toString()
    "special_attack" -> stats.spa.toString()
    "special_defense" -> stats.spd.toString()
    "speed" -> stats.spe.toString()
    else -> ""
}

private fun scalarText(value: JsonScalar): String = when (value) {
    is JsonScalar.Str -> value.v
    is JsonScalar.IntVal -> value.v.toString()
    is JsonScalar.DoubleVal -> value.v.toString()
    is JsonScalar.BoolVal -> value.v.toString()
    JsonScalar.Null -> ""
}
