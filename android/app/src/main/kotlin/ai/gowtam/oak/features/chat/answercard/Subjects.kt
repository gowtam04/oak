package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.SpriteImage
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Subject
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HistoryToggleOff
import androidx.compose.material.icons.filled.ViewColumn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders an answer's `subjects` — sprite 72, name 600, mute `#dex` caption.
 * No type-glow well (types live as chips at the top of the plate). Tapping a
 * row opens that Pokémon's profile; with ≥ 2 subjects a "Compare in viewer"
 * button opens a side-by-side comparison. The caller gates it on non-empty subjects.
 */
@Composable
fun Subjects(
    subjects: List<Subject>,
    onOpenEntity: (EntityKind, String) -> Unit,
    onOpenComparison: (List<Subject>) -> Unit,
    modifier: Modifier = Modifier,
    onAddToTeam: ((ai.gowtam.oak.wire.TeamMember) -> Unit)? = null,
) {
    val oak = LocalOakColors.current
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        for (subject in subjects) {
            Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
                SubjectCard(
                    subject = subject,
                    onClick = { onOpenEntity(EntityKind.POKEMON, subject.name) },
                )
                if (onAddToTeam != null) {
                    OakButton(
                        onClick = {
                            onAddToTeam(ai.gowtam.oak.features.teams.incomingMemberFromSubject(subject))
                        },
                        style = OakButtonStyle.Secondary,
                    ) {
                        Text("Add to team", color = oak.accent)
                    }
                }
            }
        }
        if (subjects.size >= 2) {
            OakButton(onClick = { onOpenComparison(subjects) }, style = OakButtonStyle.Secondary) {
                Icon(Icons.Filled.ViewColumn, contentDescription = null, modifier = Modifier.size(18.dp), tint = oak.accent)
                Text(text = "Compare in viewer", color = oak.accent)
            }
        }
    }
}

/**
 * The tappable sprite + name + mute dex row for one [Subject]. `internal` so
 * the artifact viewer's comparison artifact (P7) can reuse the same card.
 */
@Composable
internal fun SubjectCard(subject: Subject, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OakRadius.md))
            .clickable(onClick = onClick)
            .padding(vertical = OakSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SpriteImage(url = subject.spriteUrl, name = subject.name, size = 72.dp)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = subject.name,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
            )
            subject.dexNumber?.let { dex ->
                Text(
                    text = dexLabel(dex),
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    color = oak.textMuted,
                )
            }
            if (subject.isFallback) {
                Row(
                    modifier = Modifier
                        .background(oak.warning.copy(alpha = 0.14f), RoundedCornerShape(OakRadius.pill))
                        .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.HistoryToggleOff, contentDescription = null, tint = oak.warning, modifier = Modifier.size(12.dp))
                    Text(
                        text = subject.sourceGeneration ?: "Fallback",
                        style = MaterialTheme.typography.labelSmall,
                        color = oak.warning,
                    )
                }
            }
        }
    }
}

/** National Dex number, zero-padded to four digits (e.g. `#0006`). */
internal fun dexLabel(number: Int): String {
    val digits = number.toString()
    return "#" + "0".repeat(maxOf(0, 4 - digits.length)) + digits
}
