package ai.gowtam.oak.features.calc

import ai.gowtam.oak.wire.CalcMove
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.JsonScalar

/** Prefill a calculator scenario from a worked `damage_calc` block (CALC-AC-2.1). */
fun calcScenarioFromDamage(damage: DamageCalc, format: Format): CalcScenario {
    fun text(vararg keys: String): String? {
        for (key in keys) {
            when (val value = damage.assumptions[key] ?: damage.result[key]) {
                is JsonScalar.Str -> if (value.v.isNotBlank()) return value.v
                else -> Unit
            }
        }
        return null
    }
    val attacker = text("attacker", "attacker_species", "user")
    val defender = text("defender", "defender_species", "target")
    val move = text("move", "move_slug", "move_name")
    val slug = move?.trim()?.lowercase()?.replace(Regex("\\s+"), "-")
    return CalcScenario(
        format = format,
        attacker = CalcSide(species = attacker),
        defender = CalcSide(species = defender),
        move = CalcMove(slug = slug, name = move),
    )
}
