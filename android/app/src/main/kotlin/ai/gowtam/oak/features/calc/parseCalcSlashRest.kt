package ai.gowtam.oak.features.calc

import ai.gowtam.oak.wire.CalcMove
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide
import ai.gowtam.oak.wire.Format

/**
 * Best-effort `ATTACKER [MOVE] vs DEFENDER` parse for `/calc` rest (CALC-AC-3.2).
 * Unresolved tokens still open the overlay (CALC-AC-3.3) — this never errors.
 * Empty rest → `null` so the caller keeps empty sides.
 */
fun parseCalcSlashRest(rest: String, format: Format): CalcScenario? {
    val trimmed = rest.trim()
    if (trimmed.isEmpty()) return null
    val parts = trimmed.split(Regex("\\s+vs\\.?\\s+", RegexOption.IGNORE_CASE), limit = 2)
    val leftTokens = parts[0].trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val defender = parts.getOrNull(1)?.trim()?.split(Regex("\\s+"))?.firstOrNull().orEmpty()
    val attacker = leftTokens.firstOrNull()
    val move = leftTokens.drop(1).joinToString("-").lowercase()
    return CalcScenario(
        format = format,
        attacker = CalcSide(species = attacker?.takeIf { it.isNotEmpty() }),
        defender = CalcSide(species = defender.takeIf { it.isNotEmpty() }),
        move = CalcMove(
            slug = move.takeIf { it.isNotEmpty() },
            name = move.takeIf { it.isNotEmpty() },
        ),
    )
}
