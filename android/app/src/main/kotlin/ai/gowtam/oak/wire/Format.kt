package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * The data-scope discriminator (mirrors `formats.ts` `FORMATS`). `national-dex` is the
 * whole-Pokédex, form-aware reference scope (the new default); `scarlet-violet` is
 * Gen 9 / standard mode; `champions` is the Pokémon Champions regulation scope;
 * `gen-1`…`gen-8` are the mainline generation-scope formats.
 *
 * **Tolerant decoding is load-bearing** (mirrors iOS `Format.unknown`): the wire
 * can widen this set independently of when this app ships (it already has —
 * `gen-5`…`gen-8` postdate the app's original two-case set, and `national-dex` +
 * `gen-1`…`gen-4` postdate that), so an unrecognized string degrades to [Unknown]
 * rather than failing the parent object's decode
 * (`ConversationSummary`/`ConversationDetail`/`Team`/`EntityArtifactOk`/…).
 */
@Serializable(with = FormatSerializer::class)
sealed interface Format {
    data object NationalDex : Format
    data object ScarletViolet : Format
    data object Champions : Format
    data object Gen5 : Format
    data object Gen6 : Format
    data object Gen7 : Format
    data object Gen8 : Format
    data object Gen4 : Format
    data object Gen3 : Format
    data object Gen2 : Format
    data object Gen1 : Format

    /** A format string outside the known set — preserves the original wire value. */
    data class Unknown(val raw: String) : Format

    /**
     * Living work is Champions only (ADR-3). Any other stored format — including
     * [Unknown] — is archived and must not appear in pickers.
     */
    val isArchived: Boolean get() = this != Champions

    /** Inverse of [isArchived]: only [Champions] is a living format. */
    val isLiving: Boolean get() = this == Champions

    /** The wire string for a known case, or the original raw string for [Unknown]. */
    val rawValue: String
        get() = when (this) {
            NationalDex -> "national-dex"
            ScarletViolet -> "scarlet-violet"
            Champions -> "champions"
            Gen5 -> "gen-5"
            Gen6 -> "gen-6"
            Gen7 -> "gen-7"
            Gen8 -> "gen-8"
            Gen4 -> "gen-4"
            Gen3 -> "gen-3"
            Gen2 -> "gen-2"
            Gen1 -> "gen-1"
            is Unknown -> raw
        }

    /**
     * A short display label, e.g. for a compact list-row badge or filter chip —
     * mirrors `scopeLabelShort` (`web/src/lib/scope/scope-label.ts`) exactly.
     * [Unknown] echoes its raw value (never renders as blank).
     */
    val shortLabel: String
        get() = when (this) {
            NationalDex -> "National Dex"
            Champions -> "Champions"
            ScarletViolet -> "Gen 9"
            Gen8 -> "Gen 8"
            Gen7 -> "Gen 7"
            Gen6 -> "Gen 6"
            Gen5 -> "Gen 5"
            Gen4 -> "Gen 4"
            Gen3 -> "Gen 3"
            Gen2 -> "Gen 2"
            Gen1 -> "Gen 1"
            is Unknown -> raw
        }

    /**
     * A fuller display label with the game-pair suffix — mirrors `scopeLabel`
     * for archived formats. Champions is `"Champions"` here; the live
     * regulation letter lives on the chip (`GET /api/scope`). [Unknown] echoes
     * its raw value.
     */
    val displayLabel: String
        get() = when (this) {
            NationalDex -> "National Dex · All Gens"
            Champions -> "Champions"
            ScarletViolet -> "Gen 9 · Scarlet/Violet"
            Gen8 -> "Gen 8 · Sword/Shield"
            Gen7 -> "Gen 7 · USUM"
            Gen6 -> "Gen 6 · XY/ORAS"
            Gen5 -> "Gen 5 · Black/White"
            Gen4 -> "Gen 4 · Diamond/Pearl"
            Gen3 -> "Gen 3 · Ruby/Sapphire"
            Gen2 -> "Gen 2 · Gold/Silver"
            Gen1 -> "Gen 1 · Red/Blue"
            is Unknown -> raw
        }

    companion object {
        /**
         * The known, orderable formats — display order: default first, then
         * release-date descending. Backs the scope chip/filter; [Unknown]
         * is deliberately excluded (it has no fixed identity to list).
         */
        val knownCases: List<Format> =
            listOf(
                NationalDex, Champions, ScarletViolet,
                Gen8, Gen7, Gen6, Gen5, Gen4, Gen3, Gen2, Gen1,
            )

        /**
         * Formats offered by living pickers. Historical [knownCases] still decode
         * archived rows; the UI must not list them (CF-UI-AC-1.1, ADR-3).
         */
        val pickerCases: List<Format> = listOf(Champions)

        /** Maps a wire string to its case, falling back to [Unknown] otherwise. */
        fun fromRaw(raw: String): Format = when (raw) {
            "national-dex" -> NationalDex
            "scarlet-violet" -> ScarletViolet
            "champions" -> Champions
            "gen-5" -> Gen5
            "gen-6" -> Gen6
            "gen-7" -> Gen7
            "gen-8" -> Gen8
            "gen-4" -> Gen4
            "gen-3" -> Gen3
            "gen-2" -> Gen2
            "gen-1" -> Gen1
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
