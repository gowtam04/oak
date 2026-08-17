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
