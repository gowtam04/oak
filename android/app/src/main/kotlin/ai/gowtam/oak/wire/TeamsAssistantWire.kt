package ai.gowtam.oak.wire

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `POST /api/teams/assistant` — the team-builder assistant docked
 * in the team editor. A deliberate SIBLING of the chat wire (`ChatWire.kt`), NOT
 * an extension: the terminal `answer` carries a [BuilderAnswer] (prose + an
 * optional [TeamPatch]), never an [OakAnswer], and there is no `scope` event
 * (the request's `draft.format` IS the turn's scope).
 *
 * Authoritative TS sources: `web/src/lib/sse/teams-assistant-sse-types.ts` (the
 * request body + event map) and `web/src/agent/teams-assistant/schemas.ts`
 * (`builderAnswerSchema`, `teamPatchSchema`, `applyTeamPatch`, `blankTeamMember`
 * — the patch semantics the server legality-gate AND this client's Apply both
 * run, byte-for-byte).
 */

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * The live, unsaved on-screen draft, sent with EVERY assistant turn.
 * `draft.format` IS the turn's data scope — there is nothing for the server to
 * resolve or announce.
 */
@Serializable
data class TeamsAssistantDraft(
    /** Current team-name input (may be empty). */
    val name: String,
    /** The draft's format — this IS the turn's data scope. */
    val format: Format,
    /** The editor's current members, in slot order (0-indexed, ≤ 6). */
    val members: List<TeamMember>,
)

/** Request body for `POST /api/teams/assistant` (signed-in only). */
@Serializable
data class TeamsAssistantRequest(
    /** Per-editor conversation id (client-generated; in-memory history only). */
    @SerialName("session_id") val sessionId: String,
    val message: String,
    val draft: TeamsAssistantDraft,
)

// ---------------------------------------------------------------------------
// Patch (builder output)
// ---------------------------------------------------------------------------

/**
 * One slot-level edit (`teamPatchSlotSchema`). [member] is a FULL replacement
 * payload for that slot (never a partial-field merge); `member == null` removes
 * the slot. [slot] refers to the PRE-patch draft index.
 */
@Serializable
data class TeamPatchSlot(
    val slot: Int,
    val member: TeamMember?,
)

/**
 * A set of slot edits plus an optional rename (`teamPatchSchema`). An
 * omitted/null [name] leaves the team name unchanged.
 */
@Serializable
data class TeamPatch(
    val name: String? = null,
    val slots: List<TeamPatchSlot>,
)

/**
 * The builder assistant's whole answer (`builderAnswerSchema`). Deliberately
 * tiny next to [OakAnswer]: prose + an optional patch. [teamPatch] absent/null
 * ⇒ an advice-only turn (no edits proposed).
 */
@Serializable
data class BuilderAnswer(
    @SerialName("answer_markdown") val answerMarkdown: String,
    @SerialName("team_patch") val teamPatch: TeamPatch? = null,
)

/**
 * One decoded server-sent event from the builder stream. Mirrors the chat event
 * order MINUS `scope`: `tool_activity` (zero or more) → `answer_start` (zero or
 * more) / `answer_delta` (zero or more) → exactly one terminal `answer` (a
 * [BuilderAnswer]). An [Error] event is
 * reserved for transport/API faults ONLY.
 */
sealed interface BuilderSseEvent {
    data class ToolActivity(val tool: String, val label: String) : BuilderSseEvent
    data object AnswerStart : BuilderSseEvent
    data class AnswerDelta(val text: String) : BuilderSseEvent
    data class Answer(val answer: BuilderAnswer) : BuilderSseEvent
    data class Error(val code: String, val message: String, val status: Int?) : BuilderSseEvent
}

// ---------------------------------------------------------------------------
// Ported pure functions (DADR-12) — ported VERBATIM from
// web/src/agent/teams-assistant/schemas.ts and display-names.ts, parity-tested
// against the same vectors as web's schemas.test.ts / iOS's
// TeamsAssistantWireTests so the client-applied result equals the
// server-validated one.
// ---------------------------------------------------------------------------

/**
 * A fresh, empty member used to pad gaps when a patch targets a slot beyond the
 * draft's current length (partial team allowed; IVs default 31, level 50).
 * Mirrors `blankTeamMember` in `schemas.ts`.
 */
fun blankTeamMember(): TeamMember = TeamMember(
    species = null,
    ability = null,
    item = null,
    moves = emptyList(),
    nature = null,
    evs = StatSpread(hp = 0, atk = 0, def = 0, spa = 0, spd = 0, spe = 0),
    ivs = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
    teraType = null,
    level = 50,
    nickname = null,
    gender = null,
    shiny = null,
)

/**
 * Apply a patch to a draft's members. Pure — returns a new list, never mutates.
 * Slot indices refer to the PRE-patch draft (mirrors `applyTeamPatch` in
 * `schemas.ts` exactly, so validated and applied results can't diverge):
 *  1. every `member != null` op replaces (or, past the end, extends — gaps
 *     padded with [blankTeamMember]) its slot;
 *  2. every `member == null` op marks its pre-patch slot for removal;
 *  3. removals compact the list last, preserving order; the result is capped
 *     at 6 (a defensive bound — the Zod layer already bounds `slot` to 0..5).
 */
fun applyTeamPatch(members: List<TeamMember>, patch: TeamPatch): List<TeamMember> {
    val next = members.toMutableList<TeamMember?>()
    val removals = mutableListOf<TeamPatchSlot>()
    for (op in patch.slots) {
        if (op.member == null) {
            removals.add(op)
            continue
        }
        while (next.size <= op.slot) next.add(blankTeamMember())
        next[op.slot] = op.member
    }
    for (op in removals) {
        if (op.slot < next.size) next[op.slot] = null
    }
    return next.filterNotNull().take(6)
}

/**
 * Human-readable one-liners for a patch's operations (mirrors `describePatch`
 * in `TeamsAssistantPanel.tsx` — same curly quotes, em-dash, and middot
 * separators).
 */
fun describeTeamPatch(patch: TeamPatch): List<String> {
    val lines = mutableListOf<String>()
    patch.name?.let { name ->
        lines.add("Rename team to “$name”")
    }
    for (op in patch.slots) {
        val n = op.slot + 1
        val member = op.member
        if (member == null) {
            lines.add("Slot $n: remove")
            continue
        }
        val species = member.species?.let { titleizeTeamSlug(it) } ?: "(empty)"
        val bits = mutableListOf<String>()
        member.ability?.let { bits.add(titleizeTeamSlug(it)) }
        member.item?.let { bits.add(titleizeTeamSlug(it)) }
        if (member.moves.isNotEmpty()) {
            bits.add(member.moves.joinToString(" / ") { titleizeTeamSlug(it) })
        }
        member.nature?.let { bits.add("${titleizeTeamSlug(it)} nature") }
        val suffix = if (bits.isEmpty()) "" else " — " + bits.joinToString(" · ")
        lines.add("Slot $n: $species$suffix")
    }
    return lines
}

/**
 * Title-case a slug for display ("great-tusk" → "Great Tusk") — mirrors
 * `titleizeSlug` in `web/src/components/teams/display-names.ts`.
 */
fun titleizeTeamSlug(value: String): String {
    return value
        .split('-', ' ', '\t', '\n')
        .filter { it.isNotEmpty() }
        .joinToString(" ") { word ->
            word.substring(0, 1).uppercase() + word.substring(1)
        }
}
