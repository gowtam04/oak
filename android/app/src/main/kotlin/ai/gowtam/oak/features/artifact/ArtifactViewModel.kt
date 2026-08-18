package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.services.ArtifactPinService
import ai.gowtam.oak.services.ArtifactService
import ai.gowtam.oak.services.CreatePinResult
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityArtifactOk
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.PinnedArtifactSummary
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Drives the artifact bottom sheet (artifact-viewer.md M-ART-US-1/2/3, M-BR-ART-1/4/5;
 * component-design.md "ArtifactViewModel"). The class-for-class Kotlin port of iOS
 * `ArtifactViewModel`, re-expressed as an `androidx.lifecycle.ViewModel` over
 * `StateFlow` (Compose's counterpart to `@Observable`).
 *
 * The viewer behaves like a small in-app browser over the chat: it shows **one
 * artifact at a time** (M-BR-ART-1) via a back stack — drilling from one artifact into
 * another (a Pokémon → one of its moves, a team → a member) pushes a new entry, and
 * [back] returns to the previous one (M-ART-US-3). [current] is always the top of
 * [stack]; an empty stack means the sheet is closed ([isPresented]).
 *
 * It depends on the [ArtifactService] **interface** (never `LiveArtifactService`) so it
 * unit-tests against a fake. Entity/saved-team artifacts fetch through the service; a
 * proposed-team, comparison, or damage-calc artifact uses the inline data already
 * delivered with the answer, so opening it is instant with no round-trip (M-AC-A4.1).
 *
 * Honest failure (M-BR-ART-5, `ArtifactService` policy): a fetch that comes back
 * `null` / `not_found` / `unavailable` resolves the entry to an [ArtifactContent.Unavailable]
 * / [ArtifactContent.TeamUnavailable] state rather than throwing or silently popping it —
 * the sheet stays open and the user can always get back to chatting with a single gesture.
 */
class ArtifactViewModel(
    private val service: ArtifactService,
    initialFormat: Format,
    signedIn: Boolean = false,
    pins: ArtifactPinService? = null,
    conversationId: String? = null,
) : ViewModel() {
    private var signedIn: Boolean = signedIn
    private var pins: ArtifactPinService? = pins
    private var conversationId: String? = conversationId

    private val _stack = MutableStateFlow<List<Artifact>>(emptyList())

    /** The back stack. The **last** element is the visible artifact (M-BR-ART-1). */
    val stack: StateFlow<List<Artifact>> = _stack.asStateFlow()

    /**
     * The active data scope for entity fetches (M-BR-ART-4). Updated by [updateFormat]
     * as the chat's resolved/seeded scope changes turn to turn.
     */
    private var format: Format = initialFormat

    /**
     * The scope every artifact currently on the stack was fetched under (M-BR-ART-4). A
     * scope change clears the stack ([updateFormat]), so this always equals the request
     * format of whatever is showing — the value the entity-fallback badge compares
     * `source_format` against to name the user's OWN requested scope.
     */
    val activeFormat: Format get() = format

    /** The currently visible artifact (top of the stack), or `null` when closed. */
    val current: Artifact? get() = _stack.value.lastOrNull()

    /** Whether the sheet should be presented — drives the host's sheet visibility. */
    val isPresented: Boolean get() = _stack.value.isNotEmpty()

    /** Whether a back control belongs in the sheet (more than one artifact on the stack). */
    val canGoBack: Boolean get() = _stack.value.size > 1

    // ---- Opening artifacts (push) ----

    /**
     * Opens an entity (Pokémon/move/ability/item/type) by resolving its full profile
     * for the active format (M-ART-US-1, M-BR-ART-4). Pushes a [ArtifactContent.Loading]
     * entry immediately so the sheet responds at once, then fills it in when the fetch
     * returns; a `null`/`not_found`/`unavailable` result resolves to
     * [ArtifactContent.Unavailable] so the sheet never breaks.
     */
    fun openEntity(kind: EntityKind, query: String) {
        val entryId = UUID.randomUUID().toString()
        _stack.update { it + Artifact(id = entryId, title = query, content = ArtifactContent.Loading) }
        viewModelScope.launch {
            val result = service.entity(kind, query, format)
            resolve(entryId) {
                when (result) {
                    is EntityArtifact.Ok -> Artifact(
                        id = entryId,
                        title = result.v.resolved.displayName,
                        content = ArtifactContent.Entity(result.v),
                    )
                    // A resolution miss carries the server's "did you mean" names (#2) so
                    // the miss view can offer them as tappable suggestions; every other
                    // arm (unavailable / transport-null) is a bare miss.
                    is EntityArtifact.NotFound -> Artifact(
                        id = entryId,
                        title = query,
                        content = ArtifactContent.Unavailable(kind, query, result.v.suggestions),
                    )
                    else -> Artifact(id = entryId, title = query, content = ArtifactContent.Unavailable(kind, query))
                }
            }
        }
    }

    /**
     * Opens the agent's **proposed team** using the INLINE data already delivered with
     * the answer (no fetch — M-AC-A4.1). Synchronous: the team sheet appears instantly.
     */
    fun openProposedTeam(team: ProposedTeam, warnings: List<TeamWarning>) {
        push(
            Artifact(
                title = team.name,
                content = ArtifactContent.TeamSheet(
                    TeamArtifact(name = team.name, format = team.format, members = team.members, warnings = warnings, savedId = null),
                ),
            ),
        )
    }

    /**
     * Opens a **saved team** by reference, fetching its members + warnings fresh
     * (M-AC-A3.2: the saved-team card's "Open in viewer"). Pushes a
     * [ArtifactContent.Loading] entry, then resolves to the team or
     * [ArtifactContent.TeamUnavailable] if it can't be loaded.
     */
    fun openSavedTeam(ref: SavedTeamRef) {
        val entryId = UUID.randomUUID().toString()
        _stack.update { it + Artifact(id = entryId, title = ref.name, content = ArtifactContent.Loading) }
        viewModelScope.launch {
            val result = service.savedTeam(ref.id)
            resolve(entryId) {
                if (result != null) {
                    val (team, warnings) = result
                    Artifact(
                        id = entryId,
                        title = team.name,
                        content = ArtifactContent.TeamSheet(
                            TeamArtifact(name = team.name, format = team.format, members = team.members, warnings = warnings, savedId = team.id),
                        ),
                    )
                } else {
                    Artifact(id = entryId, title = ref.name, content = ArtifactContent.TeamUnavailable)
                }
            }
        }
    }

    /**
     * Opens a side-by-side **comparison** of the answer's subjects using the INLINE
     * data delivered with the answer (no fetch — mirrors web's `comparison` structured
     * artifact). Synchronous: the sheet appears instantly.
     */
    fun openComparison(subjects: List<Subject>) {
        push(Artifact(title = "Comparison", content = ArtifactContent.Comparison(subjects)))
    }

    /**
     * Opens the answer's **damage calculation** using its INLINE `damage_calc` (no
     * fetch — mirrors web's `damage-calc` structured artifact). Synchronous.
     */
    fun openDamageCalc(damageCalc: DamageCalc) {
        push(Artifact(title = "Damage calculation", content = ArtifactContent.DamageCalcContent(damageCalc)))
    }

    // ---- Navigation ----

    /** Returns to the previous artifact (M-AC-A3.2). At the root, backing out dismisses the sheet. */
    fun back() {
        val stackNow = _stack.value
        if (stackNow.size <= 1) {
            dismiss()
            return
        }
        _stack.value = stackNow.subList(0, stackNow.size - 1)
    }

    /**
     * Closes the viewer and clears the back stack — the single-gesture return to chat
     * (M-AC-A3.3, M-BR-ART-5). Artifacts are ephemeral (M-BR-ART-2), so nothing is persisted.
     */
    fun dismiss() {
        _stack.value = emptyList()
    }

    /**
     * Rebuilds the viewer for a newly active scope (M-BR-ART-4): entity artifacts
     * already on the stack were fetched under the OLD format and may not apply to the
     * new one, so a scope change clears the stack outright rather than leaving
     * mismatched data on screen. A no-op when the format hasn't actually changed (so a
     * recomposition doesn't spuriously dismiss an open sheet).
     */
    fun updateFormat(newFormat: Format) {
        if (newFormat == format) return
        format = newFormat
        dismiss()
    }

    fun bindSession(
        signedIn: Boolean,
        conversationId: String?,
        pins: ArtifactPinService?,
    ) {
        this.signedIn = signedIn
        this.conversationId = conversationId
        this.pins = pins
    }

    // ---- P8: Dex hop / Compare with… / Pin ----

    private val _pinError = MutableStateFlow<String?>(null)
    val pinError: StateFlow<String?> = _pinError.asStateFlow()

    private val _pinnedArtifacts = MutableStateFlow<List<PinnedArtifactSummary>>(emptyList())
    val pinnedArtifacts: StateFlow<List<PinnedArtifactSummary>> = _pinnedArtifacts.asStateFlow()

    private var lastPinId: String? = null

    val canOpenInDex: Boolean get() = dexHop() != null

    val canCompare: Boolean
        get() {
            val entity = (current?.content as? ArtifactContent.Entity)?.v ?: return false
            return entity.kind == EntityKind.POKEMON
        }

    val canPin: Boolean
        get() = signedIn && pinKind() != null

    fun dexHop(): DexHop? {
        val entity = (current?.content as? ArtifactContent.Entity)?.v ?: return null
        if (entity.kind == EntityKind.TYPE || entity.kind is EntityKind.Unknown) return null
        return DexHop(
            kind = entity.kind,
            query = entity.resolved.slug,
            format = entity.format,
        )
    }

    fun compareWith(query: String, format: Format) {
        if (!canCompare) return
        viewModelScope.launch {
            val leftOk = (current?.content as? ArtifactContent.Entity)?.v ?: return@launch
            val leftPokemon = leftOk.data as? ai.gowtam.oak.wire.EntityData.Pokemon ?: return@launch
            val result = service.entity(EntityKind.POKEMON, query, format)
            val ok = (result as? EntityArtifact.Ok)?.v ?: return@launch
            val pokemon = ok.data as? ai.gowtam.oak.wire.EntityData.Pokemon ?: return@launch
            val leftSubject = Subject(
                name = leftPokemon.v.displayName,
                spriteUrl = leftPokemon.v.spriteUrl,
                types = leftPokemon.v.types,
                isFallback = leftOk.isFallback,
                sourceGeneration = leftPokemon.v.sourceGeneration,
            )
            val rightSubject = Subject(
                name = pokemon.v.displayName,
                spriteUrl = pokemon.v.spriteUrl,
                types = pokemon.v.types,
                isFallback = ok.isFallback,
                sourceGeneration = pokemon.v.sourceGeneration,
            )
            val diff = diffPokemonProfiles(
                PokemonCompareSubject(format = leftOk.format, profile = leftPokemon.v),
                PokemonCompareSubject(format = ok.format, profile = pokemon.v),
            )
            push(
                Artifact(
                    title = "${leftSubject.name} vs ${rightSubject.name}",
                    content = ArtifactContent.Comparison(
                        subjects = listOf(leftSubject, rightSubject),
                        diff = diff,
                    ),
                ),
            )
        }
    }

    fun openPinned(kind: String, title: String, snapshot: JsonElement?) {
        val decoded = snapshot?.let { runCatching { OakJson.decodeFromJsonElement(PinSnapshotBody.serializer(), it) }.getOrNull() }
        when (kind) {
            ArtifactPinKind.Calc.rawValue -> {
                val calc = decoded?.damageCalc ?: return
                openDamageCalc(calc)
            }
            ArtifactPinKind.Comparison.rawValue -> {
                val subjects = decoded?.subjects ?: return
                openComparison(subjects)
            }
            ArtifactPinKind.TeamSheet.rawValue -> {
                val team = decoded?.team ?: return
                openProposedTeam(team, decoded.warnings.orEmpty())
            }
            else -> Unit
        }
        if (title.isNotBlank() && current != null) {
            // title already set by the open* helpers
        }
    }

    fun pin() {
        val kind = pinKind() ?: return
        val conv = conversationId ?: return
        val pinService = pins ?: return
        val title = current?.title ?: kind.rawValue
        val snapshot = pinSnapshotFor(current?.content)
        viewModelScope.launch {
            when (val result = pinService.create(conv, kind, title, snapshot = snapshot)) {
                is CreatePinResult.Ok -> {
                    lastPinId = result.pin.id
                    _pinnedArtifacts.value = result.pinnedArtifacts
                    _pinError.value = null
                }
                is CreatePinResult.Cap -> {
                    _pinError.value = "Pin cap is ${result.max}"
                }
                is CreatePinResult.Error -> {
                    _pinError.value = result.message
                }
            }
        }
    }

    fun unpin() {
        val conv = conversationId ?: return
        val pinService = pins ?: return
        val pinId = lastPinId ?: _pinnedArtifacts.value.lastOrNull()?.id ?: return
        viewModelScope.launch {
            val remaining = pinService.delete(conv, pinId)
            if (remaining != null) {
                _pinnedArtifacts.value = remaining
                lastPinId = null
                _pinError.value = null
            }
        }
    }

    private fun pinSnapshotFor(content: ArtifactContent?): PinSnapshotBody? = when (content) {
        is ArtifactContent.DamageCalcContent -> PinSnapshotBody(
            kind = ArtifactPinKind.Calc.rawValue,
            title = current?.title ?: "Calc",
            damageCalc = content.v,
        )
        is ArtifactContent.Comparison -> PinSnapshotBody(
            kind = ArtifactPinKind.Comparison.rawValue,
            title = current?.title ?: "Comparison",
            subjects = content.subjects,
        )
        is ArtifactContent.TeamSheet -> PinSnapshotBody(
            kind = ArtifactPinKind.TeamSheet.rawValue,
            title = content.v.name,
            team = ai.gowtam.oak.wire.ProposedTeam(
                name = content.v.name,
                format = content.v.format,
                members = content.v.members,
            ),
            warnings = content.v.warnings,
        )
        else -> null
    }

    private fun pinKind(): ArtifactPinKind? = when (current?.content) {
        is ArtifactContent.TeamSheet -> ArtifactPinKind.TeamSheet
        is ArtifactContent.Comparison -> ArtifactPinKind.Comparison
        is ArtifactContent.DamageCalcContent -> ArtifactPinKind.Calc
        else -> null
    }

    // ---- Internals ----

    private fun push(artifact: Artifact) {
        _stack.update { it + artifact }
    }

    /** Replaces the stack entry with id [id] (if still present) with [make]'s result. */
    private inline fun resolve(id: String, make: () -> Artifact) {
        _stack.update { list -> list.map { if (it.id == id) make() else it } }
    }
}

// ---------------------------------------------------------------------------
// Artifact model
// ---------------------------------------------------------------------------

/**
 * One entry on the viewer's back stack: a stable identity, the title shown in the
 * sheet's top bar, and the content to render. Replaced in place as an async fetch
 * settles ([ArtifactViewModel.resolve]).
 */
@Immutable
data class Artifact(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val content: ArtifactContent,
)

/**
 * What an [Artifact] is showing — a small closed set mirroring the web viewer's
 * artifact kinds (entity profile, team sheet) plus the transient loading/miss states
 * the native sheet needs. Artifacts are ephemeral (M-BR-ART-2); this is never persisted.
 */
sealed interface ArtifactContent {
    /** Awaiting a fetch (entity or saved team). */
    data object Loading : ArtifactContent

    /** A resolved entity profile (Pokémon/move/ability/item/type) — rendered by [EntityDetail]. */
    data class Entity(val v: EntityArtifactOk) : ArtifactContent

    /** A team sheet — the agent's proposed team (inline) or a fetched saved team. */
    data class TeamSheet(val v: TeamArtifact) : ArtifactContent

    /**
     * A side-by-side comparison of the answer's subjects — rendered from the answer's
     * INLINE payload (no fetch). Mirrors the web `comparison` structured artifact.
     */
    data class Comparison(
        val subjects: List<Subject>,
        val diff: PokemonCompareDiff? = null,
    ) : ArtifactContent

    /**
     * A worked damage calculation — rendered from the answer's INLINE `damage_calc`
     * (no fetch). Mirrors the web `damage-calc` structured artifact.
     */
    data class DamageCalcContent(val v: DamageCalc) : ArtifactContent

    /**
     * An entity that couldn't be shown (`not_found` / `unavailable` / transport) — an
     * honest miss (M-BR-ART-5), carrying the original kind + query for the message.
     * [suggestions] is populated only on a `not_found` (top "did you mean" names, #2),
     * empty on an `unavailable`/transport miss.
     */
    data class Unavailable(
        val kind: EntityKind,
        val query: String,
        val suggestions: List<String> = emptyList(),
    ) : ArtifactContent

    /** A saved team that couldn't be loaded. */
    data object TeamUnavailable : ArtifactContent
}

/**
 * A team rendered in the viewer — unified across the agent's **proposed** team
 * (inline, no fetch) and a **saved** team (fetched). [savedId] is non-`null` only for
 * a saved team.
 */
@Immutable
data class TeamArtifact(
    val name: String,
    val format: Format,
    val members: List<TeamMember>,
    val warnings: List<TeamWarning>,
    /** The team's id when it is a persisted saved team; `null` for an ephemeral proposed team. */
    val savedId: String?,
)

@kotlinx.serialization.Serializable
data class PinSnapshotBody(
    val kind: String,
    val title: String,
    val damageCalc: DamageCalc? = null,
    val subjects: List<Subject>? = null,
    val team: ProposedTeam? = null,
    val warnings: List<TeamWarning>? = null,
)
