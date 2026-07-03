package ai.gowtam.oak.chat

import ai.gowtam.oak.features.chat.answercard.AnswerCard
import ai.gowtam.oak.features.chat.answercard.AnswerSection
import ai.gowtam.oak.features.chat.answercard.answerSections
import ai.gowtam.oak.ui.OakTheme
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.Candidates
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.ClarifyOption
import ai.gowtam.oak.wire.ClarifyQuestion
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.Inference
import ai.gowtam.oak.wire.JsonScalar
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * Renders [AnswerCard] against fixture [OakAnswer]s for all four statuses
 * (implementation-plan.md P6 acceptance check 5; mirrors iOS
 * `AnswerCardViewTests`). **Not run in this phase** (no emulator/AVD wired up yet,
 * per implementation-plan.md CP-A) — kept here so it compiles as part of the
 * androidTest source-set validation; CP-A is the first phase that actually executes
 * it on a booted AVD.
 *
 * Verifies the render-if-present rule (a fixture with every optional field present
 * shows every one of the 13 sections, in the exact reading order from
 * component-design.md "AnswerCard render order") and that a bare, minimal answer of
 * each status renders without crashing.
 */
class AnswerCardRenderTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun aFullyPopulatedAnsweredCardRendersEverySectionInTheDocumentedOrder() {
        val answer = fullyPopulatedAnswer()

        composeTestRule.setContent {
            OakTheme { AnswerCard(answer = answer) }
        }

        // The pure ordering function is the single source of truth for what the body
        // renders — recompute the expected order from it rather than hard-coding a
        // second copy that could drift.
        val expectedOrder = answerSections(answer).map { it.testTag }
        assertEquals(EXPECTED_FULL_ORDER, expectedOrder)

        val sectionMatcher = SemanticsMatcher("has a section:* testTag") { node ->
            node.testTagOrNull()?.startsWith("section:") == true
        }
        val renderedTags = composeTestRule.onAllNodes(sectionMatcher, useUnmergedTree = true)
            .fetchSemanticsNodes()
            .sortedBy { it.boundsInRoot.top }
            .mapNotNull { it.testTagOrNull() }

        assertEquals(expectedOrder, renderedTags)
    }

    @Test
    fun aMinimalAnsweredCardOmitsEveryOptionalSectionButTheAnswerBody() {
        val answer = minimalAnswer(OakAnswer.Status.ANSWERED)

        composeTestRule.setContent {
            OakTheme { AnswerCard(answer = answer) }
        }

        composeTestRule.onNodeWithTag("section:answer").assertIsDisplayed()
        composeTestRule.onNodeWithTag("section:status").assertDoesNotExist()
        assertEquals(listOf(AnswerSection.ANSWER), answerSections(answer))
    }

    @Test
    fun aClarificationNeededAnswerRendersTheStatusBadgeAndTheQuestion() {
        val answer = minimalAnswer(OakAnswer.Status.CLARIFICATION_NEEDED).copy(
            question = ClarifyQuestion(
                options = listOf(
                    ClarifyOption(label = "Mega Charizard X", description = "Fire/Dragon"),
                    ClarifyOption(label = "Mega Charizard Y", description = "Fire/Flying"),
                ),
            ),
        )

        composeTestRule.setContent {
            OakTheme { AnswerCard(answer = answer) }
        }

        composeTestRule.onNodeWithTag("section:status").assertIsDisplayed()
        composeTestRule.onNodeWithTag("section:question").assertIsDisplayed()
    }

    @Test
    fun aResolutionFailedAnswerRendersTheStatusBadgeAndSuggestions() {
        val answer = minimalAnswer(OakAnswer.Status.RESOLUTION_FAILED).copy(
            suggestions = listOf("Charizard", "Charmeleon"),
        )

        composeTestRule.setContent {
            OakTheme { AnswerCard(answer = answer) }
        }

        composeTestRule.onNodeWithTag("section:status").assertIsDisplayed()
        composeTestRule.onNodeWithTag("section:suggestions").assertIsDisplayed()
    }

    @Test
    fun anInsufficientDataAnswerRendersTheStatusBadgeAndTheCaveatStrip() {
        val answer = minimalAnswer(OakAnswer.Status.INSUFFICIENT_DATA).copy(
            uncertaintyFlags = listOf("max_iterations_reached"),
        )

        composeTestRule.setContent {
            OakTheme { AnswerCard(answer = answer) }
        }

        composeTestRule.onNodeWithTag("section:status").assertIsDisplayed()
        composeTestRule.onNodeWithTag("section:caveat").assertIsDisplayed()
    }

    // -------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------

    private fun minimalAnswer(status: OakAnswer.Status) = OakAnswer(
        status = status,
        answerMarkdown = "A short answer.",
        reasoningMarkdown = "",
        citations = emptyList(),
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "champions", fallback = false),
    )

    private fun fullyPopulatedAnswer(): OakAnswer = OakAnswer(
        status = OakAnswer.Status.CLARIFICATION_NEEDED, // non-answered => the status badge renders too
        answerMarkdown = "Which Charizard did you mean?",
        reasoningMarkdown = "Charizard has two Mega forms with different types and roles.",
        citations = listOf(
            Citation(source = "PokéAPI", detail = "Species + Mega form data", endpointUrl = "https://pokeapi.co/api/v2/pokemon/6"),
        ),
        inferences = listOf(
            Inference(claim = "Mega Charizard Y is the stronger special attacker of the two.", confidence = Inference.Confidence.MEDIUM, note = "Based on base stats alone."),
        ),
        generationBasis = GenerationBasis(generation = "champions", fallback = true, note = "Falling back to Gen 9 data."),
        subjects = listOf(
            Subject(name = "Charizard", dexNumber = 6, spriteUrl = "https://example.com/charizard.png", types = listOf("fire", "flying"), isFallback = false, sourceGeneration = null),
            Subject(name = "Mega Charizard X", dexNumber = 6, spriteUrl = "https://example.com/charizard-mx.png", types = listOf("fire", "dragon"), isFallback = false, sourceGeneration = null),
        ),
        candidates = Candidates(
            totalCount = 2,
            truncated = false,
            sort = "speed desc",
            shown = listOf(
                CandidateRow(
                    name = "Mega Charizard X",
                    dexNumber = 6,
                    spriteUrl = "https://example.com/charizard-mx.png",
                    types = listOf("fire", "dragon"),
                    baseStats = BaseStats(hp = 78, atk = 130, def = 111, spa = 130, spd = 85, spe = 100),
                    keyStats = null,
                    ability = "Tough Claws",
                ),
                CandidateRow(
                    name = "Mega Charizard Y",
                    dexNumber = 6,
                    spriteUrl = "https://example.com/charizard-my.png",
                    types = listOf("fire", "flying"),
                    baseStats = BaseStats(hp = 78, atk = 104, def = 78, spa = 159, spd = 115, spe = 100),
                    keyStats = null,
                    ability = "Drought",
                ),
            ),
        ),
        damageCalc = DamageCalc(
            assumptions = mapOf("attacker" to JsonScalar.Str("Mega Charizard Y"), "defender" to JsonScalar.Str("Garchomp")),
            result = mapOf("min_percent" to JsonScalar.IntVal(45), "max_percent" to JsonScalar.IntVal(53)),
            isEstimate = true,
            breakdown = "159 SpA vs 115 SpD, neutral matchup.",
        ),
        suggestions = listOf("Show me Mega Charizard X instead", "Compare both Megas"),
        question = ClarifyQuestion(
            options = listOf(
                ClarifyOption(label = "Mega Charizard X", description = "Fire/Dragon, physical attacker"),
                ClarifyOption(label = "Mega Charizard Y", description = "Fire/Flying, special attacker"),
            ),
        ),
        uncertaintyFlags = listOf("recovered_prose_no_submit_answer"),
        proposedTeam = ProposedTeam(
            name = "Sun Team",
            format = Format.Champions,
            members = listOf(
                TeamMember(
                    species = "charizard",
                    ability = "drought",
                    item = "charizardite-y",
                    moves = listOf("flamethrower", "solar-beam", "roost", "focus-blast"),
                    nature = "timid",
                    evs = StatSpread(hp = 0, atk = 0, def = 0, spa = 252, spd = 4, spe = 252),
                    ivs = StatSpread(hp = 31, atk = 0, def = 31, spa = 31, spd = 31, spe = 31),
                    teraType = "fire",
                    level = 100,
                ),
            ),
        ),
        savedTeam = SavedTeamRef(id = "team-1", name = "Sun Team", format = Format.Champions),
        proposedTeamWarnings = listOf(
            TeamWarning(code = TeamWarning.Code.Incomplete, message = "This team only has 1 of 6 members."),
        ),
    )

    /** The node's `testTag`, or `null` if it carries none — avoids depending on the
     * exact package a `getOrNull(SemanticsPropertyKey)` extension ships from across
     * compose-ui versions. */
    private fun SemanticsNode.testTagOrNull(): String? =
        config.firstOrNull { it.key == SemanticsProperties.TestTag }?.value as? String

    private companion object {
        /** component-design.md "AnswerCard render order" — the authoritative sequence. */
        val EXPECTED_FULL_ORDER = listOf(
            "section:status",
            "section:scope",
            "section:caveat",
            "section:answer",
            "section:subjects",
            "section:question",
            "section:candidates",
            "section:damage",
            "section:teams",
            "section:suggestions",
            "section:reasoning",
            "section:citations",
            "section:inferences",
        )
    }
}
