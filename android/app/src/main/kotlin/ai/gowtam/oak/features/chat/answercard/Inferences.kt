package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.wire.Inference
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/**
 * Signal inferred line (`docs/design/signal.md` §4): one sentence per deduction.
 * Only the word `Inferred` is accent / 600. Rest is mute. Not a banner, not a stamp.
 * The caller gates it on non-empty inferences.
 */
@Composable
fun Inferences(inferences: List<Inference>, modifier: Modifier = Modifier) {
    if (inferences.isEmpty()) return
    val oak = LocalOakColors.current
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (inference in inferences) {
            Text(
                text = buildAnnotatedString {
                    withStyle(
                        SpanStyle(
                            color = oak.accent,
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
