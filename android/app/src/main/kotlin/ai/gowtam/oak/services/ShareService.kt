package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.wire.CreatedShare
import ai.gowtam.oak.wire.ImportShareTeamResult
import ai.gowtam.oak.wire.PublicShare
import ai.gowtam.oak.wire.ShareListItem
import ai.gowtam.oak.wire.ShareListResponse
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Public share create / list / revoke / snapshot (SHARE-US-1..5).
 */
interface ShareService {
    suspend fun create(conversationId: String, assistantMessageId: String): CreatedShare

    suspend fun list(): List<ShareListItem>

    suspend fun revoke(id: String)

    /** Public JSON for native snapshot view. No auth. */
    suspend fun getPublic(id: String): PublicShare

    suspend fun importTeam(id: String): String
}

class LiveShareService(private val apiClient: OakApiClient) : ShareService {
    override suspend fun create(conversationId: String, assistantMessageId: String): CreatedShare {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/shares",
            body = Endpoint.jsonBody(
                CreateShareBody.serializer(),
                CreateShareBody(conversationId, assistantMessageId),
            ),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, CreatedShare.serializer())
    }

    override suspend fun list(): List<ShareListItem> {
        val endpoint = Endpoint(method = Endpoint.Method.GET, path = "/api/shares", requiresAuth = true)
        return apiClient.send(endpoint, ShareListResponse.serializer()).shares
    }

    override suspend fun revoke(id: String) {
        val endpoint = Endpoint(
            method = Endpoint.Method.DELETE,
            path = "/api/shares/$id",
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun getPublic(id: String): PublicShare {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/shares/public/$id",
            requiresAuth = false,
        )
        return apiClient.send(endpoint, PublicShare.serializer())
    }

    override suspend fun importTeam(id: String): String {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/shares/$id/import-team",
            requiresAuth = true,
        )
        return apiClient.send(endpoint, ImportShareTeamResult.serializer()).teamId
    }
}

@Serializable
private data class CreateShareBody(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("assistant_message_id") val assistantMessageId: String,
)
