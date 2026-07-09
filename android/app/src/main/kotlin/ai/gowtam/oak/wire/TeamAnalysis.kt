package ai.gowtam.oak.wire

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The `POST /api/teams/analyze` response — a faithful mirror of `TeamAnalysisResponse`
 * in `web/src/lib/teams/team-analysis.ts`. A discriminated union on `status`:
 *
 *   - [Ok]          — the full analysis (per-member stats, a defensive type matrix,
 *                     offensive coverage, speed tiers, caveat notes).
 *   - [Unavailable] — the format's index is unbuilt / unreadable (honest failure,
 *                     never fabricated data).
 *
 * Decode-only. A `status` the wire adds later degrades to [Unsupported] rather than
 * failing the decode (mirrors [EntityArtifact]'s tolerant-degrade intent).
 *
 * Contract shape notes (canonical: the TS source):
 *   - [DefenseRow] carries member-SLUG arrays (`weak`/`resists`/`immune`); counts are
 *     derived client-side from the array lengths.
 *   - [Offense.covered] names the `{ member, move }` slug pairs that make a type
 *     super-effectively covered; [Offense.uncovered] lists the rest.
 *   - Unresolved species degrade PER-MEMBER ([AnalyzedMember.NotFound]).
 *   - [TeamAnalysisOk.notes] carries the v1 caveat (type-based only).
 */
@Serializable(with = TeamAnalysisSerializer::class)
sealed interface TeamAnalysis {
    data class Ok(val v: TeamAnalysisOk) : TeamAnalysis
    data class Unavailable(val format: Format) : TeamAnalysis

    /** A `status` outside the known two — preserved verbatim so the panel can degrade gracefully. */
    data class Unsupported(val rawStatus: String?) : TeamAnalysis
}

object TeamAnalysisSerializer : KSerializer<TeamAnalysis> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.TeamAnalysis")

    override fun serialize(encoder: Encoder, value: TeamAnalysis) {
        throw UnsupportedOperationException("TeamAnalysis is decode-only")
    }

    override fun deserialize(decoder: Decoder): TeamAnalysis {
        check(decoder is JsonDecoder) { "TeamAnalysis can only be decoded from JSON" }
        val json = decoder.json
        val element = decoder.decodeJsonElement()
        val obj = element.jsonObject
        return when (val status = obj["status"]?.jsonPrimitive?.content) {
            "ok" -> TeamAnalysis.Ok(json.decodeFromJsonElement(TeamAnalysisOk.serializer(), element))
            "unavailable" -> TeamAnalysis.Unavailable(
                format = json.decodeFromJsonElement(FormatSerializer, obj.getValue("format")),
            )
            else -> TeamAnalysis.Unsupported(rawStatus = status)
        }
    }
}

/**
 * The `ok` analysis body (`teamAnalysisOkSchema`). Decoded as a plain object (the
 * enclosing [TeamAnalysisSerializer] already consumed `status`; the tolerant [OakJson]
 * ignores it here). [members] uses the found/not-found union; the matrices carry
 * member-slug arrays.
 */
@Serializable
data class TeamAnalysisOk(
    val format: Format,
    val members: List<AnalyzedMember>,
    val defense: List<DefenseRow> = emptyList(),
    val offense: Offense = Offense(),
    @SerialName("speed_tiers") val speedTiers: List<SpeedTier> = emptyList(),
    val notes: List<String> = emptyList(),
)

/** A member's six computed final stats; `null` where it couldn't be computed. */
@Serializable
data class AnalyzedStats(
    val hp: Int? = null,
    val atk: Int? = null,
    val def: Int? = null,
    val spa: Int? = null,
    val spd: Int? = null,
    val spe: Int? = null,
)

/**
 * One analyzed member — a union (`analyzedMemberSchema`): a resolved species carries its
 * full readout ([Found]); an unresolved one degrades to [NotFound] (never fails the call).
 */
@Serializable(with = AnalyzedMemberSerializer::class)
sealed interface AnalyzedMember {
    val slug: String

    data class Found(
        override val slug: String,
        val displayName: String,
        val types: List<String>,
        val bst: Int,
        val stats: AnalyzedStats,
        val level: Int,
        val nature: String?,
    ) : AnalyzedMember

    data class NotFound(override val slug: String) : AnalyzedMember
}

object AnalyzedMemberSerializer : KSerializer<AnalyzedMember> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.AnalyzedMember")

    override fun serialize(encoder: Encoder, value: AnalyzedMember) {
        throw UnsupportedOperationException("AnalyzedMember is decode-only")
    }

    override fun deserialize(decoder: Decoder): AnalyzedMember {
        check(decoder is JsonDecoder) { "AnalyzedMember can only be decoded from JSON" }
        val json = decoder.json
        val obj = decoder.decodeJsonElement().jsonObject
        val slug = obj["slug"]?.jsonPrimitive?.contentOrNull ?: ""
        val found = obj["found"]?.jsonPrimitive?.booleanOrNull ?: false
        if (!found) return AnalyzedMember.NotFound(slug)
        return AnalyzedMember.Found(
            slug = slug,
            displayName = obj["display_name"]?.jsonPrimitive?.contentOrNull ?: "",
            types = obj["types"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
            bst = obj["bst"]?.jsonPrimitive?.intOrNull ?: 0,
            stats = obj["stats"]?.let { json.decodeFromJsonElement(AnalyzedStats.serializer(), it) }
                ?: AnalyzedStats(),
            level = obj["level"]?.jsonPrimitive?.intOrNull ?: 0,
            nature = obj["nature"]?.takeIf { it != JsonNull }?.jsonPrimitive?.contentOrNull,
        )
    }
}

/**
 * One row of the defensive matrix (`defenseRowSchema`): for the attacking [type], the
 * member slugs that are weak to / resist / immune to it. Counts derive from lengths.
 */
@Serializable
data class DefenseRow(
    val type: String,
    val weak: List<String> = emptyList(),
    val resists: List<String> = emptyList(),
    val immune: List<String> = emptyList(),
)

/** One super-effectively covered type and the `{ member, move }` slug pairs hitting it. */
@Serializable
data class OffenseCoverage(
    val type: String,
    val by: List<CoverageSource> = emptyList(),
)

/** A `{ member, move }` slug pair that super-effectively covers a type. */
@Serializable
data class CoverageSource(
    val member: String,
    val move: String,
)

/** Offensive coverage (`offenseSchema`): covered types (with sources) + the uncovered rest. */
@Serializable
data class Offense(
    val covered: List<OffenseCoverage> = emptyList(),
    val uncovered: List<String> = emptyList(),
)

/** One member's computed Speed, for the speed-tier ordering (server sorts desc). */
@Serializable
data class SpeedTier(
    val member: String,
    val speed: Int,
)
