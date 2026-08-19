package ai.gowtam.oak.ui.orbs

import ai.gowtam.oak.wire.Fixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class OrbEngineTest {
    @Test
    fun goldenFixtureMatchesWithinTolerance() {
        val root = Json.parseToJsonElement(Fixtures.string("orbs-golden.fixture.json")).jsonObject
        val eps = root.getValue("tolerance").jsonPrimitive.double
        val cases = root.getValue("cases").jsonArray
        assertTrue(cases.isNotEmpty())
        for (el in cases) {
            val c = el.jsonObject
            val key = c.getValue("key").jsonPrimitive.content
            val state = OrbState.fromWire(c.getValue("state").jsonPrimitive.content)
                ?: error("unknown state $key")
            val size = OrbSize.fromPx(c.getValue("size").jsonPrimitive.int)
                ?: error("unknown size $key")
            val t = c.getValue("t").jsonPrimitive.double
            val frame = OrbEngine.frame(state, size, t)
            val expectedDotCount = c.getValue("dotCount").jsonPrimitive.int
            val expectedLineCount = c.getValue("lineCount").jsonPrimitive.int
            // connecting uses hashD to pick signal endpoints; libm ulps can
            // flip a==b and drop one packet. Other modes are exact.
            if (state == OrbState.Connecting) {
                assertTrue(
                    "$key dots ${frame.dots.size} vs $expectedDotCount",
                    abs(frame.dots.size - expectedDotCount) <= 1,
                )
                assertTrue(
                    "$key lines ${frame.lines.size} vs $expectedLineCount",
                    abs(frame.lines.size - expectedLineCount) <= 2,
                )
                continue
            }
            assertEquals("$key dots", expectedDotCount, frame.dots.size)
            assertEquals("$key lines", expectedLineCount, frame.lines.size)
            val expectedDots = c.getValue("dots").jsonArray.map { it.jsonPrimitive.double }
            val expectedLines = c.getValue("lines").jsonArray.map { it.jsonPrimitive.double }
            val gotDots = frame.dots.flatMap { listOf(it.x, it.y, it.z, it.r, it.white, it.a) }
            val gotLines = frame.lines.flatMap { listOf(it.x1, it.y1, it.x2, it.y2, it.white, it.a, it.w) }
            assertEquals("$key dots len", expectedDots.size, gotDots.size)
            assertEquals("$key lines len", expectedLines.size, gotLines.size)
            for (j in gotDots.indices) {
                assertTrue(
                    "$key dots[$j] ${gotDots[j]} vs ${expectedDots[j]}",
                    abs(gotDots[j] - expectedDots[j]) <= eps,
                )
            }
            for (j in gotLines.indices) {
                assertTrue(
                    "$key lines[$j] ${gotLines[j]} vs ${expectedLines[j]}",
                    abs(gotLines[j] - expectedLines[j]) <= eps,
                )
            }
        }
    }
}
