package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import android.util.Log

/**
 * `POST /api/calc` — never-throw (CALC-BR-1). A transport/HTTP/decode fault
 * folds to `null`; in-domain misses ride back as [CalcResult.Error].
 */
interface CalcService {
    suspend fun estimate(scenario: CalcScenario): CalcResult?
}

class LiveCalcService(private val apiClient: OakApiClient) : CalcService {
    override suspend fun estimate(scenario: CalcScenario): CalcResult? {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/calc",
            body = Endpoint.jsonBody(CalcScenario.serializer(), scenario),
            requiresAuth = false,
        )
        return try {
            apiClient.send(endpoint, CalcResult.serializer())
        } catch (e: OakError) {
            Log.e(TAG, "calc estimate unavailable: ${e::class.simpleName}")
            null
        }
    }

    private companion object {
        const val TAG = "Oak.Calc"
    }
}
