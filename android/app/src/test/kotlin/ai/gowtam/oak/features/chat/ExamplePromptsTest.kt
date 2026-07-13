package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises [ExamplePrompts]: the pool has no duplicate entries, and [ExamplePrompts.pick]
 * samples distinct members of the pool without replacement, clamping to the pool size when
 * asked for more than it holds. Also covers filed starters (specimen-desk empty state).
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

    @Test
    fun `pickFiled returns one starter per category in Battle Dex Rules Meta order`() {
        val filed = ExamplePrompts.pickFiled()
        assertEquals(4, filed.size)
        assertEquals(
            listOf(
                ExamplePrompts.Category.Battle,
                ExamplePrompts.Category.Dex,
                ExamplePrompts.Category.Rules,
                ExamplePrompts.Category.Meta,
            ),
            filed.map { it.category },
        )
        assertTrue(filed.all { it.prompt.isNotBlank() })
        assertTrue(filed.all { it.typeDot.isNotBlank() })
        assertTrue(filed.all { starter -> starter in ExamplePrompts.filedPool })
    }

    @Test
    fun `filedPool covers all four categories`() {
        val categories = ExamplePrompts.filedPool.map { it.category }.toSet()
        assertEquals(ExamplePrompts.Category.entries.toSet(), categories)
    }
}
