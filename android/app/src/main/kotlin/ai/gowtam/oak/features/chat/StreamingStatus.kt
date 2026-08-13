package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakType
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ChangeCircle
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The live in-progress indicator shown while a turn streams: a phase line
 * (thinking / looking things up / writing) plus a tool-activity ticker. Purely
 * presentational — it takes the reducer's coarse [StreamingPhase] + the tool-activity
 * list and renders them. Meaning is carried by text + an icon + the spinner, never
 * color alone. When [reconnecting] the phase line reads "Reconnecting…". Renders
 * nothing when idle. Mirrors the iOS `StreamingStatusView`.
 *
 * Phase 2 specimen desk: soft plate-skeleton wash (client heuristic from tool labels
 * when a type name is visible mid-stream; otherwise a quiet sunken paper tint). No
 * backend change — wash is presentation only (`docs/design/soul.md`).
 *
 * [elapsedSeconds] renders a right-aligned mono `"${n}s"` timer alongside the phase
 * line (mirrors iOS's `TimelineView`-driven counter, visible from 0s — no gate).
 * `null` hides it entirely. It is a SIBLING of the phase row's polite live-region,
 * not a member of it: a live-region re-announces on every content change, and a
 * ticking counter would otherwise re-announce the whole phase line every second.
 * It carries its own one-shot `contentDescription` instead.
 */
@Composable
fun StreamingStatus(
    phase: StreamingPhase,
    activities: List<ToolActivity>,
    reconnecting: Boolean,
    modifier: Modifier = Modifier,
    elapsedSeconds: Int? = null,
) {
    if (phase == StreamingPhase.IDLE) return
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val reduceMotion = rememberReduceMotion()
    val heuristicTypes = remember(activities) { heuristicTypesFromActivities(activities) }
    val wash = remember(
        heuristicTypes,
        dark,
        oak.surfaceRaised,
        oak.surfaceSunken,
        oak.border,
        oak.borderStrong,
    ) {
        if (heuristicTypes.isEmpty()) {
            OakType.plateWashForTypes(
                subjectTypes = emptyList(),
                surface = oak.surfaceRaised,
                surfaceSunken = oak.surfaceSunken,
                border = oak.border,
                borderStrong = oak.borderStrong,
                dark = dark,
            )
        } else {
            OakType.plateWash(
                primary = heuristicTypes.getOrNull(0),
                secondary = heuristicTypes.getOrNull(1),
                surface = oak.surfaceRaised,
                surfaceSunken = oak.surfaceSunken,
                border = oak.border,
                borderStrong = oak.borderStrong,
                dark = dark,
            )
        }
    }
    val shellShape = RoundedCornerShape(OakRadius.lg)
    // Instrument type-light (soul.md): the shell fill goes neutral (typed/mechanics
    // alike — see OakType.plateWash), softened to a quiet gradient; the type reads
    // through a faint corner glow instead of a fill tint.
    val shellBrush = remember(wash, oak.surfaceRaised, oak.surfaceSunken) {
        if (wash.isMechanics) {
            Brush.linearGradient(
                listOf(
                    oak.surfaceSunken,
                    oak.surfaceRaised.copy(alpha = 0.92f),
                    oak.surfaceSunken.copy(alpha = 0.85f),
                ),
            )
        } else {
            Brush.linearGradient(listOf(oak.surfaceRaised, oak.surfaceRaised))
        }
    }

    // A slow breathing pulse on the phase icon signals "still working" without
    // repeating the spinner's motion; disabled outright under reduce-motion (a static
    // full-opacity icon) rather than swapped for a subtler alternative.
    val pulseAlpha = if (reduceMotion) {
        1f
    } else {
        val transition = rememberInfiniteTransition(label = "streamingPulse")
        val animated by transition.animateFloat(
            initialValue = 1f,
            targetValue = 0.45f,
            animationSpec = infiniteRepeatable(
                animation = tween(900),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "streamingPulseAlpha",
        )
        animated
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(shellShape)
            .background(shellBrush, shellShape)
            .border(1.dp, wash.border.copy(alpha = 0.85f), shellShape),
    ) {
        // Faint type-atmosphere glow (soul.md: soften the streaming plate to
        // neutral+faint glow rather than a tinted fill) — half the answer card's
        // settled well-glow strength, since this is an in-progress, not final, plate.
        if (!wash.isMechanics && wash.wellGlow != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(140.dp)
                    .alpha(0.5f)
                    .background(
                        Brush.radialGradient(listOf(wash.wellGlow, Color.Transparent)),
                    ),
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(OakSpacing.md),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = oak.accent)
                Icon(
                    imageVector = phaseIcon(phase, reconnecting),
                    contentDescription = null,
                    tint = oak.accent,
                    modifier = Modifier.size(16.dp).alpha(pulseAlpha),
                )
                Text(
                    text = phaseLabel(phase, reconnecting),
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = oak.textStrong,
                )
            }
            if (elapsedSeconds != null) {
                Spacer(Modifier.weight(1f))
                Text(
                    text = "${elapsedSeconds}s",
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = JetBrainsMonoFamily,
                    color = oak.textMuted,
                    modifier = Modifier.semantics { contentDescription = "$elapsedSeconds seconds elapsed" },
                )
            }
        }
        if (activities.isNotEmpty()) {
            // Instrument ticker (soul.md): each tool row is a mono readout line — the
            // friendly noun stays, but it reads as engraved silkscreen, not prose. The
            // active row's icon is tinted accent (still working); done rows dim as a
            // whole (icon + text + check) rather than just muting the text.
            Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
                activities.forEachIndexed { index, activity ->
                    val completed = phase == StreamingPhase.ANSWERING || index < activities.size - 1
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .toolRowEntrance(index = index, reduceMotion = reduceMotion)
                            .alpha(if (completed) 0.7f else 1f),
                        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = toolIcon(activity.tool),
                            contentDescription = null,
                            tint = if (completed) oak.textMuted else oak.accent,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = activity.label,
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFamily,
                            color = if (completed) oak.textMuted else oak.textStrong,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (completed) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = oak.success, modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }
        }
        // Soft skeleton lines — plate-in-progress atmosphere (prototype .plate-skeleton).
        StreamingSkeletonLines(reduceMotion = reduceMotion)
        }
    }
}

/**
 * A one-shot fade + slide entrance for one instrument-ticker row, staggered by
 * [index] ([OakMotion.STAGGER_STEP_MILLIS] per position) — the Android take on the
 * iOS ticker cascade, mirroring `AnswerCard.sectionEntrance`. Deliberately animates
 * opacity/`translationY` on an always-mounted node (never
 * [androidx.compose.animation.AnimatedVisibility]'s insert/remove) so a row already
 * on screen never disappears mid-stream; `remember` keys only on `index`, so a row
 * that has already settled does not restart when the ticker recomposes for a new
 * activity. No-ops entirely under [reduceMotion].
 */
private fun Modifier.toolRowEntrance(index: Int, reduceMotion: Boolean): Modifier = composed {
    if (reduceMotion) {
        this
    } else {
        val density = LocalDensity.current
        val alpha = remember(index) { Animatable(0f) }
        val offsetY = remember(index) { Animatable(with(density) { 4.dp.toPx() }) }
        LaunchedEffect(index) {
            delay(index * OakMotion.STAGGER_STEP_MILLIS.toLong())
            launch { offsetY.animateTo(0f, tween(OakMotion.FADE_MILLIS)) }
            alpha.animateTo(1f, tween(OakMotion.FADE_MILLIS))
        }
        this.graphicsLayer {
            this.alpha = alpha.value
            translationY = offsetY.value
        }
    }
}

@Composable
private fun StreamingSkeletonLines(reduceMotion: Boolean) {
    val oak = LocalOakColors.current
    val pulse = if (reduceMotion) {
        0.55f
    } else {
        val transition = rememberInfiniteTransition(label = "skelPulse")
        val animated by transition.animateFloat(
            initialValue = 0.85f,
            targetValue = 0.40f,
            animationSpec = infiniteRepeatable(
                animation = tween(1200),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "skelPulseAlpha",
        )
        animated
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = OakSpacing.xs)
            .alpha(pulse),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.72f)
                .height(12.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(oak.textFaint.copy(alpha = 0.22f)),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .height(10.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(oak.textFaint.copy(alpha = 0.16f)),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(0.55f)
                .height(10.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(oak.textFaint.copy(alpha = 0.14f)),
        )
    }
}

/**
 * Client-only type heuristic for streaming wash: scans tool-activity labels for
 * known type slugs/names (e.g. "dragon", "Ground"). Returns up to two types.
 * Pure; never invents types from species names (those need the final answer).
 */
internal fun heuristicTypesFromActivities(activities: List<ToolActivity>): List<String> {
    if (activities.isEmpty()) return emptyList()
    val found = linkedSetOf<String>()
    val haystack = activities.joinToString(" ") { "${it.tool} ${it.label}" }.lowercase()
    for (type in OakType.displayOrder) {
        // Word-ish match: type as whole token (spaces, punctuation, or edges).
        val re = Regex("""(^|[^a-z])${Regex.escape(type)}([^a-z]|$)""")
        if (re.containsMatchIn(haystack)) {
            found.add(type)
            if (found.size >= 2) break
        }
    }
    return found.toList()
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
    "get_evolution_chain" -> Icons.Filled.ChangeCircle
    "compute_stat", "get_usage_stats" -> Icons.Filled.QueryStats
    "estimate_damage" -> Icons.Filled.Bolt
    "get_learnset" -> Icons.AutoMirrored.Filled.List
    "get_team", "save_team", "list_teams" -> Icons.Filled.Group
    "get_encounters" -> Icons.Filled.Map
    "run_sql" -> Icons.Filled.Storage
    "search_wiki" -> Icons.Filled.AutoStories
    else -> if (tool.startsWith("list_")) Icons.AutoMirrored.Filled.List else Icons.Filled.Build
}
