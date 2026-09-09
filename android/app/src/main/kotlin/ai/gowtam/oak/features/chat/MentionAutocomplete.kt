package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.TeamSummary
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** `@` team autocomplete (MEN-US-1). Hidden for guests / when not typing `@`. */
@Composable
fun MentionAutocomplete(
    suggestions: List<TeamSummary>,
    query: String?,
    onPick: (TeamSummary) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (query == null) return
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, oak.border, shape)
            .padding(vertical = OakSpacing.xs),
    ) {
        if (suggestions.isEmpty()) {
            Text(
                text = "No saved teams match",
                style = MaterialTheme.typography.bodySmall,
                color = oak.textMuted,
                modifier = Modifier.padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
            )
        } else {
            for (team in suggestions) {
                Text(
                    text = team.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = oak.textStrong,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(team) }
                        .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
                )
            }
        }
    }
}
