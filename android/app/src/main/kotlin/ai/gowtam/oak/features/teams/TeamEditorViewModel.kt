package ai.gowtam.oak.features.teams

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.services.EmptyDexLookupService
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamAnalysis
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamPatch
import ai.gowtam.oak.wire.TeamSummary
import ai.gowtam.oak.wire.TeamWarning
import ai.gowtam.oak.wire.applyTeamPatch
import ai.gowtam.oak.wire.titleizeTeamSlug
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * A mutable, form-bindable EV/IV spread + slug fields for one member slot. The wire
 * [TeamMember] uses `null`/optional slugs and a variable-length `moves` list; this uses
 * empty strings and a fixed 4-move grid for clean two-way binding, converting on save
 * (empty → `null`, blank moves dropped) — mirrors iOS `EditableMember`.
 */
@Immutable
data class EditableMember(
    val id: String = UUID.randomUUID().toString(),
    val species: String = "",
    val ability: String = "",
    val item: String = "",
    /** Exactly four move slots (empty string = unset). */
    val moves: List<String> = listOf("", "", "", ""),
    val nature: String = "",
    val evs: StatSpread = StatSpread(hp = 0, atk = 0, def = 0, spa = 0, spd = 0, spe = 0),
    val ivs: StatSpread = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
    val teraType: String = "",
    val level: Int = 50,
    val nickname: String = "",
    val gender: TeamMember.Gender? = null,
    val shiny: Boolean = false,
) {
    /** The six-stat EV total (>508 is warned server-side, never blocked client-side). */
    val evTotal: Int get() = evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe

    /** Champions Stat Point total — same numbers as [evTotal] on the wire (ADR-7). */
    val statPointTotal: Int get() = evTotal

    /** Converts to the wire [TeamMember]: trimmed-empty strings become `null`, blank
     * move slots are dropped, `shiny` is emitted only when true. */
    fun asTeamMember(): TeamMember {
        fun slug(value: String): String? = value.trim().ifEmpty { null }
        val resolvedMoves = moves.map { it.trim() }.filter { it.isNotEmpty() }.take(4)
        return TeamMember(
            species = slug(species),
            ability = slug(ability),
            item = slug(item),
            moves = resolvedMoves,
            nature = slug(nature),
            evs = evs,
            ivs = ivs,
            teraType = slug(teraType),
            level = level,
            nickname = slug(nickname),
            gender = gender,
            shiny = if (shiny) true else null,
        )
    }

    companion object {
        /** Builds an editable row from a stored [TeamMember] (`null` → `""`, moves padded to 4). */
        fun from(member: TeamMember): EditableMember {
            val padded = (member.moves + List(maxOf(0, 4 - member.moves.size)) { "" }).take(4)
            return EditableMember(
                species = member.species ?: "",
                ability = member.ability ?: "",
                item = member.item ?: "",
                moves = padded,
                nature = member.nature ?: "",
                evs = member.evs,
                ivs = member.ivs,
                teraType = member.teraType ?: "",
                level = member.level,
                nickname = member.nickname ?: "",
                gender = member.gender,
                shiny = member.shiny ?: false,
            )
        }
    }
}

/**
 * An exact, restorable snapshot of the editor draft (name + editable rows) — the undo
 * target for a Teams Assistant Apply. Captured before Apply mutates the draft;
 * [TeamEditorViewModel.restoreDraft] puts it back verbatim.
 */
@Immutable
data class TeamDraftSnapshot(val name: String, val members: List<EditableMember>)

/** The single renderable snapshot the editor screen collects. */
@Immutable
data class TeamEditorUiState(
    /** The saved team's id once persisted; `null` for a brand-new, unsaved team. */
    val teamId: String? = null,
    val name: String = "",
    val members: List<EditableMember> = listOf(EditableMember()),
    /** The server's warn-but-allow validation warnings from the last load/save. */
    val warnings: List<TeamWarning> = emptyList(),
    val savedTeam: Team? = null,
    val isSaving: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    /** Batch-resolved sprite/type/ability/base-stat refs, keyed by species slug. */
    val spriteRefsBySpecies: Map<String, DexSpriteRef> = emptyMap(),
    /** Each member's fetched legal movepool, keyed by the member's stable [EditableMember.id]. */
    val movepoolByMemberId: Map<String, List<LearnsetMove>> = emptyMap(),
    /** Transient "Saved" confirmation flag; the screen self-clears it after ~1s. */
    val showSaveConfirmation: Boolean = false,
    /** The last successful export's paste text, or `null` when no export sheet is open. */
    val exportedPaste: String? = null,
    /** The latest team type-coverage analysis, or `null` before the first run / when the draft has no species. */
    val analysis: TeamAnalysis? = null,
    /** True while a debounced analysis request is in flight (the panel keeps showing the last good [analysis]). */
    val isAnalyzing: Boolean = false,
    /** A failed analysis's message; the last good [analysis] is retained alongside it. */
    val analysisError: String? = null,
)

/**
 * The full-set team editor's view model (history-and-teams.md D-TEAM-1;
 * component-design.md "TeamEditorViewModel"). Holds the editable team (name + up to 6
 * member sets), drives save (create-or-update), and surfaces the server's
 * **warn-but-allow** validation — warnings are rendered but **never block save**.
 *
 * `viewModelScope`-driven, `StateFlow<TeamEditorUiState>`-published (mirrors
 * [ai.gowtam.oak.features.artifact.ArtifactViewModel]/[ai.gowtam.oak.features.chat.ChatViewModel],
 * not the caller-driven-suspend convention `AuthViewModel`/`AccountViewModel` use — this
 * view model chains several async steps per action, e.g. a species edit triggers a
 * sprite AND a movepool refresh, so owning its own coroutines keeps call sites a plain
 * `onClick = viewModel::save`). Depends on the [TeamService]/[DexLookupService]
 * **interfaces** (never `Live…` concretes) so it unit-tests against fakes.
 *
 * A team's [format] is fixed for its life: set at construction, never edited here.
 * Slugs (not display names) are stored/sent; the server resolves names and flags
 * anything illegal as an advisory [TeamWarning].
 */
class TeamEditorViewModel private constructor(
    private val teamService: TeamService,
    private val dexLookup: DexLookupService,
    val format: Format,
    initialState: TeamEditorUiState,
) : ViewModel() {

    private val _uiState = MutableStateFlow(initialState)
    val uiState: StateFlow<TeamEditorUiState> = _uiState.asStateFlow()

    val isReadOnly: Boolean get() = format.isArchived
    val showsTeraField: Boolean get() = false
    val showsIvKnobs: Boolean get() = false
    val showsLevelKnob: Boolean get() = false
    val showsStatPoints: Boolean get() = true
    val canDuplicate: Boolean get() = !isReadOnly

    /** The pending debounce timer for [scheduleAnalysis]; cancelled/relaunched on each edit. */
    private var analysisDebounceJob: Job? = null

    /**
     * Monotonic token stamping each analysis request. The response handler discards any
     * result whose token is no longer current — so an in-flight request that a newer edit
     * superseded (but that already left the debounce window) can never overwrite fresh state.
     */
    private var analysisGeneration = 0

    /** Opens the editor on a brand-new, unsaved team in [format], seeded with one empty
     * member set so the form has something to fill. */
    constructor(
        teamService: TeamService,
        dexLookup: DexLookupService = EmptyDexLookupService(),
        format: Format,
        name: String = "",
    ) : this(teamService, dexLookup, format, TeamEditorUiState(name = name, members = listOf(EditableMember())))

    /** Opens the editor on an existing team by its list summary; [load] fetches the full
     * members + warnings. */
    constructor(
        teamService: TeamService,
        dexLookup: DexLookupService = EmptyDexLookupService(),
        summary: TeamSummary,
    ) : this(
        teamService,
        dexLookup,
        summary.format,
        TeamEditorUiState(teamId = summary.id, name = summary.name, members = emptyList()),
    )

    /** Opens the editor on an already-loaded full team (straight after create / duplicate
     * / import / apply), with no extra fetch. */
    constructor(
        teamService: TeamService,
        dexLookup: DexLookupService = EmptyDexLookupService(),
        team: Team,
        warnings: List<TeamWarning> = emptyList(),
    ) : this(
        teamService,
        dexLookup,
        team.format,
        TeamEditorUiState(
            teamId = team.id,
            name = team.name,
            members = team.members.map(EditableMember::from),
            savedTeam = team,
            warnings = warnings,
        ),
    )

    // ---- Loading ----

    /** Loads the full team (members + computed warnings) for an existing team. A no-op
     * for an unsaved team. Never throws: a failure surfaces as `errorMessage`. */
    fun load() {
        val id = uiState.value.teamId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val (team, validation) = teamService.get(id)
                applySaved(team, validation)
                doRefreshSprites()
                doRefreshAllMovepools()
                scheduleAnalysis()
            } catch (e: OakError) {
                _uiState.update { it.copy(errorMessage = message(e)) }
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = GENERIC_MESSAGE) }
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    // ---- Dex lookups (search / learnset / sprites — never throw) ----

    /** Live typeahead over `/api/search`, scoped to this editor's fixed [format] — backs
     * the species/item pickers. An empty/failed lookup just shows no suggestions. */
    suspend fun searchEntities(kind: EntityKind, query: String): List<PickerOption> =
        dexLookup.search(kind, query, Format.Champions).map { PickerOption(it.slug, it.displayName) }

    /** Re-resolves sprite/type/ability/base-stat refs for every filled species slot in
     * one batch call, then applies the Mega required-item auto-force. */
    fun refreshSprites() {
        viewModelScope.launch { doRefreshSprites() }
    }

    /** Fetches the legal movepool for one member's species, keyed by the member's stable
     * id so it survives reordering. */
    fun refreshMovepool(memberId: String) {
        viewModelScope.launch { doRefreshMovepool(memberId) }
    }

    /** Refetches every filled slot's movepool — used after a full team load, since the
     * per-species change hook only fires on further edits. */
    fun refreshAllMovepools() {
        viewModelScope.launch { doRefreshAllMovepools() }
    }

    /** The resolved sprite/type ref for a member's species, or `null` when unresolved/unset. */
    fun spriteRef(species: String): DexSpriteRef? =
        species.takeIf { it.isNotBlank() }?.let { uiState.value.spriteRefsBySpecies[it] }

    /** The species' legal ability slugs as picker options (the Ability picker's ONLY
     * offered choices) — empty when the species is unresolved. */
    fun abilityOptions(species: String): List<PickerOption> =
        (spriteRef(species)?.abilities ?: emptyList()).map { PickerOption(it, titleizeTeamSlug(it)) }

    /** The species' legal movepool as picker options, sorted by display name — the Move
     * pickers' ONLY offered choices. */
    fun movepoolOptions(memberId: String): List<PickerOption> =
        (uiState.value.movepoolByMemberId[memberId] ?: emptyList())
            .map { PickerOption(it.slug, it.displayName, moveHint(it)) }
            .sortedBy { it.displayName }

    private suspend fun doRefreshSprites() {
        val species = uiState.value.members.map { it.species }.filter { it.isNotBlank() }.toSet()
        if (species.isEmpty()) {
            _uiState.update { it.copy(spriteRefsBySpecies = emptyMap()) }
            return
        }
        val refs = dexLookup.sprites(species.toList(), Format.Champions)
        _uiState.update { it.copy(spriteRefsBySpecies = refs) }
        if (!isReadOnly) applyMegaAutoForce()
    }

    /** A Mega (or any form with a `required_item`) must hold its stone: force every
     * filled slot's item to its species' `required_item` once resolved — forward-only
     * and idempotent (never clears a stone if the species changes away from a Mega). */
    private fun applyMegaAutoForce() {
        _uiState.update { state ->
            val refs = state.spriteRefsBySpecies
            val updated = state.members.map { member ->
                val stone = refs[member.species]?.requiredItem?.takeIf { it.isNotBlank() }
                if (stone != null && member.item != stone) member.copy(item = stone) else member
            }
            state.copy(members = updated)
        }
    }

    private suspend fun doRefreshMovepool(memberId: String) {
        val member = uiState.value.members.find { it.id == memberId }
        if (member == null || member.species.isBlank()) {
            _uiState.update { it.copy(movepoolByMemberId = it.movepoolByMemberId - memberId) }
            return
        }
        val moves = dexLookup.learnset(member.species, Format.Champions)
        _uiState.update { it.copy(movepoolByMemberId = it.movepoolByMemberId + (memberId to moves)) }
    }

    private suspend fun doRefreshAllMovepools() {
        for (member in uiState.value.members) {
            if (member.species.isNotBlank()) doRefreshMovepool(member.id)
        }
    }

    private fun moveHint(move: LearnsetMove): String? {
        val parts = buildList {
            move.type?.let { add(titleizeTeamSlug(it)) }
            move.damageClass?.let { add(titleizeTeamSlug(it.name.lowercase())) }
            move.power?.let { add("$it power") }
        }
        return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
    }

    // ---- Member editing ----

    fun setName(name: String) {
        if (isReadOnly) return
        _uiState.update { it.copy(name = name) }
    }

    /** Adds an empty member set; a no-op at the 6-slot cap. */
    fun addMember() {
        if (isReadOnly) return
        _uiState.update { if (it.members.size < 6) it.copy(members = it.members + EditableMember()) else it }
        scheduleAnalysis()
    }

    fun removeMember(index: Int) {
        if (isReadOnly) return
        _uiState.update { state ->
            if (index in state.members.indices) {
                state.copy(members = state.members.filterIndexed { i, _ -> i != index })
            } else {
                state
            }
        }
        scheduleAnalysis()
    }

    val canAddMember: Boolean get() = !isReadOnly && uiState.value.members.size < 6

    /** Applies [transform] to the member at [index] and, when the species changed,
     * re-resolves that slot's sprite/movepool. */
    fun updateMember(index: Int, transform: (EditableMember) -> EditableMember) {
        if (isReadOnly) return
        val current = uiState.value.members.getOrNull(index) ?: return
        val updated = transform(current)
        if (updated == current) return
        _uiState.update { state ->
            state.copy(members = state.members.toMutableList().also { it[index] = updated })
        }
        if (updated.species != current.species) {
            refreshSprites()
            refreshMovepool(updated.id)
        }
        scheduleAnalysis()
    }

    fun warningsForSlot(index: Int): List<TeamWarning> = uiState.value.warnings.filter { it.slot == index }

    val teamLevelWarnings: List<TeamWarning> get() = uiState.value.warnings.filter { it.slot == null }

    // ---- Team analysis (debounced, public endpoint — never blocks editing) ----

    /**
     * Requests a fresh type-coverage analysis for the current draft after a ~750ms debounce
     * (coalescing rapid edits into one request). A draft with no filled species clears the
     * panel without a network call. A failed request keeps the last good [analysis] on screen
     * and surfaces [analysisError]; a stale response (superseded by a newer edit) is discarded.
     */
    fun scheduleAnalysis() {
        analysisDebounceJob?.cancel()
        val members = uiState.value.members
        if (members.none { it.species.isNotBlank() }) {
            _uiState.update { it.copy(analysis = null, isAnalyzing = false, analysisError = null) }
            return
        }
        val payload = members.map { it.asTeamMember() }
        val generation = ++analysisGeneration
        analysisDebounceJob = viewModelScope.launch {
            delay(ANALYSIS_DEBOUNCE_MS)
            runAnalysis(payload, generation)
        }
    }

    /** Re-runs the analysis immediately (no debounce) — the "Retry" action after a failure. */
    fun retryAnalysis() {
        analysisDebounceJob?.cancel()
        val members = uiState.value.members
        if (members.none { it.species.isNotBlank() }) {
            _uiState.update { it.copy(analysis = null, isAnalyzing = false, analysisError = null) }
            return
        }
        val payload = members.map { it.asTeamMember() }
        val generation = ++analysisGeneration
        viewModelScope.launch { runAnalysis(payload, generation) }
    }

    /**
     * Runs one analysis request, guarded by [generation]. Launched DETACHED from
     * [analysisDebounceJob] so a later [scheduleAnalysis] (which cancels that debounce job)
     * doesn't kill an already-issued request — staleness is handled by the generation token,
     * not by cancellation, so an older response is discarded rather than clobbering fresh data.
     */
    private fun runAnalysis(members: List<TeamMember>, generation: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isAnalyzing = true) }
            try {
                val result = teamService.analyze(Format.Champions, members)
                if (generation != analysisGeneration) return@launch
                _uiState.update { it.copy(analysis = result, isAnalyzing = false, analysisError = null) }
            } catch (e: OakError) {
                if (generation != analysisGeneration) return@launch
                _uiState.update { it.copy(isAnalyzing = false, analysisError = message(e)) }
            } catch (e: Exception) {
                if (generation != analysisGeneration) return@launch
                _uiState.update { it.copy(isAnalyzing = false, analysisError = GENERIC_MESSAGE) }
            }
        }
    }

    // ---- Save (warn-but-allow — never blocked) ----

    /** Saves the team (create when new, replace when existing). **Never blocked by
     * warnings**: the request always goes out, and the returned warnings are shown
     * afterward. */
    fun save() {
        if (isReadOnly) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            val memberPayload = uiState.value.members.map { it.asTeamMember() }
            val trimmedName = uiState.value.name.trim()
            val namePayload = trimmedName.ifEmpty { null }
            try {
                val teamId = uiState.value.teamId
                val (team, validation) = if (teamId != null) {
                    teamService.update(teamId, namePayload, memberPayload)
                } else {
                    teamService.create(format, namePayload, memberPayload)
                }
                applySaved(team, validation)
                doRefreshSprites()
                doRefreshAllMovepools()
                scheduleAnalysis()
                _uiState.update { it.copy(showSaveConfirmation = true) }
            } catch (e: OakError) {
                _uiState.update { it.copy(errorMessage = message(e)) }
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = GENERIC_MESSAGE) }
            } finally {
                _uiState.update { it.copy(isSaving = false) }
            }
        }
    }

    /** Clears the transient "Saved" badge; the screen calls this after its ~1s display window. */
    fun consumeSaveConfirmation() {
        _uiState.update { it.copy(showSaveConfirmation = false) }
    }

    // ---- Export ----

    /** Renders the saved team as Showdown paste text. Requires a saved team (an id); for
     * an unsaved team it surfaces a hint instead. */
    fun exportPaste() {
        val id = uiState.value.teamId
        if (id == null) {
            _uiState.update { it.copy(errorMessage = "Save the team before exporting.") }
            return
        }
        viewModelScope.launch {
            try {
                val paste = teamService.exportPaste(id)
                _uiState.update { it.copy(exportedPaste = paste) }
            } catch (e: OakError) {
                _uiState.update { it.copy(errorMessage = message(e)) }
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = GENERIC_MESSAGE) }
            }
        }
    }

    fun consumeExportedPaste() {
        _uiState.update { it.copy(exportedPaste = null) }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    // ---- Teams Assistant draft bridge (Apply / Undo — in-memory draft only) ----

    /** The live, unsaved draft as wire [TeamMember]s — what rides EVERY assistant turn
     * and the base [applyTeamPatch] operates on. Same conversion the Save path uses. */
    fun draftWireMembers(): List<TeamMember> = uiState.value.members.map { it.asTeamMember() }

    /** An exact snapshot of the editable draft (name + rows), captured before an
     * assistant Apply so [restoreDraft] (Undo) can put it back verbatim. */
    fun draftSnapshot(): TeamDraftSnapshot = TeamDraftSnapshot(uiState.value.name, uiState.value.members)

    /** Restores a draft snapshot (assistant Undo). Nothing here touches the DB — the
     * user still reviews and Saves. Sprites/movepools re-resolve for the restored rows. */
    fun restoreDraft(snapshot: TeamDraftSnapshot) {
        _uiState.update { it.copy(name = snapshot.name, members = snapshot.members) }
        viewModelScope.launch {
            doRefreshSprites()
            doRefreshAllMovepools()
        }
        scheduleAnalysis()
    }

    /** Applies an assistant [TeamPatch] to the in-memory draft (mirrors the web panel's
     * Apply: [applyTeamPatch] on the current members + an optional rename). The DB is
     * untouched — the patched rows land in the editor's unsaved state and the user still
     * hits Save. The slot edits reuse the exact pure [applyTeamPatch] the server
     * legality-gate ran, so applied ≡ validated. */
    fun applyAssistantPatch(patch: TeamPatch) {
        if (isReadOnly) return
        val patched = applyTeamPatch(draftWireMembers(), patch)
        _uiState.update { state ->
            state.copy(
                members = patched.map { EditableMember.from(it) },
                name = patch.name ?: state.name,
            )
        }
        viewModelScope.launch {
            doRefreshSprites()
            doRefreshAllMovepools()
        }
        scheduleAnalysis()
    }

    // ---- Internals ----

    /** Adopts a server-returned team as the editor's canonical state — the server may
     * normalize fields, so the editable rows are rebuilt from the saved members. */
    private fun applySaved(team: Team, warnings: List<TeamWarning>) {
        _uiState.update {
            it.copy(
                teamId = team.id,
                name = team.name,
                members = team.members.map(EditableMember::from),
                savedTeam = team,
                warnings = warnings,
            )
        }
    }

    companion object {
        /** The 25 nature slugs, for the nature picker. */
        val natures: List<String> = listOf(
            "hardy", "lonely", "brave", "adamant", "naughty",
            "bold", "docile", "relaxed", "impish", "lax",
            "timid", "hasty", "serious", "jolly", "naive",
            "modest", "mild", "quiet", "bashful", "rash",
            "calm", "gentle", "sassy", "careful", "quirky",
        )

        /** The 18 type slugs, for the Tera-type picker. */
        val teraTypes: List<String> = listOf(
            "normal", "fire", "water", "electric", "grass", "ice",
            "fighting", "poison", "ground", "flying", "psychic", "bug",
            "rock", "ghost", "dragon", "dark", "steel", "fairy",
        )

        const val STAT_POINT_BUDGET = 66
        const val STAT_POINT_PER_STAT_MAX = 32
        const val LEVEL = 50
        const val OFF_ROSTER_LABEL = "not in the Champions roster"

        /** Debounce window collapsing rapid draft edits into one analysis request. */
        const val ANALYSIS_DEBOUNCE_MS = 750L

        const val CONNECTION_MESSAGE = "No connection. Check your network and try again."
        const val SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again."
        const val GENERIC_MESSAGE = "Something went wrong. Please try again."

        /** Maps an [OakError] to a user-facing message. */
        fun message(error: OakError): String = when (error) {
            is OakError.Transport -> CONNECTION_MESSAGE
            is OakError.RateLimited -> "You're going too fast. Please wait a moment and try again."
            OakError.Unauthorized -> SESSION_EXPIRED_MESSAGE
            is OakError.Http -> error.message.ifEmpty { GENERIC_MESSAGE }
            is OakError.Decoding -> GENERIC_MESSAGE
            is OakError.ImageRejected -> GENERIC_MESSAGE
        }
    }
}
