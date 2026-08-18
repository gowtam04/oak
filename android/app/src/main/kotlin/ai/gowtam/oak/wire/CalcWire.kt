package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Portable wire types for `POST /api/calc` (CALC-US-4/5).
 *
 * Lockstep with `web/src/lib/calc/calc-schema.ts`. Incomplete sides still
 * decode so the engine can return `{ ok: false, error: "incomplete" }`
 * instead of a schema 400 (CALC-BR-8).
 */

@Serializable
data class CalcSide(
    val species: String? = null,
    val ability: String? = null,
    val item: String? = null,
    val nature: String? = null,
    val evs: Map<String, Int>? = null,
    val ivs: Map<String, Int>? = null,
    val tera: String? = null,
    val level: Int? = null,
)

@Serializable
data class CalcMove(
    val slug: String? = null,
    val name: String? = null,
    val power: Double? = null,
    val type: String? = null,
    val category: String? = null,
)

@Serializable
data class CalcField(
    val weather: String? = null,
    val reflect: Boolean? = null,
    @SerialName("light_screen") val lightScreen: Boolean? = null,
)

@Serializable
data class CalcScenario(
    val format: Format,
    val attacker: CalcSide,
    val defender: CalcSide,
    val move: CalcMove,
    val field: CalcField? = null,
)

@Serializable
data class CalcKo(val hits: Int)

@Serializable
data class CalcSpreadEstimate(
    @SerialName("min_damage") val minDamage: Int,
    @SerialName("max_damage") val maxDamage: Int,
    @SerialName("percent_min") val percentMin: Double,
    @SerialName("percent_max") val percentMax: Double,
    val ko: CalcKo,
)

@Serializable
data class CalcEstimate(
    @SerialName("min_damage") val minDamage: Int,
    @SerialName("max_damage") val maxDamage: Int,
    @SerialName("percent_min") val percentMin: Double,
    @SerialName("percent_max") val percentMax: Double,
    val ko: CalcKo,
    @SerialName("is_estimate") val isEstimate: Boolean = true,
)

@Serializable
data class CalcApplied(
    val stab: Boolean,
    @SerialName("type_effectiveness") val typeEffectiveness: Double,
    @SerialName("other_modifier") val otherModifier: Double,
    val weather: String? = null,
    val screens: List<String>? = null,
    val item: String? = null,
    val unsupported: List<String> = emptyList(),
)

@Serializable
data class CalcCommonSpread(
    val label: String,
    val estimate: CalcSpreadEstimate,
)

/**
 * Discriminated on `ok`. In-domain misses are values (`incomplete`,
 * `status_move`, `unresolved`, `index_unavailable`), never thrown.
 */
@Serializable(with = CalcResultSerializer::class)
sealed interface CalcResult {
    val ok: Boolean

    @Serializable
    data class Ok(
        val format: Format,
        val estimate: CalcEstimate,
        val breakdown: String,
        val applied: CalcApplied,
        @SerialName("common_spreads") val commonSpreads: List<CalcCommonSpread>? = null,
        val caveat: String? = null,
    ) : CalcResult {
        override val ok: Boolean get() = true
    }

    @Serializable
    data class Error(
        val error: String,
        val detail: String? = null,
        val suggestions: List<String>? = null,
    ) : CalcResult {
        override val ok: Boolean get() = false
    }
}

object CalcResultSerializer : KSerializer<CalcResult> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.CalcResult")

    override fun serialize(encoder: Encoder, value: CalcResult) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw IllegalStateException("CalcResult can only be encoded to JSON")
        val element = when (value) {
            is CalcResult.Ok -> {
                val obj = jsonEncoder.json.encodeToJsonElement(CalcResult.Ok.serializer(), value).jsonObject
                JsonObject(obj + ("ok" to JsonPrimitive(true)))
            }
            is CalcResult.Error -> {
                val obj = jsonEncoder.json.encodeToJsonElement(CalcResult.Error.serializer(), value).jsonObject
                JsonObject(obj + ("ok" to JsonPrimitive(false)))
            }
        }
        jsonEncoder.encodeJsonElement(element)
    }

    override fun deserialize(decoder: Decoder): CalcResult {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw IllegalStateException("CalcResult can only be decoded from JSON")
        val element = jsonDecoder.decodeJsonElement()
        val obj = element.jsonObject
        val ok = obj["ok"]?.jsonPrimitive?.content == "true"
        return if (ok) {
            jsonDecoder.json.decodeFromJsonElement(CalcResult.Ok.serializer(), element)
        } else {
            jsonDecoder.json.decodeFromJsonElement(CalcResult.Error.serializer(), element)
        }
    }
}

/** Whether this scenario has both sides and a move identity (CALC-BR-8). */
fun CalcScenario.isComplete(): Boolean {
    if (attacker.species.isNullOrBlank()) return false
    if (defender.species.isNullOrBlank()) return false
    return !move.slug.isNullOrBlank() || !move.name.isNullOrBlank()
}
