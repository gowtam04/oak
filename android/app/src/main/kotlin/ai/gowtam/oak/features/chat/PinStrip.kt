package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

data class PinStripItem(val id: String, val label: String)

/**
 * Compact jump list at the top of a conversation (PIN-US-1). Hidden when empty.
 */
@Composable
fun PinStrip(
    items: List<PinStripItem>,
    onJump: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) return
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.pill)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(bottom = OakSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        for (item in items) {
            Text(
                text = item.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                color = oak.textStrong,
                modifier = Modifier
                    .background(oak.surfaceSunken, shape)
                    .border(1.dp, oak.border, shape)
                    .clickable { onJump(item.id) }
                    .padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs),
            )
        }
    }
}
