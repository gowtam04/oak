package ai.gowtam.oak.artifact

import ai.gowtam.oak.features.artifact.entityPlateTypes
import ai.gowtam.oak.wire.AbilityArtifactData
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DamageClass
import ai.gowtam.oak.wire.DefensiveProfile
import ai.gowtam.oak.wire.EntityData
import ai.gowtam.oak.wire.ItemArtifactData
import ai.gowtam.oak.wire.MoveArtifactData
import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.Abilities
import ai.gowtam.oak.wire.TypeArtifactData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Types carried by an entity profile (empty for ability/item). */
class EntityPlateTypesTest {

    @Test
    fun `pokemon uses species types`() {
        val data = EntityData.Pokemon(
            PokemonArtifactData(
                displayName = "Garchomp",
                nationalDexNumber = 445,
                types = listOf("dragon", "ground"),
                abilities = Abilities(slot1 = "sand-veil"),
                baseStats = BaseStats(108, 130, 95, 80, 85, 102),
                baseStatTotal = 600,
                spriteUrl = "s",
                artworkUrl = "a",
                forms = emptyList(),
                isGen9Native = true,
                matchups = DefensiveProfile(emptyList(), emptyList(), emptyList()),
                movepool = emptyList(),
            ),
        )
        assertEquals(listOf("dragon", "ground"), entityPlateTypes(data))
    }

    @Test
    fun `move uses move type`() {
        val data = EntityData.Move(
            MoveArtifactData(
                displayName = "Earthquake",
                type = "ground",
                damageClass = DamageClass.PHYSICAL,
                priority = 0,
                target = "all-adjacent-foes",
                effectShort = "Hits all adjacent foes.",
                effectFull = "Hits all adjacent foes.",
            ),
        )
        assertEquals(listOf("ground"), entityPlateTypes(data))
    }

    @Test
    fun `ability and item are mechanics plates`() {
        assertTrue(
            entityPlateTypes(
                EntityData.Ability(
                    AbilityArtifactData(
                        displayName = "Intimidate",
                        effectShort = "Lowers Attack.",
                        effectFull = "Lowers Attack.",
                        learnedBy = emptyList(),
                    ),
                ),
            ).isEmpty(),
        )
        assertTrue(
            entityPlateTypes(
                EntityData.Item(
                    ItemArtifactData(
                        displayName = "Choice Scarf",
                        effectShort = "Boosts Speed.",
                        effectFull = "Boosts Speed.",
                    ),
                ),
            ).isEmpty(),
        )
    }

    @Test
    fun `type artifact uses types list`() {
        val data = EntityData.Type(
            TypeArtifactData(
                types = listOf("flying"),
                offensive = null,
                defensive = DefensiveProfile(emptyList(), emptyList(), emptyList()),
            ),
        )
        assertEquals(listOf("flying"), entityPlateTypes(data))
    }
}
