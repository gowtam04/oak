package ai.gowtam.oak.features.calc

import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide

/**
 * Deterministic "Explain this calc" chat message (CALC-AC-8.3).
 *
 * Portable: no I/O. The overlay/screen POSTs this string as a normal user
 * message; it is not JSON and not an OakAnswer.
 */
fun explainCalcPrompt(scenario: CalcScenario, result: CalcResult): String {
    val weather = scenario.field?.weather ?: "none"
    return listOf(
        "Explain this damage estimate (do not re-roll unless needed).",
        "Format: ${scenario.format.rawValue}",
        "Attacker: ${formatSide(scenario.attacker)}",
        "Defender: ${formatSide(scenario.defender)}",
        "Move: ${formatMove(scenario)}",
        "Field: $weather, screens ${formatScreens(scenario)}",
        "Estimate: ${formatEstimate(result)}",
        "Unsupported: ${formatUnsupported(result)}",
    ).joinToString("\n")
}

private fun dash(value: String?): String = if (value.isNullOrEmpty()) "—" else value

private fun dash(value: Int?): String = value?.toString() ?: "—"

private fun formatEvs(evs: Map<String, Int>?): String {
    if (evs == null) return "—"
    val parts = evs.entries.map { "${it.value} ${it.key}" }
    return if (parts.isNotEmpty()) parts.joinToString(" / ") else "—"
}

private fun formatSide(side: CalcSide): String =
    "${dash(side.species)} @ ${dash(side.item)} / ${dash(side.ability)} / " +
        "${dash(side.nature)} / ${formatEvs(side.evs)} / L${dash(side.level)} / " +
        "Tera ${dash(side.tera)}"

private fun formatScreens(scenario: CalcScenario): String {
    val screens = buildList {
        if (scenario.field?.reflect == true) add("Reflect")
        if (scenario.field?.lightScreen == true) add("Light Screen")
    }
    return if (screens.isEmpty()) "none" else screens.joinToString(", ")
}

private fun formatMove(scenario: CalcScenario): String =
    scenario.move.name?.trim()?.takeIf { it.isNotEmpty() }
        ?: scenario.move.slug?.trim()?.takeIf { it.isNotEmpty() }
        ?: "—"

private fun formatUnsupported(result: CalcResult): String {
    if (result !is CalcResult.Ok) return "—"
    val list = result.applied.unsupported
    return if (list.isNotEmpty()) list.joinToString(", ") else "none"
}

private fun formatEstimate(result: CalcResult): String {
    if (result !is CalcResult.Ok) return "unavailable"
    val estimate = result.estimate
    return "${estimate.minDamage}–${estimate.maxDamage} " +
        "(${estimate.percentMin}–${estimate.percentMax}%); ${estimate.ko.hits}HKO"
}
