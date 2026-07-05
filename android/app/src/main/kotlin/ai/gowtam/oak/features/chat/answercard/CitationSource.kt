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

/**
 * Maps a citation `source` wire string to the user-facing text a Sources row shows
 * (TestFlight feedback AH1b0N09K — raw refs like `run_sql/natdex_species` leaked
 * internal table names). Display-layer only: tap behavior stays keyed on
 * [parseCitationSource]'s result, and the wire `source` string itself is unchanged.
 * Mirrors the canonical copy table (`copy-tables.md` §2) exactly; an unrecognized
 * prefix renders the raw source string verbatim.
 */
fun displayCitationSource(source: String): String {
    val slash = source.indexOf('/')
    if (slash <= 0) return source

    val prefix = source.substring(0, slash).trim()
    val rest = source.substring(slash + 1).trim()

    fun titleizedSlug(): String {
        val paren = rest.indexOf('(')
        val slug = if (paren >= 0) rest.substring(0, paren) else rest
        return titleize(slug)
    }

    return when (prefix) {
        "pokemon" -> "Pokémon — ${titleizedSlug()}"
        "move" -> "Move — ${titleizedSlug()}"
        "ability" -> "Ability — ${titleizedSlug()}"
        "item" -> "Item — ${titleizedSlug()}"
        "type" -> "Type — ${titleizedSlug()}"
        "learnset" -> "Movepool — ${titleizedSlug()}"
        "run_sql" -> "Oak's game database"
        "wiki" -> "Community wiki — $rest"
        "get_meta_usage" -> if (rest == "gen9ou") "Competitive usage stats (Gen 9 OU)" else "Competitive usage stats"
        else -> source
    }
}
