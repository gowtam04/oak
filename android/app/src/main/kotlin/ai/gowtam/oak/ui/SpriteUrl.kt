package ai.gowtam.oak.ui

import ai.gowtam.oak.networking.BaseUrl
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.SearchMatch
import java.text.Normalizer

/**
 * Species-slug → first-party Oak media sprite URL.
 *
 * Ports `web/src/lib/sprites.ts` (`toID`, `showdownSpriteId`,
 * `guessShowdownSpriteId`, `guessOakMediaSpriteUrl`) so Dex list thumbs can
 * render when `GET /api/search` omits `sprite_url` — the same fallback web's
 * `EntityPicker` already uses. Server `sprite_url` still wins when present.
 *
 * Forme handling is NOT naive `toID(slug)`: Showdown keeps a hyphen between
 * base and forme but strips hyphens *inside* the forme (`charizard-mega-x` →
 * `charizard-megax`; `tapu-koko` has no forme suffix so the whole slug is one
 * token → `tapukoko`).
 */
object SpriteUrl {
    /**
     * Every forme suffix a species slug in Oak's pokedex can carry.
     *
     * Copied from `web/src/lib/sprites.ts` `FORME_SUFFIXES`. Refresh together
     * with that table (the generator script lives in `sprites.test.ts`) if a
     * future ingest adds a species with an uncovered forme. Sorted longest-first
     * so a multi-token suffix wins over one it contains (`galar-zen` before
     * `zen`, `mega-x` before `mega`).
     */
    private val formeSuffixes: List<String> = listOf(
        "alola-totem", "busted-totem", "cornerstone-tera", "hearthflame-tera",
        "wellspring-tera", "low-key-gmax", "rapid-strike-gmax", "original-mega",
        "curly-mega", "droopy-mega", "stretchy-mega", "f-mega", "m-mega",
        "blue-striped", "white-striped", "high-plains", "icy-snow",
        "three-segment", "spiky-eared", "rock-star", "pop-star", "rainbow-swirl",
        "ruby-swirl", "caramel-swirl", "matcha-cream", "mint-cream",
        "lemon-cream", "ruby-cream", "galar-zen", "alola",
        "antique", "archipelago", "artisan", "ash", "attack", "autumn", "belle",
        "black", "blade", "bloodmoon", "blue", "bond", "bug", "burn", "busted",
        "chill", "complete", "continental", "cosplay", "crowned", "dada", "dark",
        "dawn-wings", "defense", "douse", "dragon", "droopy", "dusk-mane",
        "dusk", "east", "electric", "elegant", "eternal", "eternamax", "f",
        "fairy", "fan", "fancy", "fighting", "fire", "flying", "four", "frost",
        "galar", "garden", "ghost", "gmax", "gorging", "grass", "green",
        "ground", "gulping", "hangry", "hearthflame", "heat", "hero", "hisui",
        "hoenn", "ice", "indigo", "jungle", "kalos", "large", "libre",
        "low-key", "marine", "masterpiece", "mega-x", "mega-y", "mega-z",
        "mega", "meteor", "midnight", "modern", "monsoon", "mow", "neutral",
        "noice", "ocean", "orange", "origin", "original", "paldea-aqua",
        "paldea-blaze", "paldea-combat", "paldea", "partner", "pau", "phd",
        "pirouette", "poison", "pokeball", "polar", "pom-pom", "primal",
        "psychic", "rainy", "rapid-strike", "resolute", "river", "roaming",
        "rock", "sandstorm", "sandy", "savanna", "school", "sensu", "shadow",
        "shock", "sinnoh", "sky", "small", "snowy", "speed", "starter", "steel",
        "stellar", "stretchy", "summer", "sun", "sunny", "sunshine", "super",
        "teal-tera", "terastal", "therian", "totem", "trash", "tundra", "ultra",
        "unbound", "unova", "violet", "wash", "water", "wellspring", "white",
        "winter", "world", "yellow", "zen", "10",
    ).distinct().sortedWith(compareByDescending<String> { it.length }.thenBy { it })

    /** Showdown spriteid guessed from an Oak species slug. */
    fun guessShowdownSpriteId(slug: String): String {
        val lower = slug.lowercase()
        for (suffix in formeSuffixes) {
            if (lower.length <= suffix.length) continue
            if (lower.endsWith("-$suffix")) {
                val base = lower.substring(0, lower.length - suffix.length - 1)
                return showdownSpriteId(base, suffix)
            }
        }
        return showdownSpriteId(lower, null)
    }

    /**
     * Absolute Oak media-sprite URL for [slug].
     *
     * [origin] is the API host (no trailing slash required). Callers that talk
     * to a non-production backend pass that host so thumbs hit the same
     * first-party media proxy as the rest of the app.
     */
    fun guessOakMedia(slug: String, origin: String): String =
        oakMediaSpriteUrl(guessShowdownSpriteId(slug), origin)

    /**
     * Pokémon Showdown's `toID`: fold diacritics, lowercase, strip every
     * non-alphanumeric character.
     */
    fun toID(s: String): String {
        val nfd = Normalizer.normalize(s, Normalizer.Form.NFD)
        val stripped = buildString(nfd.length) {
            for (ch in nfd) {
                val code = ch.code
                if (code in 0x0300..0x036F) continue
                append(ch)
            }
        }
        return stripped.lowercase().replace(Regex("[^a-z0-9]"), "")
    }

    /**
     * Showdown sprite id for a species/form: `toID(base)`, plus `-` +
     * `toID(forme)` for a non-base form.
     */
    fun showdownSpriteId(baseSpecies: String, forme: String?): String {
        val base = toID(baseSpecies)
        return if (forme == null) base else "$base-${toID(forme)}"
    }

    fun oakMediaSpriteUrl(spriteId: String, origin: String): String {
        val trimmed = origin.trimEnd('/')
        return "$trimmed/api/media/sprite/$spriteId"
    }
}

/**
 * Sprite URL the Dex list (and any other search-row consumer) should load.
 *
 * Pokémon-only. A non-empty server `sprite_url` wins; otherwise the Showdown
 * id is guessed from [SearchMatch.slug] against the API origin. Moves /
 * abilities / items return `null`.
 */
fun SearchMatch.resolvedSpriteUrl(
    origin: String = BaseUrl.current.toString().trimEnd('/'),
): String? {
    if (kind != EntityKind.POKEMON) return null
    val server = spriteUrl?.trim().orEmpty()
    if (server.isNotEmpty()) return server
    val trimmedSlug = slug.trim()
    if (trimmedSlug.isEmpty()) return null
    return SpriteUrl.guessOakMedia(trimmedSlug, origin)
}
