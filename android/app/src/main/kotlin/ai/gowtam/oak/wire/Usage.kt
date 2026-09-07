package ai.gowtam.oak.wire

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Live Champions ladder (`GET /api/usage`, api-design.md). Doubles is the
 * product default; Singles is the other view. 200 even when unavailable.
 */
@Serializable
enum class UsageLadder {
    @SerialName("doubles") Doubles,
    @SerialName("singles") Singles,
}

@Serializable
data class UsageLeaderboardRow(
    val rank: Int,
    val name: String,
    val slug: String,
    @SerialName("usage_pct") val usagePct: Double? = null,
    val sprite: String? = null,
)

@Serializable
data class UsageLeaderboard(
    val available: Boolean,
    val ladder: UsageLadder,
    val season: String? = null,
    @SerialName("fetched_at") val fetchedAt: Long? = null,
    val attribution: String? = null,
    val error: String? = null,
    val rows: List<UsageLeaderboardRow> = emptyList(),
)
