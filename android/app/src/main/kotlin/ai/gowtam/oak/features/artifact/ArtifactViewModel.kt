package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.services.ArtifactService
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityArtifactOk
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
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
) : ViewModel() {

    private val _stack = MutableStateFlow<List<Artifact>>(emptyList())

    /** The back stack. The **last** element is the visible artifact (M-BR-ART-1). */
    val stack: StateFlow<List<Artifact>> = _stack.asStateFlow()

    /**
     * The active data scope for entity fetches (M-BR-ART-4). Updated by [updateFormat]
     * as the chat's resolved/seeded scope changes turn to turn.
     */
    private var format: Format = initialFormat

    /**
     * Prefills the chat composer with a follow-up about the open artifact (the web
     * viewer's "Ask about this in chat"). The chat host installs this to route to
     * `ChatViewModel.prefillComposer`; unset ⇒ [askInChat] is a plain dismiss.
     */
    var onAskInChat: ((String) -> Unit)? = null

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
     * Prefills the chat composer with [text] (a follow-up about the open artifact) and
     * closes the sheet — the web viewer's "Ask about this in chat" (`askInChat`). The
     * prefill fills the composer for the user to edit/send; it does NOT auto-send.
     */
    fun askInChat(text: String) {
        onAskInChat?.invoke(text)
        dismiss()
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
    data class Comparison(val subjects: List<Subject>) : ArtifactContent

    /**
     * A worked damage calculation — rendered from the answer's INLINE `damage_calc`
     * (no fetch). Mirrors the web `damage-calc` structured artifact.
     */
    data class DamageCalcContent(val v: DamageCalc) : ArtifactContent

    /**
     * An entity that couldn't be shown (`not_found` / `unavailable` / transport) — an
     * honest miss (M-BR-ART-5), carrying the original kind + query for the message.
     */
    data class Unavailable(val kind: EntityKind, val query: String) : ArtifactContent

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

// ---------------------------------------------------------------------------
// Ask-in-chat copy
// ---------------------------------------------------------------------------

/**
 * The composer-prefill text for [artifact] — mirrors the web viewer's per-kind
 * `headerFor(...).askText` (`ArtifactViewer.tsx`) and iOS `ArtifactSheetView.askText`.
 * A pure, top-level function so it is directly unit-testable without a Compose host.
 */
fun askInChatText(artifact: Artifact): String = when (val content = artifact.content) {
    ArtifactContent.Loading -> "Tell me about ${artifact.title}."
    is ArtifactContent.Entity -> "Tell me more about ${content.v.resolved.displayName}."
    is ArtifactContent.Unavailable -> "Tell me about ${content.query}."
    is ArtifactContent.TeamSheet -> "Tell me about the team \"${content.v.name}\"."
    ArtifactContent.TeamUnavailable -> "Tell me about the team \"${artifact.title}\"."
    is ArtifactContent.Comparison -> "Tell me more about this comparison."
    is ArtifactContent.DamageCalcContent -> "Explain this damage calculation in more detail."
}
