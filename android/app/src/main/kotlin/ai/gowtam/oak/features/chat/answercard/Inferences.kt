package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Inference
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders an answer's `inferences` — claims Oak *deduced* rather than read directly.
 * Each row shows the claim, a confidence level (high/medium/low) carried by an icon +
 * text label (never color alone), and an optional note. Styling mirrors the web
 * `InferenceCallout`: a soft azure fill with a distinct dashed-edge intent (drawn here
 * as an azure border to mark "inferred, not cited"). The caller gates it on non-empty
 * inferences.
 */
@Composable
fun Inferences(inferences: List<Inference>, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(lerp(oak.surfaceRaised, oak.azure, 0.08f), RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = oak.azure, modifier = Modifier.size(16.dp))
            Text(
                text = "Oak's deductions",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.azure,
            )
        }
        for (inference in inferences) {
            InferenceRow(inference)
        }
    }
}

@Composable
private fun InferenceRow(inference: Inference) {
    val oak = LocalOakColors.current
    val (icon, label, tint) = confidencePresentation(inference.confidence, oak.success, oak.sunflower, oak.textMuted)
    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
        Row(
            modifier = Modifier
                .background(tint.copy(alpha = 0.15f), RoundedCornerShape(OakRadius.pill))
                .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(12.dp))
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                color = tint,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = inference.claim, style = MaterialTheme.typography.bodyMedium, color = oak.textStrong)
            val note = inference.note
            if (!note.isNullOrEmpty()) {
                Text(text = note, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
            }
        }
    }
}

private fun confidencePresentation(
    confidence: Inference.Confidence,
    success: Color,
    sunflower: Color,
    muted: Color,
): Triple<ImageVector, String, Color> = when (confidence) {
    Inference.Confidence.High -> Triple(Icons.Filled.Circle, "Solid", success)
    Inference.Confidence.Medium -> Triple(Icons.Filled.Circle, "Likely", sunflower)
    Inference.Confidence.Low -> Triple(Icons.Outlined.Circle, "Unsure", muted)
    // A confidence value the wire added after this app shipped: render its raw
    // string with neutral styling rather than hard-failing the answer's decode.
    is Inference.Confidence.Unknown -> Triple(Icons.Outlined.Circle, confidence.raw, muted)
}
