package ai.gowtam.oak.ui.orbs

import kotlin.math.max
import kotlin.math.sqrt

internal enum class OrbMode {
    Orbits, Globe, Rubik, Wave, Web, Braid, Ribbon, Ring, Morph,
}

internal data class OrbResolved(
    val mode: OrbMode,
    val speed: Double,
    val opts: Map<String, Double>,
)

private data class OrbPreset(
    val speed: Double,
    val count: Double,
    val size: Double,
    val extra: Map<String, Double> = emptyMap(),
)

internal object OrbPresets {
    fun resolve(state: OrbState, size: OrbSize): OrbResolved {
        val mode = STATE_TO_MODE.getValue(state)
        val preset = PRESETS.getValue(mode).getValue(size)
        var opts = BASE_PROFILES.getValue(mode)
        if (preset.count != 1.0) opts = scaleCounts(opts, preset.count)
        if (preset.size != 1.0) opts = scaleRadii(opts, preset.size)
        if (preset.extra.isNotEmpty()) opts = opts + preset.extra
        return OrbResolved(mode, preset.speed, opts)
    }

    private val STATE_TO_MODE = mapOf(
        OrbState.Working to OrbMode.Orbits,
        OrbState.Searching to OrbMode.Globe,
        OrbState.Solving to OrbMode.Rubik,
        OrbState.Listening to OrbMode.Wave,
        OrbState.Connecting to OrbMode.Web,
        OrbState.Weaving to OrbMode.Braid,
        OrbState.Composing to OrbMode.Ribbon,
        OrbState.Breathing to OrbMode.Ring,
        OrbState.Shaping to OrbMode.Morph,
    )

    private val PRESETS = mapOf(
        OrbMode.Orbits to mapOf(
            OrbSize.Px64 to OrbPreset(1.885, 1.0, 1.0),
            OrbSize.Px20 to OrbPreset(3.9, 0.238, 2.4),
        ),
        OrbMode.Globe to mapOf(
            OrbSize.Px64 to OrbPreset(2.015, 0.42, 1.15, mapOf("scanMul" to 4.08, "dimBase" to 0.45)),
            OrbSize.Px20 to OrbPreset(2.665, 0.105, 1.75, mapOf("scanMul" to 4.335, "dimBase" to 0.45)),
        ),
        OrbMode.Rubik to mapOf(
            OrbSize.Px64 to OrbPreset(1.82, 0.35, 1.05),
            OrbSize.Px20 to OrbPreset(1.95, 0.088, 1.9),
        ),
        OrbMode.Wave to mapOf(
            OrbSize.Px64 to OrbPreset(4.388, 0.341, 1.0),
            OrbSize.Px20 to OrbPreset(3.998, 0.105, 1.6),
        ),
        OrbMode.Web to mapOf(
            OrbSize.Px64 to OrbPreset(3.315, 1.35, 0.95),
            OrbSize.Px20 to OrbPreset(6.63, 0.25, 1.52),
        ),
        OrbMode.Braid to mapOf(
            OrbSize.Px64 to OrbPreset(1.625, 0.5, 1.0),
            OrbSize.Px20 to OrbPreset(2.75, 0.1125, 1.36),
        ),
        OrbMode.Ribbon to mapOf(
            OrbSize.Px64 to OrbPreset(2.34, 0.25, 0.85, mapOf("spin" to 0.0, "bandMul" to 3.9, "wobMul" to 1.0)),
            OrbSize.Px20 to OrbPreset(3.12, 0.051, 1.073, mapOf("spin" to 0.0, "bandMul" to 4.94, "wobMul" to 1.0)),
        ),
        OrbMode.Ring to mapOf(
            OrbSize.Px64 to OrbPreset(3.24, 0.25, 0.956, mapOf("spin" to 0.0, "bandMul" to 3.627, "wobMul" to 0.368)),
            OrbSize.Px20 to OrbPreset(3.78, 0.028, 1.622, mapOf("spin" to 0.0, "bandMul" to 3.968, "wobMul" to 0.565)),
        ),
        OrbMode.Morph to mapOf(
            OrbSize.Px64 to OrbPreset(2.405, 0.702, 0.395, mapOf("spread" to 1.45)),
            OrbSize.Px20 to OrbPreset(2.08, 0.53, 1.011, mapOf("spread" to 1.45)),
        ),
    )

    private val COUNT_PAIRS = listOf("latRings" to "lonDensity", "rings" to "lonDensity", "lanes" to "segs")
    private val COUNT_KEYS = listOf("orbitN", "ghostN", "nodeN", "strandN", "signals")
    private val RADIUS_KEYS = listOf(
        "rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth",
    )

    private fun scaleCounts(opts: Map<String, Double>, scale: Double): Map<String, Double> {
        val out = opts.toMutableMap()
        val done = mutableSetOf<String>()
        val rt = sqrt(scale)
        for ((a, b) in COUNT_PAIRS) {
            val va = out[a]
            val vb = out[b]
            if (va != null && vb != null && a !in done && b !in done) {
                out[a] = max(2.0, OrbCore.jsRound(va * rt))
                out[b] = max(2.0, OrbCore.jsRound(vb * rt))
                done += a
                done += b
            }
        }
        for (k in COUNT_KEYS) {
            val v = out[k]
            if (v != null && v != 0.0 && k !in done) out[k] = max(1.0, OrbCore.jsRound(v * scale))
        }
        val icon = out["iconD"]
        if (icon != null) out["iconD"] = max(0.02, icon * scale)
        return out
    }

    private fun scaleRadii(opts: Map<String, Double>, scale: Double): Map<String, Double> {
        val out = opts.toMutableMap()
        for (k in RADIUS_KEYS) {
            val v = out[k]
            if (v != null) out[k] = v * scale
        }
        out["rSizeMul"] = (out["rSizeMul"] ?: 1.0) * scale
        return out
    }

    private val BASE_PROFILES = mapOf(
        OrbMode.Globe to mapOf(
            "latRings" to 17.0, "lonDensity" to 44.0, "rBase" to 0.6, "rDepth" to 1.7,
            "rBoost" to 1.0, "inkFar" to 0.62, "inkSpan" to 0.54, "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Orbits to mapOf(
            "orbitN" to 12.0, "ghostN" to 40.0, "ghostR" to 0.9, "ghostA" to 0.5, "particles" to 3.0,
            "partR" to 1.2, "partRDepth" to 1.6, "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Rubik to mapOf(
            "latRings" to 15.0, "lonDensity" to 40.0, "moveCount" to 14.0, "rBase" to 0.6,
            "rDepth" to 1.7, "rActive" to 0.3, "inkFar" to 0.62, "inkSpan" to 0.54,
            "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Wave to mapOf(
            "rings" to 15.0, "lonDensity" to 40.0, "rBase" to 0.6, "rDepth" to 1.7,
            "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Web to mapOf(
            "nodeN" to 30.0, "thr" to 0.72, "signals" to 5.0, "nodeR" to 1.4,
            "nodeRDepth" to 1.8, "lineW" to 0.8, "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Braid to mapOf(
            "strandN" to 52.0, "turns" to 3.0, "ghostN" to 150.0, "rBase" to 1.2,
            "rDepth" to 1.8, "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Ribbon to mapOf(
            "lanes" to 5.0, "segs" to 88.0, "ghostN" to 150.0, "rBase" to 1.1,
            "rDepth" to 1.7, "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Ring to mapOf(
            "lanes" to 5.0, "segs" to 88.0, "ghostN" to 0.0, "faceOn" to 1.0,
            "rBase" to 1.1, "rDepth" to 1.7, "rsPow" to 0.6, "rMin" to 0.3,
        ),
        OrbMode.Morph to mapOf(
            "rDot" to 0.021, "iconD" to 1.0, "rMin" to 0.25,
        ),
    )
}
