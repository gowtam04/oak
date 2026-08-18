package ai.gowtam.oak.services

import ai.gowtam.oak.features.artifact.ArtifactPinKind
import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.PinnedArtifactSummary
import android.util.Log
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.encodeToJsonElement

/**
 * Conversation pin strip (`/api/conversations/:id/artifact-pins`).
 * Signed-in only. Guest 401s fold to empty / error (AUTH-BR-1).
 */
interface ArtifactPinService {
    suspend fun list(conversationId: String): List<PinnedArtifactSummary>

    suspend fun create(
        conversationId: String,
        kind: ArtifactPinKind,
        title: String,
        snapshot: Any?,
    ): CreatePinResult

    suspend fun delete(conversationId: String, pinId: String): List<PinnedArtifactSummary>?
}

sealed interface CreatePinResult {
    data class Ok(val pin: PinnedArtifactSummary, val pinnedArtifacts: List<PinnedArtifactSummary>) : CreatePinResult
    data class Cap(val max: Int) : CreatePinResult
    data class Error(val message: String) : CreatePinResult
}

class LiveArtifactPinService(private val apiClient: OakApiClient) : ArtifactPinService {
    override suspend fun list(conversationId: String): List<PinnedArtifactSummary> {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/conversations/$conversationId/artifact-pins",
            requiresAuth = true,
        )
        return try {
            apiClient.send(endpoint, PinListEnvelope.serializer()).pins
        } catch (e: OakError) {
            Log.e(TAG, "pin list unavailable: ${e::class.simpleName}")
            emptyList()
        }
    }

    override suspend fun create(
        conversationId: String,
        kind: ArtifactPinKind,
        title: String,
        snapshot: Any?,
    ): CreatePinResult {
        val body = CreatePinBody(
            kind = kind.rawValue,
            title = title,
            snapshot = snapshotAsJson(snapshot),
        )
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/conversations/$conversationId/artifact-pins",
            body = Endpoint.jsonBody(CreatePinBody.serializer(), body),
            requiresAuth = true,
        )
        return try {
            val envelope = apiClient.send(endpoint, CreatePinEnvelope.serializer())
            CreatePinResult.Ok(envelope.pin, envelope.pinnedArtifacts)
        } catch (e: OakError.Http) {
            if (e.status == 409 || e.code == "pin_cap") {
                CreatePinResult.Cap(max = 5)
            } else {
                CreatePinResult.Error(e.message)
            }
        } catch (e: OakError) {
            Log.e(TAG, "pin create failed: ${e::class.simpleName}")
            CreatePinResult.Error("couldn't pin")
        }
    }

    override suspend fun delete(conversationId: String, pinId: String): List<PinnedArtifactSummary>? {
        val endpoint = Endpoint(
            method = Endpoint.Method.DELETE,
            path = "/api/conversations/$conversationId/artifact-pins/$pinId",
            requiresAuth = true,
        )
        return try {
            apiClient.send(endpoint, PinListEnvelope.serializer()).pinnedArtifacts
        } catch (e: OakError) {
            Log.e(TAG, "pin delete failed: ${e::class.simpleName}")
            null
        }
    }

    private fun snapshotAsJson(snapshot: Any?): JsonElement = when (snapshot) {
        null -> JsonNull
        is JsonElement -> snapshot
        is String -> OakJson.encodeToJsonElement(snapshot)
        else -> OakJson.encodeToJsonElement(snapshot.toString())
    }

    private companion object {
        const val TAG = "Oak.Pins"
    }
}

@Serializable
private data class CreatePinBody(
    val kind: String,
    val title: String,
    val snapshot: JsonElement,
)

@Serializable
private data class CreatePinEnvelope(
    val pin: PinnedArtifactSummary,
    val pinnedArtifacts: List<PinnedArtifactSummary> = emptyList(),
)

@Serializable
private data class PinListEnvelope(
    val pins: List<PinnedArtifactSummary> = emptyList(),
    val pinnedArtifacts: List<PinnedArtifactSummary> = emptyList(),
)
