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
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// Conversation & saved-team wire DTOs — decode mirrors of the conversations /
// teams route responses.
//
// Contract fidelity (CLAUDE.md "the TS source wins"): the `json` helper
// (web/src/app/api/auth/_lib/http.ts) `JSON.stringify`s the repo objects
// verbatim — it does NOT snake-case keys — so these envelopes are already
// camelCase on the wire and map with IDENTITY `@SerialName` (never a
// snake_case strategy).

/**
 * List-view projection of a saved conversation — `GET /api/conversations`
 * (`{ conversations: ConversationSummary[] }`). Mirrors the repo
 * `ConversationSummary` (`web/src/data/repos/conversation-repo.ts`): no full
 * turns, and **no `createdAt`** — the list only carries `updatedAt`.
 */
@Serializable
data class ConversationSummary(
    val id: String,
    val title: String,
    val format: Format,
    val pinned: Boolean,
    /** Epoch-ms of last activity. Wire key is camelCase. */
    val updatedAt: Long,
)

/**
 * A full conversation with rehydrated turns — `GET /api/conversations/{id}`
 * (`{ id, title, format, pinned, turns, active_turn }`, a flat envelope — not
 * wrapped in `{ conversation: {...} }`).
 */
@Serializable
data class ConversationDetail(
    val id: String,
    val title: String,
    val format: Format,
    val pinned: Boolean,
    val turns: List<ChatTurn>,
    /**
     * A durable turn still generating for this conversation, as a live server-side
     * registry lookup (background-turns/design.md §5.4). Lets a reopened thread
     * reattach even after an app relaunch, when the client's own pending-turn pointer
     * is gone. `null` ⇒ nothing in flight; absent on older servers ⇒ decodes to `null`.
     */
    @SerialName("active_turn") val activeTurn: ActiveTurn? = null,
)

/** The `active_turn` field of [ConversationDetail] — just the running turn's id. */
@Serializable
data class ActiveTurn(@SerialName("turn_id") val turnId: String)

/**
 * One entry in a rehydrated conversation thread, discriminated on `role`. A
 * user turn carries its raw text; an assistant turn carries the full
 * [OakAnswer] so it re-renders through the normal answer-card tree.
 */
@Serializable(with = ChatTurnSerializer::class)
sealed interface ChatTurn {
    val id: String

    data class User(override val id: String, val content: String) : ChatTurn
    data class Assistant(override val id: String, val answer: OakAnswer) : ChatTurn
}

object ChatTurnSerializer : KSerializer<ChatTurn> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ai.gowtam.oak.wire.ChatTurn")

    override fun serialize(encoder: Encoder, value: ChatTurn) {
        throw UnsupportedOperationException("ChatTurn is decode-only (server-authored turns)")
    }

    override fun deserialize(decoder: Decoder): ChatTurn {
        check(decoder is JsonDecoder) { "ChatTurn can only be decoded from JSON" }
        val json = decoder.json
        val obj = decoder.decodeJsonElement().jsonObject
        val id = obj["id"]?.jsonPrimitive?.content
            ?: throw SerializationException("ChatTurn.id is required")
        return when (val role = obj["role"]?.jsonPrimitive?.content) {
            "user" -> ChatTurn.User(
                id = id,
                content = obj["content"]?.jsonPrimitive?.content
                    ?: throw SerializationException("ChatTurn(user).content is required"),
            )
            "assistant" -> ChatTurn.Assistant(
                id = id,
                answer = obj["answer"]?.let { json.decodeFromJsonElement(OakAnswer.serializer(), it) }
                    ?: throw SerializationException("ChatTurn(assistant).answer is required"),
            )
            else -> throw SerializationException("Unknown ChatTurn role \"$role\"")
        }
    }
}

/**
 * A saved team with its full members — the `team` envelope returned by the
 * teams routes (`{ team, validation }`, `{ teams: Team[] }`). Mirrors the repo
 * `Team` (`web/src/data/repos/team-repo.ts`); its extra `accountId` wire field
 * is intentionally not decoded. `createdAt`/`updatedAt` are camelCase epoch-ms.
 */
@Serializable
data class Team(
    val id: String,
    val name: String,
    val format: Format,
    val members: List<TeamMember>,
    val createdAt: Long,
    val updatedAt: Long,
)

/**
 * `GET /api/teams` list-row projection (NOT the full [Team]) — mirrors
 * `TeamSummary` in `web/src/data/repos/team-repo.ts`. Already camelCase on the
 * wire.
 */
@Serializable
data class TeamSummary(
    val id: String,
    val name: String,
    val format: Format,
    val memberCount: Int,
    val incomplete: Boolean,
    val species: List<String>,
    val updatedAt: Long,
)

/**
 * One entry in the `notes` array of `POST /api/teams/import` (Showdown import)
 * — mirrors `ImportNote` in `web/src/server/teams/import-export.ts`.
 *
 * **Drift from data-model.md** (verified against the TS source, which wins per
 * CLAUDE.md): the wire field is `resolvedTo` (camelCase), NOT `resolved_to` as
 * the doc's table states — the response envelope
 * (`web/src/app/api/teams/import/route.ts`) is a flat, un-snake-cased
 * `JSON.stringify`, same as the conversation/team envelopes. The doc's `kind`
 * union is also missing a 7th case, `"level"`, present in the TS source.
 */
@Serializable
data class ImportNote(
    val slot: Int,
    val kind: Kind,
    val raw: String,
    val resolvedTo: String? = null,
    val message: String,
) {
    @Serializable
    enum class Kind {
        @SerialName("pokemon") POKEMON,
        @SerialName("move") MOVE,
        @SerialName("ability") ABILITY,
        @SerialName("item") ITEM,
        @SerialName("nature") NATURE,
        @SerialName("tera") TERA,
        @SerialName("level") LEVEL,
    }
}
