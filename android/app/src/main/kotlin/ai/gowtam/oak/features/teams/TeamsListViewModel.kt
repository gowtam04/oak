package ai.gowtam.oak.features.teams

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.services.EmptyDexLookupService
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ImportNote
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamSummary
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The single renderable snapshot the Teams list screen collects. */
@Immutable
data class TeamsListUiState(
    /** The visible team summaries, most-recently-edited first (the server's order). */
    val teams: List<TeamSummary> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    /** The active format filter; `null` = all formats. Applied server-side. */
    val formatFilter: Format? = null,
    /** Sprite refs keyed by species slug, populated after each reload. */
    val spriteRefs: Map<String, DexSpriteRef> = emptyMap(),
)

/**
 * The team-library view model (history-and-teams.md D-TEAM-1; component-design.md
 * "TeamsListViewModel"). Holds the team list and the format-filter state, drives the
 * library mutations (create / duplicate / delete / import), and hands out
 * [TeamEditorViewModel] factories for the editor screen. Mirrors iOS
 * `TeamsListViewModel`.
 *
 * Depends on the [TeamService]/[DexLookupService] **interfaces** (never `Live…`
 * concretes) so it unit-tests against fakes. Teams are signed-in only: a guest gets
 * `401` from the routes, so the Teams route shows a sign-in prompt rather than this
 * list — see [ai.gowtam.oak.features.teams.TeamsRoute]. The format filter (`?format=`)
 * is applied **server-side** — changing it re-fetches via [reload].
 */
class TeamsListViewModel(
    private val teamService: TeamService,
    private val dexLookup: DexLookupService = EmptyDexLookupService(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(TeamsListUiState())
    val uiState: StateFlow<TeamsListUiState> = _uiState.asStateFlow()

    /** (Re)loads the team list with the current filter — the initial load,
     * pull-to-refresh, and the re-fetch after a filter change all route through here.
     * Never throws: a failure surfaces as `errorMessage` and leaves the prior list.
     * After a successful teams fetch, sprite refs are batch-fetched per format and
     * merged; a sprite fetch failure degrades silently to dots. */
    fun reload() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val teams = teamService.list(uiState.value.formatFilter)
                val spriteRefs = fetchSpriteRefs(teams)
                _uiState.update { it.copy(teams = teams, spriteRefs = spriteRefs) }
            } catch (e: OakError) {
                _uiState.update { it.copy(errorMessage = TeamEditorViewModel.message(e)) }
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = TeamEditorViewModel.GENERIC_MESSAGE) }
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    /** Batch-fetches sprite refs for all species in [teams], grouped by format.
     * Returns an empty map on any failure (degrade silently). */
    private suspend fun fetchSpriteRefs(teams: List<TeamSummary>): Map<String, DexSpriteRef> {
        val byFormat = teams.groupBy { it.format }
        return try {
            coroutineScope {
                byFormat.map { (format, formatTeams) ->
                    async {
                        val slugs = formatTeams.flatMap { it.species }.distinct()
                        if (slugs.isEmpty()) emptyMap()
                        else dexLookup.sprites(slugs, format)
                    }
                }.awaitAll().fold(emptyMap<String, DexSpriteRef>()) { acc, map -> acc + map }
            }
        } catch (e: Exception) {
            emptyMap()
        }
    }

    /** Switches the format filter and re-fetches. A no-op when unchanged. */
    fun setFormatFilter(format: Format?) {
        if (format == uiState.value.formatFilter) return
        _uiState.update { it.copy(formatFilter = format) }
        reload()
    }

    /** Creates a new, empty team in [format] and inserts its summary at the top.
     * [onCreated] fires with the created [Team] on success, so the caller can hand it
     * straight to the editor. `name == null` ⇒ the server's default name. */
    fun createTeam(format: Format, name: String? = null, onCreated: (Team) -> Unit = {}) {
        viewModelScope.launch {
            try {
                val (team, _) = teamService.create(format, name, null)
                insertOrReplace(team)
                onCreated(team)
            } catch (e: OakError) {
                setError(TeamEditorViewModel.message(e))
            } catch (e: Exception) {
                setError(TeamEditorViewModel.GENERIC_MESSAGE)
            }
        }
    }

    /** Duplicates [summary] and inserts the copy's summary at the top. */
    fun duplicate(summary: TeamSummary, onDuplicated: (Team) -> Unit = {}) {
        viewModelScope.launch {
            try {
                val (team, _) = teamService.duplicate(summary.id)
                insertOrReplace(team)
                onDuplicated(team)
            } catch (e: OakError) {
                setError(TeamEditorViewModel.message(e))
            } catch (e: Exception) {
                setError(TeamEditorViewModel.GENERIC_MESSAGE)
            }
        }
    }

    /** Deletes [summary]. Optimistically removes the row, then persists. A `404`
     * (already gone / not owned) is treated as success — idempotent UX. Any other
     * failure restores the row and surfaces an error. */
    fun delete(summary: TeamSummary) {
        val snapshot = uiState.value.teams
        _uiState.update { it.copy(teams = it.teams.filterNot { t -> t.id == summary.id }) }
        viewModelScope.launch {
            try {
                teamService.delete(summary.id)
            } catch (e: OakError.Http) {
                if (e.status != 404) _uiState.update { it.copy(teams = snapshot, errorMessage = TeamEditorViewModel.message(e)) }
            } catch (e: OakError) {
                _uiState.update { it.copy(teams = snapshot, errorMessage = TeamEditorViewModel.message(e)) }
            } catch (e: Exception) {
                _uiState.update { it.copy(teams = snapshot, errorMessage = TeamEditorViewModel.GENERIC_MESSAGE) }
            }
        }
    }

    /** Imports a Showdown paste into a new saved team and inserts its summary. The
     * import never fails wholesale — [onResult] fires with the saved team + any
     * resolve-or-clarify [ImportNote]s on success, or `(null, [])` on a
     * transport/HTTP failure. */
    fun importPaste(paste: String, format: Format, onResult: (Team?, List<ImportNote>) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            try {
                val (team, _, notes) = teamService.importPaste(format, paste)
                insertOrReplace(team)
                onResult(team, notes)
            } catch (e: OakError) {
                setError(TeamEditorViewModel.message(e))
                onResult(null, emptyList())
            } catch (e: Exception) {
                setError(TeamEditorViewModel.GENERIC_MESSAGE)
                onResult(null, emptyList())
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    // ---- Child editor factories ----

    /** An editor for a brand-new, unsaved team in [format] (the "+" flow). */
    fun makeEditor(format: Format): TeamEditorViewModel = TeamEditorViewModel(teamService, dexLookup, format = format)

    /** An editor for an existing team (by summary); the editor's own `load()` fetches
     * the full members + warnings. */
    fun makeEditor(summary: TeamSummary): TeamEditorViewModel = TeamEditorViewModel(teamService, dexLookup, summary = summary)

    /** An editor for an already-loaded full team (e.g. a freshly created/duplicated/
     * imported team), with no extra fetch. */
    fun makeEditor(team: Team): TeamEditorViewModel = TeamEditorViewModel(teamService, dexLookup, team = team)

    // ---- Internals ----

    /** Inserts a summary derived from [team] at the top, or replaces the existing row
     * with the same id and moves it to the top (mirrors the server's
     * most-recently-edited-first ordering for a freshly created/updated team). */
    private fun insertOrReplace(team: Team) {
        val summary = teamSummaryOf(team)
        _uiState.update { s -> s.copy(teams = listOf(summary) + s.teams.filterNot { it.id == summary.id }) }
    }

    private fun setError(message: String) {
        _uiState.update { it.copy(errorMessage = message) }
    }
}

/** Derives the list-row [TeamSummary] from a full [Team] (returned by create /
 * duplicate / import) so a freshly persisted team can join the list without a
 * re-fetch. Mirrors the server's `listTeams` projection: filled-slot species, a member
 * count, and the cheap "incomplete" rule (<6 members, or any slot missing a species /
 * its 4th move). */
internal fun teamSummaryOf(team: Team): TeamSummary = TeamSummary(
    id = team.id,
    name = team.name,
    format = team.format,
    memberCount = team.members.size,
    incomplete = team.members.size < 6 || team.members.any { it.species == null || it.moves.size < 4 },
    species = team.members.mapNotNull { it.species },
    updatedAt = team.updatedAt,
)
