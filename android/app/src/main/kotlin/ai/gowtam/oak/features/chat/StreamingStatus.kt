package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/**
 * Live turn chrome: a quiet status sentence while no tokens have arrived,
 * then a neutral answer plate once [streamingText] is non-empty. No pip,
 * no record tick, no fake 24–72% bar, no unsigned red glow.
 *
 * [elapsedSeconds] is accepted for call-site stability and is not shown.
 */
@Composable
fun IncomingAnswerPlate(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    streamingText: String,
    modifier: Modifier = Modifier,
    @Suppress("UNUSED_PARAMETER") elapsedSeconds: Int? = null,
) {
    if (phase == StreamingPhase.IDLE && streamingText.isEmpty()) return
    val reduceMotion = rememberReduceMotion()
    val awaitingTokens = streamingText.isEmpty()
    if (awaitingTokens) {
        StreamingStatus(
            phase = phase,
            activities = activities,
            reconnecting = reconnecting,
            modifier = modifier,
        )
        return
    }
    val enter = if (reduceMotion) {
        fadeIn(animationSpec = snap())
    } else {
        fadeIn(
            animationSpec = tween(
                durationMillis = OakMotion.ENTER_MILLIS,
                easing = OakMotion.fastEasing,
            ),
        ) + slideInVertically(
            animationSpec = tween(
                durationMillis = OakMotion.ENTER_MILLIS,
                easing = OakMotion.fastEasing,
            ),
        ) { 8 }
    }
    AnimatedVisibility(
        visible = true,
        enter = enter,
        modifier = modifier,
    ) {
        StreamingAnswerPlate(streamingText = streamingText)
    }
}

@Composable
private fun StreamingAnswerPlate(streamingText: String) {
    val oak = LocalOakColors.current
    val plateShape = RoundedCornerShape(OakRadius.lg)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(plateShape)
            .background(MaterialTheme.colorScheme.surface, plateShape)
            .border(1.dp, oak.border, plateShape)
            .padding(OakSpacing.lg),
    ) {
        MarkdownBlockView(markdown = streamingText, modifier = Modifier.fillMaxWidth())
    }
}

/**
 * Status sentence: accent verb + mute rest + three soft stepping dots.
 * Renders nothing when idle.
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
    val reduceMotion = rememberReduceMotion()
    val copy = streamingStatusCopy(phase, activities, reconnecting)
    val sentence = copy.sentence

    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
                contentDescription = sentence
            },
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = oak.accent, fontWeight = FontWeight.SemiBold)) {
                    append(copy.verb)
                }
                if (copy.rest.isNotEmpty()) {
                    withStyle(SpanStyle(color = oak.textMuted, fontWeight = FontWeight.Medium)) {
                        append(" ")
                        append(copy.rest)
                    }
                }
            },
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f, fill = false),
        )
        SteppingDots(color = oak.accent, reduceMotion = reduceMotion)
    }
}

@Composable
private fun SteppingDots(
    color: Color,
    reduceMotion: Boolean,
) {
    val transition = rememberInfiniteTransition(label = "incomingDots")
    val cycle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = DOT_CYCLE_MILLIS, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "incomingDotCycle",
    )
    Row(
        modifier = Modifier.clearAndSetSemantics { },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) { index ->
            val alpha = if (reduceMotion) DOT_REDUCED_ALPHA else dotOpacity(cycle, index)
            Box(
                modifier = Modifier
                    .size(3.dp)
                    .clip(CircleShape)
                    .background(color.copy(alpha = alpha)),
            )
        }
    }
}

/** Verb + mute rest for the incoming status line. Dots are visual, not in [sentence]. */
internal data class StreamingStatusCopy(
    val verb: String,
    val rest: String,
) {
    val sentence: String
        get() = if (rest.isEmpty()) verb else "$verb $rest"
}

/**
 * Status copy split for the incoming plate. Friendly nouns come from
 * [instrumentToken] — never a raw `GET_*` tool id.
 */
internal fun streamingStatusCopy(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
): StreamingStatusCopy {
    if (reconnecting) return StreamingStatusCopy(verb = "Reconnecting", rest = "")
    val nouns = activities.map { instrumentToken(it.tool) }.distinct()
    if (nouns.isNotEmpty()) {
        return StreamingStatusCopy(verb = "Looking up", rest = nouns.joinToString(", "))
    }
    return when (phase) {
        StreamingPhase.IDLE -> StreamingStatusCopy(verb = "", rest = "")
        StreamingPhase.THINKING -> StreamingStatusCopy(verb = "Thinking", rest = "through your question")
        StreamingPhase.USING_TOOLS -> StreamingStatusCopy(verb = "Looking", rest = "things up")
        StreamingPhase.ANSWERING -> StreamingStatusCopy(verb = "Writing", rest = "the answer")
    }
}

/** Combined mute sentence — same words as [streamingStatusCopy], no ellipsis. */
internal fun streamingStatusSentence(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
): String = streamingStatusCopy(phase, activities, reconnecting).sentence

/**
 * Tool → friendly noun. Pinned to the cross-platform copy table (web
 * `instrumentToken`, iOS `ToolTrail.friendlyNoun`). Unknown tools become
 * `"Lookup"` — never the raw id.
 */
internal fun instrumentToken(tool: String): String = INSTRUMENT_TOKENS[tool] ?: UNKNOWN_INSTRUMENT_TOKEN

private const val UNKNOWN_INSTRUMENT_TOKEN = "Lookup"

private const val DOT_CYCLE_MILLIS = 2_000
private const val DOT_DELAY_FRACTION = 0.11f
private const val DOT_REDUCED_ALPHA = 0.45f

/** Matches the web `chat-incoming-dots` keyframes (2s, delays 0 / 0.22 / 0.44). */
private fun dotOpacity(cycle: Float, index: Int): Float {
    val phase = ((cycle - index * DOT_DELAY_FRACTION) % 1f + 1f) % 1f
    val low = 0.16f
    val high = 0.62f
    return when {
        phase < 0.18f -> low
        phase < 0.40f -> low + (high - low) * ((phase - 0.18f) / 0.22f)
        phase < 0.52f -> high
        phase < 0.74f -> high + (low - high) * ((phase - 0.52f) / 0.22f)
        else -> low
    }
}

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
