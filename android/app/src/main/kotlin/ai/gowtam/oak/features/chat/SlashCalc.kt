package ai.gowtam.oak.features.chat

import ai.gowtam.oak.wire.CalcMove
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.CalcSide
import ai.gowtam.oak.wire.Format

/**
 * Sequential `/calc` slash slots (SD-US-10). Clone of
 * `web/src/lib/chat/slash-calc.ts`.
 */
data class CalcBind(
    val attacker: DexNameRow? = null,
    val move: DexNameRow? = null,
    val defender: DexNameRow? = null,
) {
    fun isEmpty(): Boolean = attacker == null && move == null && defender == null
}

enum class CalcSlot { Attacker, Move, Defender }

data class CalcPickerState(
    val slot: CalcSlot,
    val query: String,
    val bind: CalcBind,
    val vsPresent: Boolean,
)

data class CalcRestSplit(
    val left: String,
    val right: String?,
    val vsPresent: Boolean,
)

const val CALC_CAPTION_ATTACKER = "Pick attacker · or Send to open empty"
const val CALC_CAPTION_MOVE = "Pick move · or Send"
const val CALC_CAPTION_DEFENDER = "Pick defender · or Send"
const val CALC_SKIP_MOVE = "vs …"
const val CALC_SKIP_MOVE_HINT = "Skip move"
const val EMPTY_CALC_SPECIES = "No Pokémon matches"
const val EMPTY_CALC_MOVE = "No move matches"

private val VS_RE = Regex("""\s+(?:vs\.?|versus)(?:\s+|$)""", RegexOption.IGNORE_CASE)

fun emptyCalcScenario(): CalcScenario = CalcScenario(
    format = Format.Champions,
    attacker = CalcSide(),
    defender = CalcSide(),
    move = CalcMove(),
)

fun calcPickerCaption(slot: CalcSlot): String = when (slot) {
    CalcSlot.Attacker -> CALC_CAPTION_ATTACKER
    CalcSlot.Move -> CALC_CAPTION_MOVE
    CalcSlot.Defender -> CALC_CAPTION_DEFENDER
}

fun showCalcSkipMove(slot: CalcSlot, query: String): Boolean =
    slot == CalcSlot.Move && query.trim().isEmpty()

fun splitCalcRest(rest: String): CalcRestSplit {
    val trimmed = rest.trim()
    if (trimmed.isEmpty()) return CalcRestSplit("", null, false)
    val match = VS_RE.find(trimmed) ?: return CalcRestSplit(trimmed, null, false)
    val left = trimmed.substring(0, match.range.first).trim()
    val right = trimmed.substring(match.range.last + 1).trim()
    return CalcRestSplit(left, right, true)
}

fun insertCalcAttacker(displayName: String): String = "/calc $displayName "
fun insertCalcMove(attacker: String, move: String): String = "/calc $attacker $move vs "
fun insertCalcSkipMove(attacker: String): String = "/calc $attacker vs "
fun insertCalcDefender(attacker: String, move: String?, defender: String): String =
    if (!move.isNullOrEmpty()) "/calc $attacker $move vs $defender"
    else "/calc $attacker vs $defender"

fun calcPickerState(rest: String, bind: CalcBind?): CalcPickerState {
    val trimmed = rest.trim()
    val stripped = stripCalcBind(trimmed, bind)
    val split = splitCalcRest(trimmed)
    val attacker = stripped.attacker
    if (attacker == null) {
        return CalcPickerState(
            slot = CalcSlot.Attacker,
            query = if (split.vsPresent) split.left else trimmed,
            bind = CalcBind(),
            vsPresent = split.vsPresent,
        )
    }
    if (!split.vsPresent) {
        return CalcPickerState(
            slot = CalcSlot.Move,
            query = remainderAfterName(attacker.displayName, split.left),
            bind = stripped,
            vsPresent = false,
        )
    }
    return CalcPickerState(
        slot = CalcSlot.Defender,
        query = split.right.orEmpty(),
        bind = stripped,
        vsPresent = true,
    )
}

fun scenarioFromCalcBind(bind: CalcBind?): CalcScenario =
    scenarioFromRows(bind?.attacker, bind?.move, bind?.defender)

suspend fun resolveCalcScenario(
    rest: String,
    bind: CalcBind?,
    search: suspend (DexNameKind, String) -> List<DexNameRow>,
): CalcScenario {
    val trimmed = rest.trim()
    if (trimmed.isEmpty()) return emptyCalcScenario()
    val state = calcPickerState(trimmed, bind)
    val split = splitCalcRest(trimmed)
    var attacker = state.bind.attacker
    var move = state.bind.move
    var defender = state.bind.defender

    if (attacker == null) {
        val hit = longestPrefixMatch(split.left, DexNameKind.Pokemon, search)
        if (hit != null) {
            attacker = hit.row
            val leftover = split.left.substring(hit.consumed.length).trim()
            if (move == null && leftover.isNotEmpty()) {
                move = longestPrefixMatch(leftover, DexNameKind.Move, search)?.row
            }
        }
    } else if (move == null) {
        val leftover = remainderAfterName(attacker.displayName, split.left)
        if (leftover.isNotEmpty()) {
            move = longestPrefixMatch(leftover, DexNameKind.Move, search)?.row
        }
    }

    if (defender == null && split.vsPresent && !split.right.isNullOrEmpty()) {
        defender = longestPrefixMatch(split.right, DexNameKind.Pokemon, search)?.row
    }

    return scenarioFromRows(attacker, move, defender)
}

private fun scenarioFromRows(
    attacker: DexNameRow?,
    move: DexNameRow?,
    defender: DexNameRow?,
): CalcScenario = CalcScenario(
    format = Format.Champions,
    attacker = CalcSide(species = attacker?.slug),
    defender = CalcSide(species = defender?.slug),
    move = CalcMove(slug = move?.slug, name = move?.displayName),
)

private fun stripCalcBind(rest: String, bind: CalcBind?): CalcBind {
    val attacker = bind?.attacker ?: return CalcBind()
    if (!namePrefixesRest(attacker.displayName, rest)) return CalcBind()
    val split = splitCalcRest(rest)
    val afterAttacker = remainderAfterName(attacker.displayName, split.left)
    var move = bind.move
    if (move != null) {
        if (afterAttacker.isEmpty() || !namePrefixesRest(move.displayName, afterAttacker)) {
            move = null
        }
    }
    var defender = bind.defender
    if (!split.vsPresent || split.right.isNullOrEmpty() || defender == null ||
        !namePrefixesRest(defender.displayName, split.right)
    ) {
        defender = null
    }
    return CalcBind(attacker = attacker, move = move, defender = defender)
}

private fun namePrefixesRest(name: String, rest: String): Boolean {
    val n = name.trim()
    val r = rest.trimStart()
    if (n.isEmpty() || !r.startsWith(n, ignoreCase = true)) return false
    val after = r.substring(n.length)
    return after.isEmpty() || after.first().isWhitespace()
}

private fun remainderAfterName(name: String, rest: String): String {
    val r = rest.trimStart()
    if (!namePrefixesRest(name, r)) return r.trim()
    return r.substring(name.length).trimStart()
}

private fun exactRow(rows: List<DexNameRow>, query: String): DexNameRow? {
    val needle = query.lowercase()
    return rows.firstOrNull { it.displayName.lowercase() == needle }
        ?: rows.firstOrNull { it.slug.lowercase() == needle }
}

private data class PrefixHit(val row: DexNameRow, val consumed: String)

private suspend fun longestPrefixMatch(
    text: String,
    kind: DexNameKind,
    search: suspend (DexNameKind, String) -> List<DexNameRow>,
): PrefixHit? {
    val tokens = text.split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (tokens.isEmpty()) return null
    for (n in tokens.size downTo 1) {
        val candidate = tokens.subList(0, n).joinToString(" ")
        val row = exactRow(search(kind, candidate), candidate) ?: continue
        return PrefixHit(row, candidate)
    }
    return null
}
