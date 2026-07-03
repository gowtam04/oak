package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.ClarifyQuestion
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders an answer's `question` — the "ask the user" affordance on a
 * `clarification_needed` outcome. Each option is a tappable card; tapping sends the
 * option's `label` **verbatim** as the next user turn via [onSelect]. The caller gates
 * it on a question with ≥ 1 option.
 */
@Composable
fun ClarifyQuestion(
    question: ClarifyQuestion?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val options = question?.options.orEmpty()
    if (options.isEmpty()) return
    val oak = LocalOakColors.current
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.HelpOutline, contentDescription = null, tint = oak.info, modifier = Modifier.size(16.dp))
            Text(
                text = "Pick one to continue",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.info,
            )
        }
        for (option in options) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, oak.info.copy(alpha = 0.25f), RoundedCornerShape(OakRadius.md))
                    .clickable { onSelect(option.label) }
                    .padding(OakSpacing.md),
                horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = option.label,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = oak.textStrong,
                    )
                    val description = option.description?.trim()
                    if (!description.isNullOrEmpty()) {
                        Text(text = description, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                    }
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = oak.info,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}
