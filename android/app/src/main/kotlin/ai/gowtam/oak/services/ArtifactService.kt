package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamWarning
import android.util.Log
import kotlinx.serialization.Serializable

/**
 * The artifact-viewer data seam (component-design.md "Services layer"; mirrors iOS
 * `ArtifactService`). The bottom-sheet viewer reads entity profiles and saved-team
 * detail through this **interface** so `ArtifactViewModel` unit-tests against a fake.
 *
 * The one deliberate exception to the app's error policy: every method **returns
 * `null` instead of throwing**. A missing or unreachable artifact must never break
 * the viewer — there is no place to surface a thrown [OakError] inside a co-visible
 * sheet, so transport/HTTP faults collapse to `null` and the viewer shows an honest
 * "couldn't load" state.
 *
 * In-domain misses ride back as **values, not null** where the wire models them: the
 * entity endpoint returns all of `ok` / `not_found` / `unavailable` as a 200, so
 * [entity] returns the decoded [EntityArtifact] (any of the three arms) and reserves
 * `null` for a real transport/HTTP/decode fault.
 */
interface ArtifactService {
    /**
     * Fetches one entity's full profile for [format] (`GET /api/entity`). Returns the
     * decoded [EntityArtifact] (`ok`/`not_found`/`unavailable`) on a 200, or `null` on
     * a transport/HTTP/decode fault. Never throws.
     */
    suspend fun entity(kind: EntityKind, q: String, format: Format): EntityArtifact?

    /**
     * Loads one saved team with its members + computed warnings (`GET /api/teams/{id}`)
     * for a saved-team artifact. Returns `null` when the team can't be loaded (guest
     * 401, not-owned 404, transport). Never throws.
     */
    suspend fun savedTeam(id: String): Pair<Team, List<TeamWarning>>?
}

/**
 * Production [ArtifactService] over [OakApiClient]. Catches every [OakError] the
 * client throws and maps it to `null`, logging only a non-sensitive label (never the
 * query, token, or payload).
 */
class LiveArtifactService(private val apiClient: OakApiClient) : ArtifactService {

    override suspend fun entity(kind: EntityKind, q: String, format: Format): EntityArtifact? {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/entity",
            queryItems = listOf(
                "kind" to kind.wireValue,
                "q" to q,
                "format" to format.rawValue,
            ),
            requiresAuth = false,
        )
        return try {
            apiClient.send(endpoint, EntityArtifact.serializer())
        } catch (e: OakError) {
            Log.e(TAG, "entity artifact unavailable (kind ${kind.wireValue}): ${e::class.simpleName}")
            null
        }
    }

    override suspend fun savedTeam(id: String): Pair<Team, List<TeamWarning>>? {
        val endpoint = Endpoint(method = Endpoint.Method.GET, path = "/api/teams/$id", requiresAuth = true)
        return try {
            val envelope = apiClient.send(endpoint, SavedTeamEnvelope.serializer())
            envelope.team to envelope.validation
        } catch (e: OakError) {
            Log.e(TAG, "saved-team artifact unavailable: ${e::class.simpleName}")
            null
        }
    }

    private companion object {
        const val TAG = "Oak.Artifact"
    }
}

/** The `{ team, validation }` envelope returned by `GET /api/teams/{id}`. */
@Serializable
private data class SavedTeamEnvelope(val team: Team, val validation: List<TeamWarning>)
