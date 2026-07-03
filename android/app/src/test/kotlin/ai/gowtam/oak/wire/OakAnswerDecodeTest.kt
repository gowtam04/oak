package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Decode coverage for every [OakAnswer] status, incl. every optional field present. */
class OakAnswerDecodeTest {

    @Test
    fun answeredFullDecodesEveryOptionalField() {
        val answer = OakJson.decodeFromString<OakAnswer>(Fixtures.string("oakanswer_answered_full.json"))

        assertEquals(OakAnswer.Status.ANSWERED, answer.status)
        assertTrue(answer.answerMarkdown.contains("Garchomp"))
        assertEquals(2, answer.citations.size)
        assertEquals("https://pokeapi.co/api/v2/pokemon/garchomp", answer.citations[0].endpointUrl)
        assertNull(answer.citations[1].endpointUrl)
        assertEquals(2, answer.inferences.size)
        assertEquals(Inference.Confidence.HIGH, answer.inferences[0].confidence)
        assertEquals("Standard mode, current Scarlet/Violet index.", answer.generationBasis.note)

        val subjects = requireNotNull(answer.subjects)
        assertEquals("Garchomp", subjects[0].name)
        assertEquals(445, subjects[0].dexNumber)
        assertEquals("Gen 9 (Scarlet/Violet)", subjects[0].sourceGeneration)

        val candidates = requireNotNull(answer.candidates)
        assertEquals(2, candidates.totalCount)
        assertEquals("speed desc", candidates.sort)
        val dragapult = candidates.shown[0]
        val baseStats = requireNotNull(dragapult.baseStats)
        assertEquals(142, baseStats.spe)
        assertEquals(88, baseStats.hp)
        val keyStats = requireNotNull(dragapult.keyStats)
        assertEquals(JsonScalar.IntVal(142), keyStats["speed"])
        assertEquals(JsonScalar.BoolVal(true), keyStats["fully_invested"])
        assertEquals(JsonScalar.DoubleVal(9.5), keyStats["speed_tier"])
        assertEquals(JsonScalar.Null, keyStats["notes"])
        assertEquals(JsonScalar.Str("fast attacker"), keyStats["role"])
        // Second candidate has no sprite_url / base_stats — both must decode as null, not throw.
        assertNull(candidates.shown[1].spriteUrl)
        assertNull(candidates.shown[1].baseStats)

        val damageCalc = requireNotNull(answer.damageCalc)
        assertTrue(damageCalc.isEstimate)
        assertEquals(JsonScalar.IntVal(142), damageCalc.result["min_damage"])
        assertEquals(JsonScalar.BoolVal(false), damageCalc.result["guaranteed_ko"])
        assertEquals(JsonScalar.DoubleVal(1.3), damageCalc.assumptions["other_modifier"])
        assertEquals(JsonScalar.IntVal(50), damageCalc.assumptions["level"])

        assertEquals(2, answer.suggestions?.size)
        assertEquals(2, answer.question?.options?.size)
        assertEquals(1, answer.uncertaintyFlags?.size)

        val proposedTeam = requireNotNull(answer.proposedTeam)
        assertEquals(Format.ScarletViolet, proposedTeam.format)
        assertEquals(2, proposedTeam.members.size)
        assertEquals("garchomp", proposedTeam.members[0].species)
        assertEquals("steel", proposedTeam.members[0].teraType)
        assertNull(proposedTeam.members[1].item)
        assertNull(proposedTeam.members[1].nature)

        val savedTeam = requireNotNull(answer.savedTeam)
        assertEquals("team_abc123", savedTeam.id)
        assertEquals(Format.ScarletViolet, savedTeam.format)

        val warnings = requireNotNull(answer.proposedTeamWarnings)
        assertEquals(2, warnings.size)
        assertEquals(TeamWarning.Code.Incomplete, warnings[0].code)
        assertEquals(TeamWarning.Code.AbilityNotForSpecies, warnings[1].code)
        assertEquals(1, warnings[1].slot)
        assertEquals("ability", warnings[1].field)
    }

    @Test
    fun clarificationNeededDecodesQuestionOnly() {
        val answer = OakJson.decodeFromString<OakAnswer>(Fixtures.string("oakanswer_clarification.json"))
        assertEquals(OakAnswer.Status.CLARIFICATION_NEEDED, answer.status)
        assertTrue(answer.citations.isEmpty())
        assertNull(answer.subjects)
        assertNull(answer.candidates)
        val options = requireNotNull(answer.question).options
        assertEquals(3, options.size)
        assertEquals("Either is fine", options[2].label)
        assertNull(options[2].description)
    }

    @Test
    fun resolutionFailedDecodesSuggestions() {
        val answer = OakJson.decodeFromString<OakAnswer>(Fixtures.string("oakanswer_resolution_failed.json"))
        assertEquals(OakAnswer.Status.RESOLUTION_FAILED, answer.status)
        assertEquals(listOf("Garchomp", "Gabite", "Gible"), answer.suggestions)
        assertNull(answer.question)
    }

    @Test
    fun insufficientDataDecodesFallbackBasisAndUncertainty() {
        val answer = OakJson.decodeFromString<OakAnswer>(Fixtures.string("oakanswer_insufficient_data.json"))
        assertEquals(OakAnswer.Status.INSUFFICIENT_DATA, answer.status)
        assertTrue(answer.generationBasis.fallback)
        assertEquals(1, answer.citations.size)
        assertEquals(1, answer.uncertaintyFlags?.size)
    }
}
