package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
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
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/**
 * A single JSON scalar value — `string | number | boolean | null`.
 *
 * Mirrors `jsonScalarSchema` (`web/src/agent/schemas.ts`): the value type for the
 * free-form `Record<string, scalar>` maps the server emits inside `submit_answer`
 * (candidate `key_stats`, `damage_calc` `assumptions`/`result`). [IntVal]/[DoubleVal]
 * are split so whole numbers round-trip as integers (`5` → `5`, not `5.0`) while
 * fractional values keep their precision — mirrors iOS `JSONScalar` (`.int`/`.double`).
 *
 * The custom [JsonScalarSerializer] checks the JSON element's own string-ness
 * first (so a real JSON string is never re-interpreted as bool/number), then
 * decodes bool-before-number and int-before-double, so `true` never coerces to
 * `1` and whole numbers keep integer form.
 */
@Serializable(with = JsonScalarSerializer::class)
sealed interface JsonScalar {
    data class Str(val v: String) : JsonScalar
    data class IntVal(val v: Long) : JsonScalar
    data class DoubleVal(val v: Double) : JsonScalar
    data class BoolVal(val v: Boolean) : JsonScalar
    data object Null : JsonScalar
}

object JsonScalarSerializer : KSerializer<JsonScalar> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.JsonScalar")

    override fun serialize(encoder: Encoder, value: JsonScalar) {
        check(encoder is JsonEncoder) { "JsonScalar can only be serialized to JSON" }
        val element = when (value) {
            is JsonScalar.Str -> JsonPrimitive(value.v)
            is JsonScalar.IntVal -> JsonPrimitive(value.v)
            is JsonScalar.DoubleVal -> JsonPrimitive(value.v)
            is JsonScalar.BoolVal -> JsonPrimitive(value.v)
            JsonScalar.Null -> JsonNull
        }
        encoder.encodeJsonElement(element)
    }

    override fun deserialize(decoder: Decoder): JsonScalar {
        check(decoder is JsonDecoder) { "JsonScalar can only be deserialized from JSON" }
        return when (val element = decoder.decodeJsonElement()) {
            is JsonNull -> JsonScalar.Null
            is JsonPrimitive -> {
                if (element.isString) {
                    JsonScalar.Str(element.content)
                } else {
                    element.booleanOrNull?.let { return JsonScalar.BoolVal(it) }
                    element.longOrNull?.let { return JsonScalar.IntVal(it) }
                    element.doubleOrNull?.let { return JsonScalar.DoubleVal(it) }
                    JsonScalar.Str(element.content)
                }
            }
            else -> throw SerializationException(
                "JsonScalar expected a JSON primitive or null, got $element",
            )
        }
    }
}
