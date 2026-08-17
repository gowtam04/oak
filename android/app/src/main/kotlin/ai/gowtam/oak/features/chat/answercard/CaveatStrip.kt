package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.GenerationBasis
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The prominent caveat banner at the TOP of an answer card — the native mirror of the
 * web `CaveatStrip`. It merges, into ONE strip, both signals the card surfaces together:
 *
 *   1. the generation **fallback** note (`generation_basis.fallback` + its `note`),
 *   2. the answer's `uncertainty_flags`, each mapped through [uncertaintyFlagLabel] so
 *      the runtime's internal fallback codes read as plain English (a genuine
 *      model-authored caveat renders verbatim).
 *
 * The caller gates it on `fallback || any non-blank flag` (via [answerSections]); it is
 * drawn here only when there is something to say. It is the SOLID warning strip (a
 * triangle icon + "Uncertainty" + the text — never color alone), distinct from the
 * inferences' azure-tinted styling.
 */
@Composable
fun CaveatStrip(
    uncertaintyFlags: List<String>?,
    generationBasis: GenerationBasis,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val flags = nonBlank(uncertaintyFlags)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(lerp(oak.surfaceRaised, oak.warning, 0.10f), RoundedCornerShape(OakRadius.md))
            .border(1.dp, oak.warning.copy(alpha = 0.5f), RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.warning, modifier = Modifier.size(16.dp))
            Text(
                text = "Uncertainty",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.warning,
            )
        }
        if (generationBasis.fallback) {
            CaveatRow(fallbackLine(generationBasis))
        }
        for (flag in flags) {
            CaveatRow(uncertaintyFlagLabel(flag))
        }
    }
}

@Composable
private fun CaveatRow(text: String) {
    val oak = LocalOakColors.current
    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
        Icon(
            Icons.Filled.WarningAmber,
            contentDescription = null,
            tint = oak.warning,
            modifier = Modifier.size(14.dp),
        )
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = oak.textStrong)
    }
}

/** The fallback line: the model's `note` when present, else the web default message. */
private fun fallbackLine(basis: GenerationBasis): String {
    val note = basis.note?.trim()
    if (!note.isNullOrEmpty()) return note
    val generation = basis.generation.trim()
    val base = generation.ifEmpty { "an earlier generation" }
    return "Based on $base data — outside the selected scope."
}

/**
 * Friendly labels for the runtime's INTERNAL fallback `uncertainty_flags` codes —
 * mirror of `web/src/components/answer-card/uncertainty-labels.ts`. A flag not in the
 * map is a genuine model-authored caveat and is shown verbatim.
 */
fun uncertaintyFlagLabel(flag: String): String = UNCERTAINTY_FLAG_LABELS[flag] ?: flag

private val UNCERTAINTY_FLAG_LABELS: Map<String, String> = mapOf(
    "max_iterations_reached" to "Couldn't complete this answer",
    "submit_answer_invalid_after_retries" to "Couldn't complete this answer",
    "model_ended_turn_without_submit_answer" to "Couldn't complete this answer",
    "recovered_prose_no_submit_answer" to "Answer may be incomplete",
    "team_may_have_illegal_slots" to
        "Some team slots may not be fully legal — see the warnings on each Pokémon.",
)
