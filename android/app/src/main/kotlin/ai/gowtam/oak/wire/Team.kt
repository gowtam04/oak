package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * One EV or IV spread — mirrors `statSpreadSchema`. Raw `0..255` per stat on the
 * wire (Showdown permits the full byte range on input); legality (≤252/stat,
 * ≤508 total, IV 0..31) is a warn-only concern handled server-side, never
 * enforced by this DTO. Keys match the wire 1:1.
 */
@Serializable
data class StatSpread(
    val hp: Int,
    val atk: Int,
    val def: Int,
    val spa: Int,
    val spd: Int,
    val spe: Int,
)

/**
 * One team member (set). Slugs are stored, not display names; `null` means
 * "empty / not set". Mirrors `teamMemberSchema`.
 *
 * **Encoding nuance (data-model.md).** In Zod, `species`/`ability`/`item`/
 * `nature`/`teraType` are `.nullable()` — a REQUIRED key whose value may be
 * `null` (the server's `.strict()` parse rejects an absent key). `nickname`/
 * `gender`/`shiny` are `.optional()` — the key itself may be absent. A global
 * `explicitNulls` flag cannot express that split (it is all-or-nothing per
 * `Json` instance), so [TeamMemberSerializer] hand-encodes the object: the five
 * nullable-required fields are ALWAYS emitted (explicit `null` when unset), the
 * three cosmetics are omitted when `null`. Decoding tolerates both null and
 * absent for every field (mirrors iOS's `decodeIfPresent`-based synthesized
 * `init(from:)`).
 */
@Serializable(with = TeamMemberSerializer::class)
data class TeamMember(
    val species: String?,
    val ability: String?,
    val item: String?,
    val moves: List<String>,
    val nature: String?,
    val evs: StatSpread,
    val ivs: StatSpread,
    val teraType: String?,
    val level: Int,
    val nickname: String? = null,
    val gender: Gender? = null,
    val shiny: Boolean? = null,
) {
    /** Cosmetic gender flag (`z.enum(["M", "F", "N"])`). */
    @Serializable
    enum class Gender {
        @SerialName("M") MALE,
        @SerialName("F") FEMALE,
        @SerialName("N") NEUTRAL,
    }
}

object TeamMemberSerializer : KSerializer<TeamMember> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.TeamMember")

    override fun serialize(encoder: Encoder, value: TeamMember) {
        check(encoder is JsonEncoder) { "TeamMember can only be encoded to JSON" }
        val json = encoder.json
        val obj = buildJsonObject {
            // `.nullable()`-required keys: always present, explicit null when unset.
            put("species", value.species?.let { JsonPrimitive(it) } ?: JsonNull)
            put("ability", value.ability?.let { JsonPrimitive(it) } ?: JsonNull)
            put("item", value.item?.let { JsonPrimitive(it) } ?: JsonNull)
            put("moves", buildJsonArray { value.moves.forEach { add(JsonPrimitive(it)) } })
            put("nature", value.nature?.let { JsonPrimitive(it) } ?: JsonNull)
            put("evs", json.encodeToJsonElement(StatSpread.serializer(), value.evs))
            put("ivs", json.encodeToJsonElement(StatSpread.serializer(), value.ivs))
            put("tera_type", value.teraType?.let { JsonPrimitive(it) } ?: JsonNull)
            put("level", value.level)
            // `.optional()` cosmetics: omitted when null.
            value.nickname?.let { put("nickname", it) }
            value.gender?.let { put("gender", json.encodeToJsonElement(TeamMember.Gender.serializer(), it)) }
            value.shiny?.let { put("shiny", it) }
        }
        encoder.encodeJsonElement(obj)
    }

    override fun deserialize(decoder: Decoder): TeamMember {
        check(decoder is JsonDecoder) { "TeamMember can only be decoded from JSON" }
        val json = decoder.json
        val obj = decoder.decodeJsonElement().jsonObject

        fun nullableString(key: String): String? =
            obj[key]?.takeIf { it != JsonNull }?.jsonPrimitive?.contentOrNull

        return TeamMember(
            species = nullableString("species"),
            ability = nullableString("ability"),
            item = nullableString("item"),
            moves = obj["moves"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
            nature = nullableString("nature"),
            evs = obj["evs"]?.let { json.decodeFromJsonElement(StatSpread.serializer(), it) }
                ?: throw SerializationException("TeamMember.evs is required"),
            ivs = obj["ivs"]?.let { json.decodeFromJsonElement(StatSpread.serializer(), it) }
                ?: throw SerializationException("TeamMember.ivs is required"),
            teraType = nullableString("tera_type"),
            level = obj["level"]?.jsonPrimitive?.int
                ?: throw SerializationException("TeamMember.level is required"),
            nickname = nullableString("nickname"),
            gender = obj["gender"]?.takeIf { it != JsonNull }
                ?.let { json.decodeFromJsonElement(TeamMember.Gender.serializer(), it) },
            shiny = obj["shiny"]?.takeIf { it != JsonNull }?.jsonPrimitive?.boolean,
        )
    }
}

/**
 * One advisory team warning (`teamWarningSchema`). Advisory-only: warnings are
 * rendered, never thrown (in-domain failures are values). `slot` absent ⇒
 * team-level (e.g. species/item clauses).
 */
@Serializable
data class TeamWarning(
    val code: Code,
    val message: String,
    val slot: Int? = null,
    val field: String? = null,
) {
    /**
     * The validity/legality rules `validateTeam` can flag (`warningCodeSchema`).
     * **All 11** web codes are represented, including `item_missing` — the web
     * schema has 11 codes but the iOS `TeamWarning.Code` mirror only has 10 and
     * is missing `item_missing` (a drift found while porting; see the P1 report).
     * [Unknown] makes decode tolerant of a future 12th code so a single
     * unrecognized warning can never fail the parent team's decode.
     */
    @Serializable(with = CodeSerializer::class)
    sealed interface Code {
        data object Incomplete : Code
        data object EvTotalExceeded : Code
        data object EvStatExceeded : Code
        data object IvOutOfRange : Code
        data object SpeciesIllegal : Code
        data object AbilityNotForSpecies : Code
        data object ItemIllegal : Code
        data object ItemMissing : Code
        data object MoveNotInLearnset : Code
        data object DuplicateSpecies : Code
        data object DuplicateItem : Code

        /** A warning code string outside the known 11 — preserves the raw value. */
        data class Unknown(val raw: String) : Code

        val rawValue: String
            get() = when (this) {
                Incomplete -> "incomplete"
                EvTotalExceeded -> "ev_total_exceeded"
                EvStatExceeded -> "ev_stat_exceeded"
                IvOutOfRange -> "iv_out_of_range"
                SpeciesIllegal -> "species_illegal"
                AbilityNotForSpecies -> "ability_not_for_species"
                ItemIllegal -> "item_illegal"
                ItemMissing -> "item_missing"
                MoveNotInLearnset -> "move_not_in_learnset"
                DuplicateSpecies -> "duplicate_species"
                DuplicateItem -> "duplicate_item"
                is Unknown -> raw
            }

        companion object {
            fun fromRaw(raw: String): Code = when (raw) {
                "incomplete" -> Incomplete
                "ev_total_exceeded" -> EvTotalExceeded
                "ev_stat_exceeded" -> EvStatExceeded
                "iv_out_of_range" -> IvOutOfRange
                "species_illegal" -> SpeciesIllegal
                "ability_not_for_species" -> AbilityNotForSpecies
                "item_illegal" -> ItemIllegal
                "item_missing" -> ItemMissing
                "move_not_in_learnset" -> MoveNotInLearnset
                "duplicate_species" -> DuplicateSpecies
                "duplicate_item" -> DuplicateItem
                else -> Unknown(raw)
            }
        }
    }
}

object CodeSerializer : KSerializer<TeamWarning.Code> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.TeamWarning.Code")

    override fun serialize(encoder: Encoder, value: TeamWarning.Code) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): TeamWarning.Code {
        return TeamWarning.Code.fromRaw(decoder.decodeString())
    }
}

/**
 * Codes that make a team HARD-ILLEGAL in the format (mirrors web's
 * `HARD_VIOLATION_CODES`). `item_missing` is deliberately excluded — a member
 * with no held item is still a legal team. Single source of truth for both the
 * proposal gate and the save gate on the client side.
 */
val HARD_VIOLATION_CODES: Set<TeamWarning.Code> = setOf(
    TeamWarning.Code.SpeciesIllegal,
    TeamWarning.Code.AbilityNotForSpecies,
    TeamWarning.Code.ItemIllegal,
    TeamWarning.Code.MoveNotInLearnset,
    TeamWarning.Code.DuplicateSpecies,
    TeamWarning.Code.DuplicateItem,
)

/** True when a warning is a hard format-illegality (see [HARD_VIOLATION_CODES]). */
fun isHardViolation(warning: TeamWarning): Boolean = warning.code in HARD_VIOLATION_CODES
