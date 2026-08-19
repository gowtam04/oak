package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.orbs.OrbState
import ai.gowtam.oak.ui.orbs.ThinkingOrb
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Live turn chrome: expandable thinking trace, then a neutral answer plate
 * once [streamingText] is non-empty. The trace stays visible (collapsed to
 * "Thought for N seconds") above the plate.
 *
 * [elapsedSeconds] is the wall-clock age of the stream; it is frozen into the
 * header the moment tokens start.
 */
@Composable
fun IncomingAnswerPlate(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    streamingText: String,
    modifier: Modifier = Modifier,
    elapsedSeconds: Int? = null,
) {
    if (phase == StreamingPhase.IDLE && streamingText.isEmpty()) return
    val reduceMotion = rememberReduceMotion()
    val awaitingTokens = streamingText.isEmpty()
    var frozenElapsed by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(awaitingTokens, elapsedSeconds) {
        if (!awaitingTokens && frozenElapsed == null) {
            frozenElapsed = elapsedSeconds ?: 0
        }
        if (awaitingTokens) frozenElapsed = null
    }
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        if (phase != StreamingPhase.IDLE) {
            StreamingStatus(
                phase = phase,
                activities = activities,
                reconnecting = reconnecting,
                settled = !awaitingTokens,
                elapsedSeconds = frozenElapsed ?: elapsedSeconds,
            )
        }
        if (!awaitingTokens) {
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
            AnimatedVisibility(visible = true, enter = enter) {
                StreamingAnswerPlate(streamingText = streamingText)
            }
        }
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
 * Expandable thinking trace: dotted orb + shimmering "Thinking", then one row
 * per live tool call. Collapses to "Thought for N seconds" once tokens start.
 */
@Composable
fun StreamingStatus(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    modifier: Modifier = Modifier,
    settled: Boolean = false,
    elapsedSeconds: Int? = null,
) {
    if (phase == StreamingPhase.IDLE) return
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val rows = if (reconnecting) emptyList() else traceRows(activities, settled)
    val header = thinkingHeader(reconnecting, settled, elapsedSeconds)
    val desiredOrb = orbStateForActivity(
        reconnecting,
        rows.lastOrNull()?.tool,
        writing = settled,
    )
    var shownOrb by remember { mutableStateOf<OrbState?>(null) }
    val orbState = shownOrb ?: desiredOrb
    LaunchedEffect(desiredOrb) {
        if (shownOrb == null) {
            shownOrb = desiredOrb
            return@LaunchedEffect
        }
        if (desiredOrb == shownOrb) return@LaunchedEffect
        delay(400)
        shownOrb = desiredOrb
    }
    var userOpen by remember { mutableStateOf<Boolean?>(null) }
    val autoOpen = rows.isNotEmpty() && !settled && !reconnecting
    val open = userOpen ?: autoOpen
    val scene = "${if (reconnecting) 1 else 0}:${if (settled) 1 else 0}:${if (rows.isEmpty()) 0 else 1}"
    LaunchedEffect(scene) { userOpen = null }

    val expandAnim = if (reduceMotion) {
        fadeIn(snap()) + expandVertically(snap())
    } else {
        fadeIn(tween(OakMotion.ENTER_MILLIS, easing = OakMotion.fastEasing)) +
            expandVertically(tween(OakMotion.ENTER_MILLIS, easing = OakMotion.fastEasing))
    }
    val collapseAnim = if (reduceMotion) {
        fadeOut(snap()) + shrinkVertically(snap())
    } else {
        fadeOut(tween(OakMotion.FAST_MILLIS, easing = OakMotion.fastEasing)) +
            shrinkVertically(tween(OakMotion.FAST_MILLIS, easing = OakMotion.fastEasing))
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
                contentDescription = header.text
            },
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(OakRadius.sm))
                .then(
                    if (rows.isNotEmpty()) {
                        Modifier.clickable { userOpen = !open }
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = 6.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        ) {
            ThinkingOrb(
                state = orbState,
                live = header.live || orbState == OrbState.Composing,
            )
            ShimmerLabel(
                text = header.text,
                live = header.live && !reduceMotion,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontWeight = FontWeight.Medium,
                    fontSize = 13.sp,
                ),
            )
            if (rows.isNotEmpty()) {
                Icon(
                    imageVector = Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = oak.textFaint,
                    modifier = Modifier
                        .size(14.dp)
                        .rotate(if (open) 180f else 0f),
                )
            }
        }
        AnimatedVisibility(
            visible = open && rows.isNotEmpty(),
            enter = expandAnim,
            exit = collapseAnim,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min)
                    .padding(start = 10.dp, top = 2.dp),
            ) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp, bottom = 4.dp)
                        .width(1.dp)
                        .fillMaxHeight()
                        .background(oak.border),
                )
                Column(
                    modifier = Modifier.padding(start = 10.dp, top = 4.dp, bottom = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    rows.forEach { row ->
                        TraceRowView(row = row, reduceMotion = reduceMotion)
                    }
                }
            }
        }
    }
}

@Composable
private fun TraceRowView(row: TraceRow, reduceMotion: Boolean) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        if (row.active) {
            SpinningRing(color = oak.textMuted, reduceMotion = reduceMotion)
        } else {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = oak.textFaint,
                modifier = Modifier.size(14.dp),
            )
        }
        Text(
            text = row.primary,
            style = MaterialTheme.typography.bodySmall.copy(
                fontWeight = FontWeight.Medium,
                fontSize = 12.5.sp,
            ),
            color = oak.textStrong,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (row.secondary != null) {
            Spacer(Modifier.weight(1f))
            Text(
                text = row.secondary,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                color = oak.textFaint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ShimmerLabel(text: String, live: Boolean, style: TextStyle) {
    val oak = LocalOakColors.current
    if (!live) {
        Text(text = text, style = style, color = oak.textMuted)
        return
    }
    val transition = rememberInfiniteTransition(label = "thinkShimmer")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1_400, easing = LinearEasing),
        ),
        label = "thinkShimmerPhase",
    )
    var widthPx by remember { mutableFloatStateOf(1f) }
    val brush = Brush.linearGradient(
        colors = listOf(oak.textFaint, oak.textStrong, oak.textFaint),
        start = Offset(widthPx * (phase * 2f - 1.5f), 0f),
        end = Offset(widthPx * (phase * 2f - 0.5f), 0f),
    )
    Text(
        text = text,
        style = style.copy(brush = brush),
        modifier = Modifier.onSizeChanged { widthPx = it.width.toFloat().coerceAtLeast(1f) },
    )
}

@Composable
private fun SpinningRing(color: Color, reduceMotion: Boolean) {
    val transition = rememberInfiniteTransition(label = "thinkSpin")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 700, easing = LinearEasing),
        ),
        label = "thinkSpinAngle",
    )
    Canvas(
        modifier = Modifier
            .size(12.dp)
            .rotate(if (reduceMotion) 0f else angle),
    ) {
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = 260f,
            useCenter = false,
            style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round),
        )
    }
}

/** Verb + mute rest for legacy callers. New chrome uses [thinkingHeader]. */
internal data class StreamingStatusCopy(
    val verb: String,
    val rest: String,
) {
    val sentence: String
        get() = if (rest.isEmpty()) verb else "$verb $rest"
}

internal data class ThinkingHeader(
    val live: Boolean,
    val text: String,
)

internal data class TraceRow(
    val tool: String,
    val primary: String,
    val secondary: String?,
    val active: Boolean,
)

private val SOLVING_TOOLS = setOf(
    "compute_stat",
    "estimate_damage",
    "run_sql",
    "get_usage_stats",
    "get_meta_usage",
)
private val SEARCHING_TOOLS = setOf(
    "resolve_entity",
    "query_pokedex",
    "get_pokemon",
    "get_move",
    "get_ability",
    "get_item",
    "get_type_matchups",
    "get_evolution_chain",
    "get_encounters",
    "get_learnset",
    "get_team",
    "list_teams",
    "save_team",
    "search_wiki",
)

/** Lock-step with web `orbStateForActivity` / iOS `ThinkingTraceCopy.orbState`. */
internal fun orbStateForActivity(
    reconnecting: Boolean,
    latestTool: String?,
    writing: Boolean = false,
): OrbState {
    if (reconnecting) return OrbState.Connecting
    if (writing) return OrbState.Composing
    val tool = latestTool
    if (tool.isNullOrEmpty() || tool in HIDDEN_TOOLS) return OrbState.Breathing
    if (tool in SOLVING_TOOLS) return OrbState.Solving
    if (tool in SEARCHING_TOOLS) return OrbState.Searching
    return OrbState.Breathing
}

internal fun thinkingHeader(
    reconnecting: Boolean,
    settled: Boolean,
    elapsedSeconds: Int?,
): ThinkingHeader {
    if (reconnecting) return ThinkingHeader(live = true, text = "Reconnecting")
    if (!settled) return ThinkingHeader(live = true, text = "Thinking")
    return ThinkingHeader(live = false, text = thoughtFor(elapsedSeconds))
}

internal fun thoughtFor(elapsedSeconds: Int?): String {
    val n = elapsedSeconds ?: 0
    return when {
        n <= 0 -> "Thought for a moment"
        n == 1 -> "Thought for 1 second"
        else -> "Thought for $n seconds"
    }
}

internal fun traceRows(activities: List<ToolActivity>, settled: Boolean): List<TraceRow> {
    val visible = activities.filter { it.tool !in HIDDEN_TOOLS }
    return visible.mapIndexed { index, activity ->
        val cleaned = stripLeadingEmoji(activity.label)
        TraceRow(
            tool = activity.tool,
            primary = instrumentToken(activity.tool),
            secondary = subjectFromLabel(cleaned),
            active = !settled && index == visible.lastIndex,
        )
    }
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
    val settled = phase == StreamingPhase.ANSWERING
    val header = thinkingHeader(reconnecting, settled, elapsedSeconds = null)
    return StreamingStatusCopy(verb = header.text, rest = "")
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

internal fun stripLeadingEmoji(label: String): String {
    val stripped = EMOJI_PREFIX.replace(label, "")
    return stripped.trim()
}

internal fun subjectFromLabel(cleaned: String): String? {
    firstQuoted(cleaned)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val words = cleaned.trimEnd('…', '.', ' ').split(Regex("\\s+")).filter { it.isNotEmpty() }
    var lastRun = emptyList<String>()
    var lastRunStart = -1
    var currentRun = mutableListOf<String>()
    var currentStart = -1
    words.forEachIndexed { index, word ->
        val first = word.firstOrNull()
        if (first != null && first.isUpperCase()) {
            if (currentRun.isEmpty()) currentStart = index
            currentRun.add(word)
            lastRun = currentRun.toList()
            lastRunStart = currentStart
        } else {
            currentRun = mutableListOf()
        }
    }
    if (lastRun.isEmpty()) return null
    if (lastRun.size == 1 && lastRunStart == 0) return null
    return lastRun.joinToString(" ")
}

private fun firstQuoted(text: String): String? {
    val pairs = mapOf('“' to '”', '"' to '"', '‟' to '”', '‘' to '’')
    var closer: Char? = null
    val buf = StringBuilder()
    for (ch in text) {
        val expected = closer
        if (expected != null) {
            if (ch == expected) return buf.toString()
            buf.append(ch)
        } else {
            val close = pairs[ch]
            if (close != null) {
                closer = close
                buf.clear()
            }
        }
    }
    return null
}

private const val UNKNOWN_INSTRUMENT_TOKEN = "Lookup"

private val HIDDEN_TOOLS = setOf("reasoning", "submit_answer", "submit_builder_answer")

private val EMOJI_PREFIX = Regex("^[\\p{So}\\p{Cn}\\uFE0F\\u200D\\s]+")

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
