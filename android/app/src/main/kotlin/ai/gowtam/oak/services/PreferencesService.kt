package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.wire.AnswerDensity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * `PATCH /api/account/preferences` — signed-in compact/full (COMPACT-US-2).
 */
interface PreferencesService {
    suspend fun setAnswerDensity(density: AnswerDensity): AnswerDensity
}

class LivePreferencesService(private val apiClient: OakApiClient) : PreferencesService {
    override suspend fun setAnswerDensity(density: AnswerDensity): AnswerDensity {
        val endpoint = Endpoint(
            method = Endpoint.Method.PATCH,
            path = "/api/account/preferences",
            body = Endpoint.jsonBody(
                PreferencesPatchBody.serializer(),
                PreferencesPatchBody(density.rawValue),
            ),
            requiresAuth = true,
        )
        val envelope = apiClient.send(endpoint, PreferencesPatchResponse.serializer())
        return envelope.answerDensity ?: density
    }
}

@Serializable
private data class PreferencesPatchBody(
    @SerialName("answer_density") val answerDensity: String,
)

@Serializable
private data class PreferencesPatchResponse(
    val answerDensity: AnswerDensity? = null,
)
