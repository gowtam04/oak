package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * The data-scope discriminator (mirrors `formats.ts` `FORMATS`). `scarlet-violet`
 * is Gen 9 / standard mode; `champions` is the Pokémon Champions regulation
 * scope; `gen-5`…`gen-8` are the mainline generation-scope formats.
 *
 * **Tolerant decoding is load-bearing** (mirrors iOS `Format.unknown`): the wire
 * can widen this set independently of when this app ships (it already has —
 * `gen-5`…`gen-8` postdate the app's original two-case set), so an unrecognized
 * string degrades to [Unknown] rather than failing the parent object's decode
 * (`ConversationSummary`/`ConversationDetail`/`Team`/`EntityArtifactOk`/…).
 */
@Serializable(with = FormatSerializer::class)
sealed interface Format {
    data object ScarletViolet : Format
    data object Champions : Format
    data object Gen5 : Format
    data object Gen6 : Format
    data object Gen7 : Format
    data object Gen8 : Format

    /** A format string outside the known six — preserves the original wire value. */
    data class Unknown(val raw: String) : Format

    /** The wire string for a known case, or the original raw string for [Unknown]. */
    val rawValue: String
        get() = when (this) {
            ScarletViolet -> "scarlet-violet"
            Champions -> "champions"
            Gen5 -> "gen-5"
            Gen6 -> "gen-6"
            Gen7 -> "gen-7"
            Gen8 -> "gen-8"
            is Unknown -> raw
        }

    /**
     * A short display label, e.g. for a compact list-row badge or filter chip —
     * mirrors `scopeLabelShort` (`web/src/lib/scope/scope-label.ts`) exactly.
     * [Unknown] echoes its raw value (never renders as blank).
     */
    val shortLabel: String
        get() = when (this) {
            Champions -> "Champions"
            ScarletViolet -> "Gen 9"
            Gen8 -> "Gen 8"
            Gen7 -> "Gen 7"
            Gen6 -> "Gen 6"
            Gen5 -> "Gen 5"
            is Unknown -> raw
        }

    /**
     * A fuller display label with the game-pair/regulation suffix — mirrors
     * `scopeLabel` (`web/src/lib/scope/scope-label.ts`) exactly. The Champions
     * regulation string is duplicated from web's `CHAMPIONS_REGULATION` — update
     * this when that rotates. [Unknown] echoes its raw value.
     */
    val displayLabel: String
        get() = when (this) {
            Champions -> "Champions · Reg M-B"
            ScarletViolet -> "Gen 9 · Scarlet/Violet"
            Gen8 -> "Gen 8 · Sword/Shield"
            Gen7 -> "Gen 7 · USUM"
            Gen6 -> "Gen 6 · XY/ORAS"
            Gen5 -> "Gen 5 · Black/White"
            is Unknown -> raw
        }

    companion object {
        /**
         * The known, orderable formats — display order: default first, then
         * release-date descending. Backs the six-way scope chip/filter; [Unknown]
         * is deliberately excluded (it has no fixed identity to list).
         */
        val knownCases: List<Format> =
            listOf(Champions, ScarletViolet, Gen8, Gen7, Gen6, Gen5)

        /** Maps a wire string to its case, falling back to [Unknown] otherwise. */
        fun fromRaw(raw: String): Format = when (raw) {
            "scarlet-violet" -> ScarletViolet
            "champions" -> Champions
            "gen-5" -> Gen5
            "gen-6" -> Gen6
            "gen-7" -> Gen7
            "gen-8" -> Gen8
            else -> Unknown(raw)
        }
    }
}

object FormatSerializer : KSerializer<Format> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.Format", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Format) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): Format {
        return Format.fromRaw(decoder.decodeString())
    }
}
