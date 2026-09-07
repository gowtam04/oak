package ai.gowtam.oak.ui

import ai.gowtam.oak.wire.Format
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Display-only Champions regulation chip (CF-UI-AC-2.1–2.2). Not a format picker.
 */
@Composable
fun RegulationChip(
    modifier: Modifier = Modifier,
    format: Format = Format.Champions,
    onLid: Boolean = false,
) {
    val oak = LocalOakColors.current
    val chipShape = RoundedCornerShape(OakRadius.pill)
    val label = format.displayLabel
    val fg = if (onLid) oak.onRed else oak.textStrong
    val fill = if (onLid) oak.onRed.copy(alpha = 0.16f) else oak.surfaceRaised
    val stroke = if (onLid) oak.onRed.copy(alpha = 0.45f) else oak.border
    Row(
        modifier = modifier
            .clip(chipShape)
            .background(fill, chipShape)
            .border(1.dp, stroke, chipShape)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs)
            .semantics { contentDescription = "Current Champions regulation: $label" },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = fg,
        )
    }
}
