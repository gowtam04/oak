package ai.gowtam.oak.artifact

import ai.gowtam.oak.features.artifact.EntityDetail
import ai.gowtam.oak.ui.OakTheme
import ai.gowtam.oak.wire.Abilities
import ai.gowtam.oak.wire.AbilityArtifactData
import ai.gowtam.oak.wire.AbilityHolder
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.DamageClass
import ai.gowtam.oak.wire.DefensiveProfile
import ai.gowtam.oak.wire.EntityArtifactOk
import ai.gowtam.oak.wire.EntityData
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ItemArtifactData
import ai.gowtam.oak.wire.MovepoolGroup
import ai.gowtam.oak.wire.MovepoolMove
import ai.gowtam.oak.wire.MoveArtifactData
import ai.gowtam.oak.wire.OffensiveProfile
import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.ResolvedEntity
import ai.gowtam.oak.wire.TypeArtifactData
import ai.gowtam.oak.wire.WildItemHolder
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

/**
 * Renders [EntityDetail] against fixture [EntityArtifactOk]s for all five entity
 * kinds (implementation-plan.md P7 acceptance check 2; mirrors iOS
 * `EntityDetailViewTests`). **Not run in this phase** (no emulator/AVD wired up yet,
 * per implementation-plan.md CP-A) — kept here so it compiles as part of the
 * androidTest source-set validation; CP-A is the first phase that actually executes
 * it on a booted AVD.
 *
 * Each case asserts the profile renders its display name without crashing — the
 * governing risk this phase guards against is a kind-specific `when` branch (or a
 * nested `EntityData` cast) blowing up on a real payload shape, not exact layout.
 */
class EntityDetailRenderTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun aPokemonArtifactRendersItsHeaderAbilitiesStatsMatchupsAndMovepool() {
        val artifact = ok(
            kind = EntityKind.POKEMON,
            resolved = ResolvedEntity(slug = "garchomp", displayName = "Garchomp"),
            data = EntityData.Pokemon(
                PokemonArtifactData(
                    displayName = "Garchomp",
                    nationalDexNumber = 445,
                    types = listOf("dragon", "ground"),
                    abilities = Abilities(slot1 = "sand-veil", hidden = "rough-skin"),
                    baseStats = BaseStats(hp = 108, atk = 130, def = 95, spa = 80, spd = 85, spe = 102),
                    baseStatTotal = 600,
                    spriteUrl = "https://example.test/garchomp.png",
                    artworkUrl = "https://example.test/garchomp.png",
                    forms = listOf("garchomp"),
                    isGen9Native = true,
                    matchups = DefensiveProfile(
                        weakTo = listOf("ice", "dragon", "fairy"),
                        resists = listOf("fire", "water", "grass", "electric"),
                        immuneTo = listOf("electric"),
                        quadWeakTo = listOf("ice"),
                    ),
                    movepool = listOf(
                        MovepoolGroup(
                            method = "level-up",
                            moves = listOf(MovepoolMove(slug = "dragon-claw", displayName = "Dragon Claw", type = "dragon")),
                        ),
                    ),
                ),
            ),
        )

        composeTestRule.setContent { OakTheme { EntityDetail(artifact = artifact, onOpen = { _, _ -> }) } }

        composeTestRule.onNodeWithText("Garchomp").assertIsDisplayed()
        composeTestRule.onNodeWithText("Dragon Claw").assertIsDisplayed()
    }

    @Test
    fun aMoveArtifactRendersItsNameAndInfoRows() {
        val artifact = ok(
            kind = EntityKind.MOVE,
            resolved = ResolvedEntity(slug = "dragon-claw", displayName = "Dragon Claw"),
            data = EntityData.Move(
                MoveArtifactData(
                    displayName = "Dragon Claw",
                    type = "dragon",
                    damageClass = DamageClass.PHYSICAL,
                    power = 80,
                    accuracy = 100,
                    pp = 15,
                    priority = 0,
                    target = "selected-pokemon",
                    effectShort = "Deals damage with no additional effect.",
                    effectFull = "Deals damage with no additional effect.",
                ),
            ),
        )

        composeTestRule.setContent { OakTheme { EntityDetail(artifact = artifact, onOpen = { _, _ -> }) } }

        composeTestRule.onNodeWithText("Dragon Claw").assertIsDisplayed()
    }

    @Test
    fun anAbilityArtifactRendersItsNameAndHolders() {
        val artifact = ok(
            kind = EntityKind.ABILITY,
            resolved = ResolvedEntity(slug = "rough-skin", displayName = "Rough Skin"),
            data = EntityData.Ability(
                AbilityArtifactData(
                    displayName = "Rough Skin",
                    effectShort = "Damages the attacker on contact.",
                    effectFull = "Damages the attacker on contact.",
                    learnedBy = listOf(AbilityHolder(slug = "garchomp", displayName = "Garchomp")),
                ),
            ),
        )

        composeTestRule.setContent { OakTheme { EntityDetail(artifact = artifact, onOpen = { _, _ -> }) } }

        composeTestRule.onNodeWithText("Rough Skin").assertIsDisplayed()
        composeTestRule.onNodeWithText("Garchomp").assertIsDisplayed()
    }

    @Test
    fun anItemArtifactRendersItsNameAndWildHolders() {
        val artifact = ok(
            kind = EntityKind.ITEM,
            resolved = ResolvedEntity(slug = "leftovers", displayName = "Leftovers"),
            data = EntityData.Item(
                ItemArtifactData(
                    displayName = "Leftovers",
                    effectShort = "Restores a small amount of HP each turn.",
                    effectFull = "Restores a small amount of HP each turn.",
                    heldByWild = listOf(WildItemHolder(pokemon = "munchlax", rarityPercent = 50.0)),
                ),
            ),
        )

        composeTestRule.setContent { OakTheme { EntityDetail(artifact = artifact, onOpen = { _, _ -> }) } }

        composeTestRule.onNodeWithText("Leftovers").assertIsDisplayed()
    }

    @Test
    fun aTypeArtifactRendersItsOffensiveAndDefensiveProfiles() {
        val artifact = ok(
            kind = EntityKind.TYPE,
            resolved = ResolvedEntity(slug = "dragon", displayName = "Dragon"),
            data = EntityData.Type(
                TypeArtifactData(
                    types = listOf("dragon"),
                    offensive = OffensiveProfile(
                        superEffectiveAgainst = listOf("dragon"),
                        notVeryEffectiveAgainst = listOf("steel"),
                        noEffectAgainst = listOf("fairy"),
                    ),
                    defensive = DefensiveProfile(weakTo = listOf("ice", "dragon", "fairy"), resists = listOf("fire", "water", "grass", "electric"), immuneTo = emptyList()),
                ),
            ),
        )

        composeTestRule.setContent { OakTheme { EntityDetail(artifact = artifact, onOpen = { _, _ -> }) } }

        // "Dragon" itself renders multiple times (the header chip + several matchup
        // rows), so assert on the section labels instead of risking an ambiguous match.
        composeTestRule.onNodeWithText("Super effective").assertIsDisplayed()
        composeTestRule.onNodeWithText("Weak to").assertIsDisplayed()
    }

    private fun ok(kind: EntityKind, resolved: ResolvedEntity, data: EntityData) = EntityArtifactOk(
        kind = kind,
        format = Format.Champions,
        resolved = resolved,
        generation = "Gen 9 (champions)",
        isFallback = false,
        fallbackNote = null,
        citations = listOf(Citation(source = "pokemon/garchomp", detail = "Base stats and typing.")),
        data = data,
    )
}
