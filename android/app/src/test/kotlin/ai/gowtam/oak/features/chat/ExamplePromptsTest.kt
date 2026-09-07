package ai.gowtam.oak.features.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises [ExamplePrompts]: the generated pool has no duplicate prompts,
 * covers all four categories, and [ExamplePrompts.pickFiled] samples one
 * starter per category in Battle → Dex → Rules → Meta order.
 */
class ExamplePromptsTest {

    @Test
    fun `filedPool has no duplicate prompts`() {
        val prompts = ExamplePrompts.filedPool.map { it.prompt }
        assertEquals(prompts.size, prompts.toSet().size)
    }

    @Test
    fun `filedPool is a large discovery set`() {
        assertTrue(ExamplePrompts.filedPool.size >= 200)
        for (category in ExamplePrompts.Category.entries) {
            assertTrue(ExamplePrompts.filedPool.count { it.category == category } >= 50)
        }
    }

    @Test
    fun `filedPool covers all four categories`() {
        val categories = ExamplePrompts.filedPool.map { it.category }.toSet()
        assertEquals(ExamplePrompts.Category.entries.toSet(), categories)
    }

    @Test
    fun `filedPool entries have type dots`() {
        assertTrue(ExamplePrompts.filedPool.all { it.typeDot.isNotBlank() })
        assertTrue(ExamplePrompts.filedPool.all { it.prompt.isNotBlank() })
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
}
