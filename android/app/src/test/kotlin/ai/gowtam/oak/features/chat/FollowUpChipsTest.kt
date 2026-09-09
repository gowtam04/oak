package ai.gowtam.oak.features.chat

import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.Candidates
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.GenerationBasis
import ai.gowtam.oak.wire.JsonScalar
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 7/10 lockstep oracle — follow-up chips derived from OakAnswer + turn context.
 *
 * Clones `web/src/lib/chat/follow-up-chips.test.ts` fixtures and the same
 * kind/label/target/cap assertions.
 *
 * Expected production API (`features/chat/FollowUpChips.kt`):
 *
 *   deriveFollowUpChips(
 *     answer: OakAnswer,
 *     impliedFormat: Format? = null,          // only when a *different* format is implied
 *     mentionedTeam: MentionedTeam? = null,   // signed-in bound / @mentioned team
 *   ): List<FollowUpChip>
 *
 *   data class FollowUpChip(kind: Kind, label: String, target: String)
 *     Kind = Scope | Dex | Team
 *   data class MentionedTeam(id: String, name: String)
 *
 * Labels:
 *   scope → `Switch to ${impliedFormat.rawValue}.`
 *   dex   → `Open ${subject.name} in Dex`
 *   team  → `Open ${teamName}`
 *
 * Caps: ≤1 scope, ≤3 Dex, ≤1 team. No empty-row filler chips.
 * Never calc / compare / add-to-team / "Open this calc" / "tell me more".
 * No new OakAnswer field — chips are a client projection (CHIP-BR-3).
 *
 * Requirement refs: CHIP-US-1, CHIP-AC-1.1..1.5, CHIP-BR-1, CHIP-BR-2,
 * CHIP-BR-3. ADR-9.
 */
class FollowUpChipsTest {

    private val member = TeamMember(
        species = "garchomp",
        ability = "rough-skin",
        item = "life-orb",
        moves = listOf("earthquake"),
        nature = "jolly",
        evs = StatSpread(hp = 0, atk = 252, def = 0, spa = 0, spd = 4, spe = 252),
        ivs = StatSpread(hp = 31, atk = 31, def = 31, spa = 31, spd = 31, spe = 31),
        teraType = "ground",
        level = 50,
    )

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
        inferences = emptyList(),
        generationBasis = GenerationBasis(generation = "champions", fallback = false),
        subjects = listOf(
            Subject(
                name = "Garchomp",
                dexNumber = 445,
                spriteUrl = "https://example.test/garchomp.png",
                types = listOf("dragon", "ground"),
                isFallback = false,
            ),
        ),
    )

    private fun subject(name: String, dex: Int, types: List<String>) = Subject(
        name = name,
        dexNumber = dex,
        spriteUrl = "https://example.test/${name.lowercase()}.png",
        types = types,
        isFallback = false,
    )

    private val forbiddenChip =
        Regex("calc|compare|add .+ to a team|open this calc|tell me more", RegexOption.IGNORE_CASE)

    @Test
    fun `emits no scope chip even when a different format is implied (CF-UI-AC-1_1)`() {
        val chips = deriveFollowUpChips(
            answer = base,
            impliedFormat = Format.ScarletViolet,
        )
        val scope = chips.filter { it.kind == FollowUpChip.Kind.Scope }
        assertEquals(0, scope.size)
        assertTrue(chips.none { it.label.contains("Switch to", ignoreCase = true) })
    }

    @Test
    fun `emits no scope chip when impliedFormat is omitted (CHIP-AC-1_1)`() {
        val chips = deriveFollowUpChips(answer = base)
        assertEquals(0, chips.count { it.kind == FollowUpChip.Kind.Scope })
    }

    @Test
    fun `emits Dex chips for primary subjects, capped at 3 (CHIP-AC-1_2 _ CHIP-BR-2)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(
                subjects = listOf(
                    subject("Garchomp", 445, listOf("dragon", "ground")),
                    subject("Dragonite", 149, listOf("dragon", "flying")),
                    subject("Salamence", 373, listOf("dragon", "flying")),
                    subject("Hydreigon", 635, listOf("dark", "dragon")),
                    subject("Goodra", 706, listOf("dragon")),
                ),
            ),
        )
        val dex = chips.filter { it.kind == FollowUpChip.Kind.Dex }
        assertEquals(3, dex.size)
        assertEquals(
            listOf(
                "Open Garchomp in Dex",
                "Open Dragonite in Dex",
                "Open Salamence in Dex",
            ),
            dex.map { it.label },
        )
        assertEquals(
            listOf("Garchomp", "Dragonite", "Salamence"),
            dex.map { it.target },
        )
        assertFalse(dex.any { it.target == "Hydreigon" })
        assertFalse(dex.any { it.target == "Goodra" })
    }

    @Test
    fun `emits no Dex chips when there are no subjects (CHIP-AC-1_2)`() {
        val chips = deriveFollowUpChips(answer = base.copy(subjects = null))
        assertEquals(0, chips.count { it.kind == FollowUpChip.Kind.Dex })
    }

    @Test
    fun `emits one team chip from mentionedTeam (CHIP-AC-1_3 _ CHIP-BR-2)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(subjects = null),
            mentionedTeam = MentionedTeam(id = "team-rain-1", name = "Rain Offense"),
        )
        val team = chips.filter { it.kind == FollowUpChip.Kind.Team }
        assertEquals(1, team.size)
        assertEquals(
            FollowUpChip(
                kind = FollowUpChip.Kind.Team,
                label = "Open Rain Offense",
                target = "team-rain-1",
            ),
            team.single(),
        )
    }

    @Test
    fun `emits one team chip from saved_team when no mention is bound (CHIP-AC-1_3)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(
                subjects = null,
                savedTeam = SavedTeamRef(
                    id = "team-saved-9",
                    name = "Balance Core",
                    format = Format.ScarletViolet,
                ),
            ),
        )
        val team = chips.filter { it.kind == FollowUpChip.Kind.Team }
        assertEquals(1, team.size)
        assertEquals(
            FollowUpChip(
                kind = FollowUpChip.Kind.Team,
                label = "Open Balance Core",
                target = "team-saved-9",
            ),
            team.single(),
        )
    }

    @Test
    fun `caps team chips at one and prefers mentionedTeam over saved_team (CHIP-BR-2)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(
                subjects = null,
                savedTeam = SavedTeamRef(
                    id = "team-saved-9",
                    name = "Balance Core",
                    format = Format.ScarletViolet,
                ),
            ),
            mentionedTeam = MentionedTeam(id = "team-rain-1", name = "Rain Offense"),
        )
        val team = chips.filter { it.kind == FollowUpChip.Kind.Team }
        assertEquals(1, team.size)
        assertEquals("team-rain-1", team.single().target)
        assertEquals("Open Rain Offense", team.single().label)
    }

    @Test
    fun `does not turn proposed_team into an add-to-team chip (CHIP-AC-1_4 _ CHIP-BR-1)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(
                subjects = null,
                proposedTeam = ProposedTeam(
                    name = "Rain Offense",
                    format = Format.ScarletViolet,
                    members = listOf(member),
                ),
            ),
        )
        assertEquals(0, chips.count { it.kind == FollowUpChip.Kind.Team })
        assertFalse(forbiddenChip.containsMatchIn(chips.joinToString("\n") { it.label }))
    }

    @Test
    fun `never emits calc, compare, add-to-team, or tell-me-more chips (CHIP-AC-1_4 _ CHIP-BR-1)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(
                subjects = listOf(
                    subject("Garchomp", 445, listOf("dragon", "ground")),
                    subject("Dragonite", 149, listOf("dragon", "flying")),
                ),
                candidates = Candidates(
                    totalCount = 2,
                    truncated = false,
                    sort = null,
                    shown = listOf(
                        CandidateRow(name = "Garchomp", types = listOf("dragon", "ground")),
                        CandidateRow(name = "Dragonite", types = listOf("dragon", "flying")),
                    ),
                ),
                damageCalc = DamageCalc(
                    assumptions = mapOf(
                        "attacker" to JsonScalar.Str("Garchomp"),
                        "move" to JsonScalar.Str("earthquake"),
                    ),
                    result = mapOf(
                        "min_damage" to JsonScalar.IntVal(142),
                        "max_damage" to JsonScalar.IntVal(168),
                    ),
                    isEstimate = true,
                    breakdown = "floor((2*50/5+2)*100*120/65)",
                ),
                suggestions = listOf("Garchomp", "Garchomp (Mega)", "tell me more"),
                proposedTeam = ProposedTeam(
                    name = "Rain Offense",
                    format = Format.ScarletViolet,
                    members = listOf(member),
                ),
            ),
            impliedFormat = Format.ScarletViolet,
            mentionedTeam = MentionedTeam(id = "team-rain-1", name = "Rain Offense"),
        )

        val allowed = setOf(
            FollowUpChip.Kind.Scope,
            FollowUpChip.Kind.Dex,
            FollowUpChip.Kind.Team,
        )
        assertTrue(chips.all { it.kind in allowed })
        for (chip in chips) {
            assertFalse(forbiddenChip.containsMatchIn(chip.label))
            assertFalse(chip.label.lowercase().contains("/calc"))
            assertFalse(chip.label.lowercase().contains("add garchomp to a team"))
            assertFalse(chip.label.lowercase().contains("open this calc"))
        }
        assertEquals(0, chips.count { it.kind == FollowUpChip.Kind.Scope })
        assertTrue(chips.count { it.kind == FollowUpChip.Kind.Dex } <= 3)
        assertEquals(1, chips.count { it.kind == FollowUpChip.Kind.Team })
    }

    @Test
    fun `returns an empty list when there is nothing to hop to (CHIP-AC-1_5 _ CHIP-BR-2)`() {
        val chips = deriveFollowUpChips(answer = base.copy(subjects = null))
        assertEquals(emptyList<FollowUpChip>(), chips)
    }

    @Test
    fun `does not invent a suggestions field on OakAnswer (CHIP-BR-3)`() {
        val answer = base.copy()
        val fieldNames = OakAnswer::class.java.declaredFields.map { it.name }
        assertFalse("followUpChips" in fieldNames)
        assertFalse("follow_up_chips" in fieldNames)
        val snapshot = answer.copy()
        deriveFollowUpChips(answer = answer, impliedFormat = Format.Gen1)
        assertEquals(snapshot, answer)
        assertFalse("followUpChips" in OakAnswer::class.java.declaredFields.map { it.name })
    }

    @Test
    fun `respects combined caps - 1 scope + 3 Dex + 1 team (CHIP-BR-2)`() {
        val chips = deriveFollowUpChips(
            answer = base.copy(
                subjects = listOf(
                    subject("Garchomp", 445, listOf("dragon", "ground")),
                    subject("Dragonite", 149, listOf("dragon", "flying")),
                    subject("Salamence", 373, listOf("dragon", "flying")),
                    subject("Hydreigon", 635, listOf("dark", "dragon")),
                ),
                savedTeam = SavedTeamRef(
                    id = "team-saved-9",
                    name = "Balance Core",
                    format = Format.ScarletViolet,
                ),
            ),
            impliedFormat = Format.ScarletViolet,
            mentionedTeam = MentionedTeam(id = "team-rain-1", name = "Rain Offense"),
        )
        assertEquals(0, chips.count { it.kind == FollowUpChip.Kind.Scope })
        assertEquals(3, chips.count { it.kind == FollowUpChip.Kind.Dex })
        assertEquals(1, chips.count { it.kind == FollowUpChip.Kind.Team })
        assertEquals(4, chips.size)
    }
}
