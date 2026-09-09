package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.features.chat.answercard.SubjectCard
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Subject
import androidx.compose.foundation.background
import androidx.compose.foundation.border

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Renders a **comparison** artifact — a side-by-side of the answer's `subjects[]`, the
 * native mirror of the web `ComparisonArtifact` and iOS `ComparisonArtifactView`. Like
 * both, it is derived from the committed answer payload (no fetch, M-AC-A4.1) and
 * simply lays the subjects out together, reusing the exact [SubjectCard] the answer
 * itself renders — so the sprites, names, mute dex captions, and any fallback pill
 * stay identical to the answer.
 *
 * Enamel paper plate (Key Decision 16): white `--surface` + hairline + umber
 * shadow. No type-glow chassis.
 *
 * Each card is tappable to drill into that Pokémon's full profile (AV-US-5), pushing
 * a new artifact onto the viewer's back stack via [onOpen].
 */
@Composable
fun ComparisonView(
    subjects: List<Subject>,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
    diff: PokemonCompareDiff? = null,
    onAddToTeam: ((ai.gowtam.oak.wire.TeamMember) -> Unit)? = null,
) {
    val oak = LocalOakColors.current
    val dark = oak.isDark
    val plateShape = RoundedCornerShape(OakRadius.lg)
    val umber = Color(0xFF4A352A)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(OakSpacing.lg)
            .then(
                if (dark) {
                    Modifier
                } else {
                    Modifier.shadow(
                        elevation = 4.dp,
                        shape = plateShape,
                        ambientColor = umber.copy(alpha = 0.07f),
                        spotColor = umber.copy(alpha = 0.10f),
                    )
                },
            )
            .clip(plateShape)
            .background(MaterialTheme.colorScheme.surface, plateShape)
            .border(1.dp, oak.border, plateShape)
            .padding(OakSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        for (subject in subjects) {
            Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
                SubjectCard(subject = subject, onClick = { onOpen(subject.name) })
                if (onAddToTeam != null) {
                    androidx.compose.material3.TextButton(
                        onClick = {
                            onAddToTeam(ai.gowtam.oak.features.teams.incomingMemberFromSubject(subject))
                        },
                    ) {
                        androidx.compose.material3.Text("Add to team", color = oak.accent)
                    }
                }
            }
        }
        if (diff != null) {
            CompareDiffBlock(diff)
        }
    }
}

@Composable
private fun CompareDiffBlock(diff: PokemonCompareDiff) {
    val oak = LocalOakColors.current
    androidx.compose.material3.Text(
        "${diff.left.displayName} (${diff.left.format.shortLabel}) vs ${diff.right.displayName} (${diff.right.format.shortLabel})",
        color = oak.textStrong,
        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
    )
    StatDiffRow("HP", diff.stats.left.hp, diff.stats.right.hp)
    StatDiffRow("Atk", diff.stats.left.atk, diff.stats.right.atk)
    StatDiffRow("Def", diff.stats.left.def, diff.stats.right.def)
    StatDiffRow("SpA", diff.stats.left.spa, diff.stats.right.spa)
    StatDiffRow("SpD", diff.stats.left.spd, diff.stats.right.spd)
    StatDiffRow("Spe", diff.stats.left.spe, diff.stats.right.spe)
    SetDiffRow("Types", diff.types)
    SetDiffRow("Abilities", diff.abilities)
    androidx.compose.material3.Text(
        "Speed @ L${diff.speed.defaultLevel}: ${diff.speed.leftValue} vs ${diff.speed.rightValue}",
        color = oak.textMuted,
    )
    SetDiffRow("Movepool", diff.movepool)
    SetDiffRow("Weak to", diff.matchups.weakTo)
    SetDiffRow("Resists", diff.matchups.resists)
    SetDiffRow("Immune", diff.matchups.immuneTo)
}

@Composable
private fun StatDiffRow(label: String, left: Int, right: Int) {
    val oak = LocalOakColors.current
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        androidx.compose.material3.Text(label, color = oak.textMuted)
        androidx.compose.material3.Text("$left  ·  $right", color = oak.textStrong)
    }
}

@Composable
private fun SetDiffRow(label: String, set: PokemonCompareSetDiff) {
    val oak = LocalOakColors.current
    androidx.compose.material3.Text(
        "$label — only ${set.onlyLeft.joinToString().ifBlank { "—" }} / shared ${set.shared.joinToString().ifBlank { "—" }} / only ${set.onlyRight.joinToString().ifBlank { "—" }}",
        color = oak.textMuted,
        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
    )
}
