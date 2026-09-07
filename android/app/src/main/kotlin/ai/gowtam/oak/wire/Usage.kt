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

@Serializable
data class UsageEntry(
    val name: String,
    val pct: Double? = null,
    val rank: Int? = null,
)

/** `GET /api/usage/:slug` — 200 even when unavailable or not found. */
@Serializable
data class UsageSpecies(
    val available: Boolean,
    val found: Boolean? = null,
    val slug: String? = null,
    val season: String? = null,
    @SerialName("fetched_at") val fetchedAt: Long? = null,
    val attribution: String? = null,
    val error: String? = null,
    val suggestions: List<String> = emptyList(),
    @SerialName("saved_name") val savedName: String? = null,
    val format: String? = null,
    val moves: List<UsageEntry> = emptyList(),
    val items: List<UsageEntry> = emptyList(),
    val abilities: List<UsageEntry> = emptyList(),
    val natures: List<UsageEntry> = emptyList(),
    val spreads: List<UsageEntry> = emptyList(),
    val teammates: List<UsageEntry> = emptyList(),
    @SerialName("source_url") val sourceUrl: String? = null,
)

/** `POST /api/teams/set-template` — live Champions usage set for one species. */
@Serializable
data class SetTemplateResult(
    val found: Boolean,
    val member: TeamMember? = null,
    val attribution: String? = null,
    val month: String? = null,
    val notes: List<String> = emptyList(),
)
