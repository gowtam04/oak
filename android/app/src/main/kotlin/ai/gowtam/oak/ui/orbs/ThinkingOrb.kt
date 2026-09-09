package ai.gowtam.oak.ui.orbs

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.min

/** 20dp (or 64dp) dotted thinking mark. Geometry from [OrbEngine]. */
@Composable
fun ThinkingOrb(
    state: OrbState,
    modifier: Modifier = Modifier,
    size: OrbSize = OrbSize.Px20,
    paused: Boolean = false,
    live: Boolean = true,
) {
    val accent = LocalOakColors.current.accent
    val reduceMotion = rememberReduceMotion()
    val resolved = remember(state, size) { OrbEngine.resolve(state, size) }
    var t by remember(state, size) { mutableDoubleStateOf(if (reduceMotion) 0.6 else 0.0) }

    LaunchedEffect(state, size, paused, reduceMotion, resolved.speed) {
        if (reduceMotion) {
            t = 0.6
            return@LaunchedEffect
        }
        if (paused) return@LaunchedEffect
        while (true) {
            withFrameNanos { nanos ->
                t = (nanos / 1_000_000_000.0) * resolved.speed
            }
        }
    }

    Canvas(
        modifier = modifier
            .size(size.px.dp)
            .alpha(if (live) 1f else 0.55f),
    ) {
        val frame = OrbEngine.frame(state, size, if (reduceMotion) 0.6 else t)
        for (line in frame.lines) {
            val w = min(1.0, max(0.0, line.white))
            drawLine(
                color = accent.copy(alpha = (line.a * (1 - w)).toFloat()),
                start = Offset(line.x1.toFloat(), line.y1.toFloat()),
                end = Offset(line.x2.toFloat(), line.y2.toFloat()),
                strokeWidth = line.w.toFloat(),
                cap = StrokeCap.Round,
            )
        }
        for (d in frame.dots) {
            val w = min(1.0, max(0.0, d.white))
            drawCircle(
                color = accent.copy(alpha = (d.a * (1 - w)).toFloat()),
                radius = d.r.toFloat(),
                center = Offset(d.x.toFloat(), d.y.toFloat()),
            )
        }
    }
}
