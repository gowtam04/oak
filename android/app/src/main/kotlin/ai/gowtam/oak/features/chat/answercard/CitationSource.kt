package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.wire.EntityKind

/**
 * Parse a `OakAnswer` citation `source` into an openable entity (tappable Sources —
 * clicking a citation opens that resource as an entity artifact).
 *
 * `source` is `"<kind>/<slug>"`, e.g. `"ability/armor-tail"`, `"pokemon/garchomp"`,
 * `"type/ground"`, `"learnset/will-o-wisp (gen-9)"`. `learnset` maps to `move` and a
 * trailing parenthetical qualifier is stripped. An unknown prefix returns `null` (the
 * citation renders as plain, non-clickable text — no crash). Mirrors web's
 * `web/src/components/artifact/parse-citation.ts` exactly, including its case matrix.
 */
fun parseCitationSource(source: String): Pair<EntityKind, String>? {
    val slash = source.indexOf('/')
    if (slash <= 0) return null

    var prefix = source.substring(0, slash).trim()
    if (prefix == "learnset") prefix = "move"
    val kind = when (prefix) {
        "pokemon" -> EntityKind.POKEMON
        "move" -> EntityKind.MOVE
        "ability" -> EntityKind.ABILITY
        "item" -> EntityKind.ITEM
        "type" -> EntityKind.TYPE
        else -> return null
    }

    // Strip a trailing qualifier like " (gen-9)".
    val paren = source.indexOf('(', slash)
    val rawSlug = (if (paren >= 0) source.substring(slash + 1, paren) else source.substring(slash + 1)).trim()
    if (rawSlug.isEmpty()) return null

    return kind to rawSlug
}
