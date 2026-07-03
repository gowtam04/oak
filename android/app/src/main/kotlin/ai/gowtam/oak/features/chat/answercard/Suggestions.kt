package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.OakAnswer
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders an answer's `suggestions` — the closest-match / follow-up prompts Oak offers.
 * Each is a tappable chip; tapping calls [onSelect] with the verbatim text (sent as the
 * next user message). The header is status-aware ("Did you mean" on `resolution_failed`,
 * else "Suggestions"). The caller gates it on non-blank suggestions.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun Suggestions(
    suggestions: List<String>,
    status: OakAnswer.Status,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val items = nonBlank(suggestions)
    if (items.isEmpty()) return
    val oak = LocalOakColors.current
    val isResolutionMiss = status == OakAnswer.Status.RESOLUTION_FAILED
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = if (isResolutionMiss) Icons.Filled.Search else Icons.AutoMirrored.Filled.Message,
                contentDescription = null,
                tint = oak.textMuted,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = if (isResolutionMiss) "Did you mean" else "Suggestions",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textMuted,
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        ) {
            for (text in items) {
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    color = oak.accent,
                    modifier = Modifier
                        .background(oak.accent.copy(alpha = 0.12f), RoundedCornerShape(OakRadius.pill))
                        .border(1.dp, oak.accent.copy(alpha = 0.35f), RoundedCornerShape(OakRadius.pill))
                        .clickable { onSelect(text) }
                        .padding(horizontal = 14.dp, vertical = OakSpacing.sm),
                )
            }
        }
    }
}
