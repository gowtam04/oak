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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Renders an answer's `damage_calc` as a Signal two-column hairline fact table
 * (`docs/design/signal.md` §4). Rows come only from the payload (`result` then
 * `assumptions`) — nothing is invented. Plex Mono 12/13. Optional `breakdown`
 * stays a disclosure. Named `DamageCalcBlock` to avoid clashing with the wire type.
 *
 * [showOpenInViewerButton] defaults to `true` for the answer card; the artifact
 * viewer (P7) reuses this composable and passes `false`.
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
    val rows = remember(damageCalc.result, damageCalc.assumptions) {
        sortedEntries(damageCalc.result) + sortedEntries(damageCalc.assumptions)
    }
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "Damage",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
                modifier = Modifier.semantics { heading() },
            )
            if (damageCalc.isEstimate) {
                Text(
                    text = "Estimate",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                    color = oak.warning,
                )
            }
        }

        if (rows.isNotEmpty()) {
            Column(modifier = Modifier.fillMaxWidth()) {
                rows.forEachIndexed { index, (key, value) ->
                    FactRow(label = humanize(key), value = scalarDisplayText(value))
                    if (index < rows.lastIndex) {
                        HorizontalDivider(color = oak.border, thickness = 1.dp)
                    }
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

@Composable
private fun FactRow(label: String, value: String) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium.copy(
                fontFamily = JetBrainsMonoFamily,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
            ),
            color = oak.textMuted,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = JetBrainsMonoFamily,
                fontWeight = FontWeight.Normal,
                fontSize = 13.sp,
            ),
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
