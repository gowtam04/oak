package ai.gowtam.oak.wire

import kotlinx.serialization.Serializable

/** `POST /api/shares` 201 body. */
@Serializable
data class CreatedShare(
    val id: String,
    val url: String,
)

/** `GET /api/shares` live row (Shared-by-me). */
@Serializable
data class ShareListItem(
    val id: String,
    val url: String,
    val conversationTitle: String,
    val createdAt: Long,
)

@Serializable
data class ShareListResponse(val shares: List<ShareListItem> = emptyList())

/**
 * `GET /api/shares/public/:id` — native snapshot (do not scrape `/a/:id` HTML).
 */
@Serializable
data class PublicShare(
    val id: String,
    val question: String,
    val answer: OakAnswer,
    val conversationTitle: String,
    val createdAt: Long,
)

@Serializable
data class ImportShareTeamResult(@kotlinx.serialization.SerialName("team_id") val teamId: String)

/** `PUT /api/scope` 200 body. */
@Serializable
data class PersistScopeResult(
    val format: Format,
    val lastUsedScopes: List<Format>? = null,
)

/** `GET /api/scope` 200 body — current Champions regulation facts for the chip. */
@Serializable
data class RegulationMeta(
    val format: Format,
    val regulation: String,
    val chipLabel: String,
    val hint: String,
) {
    val isUsable: Boolean get() = chipLabel.isNotBlank()

    companion object {
        /** Shown when nothing has been fetched yet and nothing is cached. */
        val fallback = RegulationMeta(
            format = Format.Champions,
            regulation = "",
            chipLabel = "Champions",
            hint = "Current Champions regulation",
        )
    }
}
