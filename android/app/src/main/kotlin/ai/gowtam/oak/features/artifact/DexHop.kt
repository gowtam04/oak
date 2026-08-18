package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format

/** Dex format hop from an artifact (DEX-US-1). Format is written before push. */
data class DexHop(
    val kind: EntityKind,
    val query: String,
    val format: Format,
)
