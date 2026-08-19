package ai.gowtam.oak.ui.orbs

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Hand-port of thinking-orbs 0.3.1 geometry (MIT © Jakub Antalik). */

enum class OrbState {
    Working,
    Searching,
    Solving,
    Listening,
    Connecting,
    Weaving,
    Composing,
    Breathing,
    Shaping,
    ;

    val wire: String
        get() = name.lowercase()

    companion object {
        fun fromWire(raw: String): OrbState? = entries.firstOrNull { it.wire == raw }
    }
}

enum class OrbSize(val px: Int) {
    Px20(20),
    Px64(64),
    ;

    companion object {
        fun fromPx(px: Int): OrbSize? = entries.firstOrNull { it.px == px }
    }
}

data class OrbDot(
    val x: Double,
    val y: Double,
    val z: Double,
    val r: Double,
    val white: Double,
    val a: Double = 1.0,
)

data class OrbLine(
    val x1: Double,
    val y1: Double,
    val x2: Double,
    val y2: Double,
    val white: Double,
    val a: Double = 1.0,
    val w: Double,
)

data class OrbFrame(
    val dots: List<OrbDot>,
    val lines: List<OrbLine>,
)

internal object OrbCore {
    /** JS `Math.round` — floor(x + 0.5). Not Kotlin's half-even `round`. */
    fun jsRound(x: Double): Double = floor(x + 0.5)

    fun lerp(a: Double, b: Double, f: Double): Double = a + (b - a) * f

    fun frac(x: Double): Double = x - floor(x)

    fun hashD(a: Double, b: Double): Double {
        val h = sin(a * 12.9898 + b * 78.233) * 43758.5453
        return h - floor(h)
    }

    fun vnoise(x: Double, y: Double): Double {
        val xi = floor(x)
        val yi = floor(y)
        var fx = x - xi
        var fy = y - yi
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        val a = hashD(xi, yi)
        val b = hashD(xi + 1, yi)
        val c = hashD(xi, yi + 1)
        val d = hashD(xi + 1, yi + 1)
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }

    fun fibDir(i: Double, n: Double): Triple<Double, Double, Double> {
        val golden = PI * (3 - sqrt(5.0))
        val y = 1 - (2 * (i + 0.5)) / n
        val rad = sqrt(1 - y * y)
        val a = i * golden
        return Triple(rad * cos(a), y, rad * sin(a))
    }

    fun angleDelta(a: Double, b: Double): Double = atan2(sin(a - b), cos(a - b))

    fun makeProj(
        yaw: Double,
        tilt: Double,
        cx: Double,
        cy: Double,
        scale: Double,
    ): (Double, Double, Double) -> Triple<Double, Double, Double> {
        val st = sin(tilt)
        val ct = cos(tilt)
        val sy = sin(yaw)
        val cyw = cos(yaw)
        return { x, y, z ->
            val x1 = x * cyw + z * sy
            val z1 = -x * sy + z * cyw
            val y1 = y * ct - z1 * st
            val z2 = y * st + z1 * ct
            Triple(cx + x1 * scale, cy - y1 * scale, z2)
        }
    }

    fun radiusScale(size: Double, pow: Double): Double = (size / 300).pow(pow)

    fun finalizeFrame(dots: List<OrbDot>, lines: List<OrbLine>, rMin: Double = 0.3): OrbFrame {
        val visible = ArrayList<OrbDot>(dots.size)
        for (d in dots) {
            if (d.a < 0.02) continue
            visible.add(d.copy(r = max(rMin, d.r)))
        }
        visible.sortWith(compareBy<OrbDot> { it.z }.thenBy { 0 })
        return OrbFrame(dots = visible, lines = lines.filter { it.a >= 0.02 })
    }
}
