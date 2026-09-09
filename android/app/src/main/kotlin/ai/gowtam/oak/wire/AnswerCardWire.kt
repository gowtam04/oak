package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Answer-card additive wire types (citation anchors, compact/full density,
 * conversation pins, voice hydrate status). Additive + optional so older
 * payloads keep decoding.
 */

@Serializable(with = AnswerDensitySerializer::class)
sealed interface AnswerDensity {
    data object Full : AnswerDensity
    data object Compact : AnswerDensity

    val rawValue: String
        get() = when (this) {
            Full -> "full"
            Compact -> "compact"
        }

    companion object {
        fun fromRaw(raw: String): AnswerDensity = when (raw) {
            "compact" -> Compact
            else -> Full
        }
    }
}

object AnswerDensitySerializer : KSerializer<AnswerDensity> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.AnswerDensity", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: AnswerDensity) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): AnswerDensity {
        return AnswerDensity.fromRaw(decoder.decodeString())
    }
}

@Serializable
data class CitationAnchor(
    val target: Target,
    val id: String,
) {
    @Serializable(with = CitationAnchorTargetSerializer::class)
    sealed interface Target {
        data object AnswerSpan : Target
        data object FactRow : Target
        data class Unknown(val raw: String) : Target

        val rawValue: String
            get() = when (this) {
                AnswerSpan -> "answer_span"
                FactRow -> "fact_row"
                is Unknown -> raw
            }

        companion object {
            fun fromRaw(raw: String): Target = when (raw) {
                "answer_span" -> AnswerSpan
                "fact_row" -> FactRow
                else -> Unknown(raw)
            }
        }
    }
}

object CitationAnchorTargetSerializer : KSerializer<CitationAnchor.Target> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.CitationAnchor.Target", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: CitationAnchor.Target) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): CitationAnchor.Target {
        return CitationAnchor.Target.fromRaw(decoder.decodeString())
    }
}

@Serializable
data class PinnedArtifactSummary(
    val id: String,
    val kind: String,
    val title: String,
    @SerialName("created_at") val createdAt: Long,
)

@Serializable
data class VoiceHydrateStatus(
    @SerialName("assistant_message_id") val assistantMessageId: String,
    val status: Status,
) {
    @Serializable(with = VoiceHydrateStatusSerializer::class)
    sealed interface Status {
        data object Running : Status
        data object Failed : Status
        data class Unknown(val raw: String) : Status

        val rawValue: String
            get() = when (this) {
                Running -> "running"
                Failed -> "failed"
                is Unknown -> raw
            }

        companion object {
            fun fromRaw(raw: String): Status = when (raw) {
                "running" -> Running
                "failed" -> Failed
                else -> Unknown(raw)
            }
        }
    }
}

object VoiceHydrateStatusSerializer : KSerializer<VoiceHydrateStatus.Status> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.VoiceHydrateStatus.Status", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: VoiceHydrateStatus.Status) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): VoiceHydrateStatus.Status {
        return VoiceHydrateStatus.Status.fromRaw(decoder.decodeString())
    }
}
