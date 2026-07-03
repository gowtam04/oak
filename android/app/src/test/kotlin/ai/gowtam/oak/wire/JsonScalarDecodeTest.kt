package ai.gowtam.oak.wire

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * [JsonScalar] preserves string/int/double/bool/null distinctions without
 * coercion — e.g. `5` decodes as [JsonScalar.IntVal], never `5.0`, and `true`
 * never coerces to `1`.
 */
class JsonScalarDecodeTest {

    private val mapSerializer = MapSerializer(String.serializer(), JsonScalar.serializer())

    @Test
    fun wholeNumbersDecodeAsIntNotDouble() {
        val map = OakJson.decodeFromString(mapSerializer, """{"speed": 142}""")
        assertEquals(JsonScalar.IntVal(142), map["speed"])
    }

    @Test
    fun fractionalNumbersDecodeAsDouble() {
        val map = OakJson.decodeFromString(mapSerializer, """{"speed_tier": 9.5}""")
        assertEquals(JsonScalar.DoubleVal(9.5), map["speed_tier"])
    }

    @Test
    fun booleansNeverCoerceToOneOrZero() {
        val map = OakJson.decodeFromString(mapSerializer, """{"fully_invested": true, "guaranteed_ko": false}""")
        assertEquals(JsonScalar.BoolVal(true), map["fully_invested"])
        assertEquals(JsonScalar.BoolVal(false), map["guaranteed_ko"])
    }

    @Test
    fun nullDecodesAsJsonScalarNull() {
        val map = OakJson.decodeFromString(mapSerializer, """{"notes": null}""")
        assertEquals(JsonScalar.Null, map["notes"])
    }

    @Test
    fun stringsStayStringsEvenWhenTheyLookNumericOrBoolean() {
        val map = OakJson.decodeFromString(
            mapSerializer,
            """{"role": "fast attacker", "flag_like": "true", "num_like": "142"}""",
        )
        assertEquals(JsonScalar.Str("fast attacker"), map["role"])
        assertEquals(JsonScalar.Str("true"), map["flag_like"])
        assertEquals(JsonScalar.Str("142"), map["num_like"])
    }

    @Test
    fun everyScalarVariantRoundTripsThroughEncodeAndDecode() {
        val values = listOf(
            JsonScalar.Str("fast attacker"),
            JsonScalar.IntVal(142),
            JsonScalar.DoubleVal(9.5),
            JsonScalar.BoolVal(true),
            JsonScalar.BoolVal(false),
            JsonScalar.Null,
        )
        for (value in values) {
            val encoded = OakJson.encodeToString(JsonScalar.serializer(), value)
            val decoded = OakJson.decodeFromString(JsonScalar.serializer(), encoded)
            assertEquals(value, decoded)
        }
    }
}
