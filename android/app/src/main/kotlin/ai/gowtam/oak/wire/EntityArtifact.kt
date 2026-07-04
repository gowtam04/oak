package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The `GET /api/entity` response — a faithful mirror of `EntityArtifactResponse`
 * in `web/src/lib/entity-artifact.ts`. A discriminated union on `status`, the
 * `ok` arm further discriminated on entity `kind`
 * (`pokemon`/`move`/`ability`/`item`/`type`), each carrying a kind-specific
 * `data` payload.
 *
 * Decode-only; `not_found`/`unavailable` are honest in-domain misses rendered
 * in the viewer, never thrown (`ArtifactService` returns `null`, not an error).
 */
@Serializable(with = EntityArtifactSerializer::class)
sealed interface EntityArtifact {
    data class Ok(val v: EntityArtifactOk) : EntityArtifact
    data class NotFound(val v: EntityArtifactNotFound) : EntityArtifact
    data class Unavailable(val v: EntityArtifactUnavailable) : EntityArtifact

    /**
     * A frame this client can't render — an unknown top-level `status`, or an `ok`
     * frame whose `kind` is outside the known five. Preserved verbatim ([rawStatus]/
     * [rawKind]) so the viewer can show a graceful "can't display this yet" state
     * instead of hard-failing the whole decode. Mirrors the tolerant-degrade intent
     * of [Format]/[OakAnswer.Status]; the wire can add a status/kind independently of
     * when this app ships.
     */
    data class Unsupported(val rawStatus: String?, val rawKind: String? = null) : EntityArtifact
}

object EntityArtifactSerializer : KSerializer<EntityArtifact> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.EntityArtifact")

    override fun serialize(encoder: Encoder, value: EntityArtifact) {
        throw UnsupportedOperationException("EntityArtifact is decode-only")
    }

    override fun deserialize(decoder: Decoder): EntityArtifact {
        check(decoder is JsonDecoder) { "EntityArtifact can only be decoded from JSON" }
        val json = decoder.json
        val element = decoder.decodeJsonElement()
        val obj = element.jsonObject
        val status = obj["status"]?.jsonPrimitive?.content
        return when (status) {
            "ok" -> {
                // An `ok` frame with a kind outside the known five can't build a
                // kind-specific payload — degrade to Unsupported rather than throw.
                val rawKind = obj["kind"]?.jsonPrimitive?.content
                if (rawKind != null && EntityKind.fromRaw(rawKind) is EntityKind.Unknown) {
                    EntityArtifact.Unsupported(rawStatus = status, rawKind = rawKind)
                } else {
                    EntityArtifact.Ok(json.decodeFromJsonElement(EntityArtifactOkSerializer, element))
                }
            }
            "not_found" -> EntityArtifact.NotFound(
                json.decodeFromJsonElement(EntityArtifactNotFound.serializer(), element),
            )
            "unavailable" -> EntityArtifact.Unavailable(
                json.decodeFromJsonElement(EntityArtifactUnavailable.serializer(), element),
            )
            // An unknown status (the wire added a new artifact outcome) degrades to a
            // graceful "unsupported" arm instead of failing the parent's decode.
            else -> EntityArtifact.Unsupported(rawStatus = status)
        }
    }
}

/**
 * The five entity kinds an artifact can describe — mirrors `entityKindSchema`
 * (`ENTITY_KINDS`) in `web/src/agent/schemas.ts`.
 *
 * **Tolerant decoding** mirrors [Format]: a `kind` outside the known five degrades
 * to [Unknown] rather than failing the containing frame's decode; the enclosing
 * [EntityArtifact] routes such a frame to [EntityArtifact.Unsupported].
 */
@Serializable(with = EntityKindSerializer::class)
sealed interface EntityKind {
    data object POKEMON : EntityKind
    data object MOVE : EntityKind
    data object ABILITY : EntityKind
    data object ITEM : EntityKind
    data object TYPE : EntityKind

    /** A kind string outside the known five — preserves the original wire value. */
    data class Unknown(val raw: String) : EntityKind

    /** The wire string for a known case, or the original raw string for [Unknown]. */
    val rawValue: String
        get() = when (this) {
            POKEMON -> "pokemon"
            MOVE -> "move"
            ABILITY -> "ability"
            ITEM -> "item"
            TYPE -> "type"
            is Unknown -> raw
        }

    companion object {
        /** Maps a wire string to its case, falling back to [Unknown] otherwise. */
        fun fromRaw(raw: String): EntityKind = when (raw) {
            "pokemon" -> POKEMON
            "move" -> MOVE
            "ability" -> ABILITY
            "item" -> ITEM
            "type" -> TYPE
            else -> Unknown(raw)
        }
    }
}

object EntityKindSerializer : KSerializer<EntityKind> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.EntityKind", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: EntityKind) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): EntityKind {
        return EntityKind.fromRaw(decoder.decodeString())
    }
}

// ---------------------------------------------------------------------------
// ok envelope (grounding chrome + kind-specific data)
// ---------------------------------------------------------------------------

/**
 * The `ok` envelope — grounding chrome plus a `kind`-specific [data] payload
 * (`entityArtifactOkSchema`).
 */
@Serializable(with = EntityArtifactOkSerializer::class)
data class EntityArtifactOk(
    val kind: EntityKind,
    val format: Format,
    val resolved: ResolvedEntity,
    val generation: String,
    val isFallback: Boolean,
    val fallbackNote: String?,
    val citations: List<Citation>,
    val data: EntityData,
)

object EntityArtifactOkSerializer : KSerializer<EntityArtifactOk> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.EntityArtifactOk")

    override fun serialize(encoder: Encoder, value: EntityArtifactOk) {
        throw UnsupportedOperationException("EntityArtifactOk is decode-only")
    }

    override fun deserialize(decoder: Decoder): EntityArtifactOk {
        check(decoder is JsonDecoder) { "EntityArtifactOk can only be decoded from JSON" }
        val json = decoder.json
        val obj = decoder.decodeJsonElement().jsonObject

        val kind = json.decodeFromJsonElement(EntityKind.serializer(), obj.getValue("kind"))
        val dataElement = obj.getValue("data")
        val data: EntityData = when (kind) {
            EntityKind.POKEMON -> EntityData.Pokemon(
                json.decodeFromJsonElement(PokemonArtifactData.serializer(), dataElement),
            )
            EntityKind.MOVE -> EntityData.Move(
                json.decodeFromJsonElement(MoveArtifactData.serializer(), dataElement),
            )
            EntityKind.ABILITY -> EntityData.Ability(
                json.decodeFromJsonElement(AbilityArtifactData.serializer(), dataElement),
            )
            EntityKind.ITEM -> EntityData.Item(
                json.decodeFromJsonElement(ItemArtifactData.serializer(), dataElement),
            )
            EntityKind.TYPE -> EntityData.Type(
                json.decodeFromJsonElement(TypeArtifactData.serializer(), dataElement),
            )
            // Unreachable: the enclosing EntityArtifactSerializer routes an unknown
            // kind to EntityArtifact.Unsupported before this ok-body decode runs.
            is EntityKind.Unknown -> throw kotlinx.serialization.SerializationException(
                "Unknown EntityArtifact kind \"${kind.raw}\"",
            )
        }

        return EntityArtifactOk(
            kind = kind,
            format = json.decodeFromJsonElement(FormatSerializer, obj.getValue("format")),
            resolved = json.decodeFromJsonElement(ResolvedEntity.serializer(), obj.getValue("resolved")),
            generation = obj.getValue("generation").jsonPrimitive.content,
            isFallback = obj.getValue("is_fallback").jsonPrimitive.content.toBoolean(),
            fallbackNote = obj["fallback_note"]?.takeIf { it != JsonNull }?.jsonPrimitive?.content,
            citations = json.decodeFromJsonElement(ListSerializer(Citation.serializer()), obj.getValue("citations")),
            data = data,
        )
    }
}

/** The resolved entity's canonical slug + display name (`okBaseSchema.resolved`). */
@Serializable
data class ResolvedEntity(
    val slug: String,
    @SerialName("display_name") val displayName: String,
)

/** The kind-specific payload of an `ok` artifact, selected by [EntityArtifactOk.kind]. */
sealed interface EntityData {
    data class Pokemon(val v: PokemonArtifactData) : EntityData
    data class Move(val v: MoveArtifactData) : EntityData
    data class Ability(val v: AbilityArtifactData) : EntityData
    data class Item(val v: ItemArtifactData) : EntityData
    data class Type(val v: TypeArtifactData) : EntityData
}

// ---------------------------------------------------------------------------
// Per-kind data shapes (pokemonProfileSchema/moveDetailSchema/… minus `found`)
// ---------------------------------------------------------------------------

/**
 * `data` for a Pokémon artifact — `pokemonArtifactDataSchema`: the
 * `pokemonProfileSchema` fields (minus `found`) plus the combined defensive
 * [matchups] and the grouped [movepool].
 */
@Serializable
data class PokemonArtifactData(
    @SerialName("display_name") val displayName: String,
    @SerialName("national_dex_number") val nationalDexNumber: Int,
    val types: List<String>,
    val abilities: Abilities,
    @SerialName("base_stats") val baseStats: BaseStats,
    @SerialName("base_stat_total") val baseStatTotal: Int,
    @SerialName("sprite_url") val spriteUrl: String,
    @SerialName("artwork_url") val artworkUrl: String,
    val forms: List<String>,
    @SerialName("is_gen9_native") val isGen9Native: Boolean,
    @SerialName("source_generation") val sourceGeneration: String? = null,
    /** Combined defensive matchups for the species' actual type(s). */
    val matchups: DefensiveProfile,
    /** Full movepool for the active format, grouped by learn method. */
    val movepool: List<MovepoolGroup>,
)

/**
 * A species' ability slots — `abilitiesSchema` in `schemas.ts`. `slot1` is
 * always present; `slot2`/`hidden` may be absent or null.
 */
@Serializable
data class Abilities(
    val slot1: String,
    val slot2: String? = null,
    val hidden: String? = null,
)

/** `data` for a move artifact — `moveDetailSchema` (minus `found`). */
@Serializable
data class MoveArtifactData(
    @SerialName("display_name") val displayName: String,
    val type: String,
    @SerialName("damage_class") val damageClass: DamageClass,
    val power: Int? = null,
    val accuracy: Int? = null,
    val pp: Int? = null,
    val priority: Int,
    val target: String,
    @SerialName("hits_allies") val hitsAllies: Boolean? = null,
    @SerialName("spread_modifier_doubles") val spreadModifierDoubles: Double? = null,
    @SerialName("effect_short") val effectShort: String,
    @SerialName("effect_full") val effectFull: String,
    @SerialName("gen9_learner_count") val gen9LearnerCount: Int? = null,
)

/** A move's damage class — `moveDetailSchema.damage_class`. */
@Serializable
enum class DamageClass {
    @SerialName("physical") PHYSICAL,
    @SerialName("special") SPECIAL,
    @SerialName("status") STATUS,
}

/**
 * `data` for an ability artifact — `abilityArtifactDataSchema`: the
 * `abilityDetailSchema` fields (minus `found`) plus [learnedBy].
 */
@Serializable
data class AbilityArtifactData(
    @SerialName("display_name") val displayName: String,
    @SerialName("effect_short") val effectShort: String,
    @SerialName("effect_full") val effectFull: String,
    /** Species that have this ability. */
    @SerialName("learned_by") val learnedBy: List<AbilityHolder>,
)

/** One species that has a given ability — `abilityHolderSchema`. */
@Serializable
data class AbilityHolder(
    val slug: String,
    @SerialName("display_name") val displayName: String,
)

/**
 * `data` for an item artifact — `itemArtifactDataSchema` (= `itemDetailSchema`
 * minus `found`).
 */
@Serializable
data class ItemArtifactData(
    @SerialName("display_name") val displayName: String,
    @SerialName("effect_short") val effectShort: String,
    @SerialName("effect_full") val effectFull: String,
    /** Wild Pokémon known to hold this item. */
    @SerialName("held_by_wild") val heldByWild: List<WildItemHolder>? = null,
)

/** A wild Pokémon that may hold an item, with its rarity — `held_by_wild` element. */
@Serializable
data class WildItemHolder(
    val pokemon: String,
    @SerialName("rarity_percent") val rarityPercent: Double,
)

/**
 * `data` for a type artifact — `typeArtifactDataSchema` (=
 * `typeMatchupsDetailSchema` minus `found`).
 */
@Serializable
data class TypeArtifactData(
    val types: List<String>,
    /** Present for a single-type request; omitted for a combined defensive lookup. */
    val offensive: OffensiveProfile? = null,
    val defensive: DefensiveProfile,
)

/** A type's offensive profile — `typeMatchupsDetailSchema.offensive`. */
@Serializable
data class OffensiveProfile(
    @SerialName("super_effective_against") val superEffectiveAgainst: List<String>,
    @SerialName("not_very_effective_against") val notVeryEffectiveAgainst: List<String>,
    @SerialName("no_effect_against") val noEffectAgainst: List<String>,
)

/**
 * A combined (or single-type) defensive profile — `defensiveProfileSchema`,
 * reused for a Pokémon's matchup grid. `quad_weak_to`/`quad_resists` are
 * optional strict subsets of `weak_to`/`resists` (x4 / x0.25), filled only by
 * the artifact assembler.
 */
@Serializable
data class DefensiveProfile(
    @SerialName("weak_to") val weakTo: List<String>,
    val resists: List<String>,
    @SerialName("immune_to") val immuneTo: List<String>,
    @SerialName("quad_weak_to") val quadWeakTo: List<String>? = null,
    @SerialName("quad_resists") val quadResists: List<String>? = null,
)

/**
 * One move in a Pokémon's movepool — `movepoolMoveSchema`, clickable with its
 * type badge.
 */
@Serializable
data class MovepoolMove(
    val slug: String,
    @SerialName("display_name") val displayName: String,
    val type: String,
)

/**
 * Movepool grouped by learn method (level-up / machine / tutor / egg) —
 * `movepoolGroupSchema`.
 */
@Serializable
data class MovepoolGroup(
    val method: String,
    val moves: List<MovepoolMove>,
)

// ---------------------------------------------------------------------------
// Miss envelopes (not_found | unavailable)
// ---------------------------------------------------------------------------

/**
 * Resolution miss — `entityArtifactNotFoundSchema`. The entity could not be
 * resolved; [suggestions] are close names to offer.
 */
@Serializable
data class EntityArtifactNotFound(
    val kind: EntityKind,
    val format: Format,
    val query: String,
    val suggestions: List<String>,
)

/** Index unavailable — `entityArtifactUnavailableSchema`. Honest failure; never fabricated data. */
@Serializable
data class EntityArtifactUnavailable(
    val kind: EntityKind,
    val format: Format,
)
