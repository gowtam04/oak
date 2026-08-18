package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.VoiceHydrateStatus
import android.util.Log
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * `POST /api/voice/hydrate` retry. Android has no mic session — this is the
 * history-path Retry only (VOICE-AC-3.1).
 */
interface VoiceHydrateService {
    suspend fun retry(conversationId: String, assistantMessageId: String): VoiceHydrateStatus
}

class LiveVoiceHydrateService(private val apiClient: OakApiClient) : VoiceHydrateService {
    override suspend fun retry(
        conversationId: String,
        assistantMessageId: String,
    ): VoiceHydrateStatus {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/voice/hydrate",
            body = Endpoint.jsonBody(
                HydrateRetryBody.serializer(),
                HydrateRetryBody(conversationId, assistantMessageId),
            ),
            requiresAuth = true,
        )
        return try {
            apiClient.send(endpoint, VoiceHydrateStatus.serializer())
        } catch (e: OakError) {
            Log.e(TAG, "hydrate retry failed: ${e::class.simpleName}")
            VoiceHydrateStatus(
                assistantMessageId = assistantMessageId,
                status = VoiceHydrateStatus.Status.Failed,
            )
        }
    }

    private companion object {
        const val TAG = "Oak.Hydrate"
    }
}

@Serializable
private data class HydrateRetryBody(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("assistant_message_id") val assistantMessageId: String,
)
