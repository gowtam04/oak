package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.chat.answercard.AnswerSection
import ai.gowtam.oak.features.chat.answercard.CandidateTableQuery
import ai.gowtam.oak.features.chat.answercard.answerSections
import ai.gowtam.oak.features.chat.answercard.citationHighlight
import ai.gowtam.oak.features.chat.answercard.inferenceReason
import ai.gowtam.oak.features.chat.answercard.shownCandidateRows
import ai.gowtam.oak.features.chat.proposedTeamToShowdownPaste
import ai.gowtam.oak.wire.AnswerDensity
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.Candidates
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.CitationAnchor
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.Inference
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    // -------------------------------------------------------------------
    // COMPACT-US-1 / COMPACT-BR-1 — compact hides reasoning + sources only
    //
    // Fails to compile until `answerSections(answer, density = Full)` grows
    // an [AnswerDensity] argument (default Full so existing callers stay).
    // -------------------------------------------------------------------

    private fun richAnswer() = OakAnswer(
        status = OakAnswer.Status.Answered,
        answerMarkdown = "Garchomp outspeeds most Ground threats.",
        reasoningMarkdown = "Looked up Garchomp base stats and typing.",
        citations = listOf(Citation(source = "pokemon/garchomp", detail = "base speed 102")),
        inferences = listOf(
            Inference(claim = "Outspeeds most Ground threats.", confidence = Inference.Confidence.High),
        ),
        generationBasis = GenerationBasis(generation = "scarlet-violet", fallback = false),
        subjects = listOf(
            Subject(
                name = "Garchomp",
                dexNumber = 445,
                spriteUrl = "https://example/g.png",
                types = listOf("dragon", "ground"),
                isFallback = false,
            ),
        ),
        candidates = Candidates(
            totalCount = 4,
            truncated = true,
            shown = listOf(
                CandidateRow(name = "Garchomp", types = listOf("dragon", "ground"), baseStats = BaseStats(108, 130, 95, 80, 85, 102)),
                CandidateRow(name = "Dragonite", types = listOf("dragon", "flying"), baseStats = BaseStats(91, 134, 95, 100, 100, 80)),
                CandidateRow(name = "Excadrill", types = listOf("ground", "steel"), baseStats = BaseStats(110, 135, 60, 50, 65, 88)),
            ),
        ),
        damageCalc = DamageCalc(assumptions = emptyMap(), result = emptyMap(), isEstimate = true),
        proposedTeam = ProposedTeam(
            name = "Rain Offense",
            format = Format.ScarletViolet,
            members = listOf(
                TeamMember(
                    species = "garchomp",
                    ability = "rough-skin",
                    item = "life-orb",
                    moves = listOf("earthquake", "dragon-claw", "stone-edge", "swords-dance"),
                    nature = "jolly",
                    evs = StatSpread(0, 252, 0, 0, 4, 252),
                    ivs = StatSpread(31, 31, 31, 31, 31, 31),
                    teraType = "ground",
                    level = 50,
                ),
            ),
        ),
        uncertaintyFlags = listOf("Competitive usage may shift monthly."),
    )

    @Test
    fun compactHidesReasoningAndSourcesOnly() {
        val sections = answerSections(richAnswer(), AnswerDensity.Compact)
        assertFalse(sections.contains(AnswerSection.REASONING))
        assertFalse(sections.contains(AnswerSection.CITATIONS))
        assertTrue(sections.contains(AnswerSection.ANSWER))
        assertTrue(sections.contains(AnswerSection.CAVEAT))
        assertTrue(sections.contains(AnswerSection.INFERENCES))
        assertTrue(sections.contains(AnswerSection.SUBJECTS))
        assertTrue(sections.contains(AnswerSection.CANDIDATES))
        assertTrue(sections.contains(AnswerSection.DAMAGE))
        assertTrue(sections.contains(AnswerSection.TEAMS))
    }

    @Test
    fun fullModeStillListsReasoningAndSources() {
        val sections = answerSections(richAnswer(), AnswerDensity.Full)
        assertTrue(sections.contains(AnswerSection.REASONING))
        assertTrue(sections.contains(AnswerSection.CITATIONS))
        assertTrue(sections.contains(AnswerSection.ANSWER))
        assertTrue(sections.contains(AnswerSection.CANDIDATES))
    }

    @Test
    fun compactOnASpokenOnlyVoiceCardKeepsTheSpokenText() {
        val spoken = OakAnswer(
            status = OakAnswer.Status.Answered,
            answerMarkdown = "Garchomp is a Dragon/Ground type.",
            reasoningMarkdown = "",
            citations = emptyList(),
            inferences = emptyList(),
            generationBasis = GenerationBasis(generation = "champions", fallback = false),
            origin = "voice",
        )
        val sections = answerSections(spoken, AnswerDensity.Compact)
        assertEquals(listOf(AnswerSection.ANSWER), sections)
        assertFalse(sections.contains(AnswerSection.REASONING))
        assertFalse(sections.contains(AnswerSection.CITATIONS))
    }

    // -------------------------------------------------------------------
    // PASTE-US-1 / PASTE-BR-1 / PASTE-BR-2 — Showdown paste
    // -------------------------------------------------------------------

    @Test
    fun proposedTeamShowdownPasteMatchesTheEditorDialect() {
        val team = richAnswer().proposedTeam!!
        val paste = proposedTeamToShowdownPaste(team)
        assertTrue(paste.contains("Garchomp") || paste.contains("garchomp"))
        assertTrue(paste.contains("Life Orb") || paste.contains("life-orb"))
        assertTrue(paste.contains("Rough Skin") || paste.contains("rough-skin"))
        assertTrue(paste.contains("Earthquake") || paste.contains("earthquake"))
        assertTrue(paste.contains("Jolly") || paste.contains("jolly"))
        assertTrue(paste.contains("Level: 50"))
        assertTrue(paste.contains("252"))
        assertFalse(paste.contains("Rain Offense")) // paste is the roster, not the team name
    }

    @Test
    fun showdownPasteIsEmptyWhenNoMembersHaveASpecies() {
        val team = ProposedTeam(name = "Empty", format = Format.Champions, members = emptyList())
        assertEquals("", proposedTeamToShowdownPaste(team))
    }

    // -------------------------------------------------------------------
    // TBL-US-1–3 / TBL-BR-1 — shown-set sort / filter / pin-in-table
    //
    // Fails to compile until:
    //   shownCandidateRows(candidates, CandidateTableQuery): List<CandidateRow>
    // Hidden remainder is never fetched. N of M stays the unfiltered shown size.
    // -------------------------------------------------------------------

    @Test
    fun typeFilterKeepsOnlyShownRowsOfThatType() {
        val visible = shownCandidateRows(
            richAnswer().candidates!!,
            CandidateTableQuery(typeFilter = "dragon"),
        )
        assertEquals(listOf("Garchomp", "Dragonite"), visible.map { it.name })
        assertFalse(visible.any { it.name == "Excadrill" })
        assertEquals(3, richAnswer().candidates!!.shown.size) // N unchanged
        assertEquals(4, richAnswer().candidates!!.totalCount) // M unchanged
    }

    @Test
    fun nameSearchAndTypeFilterComposeAsAnd() {
        val visible = shownCandidateRows(
            richAnswer().candidates!!,
            CandidateTableQuery(typeFilter = "dragon", nameQuery = "nite"),
        )
        assertEquals(listOf("Dragonite"), visible.map { it.name })
    }

    @Test
    fun clearingFiltersRestoresTheFullShownSet() {
        val candidates = richAnswer().candidates!!
        val filtered = shownCandidateRows(candidates, CandidateTableQuery(typeFilter = "steel"))
        assertEquals(listOf("Excadrill"), filtered.map { it.name })
        val restored = shownCandidateRows(candidates, CandidateTableQuery())
        assertEquals(candidates.shown.map { it.name }, restored.map { it.name })
    }

    @Test
    fun anInTablePinStaysVisibleWhenItFailsTheFilter() {
        val visible = shownCandidateRows(
            richAnswer().candidates!!,
            CandidateTableQuery(typeFilter = "steel", pinnedNames = setOf("Garchomp")),
        )
        assertEquals("Garchomp", visible.first().name)
        assertEquals(listOf("Garchomp", "Excadrill"), visible.map { it.name })
    }

    @Test
    fun sortReordersOnlyTheShownRows() {
        val visible = shownCandidateRows(
            richAnswer().candidates!!,
            CandidateTableQuery(sortColumn = "spe", sortAscending = false),
        )
        assertEquals(listOf("Garchomp", "Excadrill", "Dragonite"), visible.map { it.name })
        assertEquals(3, visible.size)
        assertEquals(4, richAnswer().candidates!!.totalCount)
    }

    // -------------------------------------------------------------------
    // CIT-US-1 / CIT-BR-1 / CIT-BR-2 — highlight only when linked
    // -------------------------------------------------------------------

    @Test
    fun aLinkedCitationHighlightsItsAnchor() {
        val linked = Citation(
            source = "pokemon/garchomp",
            detail = "base speed 102",
            anchor = CitationAnchor(target = CitationAnchor.Target.AnswerSpan, id = "span-speed"),
        )
        assertEquals(
            CitationAnchor(target = CitationAnchor.Target.AnswerSpan, id = "span-speed"),
            citationHighlight(linked),
        )
    }

    @Test
    fun anUnlinkedCitationDoesNotInventAHighlight() {
        val old = Citation(source = "pokemon/garchomp", detail = "base speed 102")
        assertNull(citationHighlight(old))
        assertNull(old.anchor)
    }
}
