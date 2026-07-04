package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.OakAnswer

/**
 * A labeled status chip for non-`answered` outcomes — an icon + word so the outcome
 * never rests on color alone. Only rendered when `status != answered` (the caller
 * gates it via [answerSections]). Mirrors the iOS `statusBadge`.
 */
@Composable
fun StatusBadge(status: OakAnswer.Status, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    val (icon, label, tint) = statusPresentation(status, oak.success, oak.info, oak.warning)
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        Text(
            text = label,
            color = tint,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
        )
    }
}

private fun statusPresentation(
    status: OakAnswer.Status,
    success: Color,
    info: Color,
    warning: Color,
): Triple<ImageVector, String, Color> = when (status) {
    OakAnswer.Status.Answered -> Triple(Icons.Filled.CheckCircle, "Answered", success)
    OakAnswer.Status.ClarificationNeeded -> Triple(Icons.Filled.HelpOutline, "Needs clarification", info)
    OakAnswer.Status.ResolutionFailed -> Triple(Icons.Filled.Search, "Couldn't find that", warning)
    OakAnswer.Status.InsufficientData -> Triple(Icons.Filled.WarningAmber, "Not enough data", warning)
    // A status the wire added after this app shipped: a neutral, humanized badge
    // rather than a hard-failed decode.
    is OakAnswer.Status.Unknown -> Triple(Icons.Filled.Info, titleizeNonNull(status.raw), info)
}
