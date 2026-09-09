package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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

/**
 * The masthead status LED — soul.md "the reading latches": a small dot that blips
 * `oak.accent` (the live red of [IncomingAnswerPlate]) then settles into the
 * answer's resolved status tint over 300ms the instant an already-finalized
 * [AnswerCard] first mounts (this is the ANDROID equivalent of a live
 * streaming→answered transition — the card itself only ever renders a finalized
 * answer, so the "latch" plays as a one-shot mount animation, the visual handoff
 * from the incoming plate's live accent into the settled plate). Always mounted —
 * never gated on status — so [answerSections]'s render-if-present rule for
 * [StatusBadge] (label + icon, non-`answered` only) is untouched. Instant, no
 * animation, under [rememberReduceMotion].
 */
@Composable
fun StatusLed(status: OakAnswer.Status, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val (_, label, tint) = statusPresentation(status, oak.success, oak.info, oak.warning)
    val settled = if (status == OakAnswer.Status.Answered) oak.success else tint
    var latched by remember { mutableStateOf(reduceMotion) }
    LaunchedEffect(Unit) {
        if (!reduceMotion) latched = true
    }
    val dotColor by animateColorAsState(
        targetValue = if (latched) settled else oak.accent,
        animationSpec = if (reduceMotion) snap() else tween(300, easing = OakMotion.fastEasing),
        label = "statusLed",
    )
    Box(
        modifier = modifier
            .testTag(TAG_STATUS_LED)
            .size(8.dp)
            .clip(CircleShape)
            .background(dotColor)
            .semantics { contentDescription = "Status: $label" },
    )
}

internal const val TAG_STATUS_LED = "status-led"
