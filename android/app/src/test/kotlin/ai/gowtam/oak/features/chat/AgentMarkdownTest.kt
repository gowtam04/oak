package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.chat.answercard.oakAnswerAgentMarkdown
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.Inference
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.Subject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure export for "Copy for agents" (soul.md Phase 3) — structured markdown from
 * a finalized [OakAnswer], no Compose / clipboard.
 */
class AgentMarkdownTest {

    private fun baseAnswer(
        markdown: String = "Garchomp's base Speed is **102**.",
        reasoning: String = "Looked up base stats.",
    ) = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = markdown,
        reasoningMarkdown = reasoning,
        citations = listOf(
            Citation(source = "pokemon:garchomp", detail = "base stats", endpointUrl = null),
        ),
        inferences = listOf(
            Inference(claim = "Jolly is preferred for speed", confidence = Inference.Confidence.High, note = null),
        ),
        generationBasis = GenerationBasis(generation = "Gen 9", fallback = false, note = null),
        subjects = listOf(
            Subject(
                name = "Garchomp",
                dexNumber = 445,
                spriteUrl = "https://example/garchomp.png",
                types = listOf("dragon", "ground"),
                isFallback = false,
            ),
        ),
        uncertaintyFlags = listOf("EV investment not specified"),
        suggestions = listOf("What about Choice Scarf sets?"),
    )

    @Test
    fun `exports status generation subjects answer reasoning sources`() {
        val md = oakAnswerAgentMarkdown(baseAnswer())
        assertTrue(md.startsWith("# Oak answer"))
        assertTrue(md.contains("**Status:** answered"))
        assertTrue(md.contains("**Generation:** Gen 9"))
        assertTrue(md.contains("## Subjects"))
        assertTrue(md.contains("Garchomp"))
        assertTrue(md.contains("dragon / ground"))
        assertTrue(md.contains("#0445"))
        assertTrue(md.contains("## Answer"))
        assertTrue(md.contains("base Speed is **102**"))
        assertTrue(md.contains("## Reasoning"))
        assertTrue(md.contains("Looked up base stats"))
        assertTrue(md.contains("## Sources"))
        assertTrue(md.contains("pokemon:garchomp"))
        assertTrue(md.contains("## Inferences"))
        assertTrue(md.contains("(high)"))
        assertTrue(md.contains("## Uncertainty"))
        assertTrue(md.contains("EV investment not specified"))
        assertTrue(md.contains("## Suggestions"))
    }

    @Test
    fun `omits empty optional sections`() {
        val md = oakAnswerAgentMarkdown(
            OakAnswer(
                status = OakAnswer.Status.Answered,
                answerMarkdown = "Plain answer.",
                reasoningMarkdown = "",
                citations = emptyList(),
                inferences = emptyList(),
                generationBasis = GenerationBasis(generation = "Champions", fallback = true, note = "pre-release"),
            ),
        )
        assertTrue(md.contains("**Fallback:** true"))
        assertTrue(md.contains("**Basis note:** pre-release"))
        assertFalse(md.contains("## Reasoning"))
        assertFalse(md.contains("## Sources"))
        assertFalse(md.contains("## Subjects"))
        assertFalse(md.contains("## Inferences"))
        assertTrue(md.contains("Plain answer."))
    }

    @Test
    fun `strips citation span comments from the answer body`() {
        val md = oakAnswerAgentMarkdown(
            baseAnswer(markdown = "<!-- span:c0 -->Garchomp is a Dragon/Ground pseudo-legendary.<!-- /span:c0 -->"),
        )
        assertTrue(md.contains("Garchomp is a Dragon/Ground pseudo-legendary."))
        assertFalse(md.contains("<!--"))
        assertFalse(md.contains("span:c0"))
    }
}
