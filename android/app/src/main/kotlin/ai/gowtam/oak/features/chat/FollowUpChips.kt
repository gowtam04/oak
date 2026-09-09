package ai.gowtam.oak.features.chat

import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer

/**
 * Derive follow-up chips from a finalized OakAnswer + turn context (CHIP-US-1 /
 * ADR-9). Caps: ≤1 scope, ≤3 Dex, ≤1 team. Never invents calc / compare /
 * add-to-team. Lockstep with `web/src/lib/chat/follow-up-chips.ts`.
 */
data class FollowUpChip(
    val kind: Kind,
    val label: String,
    val target: String,
) {
    enum class Kind { Scope, Dex, Team }
}

data class MentionedTeam(val id: String, val name: String)

private const val DEX_CAP = 3

fun deriveFollowUpChips(
    answer: OakAnswer,
    impliedFormat: Format? = null,
    mentionedTeam: MentionedTeam? = null,
): List<FollowUpChip> {
    val chips = mutableListOf<FollowUpChip>()

    // Champions-first: never offer switching to another game (CF-UI-AC-1.1).
    val subjects = answer.subjects
    if (!subjects.isNullOrEmpty()) {
        for (subject in subjects.take(DEX_CAP)) {
            chips += FollowUpChip(
                kind = FollowUpChip.Kind.Dex,
                label = "Open ${subject.name} in Dex",
                target = subject.name,
            )
        }
    }

    val team = mentionedTeam ?: answer.savedTeam?.let { MentionedTeam(it.id, it.name) }
    if (team != null) {
        chips += FollowUpChip(
            kind = FollowUpChip.Kind.Team,
            label = "Open ${team.name}",
            target = team.id,
        )
    }

    return chips
}
