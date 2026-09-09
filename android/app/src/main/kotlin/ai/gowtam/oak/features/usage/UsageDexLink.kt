package ai.gowtam.oak.features.usage

import ai.gowtam.oak.wire.EntityKind

/**
 * Usage-species list sections. Only moves, items, abilities, and teammates
 * have a Dex page; natures and EV spreads do not.
 */
enum class UsageListKind {
    MOVES,
    ITEMS,
    ABILITIES,
    NATURES,
    SPREADS,
    TEAMMATES,
    ;

    val dexKind: EntityKind?
        get() = when (this) {
            MOVES -> EntityKind.MOVE
            ITEMS -> EntityKind.ITEM
            ABILITIES -> EntityKind.ABILITY
            TEAMMATES -> EntityKind.POKEMON
            NATURES, SPREADS -> null
        }
}

data class UsageDexTarget(
    val kind: EntityKind,
    val query: String,
)

/** Maps a usage-share row onto a Dex entity. Pure — no I/O. */
object UsageDexLink {
    /** `null` when the section has no Dex page or the name is blank after trim. */
    fun route(kind: UsageListKind, name: String): UsageDexTarget? {
        val trimmed = name.trim()
        val entityKind = kind.dexKind
        if (trimmed.isEmpty() || entityKind == null) return null
        return UsageDexTarget(entityKind, trimmed)
    }

    /** Header “View in Dex” for the species being inspected. */
    fun speciesRoute(nameOrSlug: String): UsageDexTarget? {
        val trimmed = nameOrSlug.trim()
        if (trimmed.isEmpty()) return null
        return UsageDexTarget(EntityKind.POKEMON, trimmed)
    }
}
