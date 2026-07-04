package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Decode coverage for all five [EntityArtifact] `ok` kinds plus the two miss arms. */
class EntityArtifactDecodeTest {

    @Test
    fun pokemonArtifactDecodesMatchupsAndGroupedMovepool() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_pokemon.json"))
        val ok = artifact as EntityArtifact.Ok
        assertEquals(EntityKind.POKEMON, ok.v.kind)
        assertEquals("garchomp", ok.v.resolved.slug)
        val data = (ok.v.data as EntityData.Pokemon).v
        assertEquals(445, data.nationalDexNumber)
        assertEquals("sand-veil", data.abilities.slot1)
        assertNull(data.abilities.slot2)
        assertEquals("rough-skin", data.abilities.hidden)
        assertEquals(listOf("ice"), data.matchups.quadWeakTo)
        assertTrue(data.matchups.quadResists.orEmpty().isEmpty())
        assertEquals(2, data.movepool.size)
        assertEquals("level-up", data.movepool[0].method)
        assertEquals("dragon-claw", data.movepool[0].moves[0].slug)
    }

    @Test
    fun moveArtifactDecodesWithOptionalFieldsAbsent() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_move.json"))
        val ok = artifact as EntityArtifact.Ok
        assertEquals(Format.Champions, ok.v.format)
        val data = (ok.v.data as EntityData.Move).v
        assertEquals(DamageClass.PHYSICAL, data.damageClass)
        assertEquals(100, data.power)
        assertNull(data.hitsAllies)
        assertNull(data.spreadModifierDoubles)
        assertNull(data.gen9LearnerCount)
    }

    @Test
    fun abilityArtifactDecodesLearnedBy() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_ability.json"))
        val ok = artifact as EntityArtifact.Ok
        val data = (ok.v.data as EntityData.Ability).v
        assertEquals(2, data.learnedBy.size)
        assertEquals("garchomp", data.learnedBy[0].slug)
    }

    @Test
    fun itemArtifactDecodesFallbackNoteAndHeldByWild() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_item.json"))
        val ok = artifact as EntityArtifact.Ok
        assertTrue(ok.v.isFallback)
        assertEquals("No Gen 9 entry; showing the latest available data.", ok.v.fallbackNote)
        val data = (ok.v.data as EntityData.Item).v
        val holders = requireNotNull(data.heldByWild)
        assertEquals(2, holders.size)
        assertEquals(50.0, holders[0].rarityPercent, 0.0001)
        assertEquals(12.5, holders[1].rarityPercent, 0.0001)
    }

    @Test
    fun typeArtifactDecodesOffensiveAndDefensiveProfiles() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_type.json"))
        val ok = artifact as EntityArtifact.Ok
        val data = (ok.v.data as EntityData.Type).v
        val offensive = requireNotNull(data.offensive)
        assertEquals(5, offensive.superEffectiveAgainst.size)
        assertEquals(listOf("water", "grass", "ice"), data.defensive.weakTo)
        assertTrue(data.defensive.quadWeakTo.orEmpty().isEmpty())
    }

    @Test
    fun notFoundDecodesSuggestions() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_not_found.json"))
        val notFound = artifact as EntityArtifact.NotFound
        assertEquals(EntityKind.POKEMON, notFound.v.kind)
        assertEquals(listOf("Garchomp"), notFound.v.suggestions)
    }

    @Test
    fun unavailableDecodesKindAndFormatOnly() {
        val artifact = OakJson.decodeFromString<EntityArtifact>(Fixtures.string("entity_unavailable.json"))
        val unavailable = artifact as EntityArtifact.Unavailable
        assertEquals(EntityKind.MOVE, unavailable.v.kind)
        assertEquals(Format.Champions, unavailable.v.format)
    }

    // An `ok` frame whose `kind` is outside the known five degrades to the graceful
    // Unsupported arm (the viewer shows "can't display this yet") rather than
    // hard-failing the decode.
    @Test
    fun unknownKindDegradesToUnsupported() {
        val json = """
            {"status":"ok","kind":"ribbon","format":"champions",
             "resolved":{"slug":"x","display_name":"X"},"generation":"Gen 9",
             "is_fallback":false,"fallback_note":null,"citations":[],
             "data":{"anything":true}}
        """.trimIndent()
        val artifact = OakJson.decodeFromString<EntityArtifact>(json)
        val unsupported = artifact as EntityArtifact.Unsupported
        assertEquals("ok", unsupported.rawStatus)
        assertEquals("ribbon", unsupported.rawKind)
    }

    // Likewise a top-level `status` the wire adds later degrades to Unsupported.
    @Test
    fun unknownArtifactStatusDegradesToUnsupported() {
        val json = """{"status":"deprecated","kind":"pokemon","format":"champions"}"""
        val artifact = OakJson.decodeFromString<EntityArtifact>(json)
        val unsupported = artifact as EntityArtifact.Unsupported
        assertEquals("deprecated", unsupported.rawStatus)
        assertNull(unsupported.rawKind)
    }
}
