package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.JsonScalar
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Functions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders an answer's `damage_calc` — Oak's worked damage figure, always marked a
 * non-authoritative ESTIMATE (an "ESTIMATE" pill + a warning-tinted border, never color
 * alone). Below the marker it shows the `result`, the `assumptions`, and an optional
 * `breakdown` disclosure. Free-form maps render in stable key-sorted order. Mirrors the
 * iOS `DamageCalcView`; named `DamageCalcBlock` to avoid clashing with the wire type.
 *
 * [showOpenInViewerButton] defaults to `true` for the answer card's own rendering; the
 * artifact viewer (P7) reuses this same composable for its damage-calc artifact and
 * passes `false`, since the button's destination (this same content) is already what's
 * on screen there.
 */
@Composable
fun DamageCalcBlock(
    damageCalc: DamageCalc,
    onOpenInViewer: () -> Unit,
    modifier: Modifier = Modifier,
    showOpenInViewerButton: Boolean = true,
) {
    val oak = LocalOakColors.current
    var breakdownExpanded by remember { mutableStateOf(false) }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(lerp(oak.surfaceRaised, oak.warning, 0.06f), RoundedCornerShape(OakRadius.md))
            .border(1.dp, oak.warning.copy(alpha = 0.4f), RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Bolt, contentDescription = null, tint = oak.textStrong, modifier = Modifier.size(16.dp))
            Text(
                text = "  Damage",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Text(
                text = "± ESTIMATE",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                color = oak.warning,
                modifier = Modifier
                    .background(oak.warning.copy(alpha = 0.15f), RoundedCornerShape(OakRadius.pill))
                    .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
            )
        }

        if (damageCalc.result.isNotEmpty()) {
            // Inset readout (soul.md): the headline damage figures sit in a machined
            // sunken well of their own, larger mono tabular numerals + mono captions —
            // the single most "instrument" moment in the answer card.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(oak.surfaceSunken, RoundedCornerShape(OakRadius.md))
                    .border(1.dp, oak.border, RoundedCornerShape(OakRadius.md))
                    .padding(OakSpacing.md),
                verticalArrangement = Arrangement.spacedBy(OakSpacing.xs),
            ) {
                for ((key, value) in sortedEntries(damageCalc.result)) {
                    ReadoutRow(humanize(key), scalarDisplayText(value))
                }
            }
        }

        if (damageCalc.assumptions.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "Assumptions",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = oak.textMuted,
                )
                for ((key, value) in sortedEntries(damageCalc.assumptions)) {
                    ScalarRow(humanize(key), scalarDisplayText(value), emphasized = false)
                }
            }
        }

        val breakdown = damageCalc.breakdown?.trim()
        if (!breakdown.isNullOrEmpty()) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { breakdownExpanded = !breakdownExpanded }
                        .padding(vertical = OakSpacing.xs)
                        .semantics(mergeDescendants = true) {
                            role = Role.Button
                            stateDescription = if (breakdownExpanded) "Expanded" else "Collapsed"
                        },
                    horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Functions, contentDescription = null, tint = oak.textMuted, modifier = Modifier.size(16.dp))
                    Text(
                        text = "Show the math",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        color = oak.textMuted,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        imageVector = if (breakdownExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = null,
                        tint = oak.textMuted,
                        modifier = Modifier.size(18.dp),
                    )
                }
                AnimatedVisibility(visible = breakdownExpanded) {
                    Text(
                        text = breakdown,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = JetBrainsMonoFamily,
                        color = oak.textMuted,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(oak.surfaceSunken, RoundedCornerShape(OakRadius.sm))
                            .padding(OakSpacing.sm),
                    )
                }
            }
        }

        if (showOpenInViewerButton) {
            OakButton(onClick = onOpenInViewer, style = OakButtonStyle.Secondary) {
                Text(text = "Open in viewer", color = oak.accent)
            }
        }
    }
}

/** One line of the inset damage readout: a mono caption + a large mono tabular figure. */
@Composable
private fun ReadoutRow(label: String, value: String) {
    val oak = LocalOakColors.current
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFamily,
            color = oak.textMuted,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
            fontFamily = JetBrainsMonoFamily,
            color = oak.textStrong,
        )
    }
}

@Composable
private fun ScalarRow(label: String, value: String, emphasized: Boolean) {
    val oak = LocalOakColors.current
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
        Text(
            text = label,
            style = if (emphasized) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodySmall,
            color = oak.textMuted,
        )
        Text(
            text = value,
            style = (if (emphasized) MaterialTheme.typography.bodyLarge else MaterialTheme.typography.bodySmall)
                .copy(fontWeight = if (emphasized) FontWeight.SemiBold else FontWeight.Normal),
            fontFamily = JetBrainsMonoFamily,
            color = oak.textStrong,
        )
    }
}

/** Stable, key-sorted entries — decoded maps have no inherent order. */
private fun sortedEntries(map: Map<String, JsonScalar>): List<Pair<String, JsonScalar>> =
    map.entries.sortedBy { it.key }.map { it.key to it.value }

/** `max_damage` → `max damage` for display. */
private fun humanize(key: String): String = key.replace('_', ' ')

/** Display formatting for a [JsonScalar] cell (integers/strings verbatim; null ⇒ em dash). */
internal fun scalarDisplayText(value: JsonScalar): String = when (value) {
    is JsonScalar.Str -> value.v
    is JsonScalar.IntVal -> value.v.toString()
    is JsonScalar.DoubleVal -> {
        val d = value.v
        if (d == kotlin.math.floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString()
    }
    is JsonScalar.BoolVal -> if (value.v) "Yes" else "No"
    JsonScalar.Null -> "—"
}
