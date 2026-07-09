package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ImportNote
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamAnalysis
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamSummary
import ai.gowtam.oak.wire.TeamWarning
import kotlinx.serialization.Serializable

/**
 * The team-builder seam (component-design.md "Services layer"; mirrors iOS
 * `TeamService`). View models depend on this **interface** (never `LiveTeamService`)
 * so they unit-test against a fake.
 *
 * Teams are **signed-in only**: every call attaches the Bearer token, and the routes
 * return `401` for a guest — the app gates the Teams surface behind a sign-in prompt
 * rather than surfacing the error. In-domain results (validation warnings, import
 * notes) ride back as normal values, never thrown (warn-but-allow).
 *
 * Contract-fidelity note (the TS source wins, CLAUDE.md): [list] returns the repo's
 * **`TeamSummary`** projection (`web/src/data/repos/team-repo.ts`), NOT the full
 * `Team` with members; the full team + members is fetched on demand via [get] when
 * the editor opens.
 */
interface TeamService {
    /**
     * Lists the account's teams, most-recently-edited first (`GET /api/teams?format=`).
     * [format] filters by data scope (`null` = all).
     */
    suspend fun list(format: Format?): List<TeamSummary>

    /**
     * Loads one full team with its members + computed warnings (`GET /api/teams/{id}`).
     * Throws `Http(404, …)` for a missing / not-owned team.
     */
    suspend fun get(id: String): Pair<Team, List<TeamWarning>>

    /**
     * Creates a team (`POST /api/teams`). Also the "apply a proposed team as a new
     * saved team" path. [name] `null` ⇒ server default; [members] `null` ⇒ an empty
     * team (a partial/empty team is valid).
     */
    suspend fun create(format: Format, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>>

    /**
     * Replaces a team's name and/or members (`PUT /api/teams/{id}`). At least one of
     * [name]/[members] should be non-null. The format is fixed for a team's life and
     * is never changed here.
     */
    suspend fun update(id: String, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>>

    /**
     * Permanently deletes a team (`DELETE /api/teams/{id}`). A 404 (already gone /
     * not owned) is treated as success by the caller for idempotent UX.
     */
    suspend fun delete(id: String)

    /** Clones a team into a fresh, independent copy (`POST /api/teams/{id}/duplicate`). */
    suspend fun duplicate(id: String): Pair<Team, List<TeamWarning>>

    /**
     * Imports a Showdown paste into a new saved team (`POST /api/teams/import`).
     * Never aborts wholesale: whatever resolves becomes the team; the rest comes back
     * as [ImportNote]s.
     */
    suspend fun importPaste(format: Format, paste: String): Triple<Team, List<TeamWarning>, List<ImportNote>>

    /**
     * Renders a saved team as Showdown paste text (`GET /api/teams/{id}/export`).
     * Round-trips through [importPaste].
     */
    suspend fun exportPaste(id: String): String

    /**
     * Analyzes a draft team's defensive/offensive type coverage + speed tiers
     * (`POST /api/teams/analyze`). **PUBLIC** — pure Pokédex math, no account data, so
     * it carries NO Bearer token (`requiresAuth = false`) and works for guests. In-domain
     * failure (unbuilt index) rides back as `TeamAnalysis.Unavailable`, never thrown.
     */
    suspend fun analyze(format: Format, members: List<TeamMember>): TeamAnalysis
}

/**
 * Production [TeamService] over [OakApiClient]. Wire shapes are decoded into the
 * team DTOs (`Team`/`TeamMember`/`TeamWarning`); error mapping happens inside
 * [OakApiClient].
 */
class LiveTeamService(private val apiClient: OakApiClient) : TeamService {

    override suspend fun list(format: Format?): List<TeamSummary> {
        val queryItems = format?.let { listOf("format" to it.rawValue) } ?: emptyList()
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/teams",
            queryItems = queryItems,
            requiresAuth = true,
        )
        return apiClient.send(endpoint, TeamsListEnvelope.serializer()).teams
    }

    override suspend fun get(id: String): Pair<Team, List<TeamWarning>> {
        val endpoint = Endpoint(method = Endpoint.Method.GET, path = "/api/teams/$id", requiresAuth = true)
        val envelope = apiClient.send(endpoint, TeamEnvelope.serializer())
        return envelope.team to envelope.validation
    }

    override suspend fun create(
        format: Format,
        name: String?,
        members: List<TeamMember>?,
    ): Pair<Team, List<TeamWarning>> {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/teams",
            body = Endpoint.jsonBody(CreateTeamBody.serializer(), CreateTeamBody(format, name, members)),
            requiresAuth = true,
        )
        val envelope = apiClient.send(endpoint, TeamEnvelope.serializer())
        return envelope.team to envelope.validation
    }

    override suspend fun update(
        id: String,
        name: String?,
        members: List<TeamMember>?,
    ): Pair<Team, List<TeamWarning>> {
        val endpoint = Endpoint(
            method = Endpoint.Method.PUT,
            path = "/api/teams/$id",
            body = Endpoint.jsonBody(UpdateTeamBody.serializer(), UpdateTeamBody(name, members)),
            requiresAuth = true,
        )
        val envelope = apiClient.send(endpoint, TeamEnvelope.serializer())
        return envelope.team to envelope.validation
    }

    override suspend fun delete(id: String) {
        val endpoint = Endpoint(method = Endpoint.Method.DELETE, path = "/api/teams/$id", requiresAuth = true)
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun duplicate(id: String): Pair<Team, List<TeamWarning>> {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/teams/$id/duplicate",
            requiresAuth = true,
        )
        val envelope = apiClient.send(endpoint, TeamEnvelope.serializer())
        return envelope.team to envelope.validation
    }

    override suspend fun importPaste(format: Format, paste: String): Triple<Team, List<TeamWarning>, List<ImportNote>> {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/teams/import",
            body = Endpoint.jsonBody(ImportBody.serializer(), ImportBody(format, paste)),
            requiresAuth = true,
        )
        val envelope = apiClient.send(endpoint, ImportEnvelope.serializer())
        return Triple(envelope.team, envelope.validation, envelope.notes)
    }

    override suspend fun exportPaste(id: String): String {
        val endpoint = Endpoint(method = Endpoint.Method.GET, path = "/api/teams/$id/export", requiresAuth = true)
        return apiClient.send(endpoint, ExportEnvelope.serializer()).paste
    }

    override suspend fun analyze(format: Format, members: List<TeamMember>): TeamAnalysis {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/teams/analyze",
            body = Endpoint.jsonBody(AnalyzeBody.serializer(), AnalyzeBody(format, members)),
            // PUBLIC endpoint — pure Pokédex math, no account scope; no Bearer token.
            requiresAuth = false,
        )
        return apiClient.send(endpoint, TeamAnalysis.serializer())
    }
}

// ---------------------------------------------------------------------------
// Wire bodies & envelopes (private to the service)
// ---------------------------------------------------------------------------

/** `GET /api/teams` → `{ teams: TeamSummary[] }`. */
@Serializable
private data class TeamsListEnvelope(val teams: List<TeamSummary>)

/**
 * The `{ team, validation }` envelope returned by create / get / update / duplicate.
 * `validation` is a flat `TeamWarning[]`.
 */
@Serializable
private data class TeamEnvelope(val team: Team, val validation: List<TeamWarning>)

/** `POST /api/teams/import` → `{ team, validation, notes }`. */
@Serializable
private data class ImportEnvelope(val team: Team, val validation: List<TeamWarning>, val notes: List<ImportNote>)

/** `GET /api/teams/{id}/export` → `{ paste }`. */
@Serializable
private data class ExportEnvelope(val paste: String)

/**
 * `POST /api/teams` body (`{ format, name?, members? }`). `name`/`members` are
 * optional server-side — an absent `name` defaults server-side and absent `members`
 * becomes an empty team.
 */
@Serializable
private data class CreateTeamBody(val format: Format, val name: String?, val members: List<TeamMember>?)

/** `PUT /api/teams/{id}` body (`{ name?, members? }`, at least one). */
@Serializable
private data class UpdateTeamBody(val name: String?, val members: List<TeamMember>?)

/** `POST /api/teams/import` body (`{ format, paste }`). */
@Serializable
private data class ImportBody(val format: Format, val paste: String)

/** `POST /api/teams/analyze` body (`{ format, members }`, members = the full team wire shape). */
@Serializable
private data class AnalyzeBody(val format: Format, val members: List<TeamMember>)
