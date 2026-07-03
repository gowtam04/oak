package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The live in-progress indicator shown while a turn streams: a phase line
 * (thinking / looking things up / writing) plus a tool-activity ticker. Purely
 * presentational — it takes the reducer's coarse [StreamingPhase] + the tool-activity
 * list and renders them. Meaning is carried by text + an icon + the spinner, never
 * color alone. When [reconnecting] the phase line reads "Reconnecting…". Renders
 * nothing when idle. Mirrors the iOS `StreamingStatusView`.
 */
@Composable
fun StreamingStatus(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    modifier: Modifier = Modifier,
) {
    if (phase == StreamingPhase.IDLE) return
    val oak = LocalOakColors.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = oak.accent)
            Icon(
                imageVector = phaseIcon(phase, reconnecting),
                contentDescription = null,
                tint = oak.accent,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = phaseLabel(phase, reconnecting),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = oak.textStrong,
            )
        }
        if (activities.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
                activities.forEachIndexed { index, activity ->
                    val completed = phase == StreamingPhase.ANSWERING || index < activities.size - 1
                    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = toolIcon(activity.tool),
                            contentDescription = null,
                            tint = if (completed) oak.textMuted else oak.azure,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = activity.label,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (completed) oak.textMuted else oak.text,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (completed) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = oak.success, modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }
        }
    }
}

private fun phaseLabel(phase: StreamingPhase, reconnecting: Boolean): String {
    if (reconnecting) return "Reconnecting…"
    return when (phase) {
        StreamingPhase.IDLE -> ""
        StreamingPhase.THINKING -> "Thinking…"
        StreamingPhase.USING_TOOLS -> "Looking things up…"
        StreamingPhase.ANSWERING -> "Writing the answer…"
    }
}

private fun phaseIcon(phase: StreamingPhase, reconnecting: Boolean): ImageVector {
    if (reconnecting) return Icons.Filled.Sync
    return when (phase) {
        StreamingPhase.IDLE, StreamingPhase.THINKING -> Icons.Filled.Psychology
        StreamingPhase.USING_TOOLS -> Icons.Filled.Search
        StreamingPhase.ANSWERING -> Icons.Filled.MenuBook
    }
}

/** Maps a tool name to a representative icon for the ticker; the label text carries meaning. */
private fun toolIcon(tool: String): ImageVector = when (tool) {
    "resolve_entity" -> Icons.Filled.Search
    "get_pokemon" -> Icons.Filled.MenuBook
    "get_move" -> Icons.Filled.Bolt
    "get_ability" -> Icons.Filled.Psychology
    "get_item" -> Icons.Filled.Inventory2
    "type_matchup", "get_type_chart" -> Icons.Filled.Shield
    "compute_stat", "get_usage_stats" -> Icons.Filled.QueryStats
    "estimate_damage" -> Icons.Filled.Bolt
    "get_learnset" -> Icons.AutoMirrored.Filled.List
    "get_team", "save_team", "list_teams" -> Icons.Filled.Group
    "get_encounters" -> Icons.Filled.Map
    else -> if (tool.startsWith("list_")) Icons.AutoMirrored.Filled.List else Icons.Filled.Build
}
