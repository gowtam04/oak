package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.chat.answercard.oakAnswerAgentMarkdown
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.Candidates
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.Inference
import ai.gowtam.oak.wire.JsonScalar
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 7/10 lockstep oracle — human-readable copy projection.
 *
 * Clones `web/src/lib/oak-answer-human-md.test.ts` fixtures and the same
 * inclusions/exclusions. Do not drift the BASE shape or the required/forbidden
 * strings without updating web + iOS too.
 *
 * Expected production API (`features/chat/HumanMarkdown.kt`):
 *   `fun oakAnswerHumanMarkdown(answer: OakAnswer): String`
 *
 * Requirement refs: COPY-US-1, COPY-AC-1.1, COPY-AC-1.2, COPY-AC-1.3,
 * COPY-BR-1, COPY-BR-2. ADR-9.
 *
 * Lockstep with web `oak-answer-human-md.ts` / iOS `OakAnswerHumanMarkdown`
 * / Android `HumanMarkdown`.
 */
class HumanMarkdownTest {

    /** Shared with the web BASE so both projections start from one shape. */
    private val base = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = "Garchomp is a Dragon/Ground pseudo-legendary.",
        reasoningMarkdown = "Looked up Garchomp base stats and typing.",
        citations = listOf(
            Citation(
                source = "pokemon/garchomp",
                detail = "base speed: 102",
                endpointUrl = "https://example.test/garchomp",
            ),
        ),
        inferences = listOf(
            Inference(
                claim = "Outspeeds most Ground threats.",
                confidence = Inference.Confidence.High,
                note = "Base 102 Speed.",
            ),
        ),
        generationBasis = GenerationBasis(generation = "gen-9", fallback = false),
        subjects = listOf(
            Subject(
                name = "Garchomp",
                dexNumber = 445,
                spriteUrl = "https://example.test/garchomp.png",
                types = listOf("dragon", "ground"),
                isFallback = false,
            ),
        ),
        uncertaintyFlags = listOf("Competitive usage may shift monthly."),
    )

    private val garchompSet = TeamMember(
        species = "garchomp",
        ability = "rough-skin",
        item = "life-orb",
        moves = listOf("earthquake", "dragon-claw", "stone-edge", "swords-dance"),
        nature = "jolly",
        evs = StatSpread(hp = 0, atk = 252, def = 0, spa = 0, spd = 4, spe = 252),
        ivs = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
        teraType = "ground",
        level = 50,
    )

    private val dragoniteSet = TeamMember(
        species = "dragonite",
        ability = "multiscale",
        item = null,
        moves = listOf("extreme-speed", "earthquake"),
        nature = "adamant",
        evs = StatSpread(hp = 248, atk = 252, def = 0, spa = 0, spd = 8, spe = 0),
        ivs = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
        teraType = "normal",
        level = 50,
    )

    /** Full lockstep card: prose + candidate fact table + caveats + proposed team. */
    private val full = base.copy(
        candidates = Candidates(
            totalCount = 2,
            truncated = false,
            sort = "speed desc",
            shown = listOf(
                CandidateRow(
                    name = "Garchomp",
                    dexNumber = 445,
                    types = listOf("dragon", "ground"),
                    baseStats = BaseStats(
                        hp = 108,
                        atk = 130,
                        def = 95,
                        spa = 80,
                        spd = 85,
                        spe = 102,
                    ),
                ),
                CandidateRow(
                    name = "Dragonite",
                    dexNumber = 149,
                    types = listOf("dragon", "flying"),
                    baseStats = BaseStats(
                        hp = 91,
                        atk = 134,
                        def = 95,
                        spa = 100,
                        spd = 100,
                        spe = 80,
                    ),
                ),
            ),
        ),
        proposedTeam = ProposedTeam(
            name = "Rain Offense",
            format = Format.ScarletViolet,
            members = listOf(garchompSet, dragoniteSet),
        ),
    )

    @Test
    fun `includes the user-facing prose (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(base)
        assertTrue(md.contains("Garchomp is a Dragon/Ground pseudo-legendary."))
    }

    @Test
    fun `includes a readable fact table from candidates (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(full)
        assertTrue(md.contains("|"))
        assertTrue(md.contains("Garchomp"))
        assertTrue(md.contains("Dragonite"))
        assertTrue(md.contains("108"))
        assertTrue(md.contains("130"))
        assertTrue(md.contains("102"))
        assertTrue(md.contains("91"))
        assertTrue(md.contains("134"))
        assertTrue(md.contains("80"))
    }

    @Test
    fun `renders key_stats when a candidate has no base_stats (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(
            base.copy(
                candidates = Candidates(
                    totalCount = 1,
                    truncated = false,
                    sort = null,
                    shown = listOf(
                        CandidateRow(
                            name = "Garchomp",
                            dexNumber = 445,
                            types = listOf("dragon", "ground"),
                            keyStats = mapOf(
                                "speed" to JsonScalar.IntVal(102),
                                "attack" to JsonScalar.IntVal(130),
                            ),
                        ),
                    ),
                ),
            ),
        )
        assertTrue(md.contains("|"))
        assertTrue(md.contains("Garchomp"))
        assertTrue(md.contains("102"))
        assertTrue(md.contains("130"))
    }

    @Test
    fun `emits a Name+Types fact table when shown rows have no stats (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(
            base.copy(
                candidates = Candidates(
                    totalCount = 2,
                    truncated = false,
                    sort = null,
                    shown = listOf(
                        CandidateRow(name = "Garchomp", types = listOf("dragon", "ground")),
                        CandidateRow(name = "Dragonite", types = listOf("dragon", "flying")),
                    ),
                ),
            ),
        )
        assertTrue(md.contains("|"))
        assertTrue(md.contains("Garchomp"))
        assertTrue(md.contains("Dragonite"))
    }

    @Test
    fun `omits a fact table when there is no candidates_shown (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(
            base.copy(answerMarkdown = "Yes, Garchomp can learn Earthquake."),
        )
        assertTrue(md.contains("Yes, Garchomp can learn Earthquake."))
        assertFalse(Regex("^\\s*\\|", RegexOption.MULTILINE).containsMatchIn(md))
    }

    @Test
    fun `includes user-facing uncertainty caveats (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(full)
        assertTrue(md.contains("Competitive usage may shift monthly."))
    }

    @Test
    fun `maps internal uncertainty codes to user-facing labels (COPY-AC-1_1 _ COPY-AC-1_2)`() {
        val md = oakAnswerHumanMarkdown(
            base.copy(uncertaintyFlags = listOf("max_iterations_reached")),
        )
        assertTrue(md.contains("Couldn't complete this answer"))
        assertFalse(md.contains("max_iterations_reached"))
    }

    @Test
    fun `includes the generation-fallback note when fallback is true (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(
            base.copy(
                generationBasis = GenerationBasis(
                    generation = "gen-8",
                    fallback = true,
                    note = "Not in Scarlet/Violet roster.",
                ),
            ),
        )
        assertTrue(md.contains("Not in Scarlet/Violet roster."))
        assertFalse(md.contains("generation_basis"))
    }

    @Test
    fun `includes the default generation-fallback sentence when note is absent (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(
            base.copy(
                generationBasis = GenerationBasis(
                    generation = "gen-8",
                    fallback = true,
                ),
            ),
        )
        assertTrue(md.contains("Based on gen-8 data — this Pokémon is not in Gen 9."))
        assertFalse(md.contains("generation_basis"))
    }

    @Test
    fun `includes a Showdown paste when proposed_team is present (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(full)
        val ignoreCase = RegexOption.IGNORE_CASE
        assertTrue(Regex("garchomp", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("life-orb|Life Orb", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("rough-skin|Rough Skin", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("earthquake", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("dragon-claw|Dragon Claw", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("stone-edge|Stone Edge", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("swords-dance|Swords Dance", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("jolly", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("Level:\\s*50").containsMatchIn(md))
        assertTrue(md.contains("252"))
        assertTrue(Regex("dragonite", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("multiscale|Multiscale", ignoreCase).containsMatchIn(md))
        assertTrue(Regex("extreme-speed|Extreme Speed", ignoreCase).containsMatchIn(md))
        assertTrue(md.contains("Rain Offense"))
    }

    @Test
    fun `omits a Showdown paste when there is no proposed_team (COPY-AC-1_1)`() {
        val md = oakAnswerHumanMarkdown(base)
        assertFalse(Regex("Ability:").containsMatchIn(md))
        assertFalse(Regex("Level:\\s*\\d+").containsMatchIn(md))
        assertFalse(Regex("@\\s*life-orb", RegexOption.IGNORE_CASE).containsMatchIn(md))
    }

    @Test
    fun `does not dump citation schema, endpoints, or agent headings (COPY-AC-1_2)`() {
        val md = oakAnswerHumanMarkdown(full)
        assertFalse(md.contains("# Oak answer"))
        assertFalse(md.contains("## Citations"))
        assertFalse(md.contains("## Reasoning"))
        assertFalse(md.contains("## Subjects"))
        assertFalse(md.contains("## Inferences"))
        assertFalse(md.contains("## Uncertainty flags"))
        assertFalse(md.contains("**Status:**"))
        assertFalse(md.contains("`pokemon/garchomp`"))
        assertFalse(md.contains("pokemon/garchomp"))
        assertFalse(md.contains("https://example.test/garchomp"))
        assertFalse(md.contains("endpoint_url"))
        assertFalse(md.contains("reasoning_markdown"))
        assertFalse(md.contains("generation_basis"))
        assertFalse(md.contains("tool_activity"))
        assertFalse(md.contains("tool-activity"))
    }

    @Test
    fun `does not include the internal reasoning dump (COPY-AC-1_2)`() {
        val md = oakAnswerHumanMarkdown(full)
        assertFalse(md.contains("Looked up Garchomp base stats and typing."))
    }

    @Test
    fun `stays distinct from Copy-for-agents (COPY-AC-1_3 _ COPY-BR-2)`() {
        val human = oakAnswerHumanMarkdown(full)
        val agent = oakAnswerAgentMarkdown(full)
        assertNotEquals(agent, human)
        assertTrue(agent.contains("# Oak answer"))
        // Android agent export titles the citation block "## Sources"; the web
        // lockstep still forbids "## Citations" on the human side.
        assertTrue(agent.contains("## Sources") || agent.contains("## Citations"))
        assertTrue(agent.contains("pokemon/garchomp"))
        assertTrue(agent.contains("## Reasoning"))
        assertFalse(human.contains("# Oak answer"))
        assertFalse(human.contains("## Citations"))
    }

    @Test
    fun `is a pure projection of the given answer (COPY-BR-1)`() {
        val snapshot = full.copy()
        val md = oakAnswerHumanMarkdown(full)
        assertEquals(snapshot, full)
        assertTrue(md.isNotEmpty())
    }
}
