package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.UsageLadder
import ai.gowtam.oak.wire.UsageLeaderboard
import android.util.Log

/**
 * Public live Champions usage ladder (`GET /api/usage`). Never throws —
 * transport/HTTP/decode faults fold to `{ available: false }` (CF-USAGE-AC-1.6).
 * No Bearer token (CF-USAGE-AC-1.1 / CF-AS-1).
 */
interface UsageService {
    /**
     * Leaderboard for [ladder]. Doubles is the product default. In-domain
     * unavailability rides back as [UsageLeaderboard.available] `false`.
     */
    suspend fun leaderboard(ladder: UsageLadder = UsageLadder.Doubles): UsageLeaderboard
}

class LiveUsageService(private val apiClient: OakApiClient) : UsageService {
    override suspend fun leaderboard(ladder: UsageLadder): UsageLeaderboard {
        val queryItems = if (ladder == UsageLadder.Doubles) {
            emptyList()
        } else {
            listOf("ladder" to "singles")
        }
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/usage",
            queryItems = queryItems,
            requiresAuth = false,
        )
        return try {
            apiClient.send(endpoint, UsageLeaderboard.serializer())
        } catch (e: OakError) {
            Log.e(TAG, "usage leaderboard unavailable: ${e::class.simpleName}")
            UsageLeaderboard(
                available = false,
                ladder = ladder,
                error = "upstream_unavailable",
                rows = emptyList(),
            )
        } catch (e: Exception) {
            Log.e(TAG, "usage leaderboard unavailable: ${e::class.simpleName}")
            UsageLeaderboard(
                available = false,
                ladder = ladder,
                error = "upstream_unavailable",
                rows = emptyList(),
            )
        }
    }

    private companion object {
        const val TAG = "Oak.Usage"
    }
}
