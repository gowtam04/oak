package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.PersistScopeResult
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Persist a header scope-chip pick with no follow-up message (SCOPE-US-1).
 * View models depend on this interface so they unit-test against a fake.
 */
interface ScopeService {
    /**
     * `PUT /api/scope`. Guests must pass [sessionId] (query + body). Signed-in
     * callers may pass [conversationId] to update that thread's sticky scope.
     */
    suspend fun persist(format: Format, conversationId: String?, sessionId: String): PersistScopeResult
}

class LiveScopeService(private val apiClient: OakApiClient) : ScopeService {
    override suspend fun persist(
        format: Format,
        conversationId: String?,
        sessionId: String,
    ): PersistScopeResult {
        val endpoint = Endpoint(
            method = Endpoint.Method.PUT,
            path = "/api/scope",
            queryItems = listOf("session_id" to sessionId),
            body = Endpoint.jsonBody(
                ScopeBody.serializer(),
                ScopeBody(format = format, conversationId = conversationId, sessionId = sessionId),
            ),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, PersistScopeResult.serializer())
    }
}

@Serializable
private data class ScopeBody(
    val format: Format,
    @SerialName("conversation_id") val conversationId: String? = null,
    @SerialName("session_id") val sessionId: String,
)
