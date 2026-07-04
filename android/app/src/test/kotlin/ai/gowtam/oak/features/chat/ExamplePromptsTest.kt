package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises [ExamplePrompts]: the pool has no duplicate entries, and [ExamplePrompts.pick]
 * samples distinct members of the pool without replacement, clamping to the pool size when
 * asked for more than it holds.
 */
class ExamplePromptsTest {

    @Test
    fun `pool has no duplicate entries`() {
        assertEquals(ExamplePrompts.pool.size, ExamplePrompts.pool.toSet().size)
    }

    @Test
    fun `pick returns the requested count of distinct entries all drawn from the pool`() {
        val picked = ExamplePrompts.pick(4)
        assertEquals(4, picked.size)
        assertEquals(4, picked.toSet().size)
        assertTrue(picked.all { it in ExamplePrompts.pool })
    }

    @Test
    fun `pick clamps to the pool size when asked for more than it holds`() {
        val picked = ExamplePrompts.pick(ExamplePrompts.pool.size + 100)
        assertEquals(ExamplePrompts.pool.size, picked.size)
        assertEquals(ExamplePrompts.pool.toSet(), picked.toSet())
    }
}
