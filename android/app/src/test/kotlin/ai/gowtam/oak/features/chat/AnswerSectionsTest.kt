package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.chat.answercard.AnswerSection
import ai.gowtam.oak.features.chat.answercard.answerSections
import ai.gowtam.oak.features.chat.answercard.inferenceReason
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.Inference
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.Subject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Signal answer-plate section order (no scope tag on the plate). */
class AnswerSectionsTest {

    @Test
    fun `minimal answered card is just the body`() {
        val answer = OakAnswer(
            status = OakAnswer.Status.Answered,
            answerMarkdown = "A short answer.",
            reasoningMarkdown = "",
            citations = emptyList(),
            inferences = emptyList(),
            generationBasis = GenerationBasis(generation = "champions", fallback = false),
        )
        assertEquals(listOf(AnswerSection.ANSWER), answerSections(answer))
    }

    @Test
    fun `inferences sit under the lead, scope is off the plate`() {
        val answer = OakAnswer(
            status = OakAnswer.Status.Answered,
            answerMarkdown = "Fake Out fails on Farigiraf.",
            reasoningMarkdown = "Armor Tail blocks priority.",
            citations = listOf(Citation(source = "ability:armor-tail", detail = "effect")),
            inferences = listOf(
                Inference(
                    claim = "Armor Tail stops Fake Out",
                    confidence = Inference.Confidence.High,
                    note = "from the ability text",
                ),
            ),
            generationBasis = GenerationBasis(generation = "scarlet-violet", fallback = false),
            subjects = listOf(
                Subject(
                    name = "Farigiraf",
                    dexNumber = 981,
                    spriteUrl = "https://example/f.png",
                    types = listOf("normal", "psychic"),
                    isFallback = false,
                ),
            ),
        )
        assertEquals(
            listOf(
                AnswerSection.ANSWER,
                AnswerSection.INFERENCES,
                AnswerSection.SUBJECTS,
                AnswerSection.REASONING,
                AnswerSection.CITATIONS,
            ),
            answerSections(answer),
        )
        assertFalse(answerSections(answer).contains(AnswerSection.SCOPE))
    }

    @Test
    fun `inferenceReason strips a leading from`() {
        val inference = Inference(
            claim = "It is a deduction",
            confidence = Inference.Confidence.Medium,
            note = "from the ability text",
        )
        assertEquals("the ability text", inferenceReason(inference))
    }
}
