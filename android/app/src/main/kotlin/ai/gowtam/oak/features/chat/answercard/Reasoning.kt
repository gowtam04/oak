package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakSpacing
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The collapsible "Reasoning" section — native mirror of the web `ReasoningBlock`
 * (`reasoning_markdown`), closed by default. The caller gates it on non-blank reasoning
 * (via [answerSections]).
 */
@Composable
fun Reasoning(reasoningMarkdown: String, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    var expanded by remember { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(vertical = OakSpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Psychology, contentDescription = null, tint = oak.textMuted, modifier = Modifier.size(18.dp))
            Text(
                text = "Reasoning",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = oak.textMuted,
                modifier = Modifier.size(20.dp),
            )
        }
        AnimatedVisibility(visible = expanded) {
            MarkdownBlockView(
                markdown = reasoningMarkdown,
                modifier = Modifier.fillMaxWidth().padding(top = OakSpacing.sm),
            )
        }
    }
}
