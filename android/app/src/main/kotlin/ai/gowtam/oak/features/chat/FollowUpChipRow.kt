package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
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
import androidx.compose.ui.unit.dp

/** Modest hop-target row under an answer card (CHIP-US-1). Hidden when empty. */
@Composable
fun FollowUpChipRow(
    chips: List<FollowUpChip>,
    onChip: (FollowUpChip) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (chips.isEmpty()) return
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.pill)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        for (chip in chips) {
            Text(
                text = chip.label,
                style = MaterialTheme.typography.labelMedium,
                color = oak.textStrong,
                modifier = Modifier
                    .border(1.dp, oak.border, shape)
                    .clickable { onChip(chip) }
                    .padding(horizontal = OakSpacing.md, vertical = OakSpacing.xs),
            )
        }
    }
}
