package ai.gowtam.oak.features.dex

import ai.gowtam.oak.wire.EntityKind

/**
 * Dex tab sections. Usage is a first-class section (ADR-6), not a sixth bottom
 * tab. Entity browse kinds stay in web order before Usage.
 */
enum class DexSection(val title: String, val entityKind: EntityKind?) {
    Pokemon("Pokémon", EntityKind.POKEMON),
    Move("Moves", EntityKind.MOVE),
    Ability("Abilities", EntityKind.ABILITY),
    Item("Items", EntityKind.ITEM),
    Usage("Usage", null),
}

/** One navigation-stack entry for a Dex entity detail (list row or drill-in). */
data class DexEntityRoute(
    val kind: EntityKind,
    val query: String,
)
