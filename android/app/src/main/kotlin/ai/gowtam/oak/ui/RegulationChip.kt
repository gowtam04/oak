package ai.gowtam.oak.ui

import ai.gowtam.oak.wire.RegulationMeta
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Live regulation facts from `GET /api/scope`, provided at the app root. */
val LocalRegulation = staticCompositionLocalOf { RegulationMeta.fallback }

/**
 * Display-only Champions regulation chip (CF-UI-AC-2.1–2.2). Not a format picker.
 * Label comes from [LocalRegulation] (`GET /api/scope`).
 */
@Composable
fun RegulationChip(
    modifier: Modifier = Modifier,
    onLid: Boolean = false,
) {
    val oak = LocalOakColors.current
    val meta = LocalRegulation.current
    val chipShape = RoundedCornerShape(OakRadius.pill)
    val label = meta.chipLabel
    val fg = if (onLid) oak.onRed else oak.textStrong
    val fill = if (onLid) oak.onRed.copy(alpha = 0.16f) else oak.surfaceRaised
    val stroke = if (onLid) oak.onRed.copy(alpha = 0.45f) else oak.border
    Row(
        modifier = modifier
            .clip(chipShape)
            .background(fill, chipShape)
            .border(1.dp, stroke, chipShape)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs)
            .semantics { contentDescription = meta.hint },
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
