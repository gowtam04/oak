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
 * The single structured answer the agent emits per turn — the field-by-field
 * render target for the chat UI. Faithful mirror of `oakAnswerSchema` (and its
 * sub-objects) in `web/src/agent/schemas.ts`.
 *
 * In-domain failures are **values, not errors**: a non-`answered` [status],
 * empty [subjects], `resolution_failed` [suggestions], etc. are normal results
 * rendered in the UI, never thrown.
 */
@Serializable
data class OakAnswer(
    val status: Status,
    @SerialName("answer_markdown") val answerMarkdown: String,
    @SerialName("reasoning_markdown") val reasoningMarkdown: String,
    val citations: List<Citation>,
    val inferences: List<Inference>,
    @SerialName("generation_basis") val generationBasis: GenerationBasis,
    // Optional, render-if-present.
    val subjects: List<Subject>? = null,
    val candidates: Candidates? = null,
    @SerialName("damage_calc") val damageCalc: DamageCalc? = null,
    val suggestions: List<String>? = null,
    val question: ClarifyQuestion? = null,
    @SerialName("uncertainty_flags") val uncertaintyFlags: List<String>? = null,
    // Team-builder fields. `proposedTeam` is model-emitted; `savedTeam` and
    // `proposedTeamWarnings` are server-stamped onto the answer.
    @SerialName("proposed_team") val proposedTeam: ProposedTeam? = null,
    @SerialName("saved_team") val savedTeam: SavedTeamRef? = null,
    @SerialName("proposed_team_warnings") val proposedTeamWarnings: List<TeamWarning>? = null,
    /** Server-owned. `"voice"` on a spoken turn (VOICE-AC-1.2). */
    val origin: String? = null,
) {
    /**
     * The outcome of the turn. Drives which optional blocks the UI expects.
     *
     * **Tolerant decoding is load-bearing** (mirrors [Format]): the server can add
     * a new terminal status independently of when this app ships, so an
     * unrecognized value degrades to [Unknown] rather than failing the whole
     * `OakAnswer` decode (which would lose the answer to an error banner). Render
     * sites treat [Unknown] as a neutral generic outcome.
     */
    @Serializable(with = StatusSerializer::class)
    sealed interface Status {
        data object Answered : Status
        data object ClarificationNeeded : Status
        data object ResolutionFailed : Status
        data object InsufficientData : Status

        /** A status string outside the known four — preserves the original wire value. */
        data class Unknown(val raw: String) : Status

        /** The wire string for a known case, or the original raw string for [Unknown]. */
        val rawValue: String
            get() = when (this) {
                Answered -> "answered"
                ClarificationNeeded -> "clarification_needed"
                ResolutionFailed -> "resolution_failed"
                InsufficientData -> "insufficient_data"
                is Unknown -> raw
            }

        companion object {
            /** Maps a wire string to its case, falling back to [Unknown] otherwise. */
            fun fromRaw(raw: String): Status = when (raw) {
                "answered" -> Answered
                "clarification_needed" -> ClarificationNeeded
                "resolution_failed" -> ResolutionFailed
                "insufficient_data" -> InsufficientData
                else -> Unknown(raw)
            }
        }
    }
}

object StatusSerializer : KSerializer<OakAnswer.Status> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.OakAnswer.Status", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: OakAnswer.Status) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): OakAnswer.Status {
        return OakAnswer.Status.fromRaw(decoder.decodeString())
    }
}

/** A cited source backing the answer (mirrors `citationSchema`). */
@Serializable
data class Citation(
    val source: String,
    val detail: String,
    @SerialName("endpoint_url") val endpointUrl: String? = null,
    val anchor: CitationAnchor? = null,
)

/** A claim the agent deduced rather than read directly (mirrors `inferenceSchema`). */
@Serializable
data class Inference(
    val claim: String,
    val confidence: Confidence,
    val note: String? = null,
) {
    /**
     * How sure Oak is of an inferred claim. **Tolerant decoding** mirrors
     * [Format]/[OakAnswer.Status]: an unrecognized confidence value degrades to
     * [Unknown] (rendered as its raw string) rather than failing the answer's
     * decode.
     */
    @Serializable(with = ConfidenceSerializer::class)
    sealed interface Confidence {
        data object High : Confidence
        data object Medium : Confidence
        data object Low : Confidence

        /** A confidence string outside the known three — preserves the original wire value. */
        data class Unknown(val raw: String) : Confidence

        /** The wire string for a known case, or the original raw string for [Unknown]. */
        val rawValue: String
            get() = when (this) {
                High -> "high"
                Medium -> "medium"
                Low -> "low"
                is Unknown -> raw
            }

        companion object {
            /** Maps a wire string to its case, falling back to [Unknown] otherwise. */
            fun fromRaw(raw: String): Confidence = when (raw) {
                "high" -> High
                "medium" -> Medium
                "low" -> Low
                else -> Unknown(raw)
            }
        }
    }
}

object ConfidenceSerializer : KSerializer<Inference.Confidence> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ai.gowtam.oak.wire.Inference.Confidence", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Inference.Confidence) {
        encoder.encodeString(value.rawValue)
    }

    override fun deserialize(decoder: Decoder): Inference.Confidence {
        return Inference.Confidence.fromRaw(decoder.decodeString())
    }
}

/** The generation/format the answer is based on (mirrors `generationBasisSchema`). */
@Serializable
data class GenerationBasis(
    val generation: String,
    val fallback: Boolean,
    val note: String? = null,
)

/** A primary entity the answer is about, for the header sprite/badges (mirrors `subjectSchema`). */
@Serializable
data class Subject(
    val name: String,
    @SerialName("dex_number") val dexNumber: Int? = null,
    @SerialName("sprite_url") val spriteUrl: String,
    val types: List<String>,
    @SerialName("is_fallback") val isFallback: Boolean,
    @SerialName("source_generation") val sourceGeneration: String? = null,
)

/** A result set the answer enumerates (mirrors `candidatesSchema`). */
@Serializable
data class Candidates(
    @SerialName("total_count") val totalCount: Int,
    val truncated: Boolean,
    /** Present-or-null on the wire (`z.string().nullable().optional()`); both map to `null`. */
    val sort: String? = null,
    val shown: List<CandidateRow>,
    /**
     * The rows beyond [shown], server-populated only when the full set (≤200 rows)
     * could be fetched. Absent/null on older answers or when the server couldn't
     * enrich — the UI falls back to the follow-up-message "Show all" behavior.
     */
    @SerialName("hidden_rows") val hiddenRows: List<CandidateRow>? = null,
)

/** One row in a `candidates` table (mirrors `candidateRowSchema`). */
@Serializable
data class CandidateRow(
    val name: String,
    @SerialName("dex_number") val dexNumber: Int? = null,
    @SerialName("sprite_url") val spriteUrl: String? = null,
    val types: List<String>,
    @SerialName("base_stats") val baseStats: BaseStats? = null,
    /** Free-form scalar map; the candidate table falls back to this when [baseStats] is absent. */
    @SerialName("key_stats") val keyStats: Map<String, JsonScalar>? = null,
    val ability: String? = null,
)

/**
 * The six-stat block, in fixed order — mirrors `baseStatsSchema` in
 * `web/src/agent/schemas.ts` (the source for `candidateRowSchema.base_stats`,
 * `pokedexRowSchema`, and the entity artifact). Unlike the team [StatSpread]
 * (which uses the abbreviated `atk`/`def`/`spa` wire keys), `baseStatsSchema`
 * sends the FULL stat names (`attack`/`defense`/`special_attack`/…), so the
 * abbreviated Kotlin properties are mapped with explicit `@SerialName`.
 */
@Serializable
data class BaseStats(
    val hp: Int,
    @SerialName("attack") val atk: Int,
    @SerialName("defense") val def: Int,
    @SerialName("special_attack") val spa: Int,
    @SerialName("special_defense") val spd: Int,
    @SerialName("speed") val spe: Int,
)

/** A non-authoritative damage estimate (mirrors `damageCalcSchema`). */
@Serializable
data class DamageCalc(
    val assumptions: Map<String, JsonScalar>,
    val result: Map<String, JsonScalar>,
    /** Always `true` on the wire (`z.literal(true)`); kept a `Boolean` for decode tolerance. */
    @SerialName("is_estimate") val isEstimate: Boolean,
    val breakdown: String? = null,
)

/**
 * A focused multiple-choice question shown on a `clarification_needed` answer
 * (mirrors `questionSchema`).
 */
@Serializable
data class ClarifyQuestion(val options: List<ClarifyOption>)

/**
 * One selectable option in a [ClarifyQuestion] (mirrors `questionOptionSchema`).
 * [label] is sent verbatim as the next user message when tapped.
 */
@Serializable
data class ClarifyOption(
    val label: String,
    val description: String? = null,
)

/**
 * A buildable team the agent proposes for the user to Apply (mirrors
 * `proposedTeamSchema`).
 */
@Serializable
data class ProposedTeam(
    val name: String,
    val format: Format,
    val members: List<TeamMember>,
)

/**
 * A reference to a team the agent saved this turn (mirrors `savedTeamSchema`),
 * server-stamped so the UI can render a "Saved ✓ — open in viewer" card.
 */
@Serializable
data class SavedTeamRef(
    val id: String,
    val name: String,
    val format: Format,
)
