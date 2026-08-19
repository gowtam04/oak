package ai.gowtam.oak.ui.orbs

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

internal object OrbModes {
    fun frame(mode: OrbMode, size: Double, t: Double, o: Map<String, Double>): OrbFrame = when (mode) {
        OrbMode.Orbits -> orbits(size, t, o)
        OrbMode.Globe -> globe(size, t, o)
        OrbMode.Rubik -> rubik(size, t, o)
        OrbMode.Wave -> wave(size, t, o)
        OrbMode.Web -> web(size, t, o)
        OrbMode.Braid -> braid(size, t, o)
        OrbMode.Ribbon, OrbMode.Ring -> ribbon(size, t, o)
        OrbMode.Morph -> morph(size, t, o)
    }

    private fun d(o: Map<String, Double>, key: String, fallback: Double) = o[key] ?: fallback

    private fun orbits(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cx = size / 2
        val cy = size / 2
        val R = (size / 2) * 0.82
        val pt = OrbCore.makeProj(t * 0.12, 0.3, cx, cy, 1.0)
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val dots = ArrayList<OrbDot>()
        val orbitN = d(o, "orbitN", 12.0).toInt()
        val ghostN = d(o, "ghostN", 40.0).toInt()
        val particles = d(o, "particles", 3.0).toInt()
        for (orb in 0 until orbitN) {
            val h1 = OrbCore.hashD(orb.toDouble(), 1.7)
            val h2 = OrbCore.hashD(orb.toDouble(), 5.2)
            val h3 = OrbCore.hashD(orb.toDouble(), 8.9)
            val ro = R * (0.45 + 0.52 * h1)
            val th = h1 * 2 * PI
            val phi = acos(2 * h2 - 1)
            val nx = sin(phi) * cos(th)
            val ny = cos(phi)
            val nz = sin(phi) * sin(th)
            var ux = -ny
            var uy = nx
            val uz = 0.0
            val ul = max(1e-6, sqrt(ux * ux + uy * uy))
            ux /= ul
            uy /= ul
            val vx = ny * uz - nz * uy
            val vy = nz * ux - nx * uz
            val vz = nx * uy - ny * ux
            val speed = (0.25 + 0.55 * h3) * if (h3 > 0.5) 1.0 else -1.0
            for (k in 0 until ghostN) {
                val a = (k.toDouble() / ghostN) * 2 * PI
                val (px, py, z) = pt(
                    (ux * cos(a) + vx * sin(a)) * ro,
                    (uy * cos(a) + vy * sin(a)) * ro,
                    (uz * cos(a) + vz * sin(a)) * ro,
                )
                val depth = (z / ro + 1) / 2
                dots.add(
                    OrbDot(
                        px, py, z, (d(o, "ghostR", 0.9)) * rs,
                        0.72, (d(o, "ghostA", 0.5)) * (0.4 + 0.6 * depth),
                    ),
                )
            }
            for (m in 0 until particles) {
                val a = t * speed + (m.toDouble() / particles) * 2 * PI + h2 * 6
                val (px, py, z) = pt(
                    (ux * cos(a) + vx * sin(a)) * ro,
                    (uy * cos(a) + vy * sin(a)) * ro,
                    (uz * cos(a) + vz * sin(a)) * ro,
                )
                val depth = (z / ro + 1) / 2
                dots.add(
                    OrbDot(
                        px, py, z,
                        ((d(o, "partR", 1.2)) + (d(o, "partRDepth", 1.6)) * depth) * rs,
                        0.3 - 0.22 * depth,
                    ),
                )
            }
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }

    private fun globe(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val spin = 0.5
        val cx = size / 2
        val cy = size / 2
        val radius = (size / 2) * 0.82
        val tilt = 0.4 + 0.06 * sin(t * 0.35)
        val pt = OrbCore.makeProj(t * spin, tilt, cx, cy, radius)
        val scan = t * (spin + (1.7 - spin) * d(o, "scanMul", 1.0))
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val dimBase = d(o, "dimBase", 1.0)
        val dots = ArrayList<OrbDot>()
        val latRings = d(o, "latRings", 17.0)
        val lonDensity = d(o, "lonDensity", 44.0)
        var li = 0.0
        while (li <= latRings) {
            val lat = -PI / 2 + (li / latRings) * PI
            val cosLat = cos(lat)
            val sinLat = sin(lat)
            val lonCount = max(1, OrbCore.jsRound(abs(cosLat) * lonDensity).toInt())
            for (lj in 0 until lonCount) {
                val lon = (lj.toDouble() / lonCount) * 2 * PI
                val (px, py, z) = pt(cosLat * cos(lon), sinLat, cosLat * sin(lon))
                val depth = (z + 1) / 2
                val delta = OrbCore.angleDelta(lon + t * spin, scan)
                val boost = exp(-(delta * delta) / 0.18) * max(0.0, z)
                dots.add(
                    OrbDot(
                        px, py, z,
                        ((d(o, "rBase", 0.6)) + (d(o, "rDepth", 1.7)) * depth + (d(o, "rBoost", 1.0)) * boost) * rs,
                        (d(o, "inkFar", 0.62)) - (d(o, "inkSpan", 0.54)) * depth,
                        dimBase + (1 - dimBase) * min(1.0, boost),
                    ),
                )
            }
            li += 1
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }

    private data class Move(val axis: Int, val lo: Double, val hi: Double, val ang: Double)

    private fun solveCycle(time: Double, count: Int, slotDur: Double, rest: Double): Pair<DoubleArray, Int> {
        val cyc = 2 * count * slotDur + rest
        val tc = time % cyc
        val amount = DoubleArray(count)
        var active = -1
        if (tc < 2 * count * slotDur) {
            val slot = floor(tc / slotDur).toInt()
            val p = (tc - slot * slotDur) / slotDur
            val cl = min(1.0, p / 0.7)
            val ep = 1 - (1 - cl).pow(3)
            if (slot < count) {
                for (i in 0 until slot) amount[i] = 1.0
                amount[slot] = ep
                active = slot
            } else {
                val u = 2 * count - 1 - slot
                for (i in 0 until u) amount[i] = 1.0
                if (u in 0 until count) {
                    amount[u] = 1 - ep
                    active = u
                }
            }
        }
        return amount to active
    }

    private fun makeMoves(count: Int): List<Move> = (0 until count).map { i ->
        val axis = min(2, floor(OrbCore.hashD(i.toDouble(), 2.3) * 3).toInt())
        val lo = -1.0 + 0.5 * min(3, floor(OrbCore.hashD(i.toDouble(), 5.9) * 4).toInt())
        val dir = if (OrbCore.hashD(i.toDouble(), 7.7) < 0.5) 1.0 else -1.0
        Move(axis, lo, lo + 0.5, (dir * PI) / 2)
    }

    private fun applyMoves(
        pt3: Triple<Double, Double, Double>,
        moves: List<Move>,
        amount: DoubleArray,
        active: Int,
    ): Pair<Triple<Double, Double, Double>, Boolean> {
        var x = pt3.first
        var y = pt3.second
        var z = pt3.third
        var inActive = false
        for (i in moves.indices) {
            if (amount[i] <= 0) continue
            val mv = moves[i]
            val coord = when (mv.axis) {
                0 -> x
                1 -> y
                else -> z
            }
            if (coord < mv.lo || coord >= mv.hi) continue
            if (i == active) inActive = true
            val a = mv.ang * amount[i]
            val ca = cos(a)
            val sa = sin(a)
            when (mv.axis) {
                0 -> {
                    val y2 = y * ca - z * sa
                    z = y * sa + z * ca
                    y = y2
                }
                1 -> {
                    val x2 = x * ca + z * sa
                    z = -x * sa + z * ca
                    x = x2
                }
                else -> {
                    val x2 = x * ca - y * sa
                    y = x * sa + y * ca
                    x = x2
                }
            }
        }
        return Triple(x, y, z) to inActive
    }

    private fun rubik(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cx = size / 2
        val cy = size / 2
        val R = (size / 2) * 0.82
        val pt = OrbCore.makeProj(t * 0.55, 0.35 + 0.1 * sin(t * 0.9), cx, cy, R)
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val moveCount = d(o, "moveCount", 14.0).toInt()
        val moves = makeMoves(moveCount)
        val (amount, active) = solveCycle(t, moveCount, 0.42, 1.2)
        val dots = ArrayList<OrbDot>()
        val latRings = d(o, "latRings", 15.0)
        val lonDensity = d(o, "lonDensity", 40.0)
        var li = 0.0
        while (li <= latRings) {
            val lat = -PI / 2 + (li / latRings) * PI
            val cosLat = cos(lat)
            val sinLat = sin(lat)
            val lonCount = max(1, OrbCore.jsRound(abs(cosLat) * lonDensity).toInt())
            for (lj in 0 until lonCount) {
                val lon = (lj.toDouble() / lonCount) * 2 * PI
                val (xyz, inActive) = applyMoves(
                    Triple(cosLat * cos(lon), sinLat, cosLat * sin(lon)),
                    moves, amount, active,
                )
                val (px, py, zr) = pt(xyz.first, xyz.second, xyz.third)
                val depth = (zr + 1) / 2
                dots.add(
                    OrbDot(
                        px, py, zr,
                        ((d(o, "rBase", 0.6)) + (d(o, "rDepth", 1.7)) * depth + if (inActive) d(o, "rActive", 0.3) else 0.0) * rs,
                        (d(o, "inkFar", 0.62)) - (d(o, "inkSpan", 0.54)) * depth - if (inActive) 0.14 else 0.0,
                    ),
                )
            }
            li += 1
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }

    private fun wave(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cx = size / 2
        val cy = size / 2
        val R = (size / 2) * 0.874
        val pt = OrbCore.makeProj(t * 0.18, 0.38, cx, cy, 1.0)
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val dots = ArrayList<OrbDot>()
        val rings = d(o, "rings", 15.0)
        val lonDensity = d(o, "lonDensity", 40.0)
        var ri = 0.0
        while (ri <= rings) {
            val lat = -PI / 2 + (ri / rings) * PI
            val cosLat = cos(lat)
            val sinLat = sin(lat)
            val w = 0.62 * sin(t * 2.1 - ri * 0.52) + 0.38 * sin(t * 1.27 + ri * 0.83)
            val rr = R * (0.88 + 0.105 * w)
            val lonCount = max(1, OrbCore.jsRound(abs(cosLat) * lonDensity).toInt())
            for (lj in 0 until lonCount) {
                val lon = (lj.toDouble() / lonCount) * 2 * PI
                val (px, py, z) = pt(cosLat * cos(lon) * rr, sinLat * rr, cosLat * sin(lon) * rr)
                val depth = (z / R + 1) / 2
                val crest = max(0.0, w)
                dots.add(
                    OrbDot(
                        px, py, z,
                        ((d(o, "rBase", 0.6)) + (d(o, "rDepth", 1.7)) * depth) * (1 + 0.4 * crest) * rs,
                        0.66 - 0.56 * depth - 0.1 * crest,
                    ),
                )
            }
            ri += 1
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }

    private fun web(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cx = size / 2
        val cy = size / 2
        val R = (size / 2) * 0.8 * d(o, "spread", 1.0)
        val pt = OrbCore.makeProj(t * 0.12, 0.32, cx, cy, R)
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val nodeN = d(o, "nodeN", 30.0).toInt()
        val thr = d(o, "thr", 0.72)
        val nodeR = d(o, "nodeR", 1.4)
        val nodeRDepth = d(o, "nodeRDepth", 1.8)
        val nodes = ArrayList<Triple<Double, Double, Double>>(nodeN)
        for (i in 0 until nodeN) {
            val dir = OrbCore.fibDir(i.toDouble(), nodeN.toDouble())
            val x = dir.first + 0.3 * (OrbCore.vnoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2
            val y = dir.second + 0.3 * (OrbCore.vnoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2
            val z = dir.third + 0.3 * (OrbCore.vnoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2
            val l = sqrt(x * x + y * y + z * z)
            nodes.add(Triple(x / l, y / l, z / l))
        }
        val lines = ArrayList<OrbLine>()
        val dots = ArrayList<OrbDot>()
        for (i in 0 until nodeN) {
            for (j in i + 1 until nodeN) {
                val dx = nodes[i].first - nodes[j].first
                val dy = nodes[i].second - nodes[j].second
                val dz = nodes[i].third - nodes[j].third
                val dist = sqrt(dx * dx + dy * dy + dz * dz)
                if (dist >= thr) continue
                val (x1, y1, z1) = pt(nodes[i].first, nodes[i].second, nodes[i].third)
                val (x2, y2, z2) = pt(nodes[j].first, nodes[j].second, nodes[j].third)
                val depth = ((z1 + z2) / 2 + 1) / 2
                lines.add(
                    OrbLine(
                        x1, y1, x2, y2, 0.42,
                        (1 - dist / thr) * (0.3 + 0.55 * depth),
                        max(0.6, d(o, "lineW", 0.8) * rs),
                    ),
                )
            }
        }
        for (i in 0 until nodeN) {
            val (px, py, z) = pt(nodes[i].first, nodes[i].second, nodes[i].third)
            val depth = (z + 1) / 2
            val pulse = 1 + 0.25 * sin(t * 1.4 + i * 2.7)
            dots.add(OrbDot(px, py, z, (nodeR + nodeRDepth * depth) * pulse * rs, 0.55 - 0.45 * depth))
        }
        val signals = d(o, "signals", 5.0).toInt()
        for (s in 0 until signals) {
            val seg = floor(t * 0.55 + s * 7.31)
            val a = floor(OrbCore.hashD(seg, s * 3.1 + 1.7) * nodeN).toInt()
            val b = floor(OrbCore.hashD(seg, s * 5.7 + 4.2) * nodeN).toInt()
            if (a == b) continue
            val f = OrbCore.frac(t * 0.55 + s * 7.31)
            val x = OrbCore.lerp(nodes[a].first, nodes[b].first, f)
            val y = OrbCore.lerp(nodes[a].second, nodes[b].second, f)
            val z = OrbCore.lerp(nodes[a].third, nodes[b].third, f)
            val l = max(1e-6, sqrt(x * x + y * y + z * z))
            val (px, py, zr) = pt(x / l, y / l, z / l)
            val depth = (zr + 1) / 2
            dots.add(OrbDot(px, py, zr, (nodeR * 1.5 + nodeRDepth * depth) * rs, 0.05, 0.5 + 0.5 * depth))
        }
        return OrbCore.finalizeFrame(dots, lines, d(o, "rMin", 0.3))
    }

    private fun braid(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cx = size / 2
        val cy = size / 2
        val R = (size / 2) * 0.76
        val pt = OrbCore.makeProj(t * 0.4, 0.3, cx, cy, 1.0)
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val dots = ArrayList<OrbDot>()
        val ghostN = d(o, "ghostN", 150.0).toInt()
        for (i in 0 until ghostN) {
            val dir = OrbCore.fibDir(i.toDouble(), ghostN.toDouble())
            val (px, py, z) = pt(dir.first * R, dir.second * R, dir.third * R)
            val depth = (z / R + 1) / 2
            dots.add(OrbDot(px, py, z, 0.8 * rs, 0.78, 0.1 + 0.22 * depth))
        }
        val strandN = d(o, "strandN", 52.0).toInt()
        val turns = d(o, "turns", 3.0)
        for (s in 0 until 3) {
            val phase = (s.toDouble() / 3) * 2 * PI
            for (i in 0 until strandN) {
                val u = (OrbCore.frac(i.toDouble() / strandN + t * 0.045) * 2 - 1) * 0.96
                val surf = sqrt(max(0.0, 1 - u * u))
                val endFade = min(1.0, (1 - abs(u)) / 0.1)
                val a = u * PI * turns + phase
                val weave = 1 + 0.075 * sin(u * PI * turns * 2 + phase * 2 + t * 0.8)
                val rr = surf * R * weave
                val (px, py, zr) = pt(cos(a) * rr, u * R * weave, sin(a) * rr)
                val depth = (zr / R + 1) / 2
                dots.add(
                    OrbDot(
                        px, py, zr,
                        ((d(o, "rBase", 1.2)) + (d(o, "rDepth", 1.8)) * depth) * rs,
                        0.55 - 0.45 * depth,
                        endFade * (0.45 + 0.55 * depth),
                    ),
                )
            }
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }

    private fun ribbon(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cx = size / 2
        val cy = size / 2
        val R = (size / 2) * 0.78
        val spin = d(o, "spin", 1.0)
        val camTilt = 0.3
        val pt = OrbCore.makeProj(t * 0.1 * spin, camTilt, cx, cy, 1.0)
        val rs = OrbCore.radiusScale(size, d(o, "rsPow", 0.6))
        val dots = ArrayList<OrbDot>()
        val ghostN = d(o, "ghostN", 150.0).toInt()
        for (i in 0 until ghostN) {
            val dir = OrbCore.fibDir(i.toDouble(), ghostN.toDouble())
            val (px, py, z) = pt(dir.first * R, dir.second * R, dir.third * R)
            val depth = (z / R + 1) / 2
            dots.add(OrbDot(px, py, z, 0.8 * rs, 0.78, 0.1 + 0.22 * depth))
        }
        val faceOn = d(o, "faceOn", 0.0) != 0.0
        val ya = t * 0.24 * spin
        val ta = if (faceOn) -camTilt else 0.55 + 0.3 * sin(t * 0.18) * spin
        val ux = cos(ya)
        val uy = 0.0
        val uz = sin(ya)
        val vx = -uz * sin(ta)
        val vy = cos(ta)
        val vz = ux * sin(ta)
        val nx = uy * vz - uz * vy
        val ny = uz * vx - ux * vz
        val nz = ux * vy - uy * vx
        val wobAmp = 0.23 * d(o, "wobMul", 1.0)
        val baseR = if (faceOn) R / (1 + 0.85 * wobAmp) else R
        val baseLanes = d(o, "lanes", 5.0)
        val segs = d(o, "segs", 88.0).toInt()
        val lanes = max(1, OrbCore.jsRound(baseLanes * d(o, "bandMul", 1.0)).toInt())
        for (w in 0 until lanes) {
            val laneOff = (w - (lanes - 1) / 2.0) * 0.075
            val edge = abs(w - (lanes - 1) / 2.0) / max(1.0, (lanes - 1) / 2.0)
            for (k in 0 until segs) {
                val a = (k.toDouble() / segs) * 2 * PI
                val wobMul = d(o, "wobMul", 1.0)
                val wob = (0.16 * sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * sin(a * 5 + t * 1.1)) * wobMul
                val radial = if (faceOn) 1 + wob else 1.0
                val off = if (faceOn) laneOff else laneOff + wob
                val x = ux * cos(a) + vx * sin(a) + nx * off
                val y = uy * cos(a) + vy * sin(a) + ny * off
                val z = uz * cos(a) + vz * sin(a) + nz * off
                val l = sqrt(x * x + y * y + z * z)
                val rr = baseR * radial
                val (px, py, zr) = pt((x / l) * rr, (y / l) * rr, (z / l) * rr)
                val depth = (zr / R + 1) / 2
                dots.add(
                    OrbDot(
                        px, py, zr,
                        ((d(o, "rBase", 1.1)) + (d(o, "rDepth", 1.7)) * depth) * (1 - 0.25 * edge) * rs,
                        0.52 - 0.44 * depth + 0.18 * edge,
                        0.4 + 0.6 * depth,
                    ),
                )
            }
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }

    private fun smoothE(x: Double) = x * x * (3 - 2 * x)

    private fun polyPath(verts: List<Pair<Double, Double>>): (Double) -> Pair<Double, Double> {
        val v = verts.size
        val lengths = ArrayList<Double>(v)
        var total = 0.0
        for (i in 0 until v) {
            val a = verts[i]
            val b = verts[(i + 1) % v]
            val l = hypot(b.first - a.first, b.second - a.second)
            lengths.add(l)
            total += l
        }
        return { f ->
            var target = f * total
            var i = 0
            while (target > lengths[i] && i < v - 1) {
                target -= lengths[i]
                i++
            }
            val a = verts[i]
            val b = verts[(i + 1) % v]
            val ff = if (lengths[i] != 0.0) min(1.0, target / lengths[i]) else 0.0
            Pair(a.first + (b.first - a.first) * ff, a.second + (b.second - a.second) * ff)
        }
    }

    private val circle: (Double) -> Pair<Double, Double> = { f ->
        val a = -PI / 2 + f * 2 * PI
        Pair(cos(a) * 0.24, sin(a) * 0.24)
    }
    private val triangle = polyPath(listOf(0.0 to -0.26, 0.24 to 0.16, -0.24 to 0.16))
    private val square = polyPath(listOf(0.0 to -0.2, 0.2 to -0.2, 0.2 to 0.2, -0.2 to 0.2, -0.2 to -0.2))

    private fun morph(size: Double, t: Double, o: Map<String, Double>): OrbFrame {
        val cycle = listOf(circle, triangle, square)
        val kCount = cycle.size
        val hold = 1.4
        val morphDur = 0.9
        val seg = hold + morphDur
        val tc = t % (seg * kCount)
        val k = floor(tc / seg).toInt()
        val local = tc - k * seg
        val m = if (local > hold) smoothE((local - hold) / morphDur) else 0.0
        val sprd = d(o, "spread", 1.0)
        val pA = cycle[k]
        val pB = cycle[(k + 1) % kCount]
        val mCount = 160
        val pts = ArrayList<Pair<Double, Double>>(mCount)
        for (i in 0 until mCount) {
            val f = i.toDouble() / mCount
            val a = pA(f)
            val b = pB(f)
            pts.add(Pair((a.first + (b.first - a.first) * m) * sprd, (a.second + (b.second - a.second) * m) * sprd))
        }
        val lengths = ArrayList<Double>(mCount)
        var total = 0.0
        for (i in 0 until mCount) {
            val a = pts[i]
            val b = pts[(i + 1) % mCount]
            val l = hypot(b.first - a.first, b.second - a.second)
            lengths.add(l)
            total += l
        }
        val n = max(6, OrbCore.jsRound(34 * d(o, "iconD", 1.0)).toInt())
        val re = d(o, "rDot", 0.021) * 1.35 * sprd
        val pulse = 1 + 0.02 * sin(local * 3.1)
        val dots = ArrayList<OrbDot>(n)
        val c2 = size / 2
        var segI = 0
        var acc = 0.0
        for (k2 in 0 until n) {
            val target = (k2.toDouble() / n) * total
            while (acc + lengths[segI] < target && segI < mCount - 1) {
                acc += lengths[segI]
                segI++
            }
            val a = pts[segI]
            val b = pts[(segI + 1) % mCount]
            val f = if (lengths[segI] != 0.0) min(1.0, (target - acc) / lengths[segI]) else 0.0
            val x = (a.first + (b.first - a.first) * f) * pulse
            val y = (a.second + (b.second - a.second) * f) * pulse
            dots.add(OrbDot(c2 + x * size, c2 + y * size, 0.0, max(0.35, re * size), 0.1))
        }
        return OrbCore.finalizeFrame(dots, emptyList(), d(o, "rMin", 0.3))
    }
}
