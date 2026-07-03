package ai.gowtam.oak.services

import ai.gowtam.oak.wire.EntityKind

/**
 * The wire string for one [EntityKind] — mirrors its `@SerialName`s in
 * `wire/EntityArtifact.kt`. `EntityKind` decodes those `@SerialName`s automatically
 * via kotlinx.serialization, but a service building a `?kind=` query string needs the
 * raw string directly rather than round-tripping through the JSON encoder; shared by
 * [ArtifactService] and [DexLookupService].
 */
internal val EntityKind.wireValue: String
    get() = when (this) {
        EntityKind.POKEMON -> "pokemon"
        EntityKind.MOVE -> "move"
        EntityKind.ABILITY -> "ability"
        EntityKind.ITEM -> "item"
        EntityKind.TYPE -> "type"
    }
