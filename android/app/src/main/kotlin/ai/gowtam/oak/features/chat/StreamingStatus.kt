package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * Incoming answer plate while a turn is live. Unsigned type-light (faint
 * poke-red radial + ~18% red-mixed hairline) until the first token; then the
 * same plate, glow/border latched neutral, showing streamed markdown. No pip,
 * no record tick, no fake 24–72% bar.
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
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val awaitingTokens = streamingText.isEmpty()
    val plateShape = RoundedCornerShape(OakRadius.lg)
    val liveBorder = lerp(oak.border, oak.accent, UNSIGNED_BORDER_RED_MIX)
    val borderColor by animateColorAsState(
        targetValue = if (awaitingTokens) liveBorder else oak.border,
        animationSpec = if (reduceMotion) {
            snap()
        } else {
            tween(durationMillis = OakMotion.ENTER_MILLIS, easing = OakMotion.fastEasing)
        },
        label = "incomingPlateBorder",
    )
    val glowColor = oak.accent.copy(alpha = UNSIGNED_GLOW_ALPHA)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(plateShape)
            .background(oak.surfaceRaised, plateShape)
            .border(1.dp, borderColor, plateShape),
    ) {
        if (awaitingTokens) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .drawBehind {
                        val trailing = if (layoutDirection == LayoutDirection.Rtl) 0.12f else 0.88f
                        val center = Offset(size.width * trailing, 0f)
                        val radius = size.width * 0.55f
                        drawCircle(
                            brush = Brush.radialGradient(
                                colors = listOf(glowColor, Color.Transparent),
                                center = center,
                                radius = radius,
                            ),
                            center = center,
                            radius = radius,
                        )
                    },
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(OakSpacing.lg),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
        ) {
            if (awaitingTokens) {
                StreamingStatus(
                    phase = phase,
                    activities = activities,
                    reconnecting = reconnecting,
                )
                IncomingSkeleton(reduceMotion = reduceMotion)
            } else {
                MarkdownBlockView(markdown = streamingText, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

/**
 * Status sentence on the incoming plate: accent verb + mute rest + three
 * stepping dots. Renders nothing when idle.
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
    val litCount = if (reduceMotion) {
        -1
    } else {
        val transition = rememberInfiniteTransition(label = "incomingDots")
        val frame by transition.animateFloat(
            initialValue = 0f,
            targetValue = 4f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = DOT_CYCLE_MILLIS, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "incomingDotFrame",
        )
        frame.toInt().coerceIn(0, 3)
    }
    Row(
        modifier = Modifier.clearAndSetSemantics { },
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) { index ->
            val alpha = when {
                reduceMotion -> DOT_REDUCED_ALPHA
                index < litCount -> 0.95f
                else -> 0.22f
            }
            Box(
                modifier = Modifier
                    .size(3.5.dp)
                    .clip(CircleShape)
                    .background(color.copy(alpha = alpha)),
            )
        }
    }
}

@Composable
private fun IncomingSkeleton(reduceMotion: Boolean) {
    val oak = LocalOakColors.current
    val sheenProgress = if (reduceMotion) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "incomingSheen")
        val animated by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = SHEEN_CYCLE_MILLIS, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "incomingSheenProgress",
        )
        animated
    }
    val sheenColor = oak.accent.copy(alpha = if (reduceMotion) 0f else SHEEN_ALPHA)
    val leadFill = lerp(oak.surfaceSunken, oak.accent, LEAD_WASH_MIX)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clearAndSetSemantics { },
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        SKELETON_BARS.forEachIndexed { index, bar ->
            SkeletonBar(
                widthFraction = bar.widthFraction,
                height = bar.height,
                fill = if (bar.redWash) leadFill else oak.surfaceSunken,
                sheenColor = sheenColor,
                sheenProgress = (sheenProgress + index * SHEEN_STAGGER) % 1f,
                reduceMotion = reduceMotion,
            )
        }
    }
}

@Composable
private fun SkeletonBar(
    widthFraction: Float,
    height: Dp,
    fill: Color,
    sheenColor: Color,
    sheenProgress: Float,
    reduceMotion: Boolean,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth(widthFraction)
            .height(height)
            .clip(RoundedCornerShape(3.dp))
            .background(fill)
            .then(
                if (reduceMotion) {
                    Modifier
                } else {
                    Modifier.drawWithContent {
                        drawContent()
                        val sheenWidth = size.width * 0.38f
                        val travel = size.width + sheenWidth
                        val x = sheenProgress * travel - sheenWidth
                        drawRect(
                            brush = Brush.linearGradient(
                                colors = listOf(Color.Transparent, sheenColor, Color.Transparent),
                                start = Offset(x, 0f),
                                end = Offset(x + sheenWidth, 0f),
                            ),
                        )
                    }
                },
            ),
    )
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

private const val UNSIGNED_BORDER_RED_MIX = 0.18f
private const val UNSIGNED_GLOW_ALPHA = 0.14f
private const val LEAD_WASH_MIX = 0.12f
private const val SHEEN_ALPHA = 0.38f
private const val SHEEN_STAGGER = 0.08f
private const val SHEEN_CYCLE_MILLIS = 1_600
private const val DOT_CYCLE_MILLIS = 1_200
private const val DOT_REDUCED_ALPHA = 0.45f

private data class SkeletonBarSpec(
    val widthFraction: Float,
    val height: Dp,
    val redWash: Boolean,
)

private val SKELETON_BARS = listOf(
    SkeletonBarSpec(widthFraction = 0.68f, height = 16.dp, redWash = true),
    SkeletonBarSpec(widthFraction = 1.00f, height = 9.dp, redWash = false),
    SkeletonBarSpec(widthFraction = 0.92f, height = 9.dp, redWash = false),
    SkeletonBarSpec(widthFraction = 0.48f, height = 9.dp, redWash = false),
)

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
