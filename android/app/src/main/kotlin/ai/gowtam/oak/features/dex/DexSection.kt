package ai.gowtam.oak.features.dex

import ai.gowtam.oak.wire.EntityKind

/**
 * The four browse sections of the Dex tab — mirrors web `ReferenceNav` minus Meta
 * (Meta has no public mobile API yet; types stay reachable via matchup drill-ins).
 * Mirrors iOS `DexSection`.
 */
enum class DexSection(val title: String, val entityKind: EntityKind) {
    Pokemon("Pokémon", EntityKind.POKEMON),
    Move("Moves", EntityKind.MOVE),
    Ability("Abilities", EntityKind.ABILITY),
    Item("Items", EntityKind.ITEM),
}

/** One navigation-stack entry for a Dex entity detail (list row or drill-in). */
data class DexEntityRoute(
    val kind: EntityKind,
    val query: String,
)
