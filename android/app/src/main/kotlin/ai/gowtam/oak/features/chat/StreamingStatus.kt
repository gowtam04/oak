package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Signal streaming status (`docs/design/signal.md` §6.2): a 7.dp red pip, a mute
 * sentence of friendly nouns, and a 2.dp red bar that eases 24% → 72%. No
 * instrument ticker, no raw tool ids, no type-lit plate. Renders nothing when idle.
 *
 * [elapsedSeconds] is accepted for call-site stability and is not shown — the
 * bar + pip carry the live state.
 */
@Composable
fun StreamingStatus(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    modifier: Modifier = Modifier,
    @Suppress("UNUSED_PARAMETER") elapsedSeconds: Int? = null,
) {
    if (phase == StreamingPhase.IDLE) return
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val sentence = streamingStatusSentence(phase, activities, reconnecting)

    val pipAlpha = if (reduceMotion) {
        1f
    } else {
        val transition = rememberInfiniteTransition(label = "sigPip")
        val animated by transition.animateFloat(
            initialValue = 1f,
            targetValue = 0.25f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 1_200, easing = OakMotion.fastEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "sigPipAlpha",
        )
        animated
    }
    val barFraction = if (reduceMotion) {
        0.48f
    } else {
        val transition = rememberInfiniteTransition(label = "sigBar")
        val animated by transition.animateFloat(
            initialValue = 0.24f,
            targetValue = 0.72f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 2_400, easing = OakMotion.fastEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "sigBarWidth",
        )
        animated
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(oak.accent.copy(alpha = pipAlpha)),
            )
            Text(
                text = sentence,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                color = oak.textMuted,
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth(barFraction)
                .height(2.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(oak.accent),
        )
    }
}

/**
 * Mute sentence for the streaming line. Friendly nouns come from [instrumentToken]
 * (the same map as web `instrumentToken` / iOS `ToolTrail.friendlyNoun`) — never
 * a raw `GET_*` tool id.
 */
internal fun streamingStatusSentence(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
): String {
    if (reconnecting) return "Reconnecting…"
    val nouns = activities.map { instrumentToken(it.tool) }.distinct()
    if (nouns.isNotEmpty()) return "Looking up ${nouns.joinToString(", ")}"
    return when (phase) {
        StreamingPhase.IDLE -> ""
        StreamingPhase.THINKING -> "Thinking through your question…"
        StreamingPhase.USING_TOOLS -> "Looking things up…"
        StreamingPhase.ANSWERING -> "Writing the answer…"
    }
}

/**
 * Tool → friendly noun. Pinned to the cross-platform copy table (web
 * `instrumentToken`, iOS `ToolTrail.friendlyNoun`). Unknown tools become
 * `"Lookup"` — never the raw id.
 */
internal fun instrumentToken(tool: String): String = INSTRUMENT_TOKENS[tool] ?: UNKNOWN_INSTRUMENT_TOKEN

private const val UNKNOWN_INSTRUMENT_TOKEN = "Lookup"

private val INSTRUMENT_TOKENS: Map<String, String> = mapOf(
    "resolve_entity" to "Dex lookup",
    "query_pokedex" to "Pokédex search",
    "get_pokemon" to "Pokémon",
    "get_move" to "Move",
    "get_ability" to "Ability",
    "get_item" to "Item",
    "get_type_matchups" to "Type matchups",
    "type_matchup" to "Type matchups",
    "get_type_chart" to "Type matchups",
    "get_evolution_chain" to "Evolution",
    "compute_stat" to "Stats",
    "estimate_damage" to "Damage calc",
    "get_usage_stats" to "Usage",
    "get_meta_usage" to "Usage",
    "get_encounters" to "Locations",
    "get_learnset" to "Movepool",
    "get_team" to "Teams",
    "list_teams" to "Teams",
    "save_team" to "Teams",
    "run_sql" to "Game data",
    "search_wiki" to "Wiki",
    "submit_answer" to "Answer",
    "submit_builder_answer" to "Teams",
)
