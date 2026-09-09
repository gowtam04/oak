package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Inference
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/**
 * Enamel inference callout: azure-soft fill, dashed azure border. One sentence
 * per deduction. Only the word `Inferred` is azure / 600. Rest is mute.
 * The caller gates it on non-empty inferences.
 */
@Composable
fun Inferences(inferences: List<Inference>, modifier: Modifier = Modifier) {
    if (inferences.isEmpty()) return
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    val dashColor = oak.azure
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(oak.azureSoft, shape)
            .drawBehind {
                val stroke = Stroke(
                    width = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(
                        floatArrayOf(8.dp.toPx(), 5.dp.toPx()),
                        0f,
                    ),
                )
                drawRoundRect(
                    color = dashColor,
                    style = stroke,
                    cornerRadius = CornerRadius(OakRadius.md.toPx()),
                )
            }
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (inference in inferences) {
            Text(
                text = buildAnnotatedString {
                    withStyle(
                        SpanStyle(
                            color = oak.azure,
                            fontWeight = FontWeight.SemiBold,
                        ),
                    ) { append("Inferred") }
                    withStyle(SpanStyle(color = oak.textMuted, fontWeight = FontWeight.Normal)) {
                        append(" from ")
                        append(inferenceReason(inference))
                        append(".")
                    }
                },
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

/** Note when present (stripping a leading "from "), else the claim. */
internal fun inferenceReason(inference: Inference): String {
    val note = inference.note?.trim().orEmpty()
    if (note.isNotEmpty()) return note.replace(LEADING_FROM, "")
    return inference.claim.trim()
}

private val LEADING_FROM = Regex("^from\\s+", RegexOption.IGNORE_CASE)
