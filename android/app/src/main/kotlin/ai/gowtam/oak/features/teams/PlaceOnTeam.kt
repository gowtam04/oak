package ai.gowtam.oak.features.teams

import ai.gowtam.oak.wire.TeamMember

/**
 * Portable add-to-team slot write (ADR-5).
 *
 * First empty = lowest index 0–5 whose `species` is null/empty (ADD-BR-1).
 * A full roster is never auto-replaced — the caller must name a slot
 * (ADD-BR-6). Incoming is already species + copied named fields; unnamed
 * stay [ai.gowtam.oak.wire.blankTeamMember] defaults (ADD-BR-2). Does not
 * mutate `members`.
 */

private const val TEAM_SIZE = 6

sealed interface PlaceOnTeamTarget {
    data object FirstEmpty : PlaceOnTeamTarget
    data class Replace(val index: Int) : PlaceOnTeamTarget
}

sealed interface PlaceOnTeamResult {
    data class Ok(val members: List<TeamMember>, val slotIndex: Int) : PlaceOnTeamResult
    data object Full : PlaceOnTeamResult
}

private fun isEmptySlot(member: TeamMember?): Boolean {
    if (member == null) return true
    return member.species.isNullOrEmpty()
}

/**
 * Write [incoming] into the first empty slot, or replace a named index.
 * Full + [PlaceOnTeamTarget.FirstEmpty] → [PlaceOnTeamResult.Full] (no auto-replace).
 */
fun placeSpeciesOnTeam(
    members: List<TeamMember>,
    incoming: TeamMember,
    target: PlaceOnTeamTarget,
): PlaceOnTeamResult {
    if (target is PlaceOnTeamTarget.Replace) {
        val next = members.toMutableList()
        writeAt(next, target.index, incoming)
        return PlaceOnTeamResult.Ok(members = next, slotIndex = target.index)
    }

    for (i in 0 until TEAM_SIZE) {
        if (isEmptySlot(members.getOrNull(i))) {
            val next = members.toMutableList()
            writeAt(next, i, incoming)
            return PlaceOnTeamResult.Ok(members = next, slotIndex = i)
        }
    }

    return PlaceOnTeamResult.Full
}

private fun writeAt(members: MutableList<TeamMember>, index: Int, incoming: TeamMember) {
    if (index < members.size) {
        members[index] = incoming
    } else {
        members.add(incoming)
    }
}
