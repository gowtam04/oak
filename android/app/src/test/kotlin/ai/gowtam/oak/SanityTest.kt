package ai.gowtam.oak

import org.junit.Assert.assertEquals
import org.junit.Test

/** Exercises the JVM unit test toolchain end to end (build config, Kotlin, JUnit4). */
class SanityTest {
    @Test
    fun additionIsCorrect() {
        assertEquals(4, 2 + 2)
    }
}
