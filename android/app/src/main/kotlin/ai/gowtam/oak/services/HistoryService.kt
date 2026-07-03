package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.ConversationDetail
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.OakJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

/**
 * The durable chat-history seam (component-design.md "Services layer"; mirrors iOS
 * `HistoryService`). View models depend on this **interface** (never
 * `LiveHistoryService`) so they unit-test against a fake.
 *
 * History is signed-in only: every call attaches the Bearer token when present.
 * [list] is client-side graceful for a **guest** — it returns `[]` WITHOUT hitting
 * the network when no token is stored, rather than round-tripping to the (also
 * guest-graceful) server route. The per-conversation reads/writes throw
 * [OakError.Unauthorized] for a guest; the app gates them behind a sign-in prompt.
 */
interface HistoryService {
    /**
     * Lists the signed-in account's conversations, pinned first then most-recent
     * (`GET /api/conversations`). [query] filters by title/message text (`?q=`),
     * [format] filters by data scope (`?format=`). Returns `[]` for a guest with NO
     * network request.
     */
    suspend fun list(query: String?, format: Format?): List<ConversationSummary>

    /**
     * Loads one full conversation with its rehydrated turns
     * (`GET /api/conversations/{id}`). Throws [OakError.Unauthorized] for a guest and
     * `Http(404, …)` for a conversation that is missing or not owned.
     */
    suspend fun get(id: String): ConversationDetail

    /** Renames a conversation (`PATCH /api/conversations/{id}` with `{ title }`). */
    suspend fun rename(id: String, title: String)

    /** Pins or unpins a conversation (`PATCH …` with `{ pinned }`). */
    suspend fun setPinned(id: String, pinned: Boolean)

    /**
     * Permanently deletes a conversation (`DELETE /api/conversations/{id}`). The
     * server returns 404 for an already-gone or not-owned id; the caller treats that
     * as success for idempotent UX.
     */
    suspend fun delete(id: String)

    /**
     * The guest→sign-in bulk save (`POST /api/conversations/import`). Uploads the
     * in-memory guest thread's [turns] under [sessionId] and the scope the thread
     * resolved to ([format]); the returned id becomes the active conversation. An
     * empty thread imports nothing and returns `null` (a normal value, not an error).
     */
    suspend fun importGuestThread(sessionId: String, format: Format, turns: List<ChatTurn>): String?
}

/**
 * Production [HistoryService] over [OakApiClient]. Wire shapes are decoded into the
 * conversation DTOs in `wire/Conversation.kt`; error mapping happens inside
 * [OakApiClient].
 */
class LiveHistoryService(
    private val apiClient: OakApiClient,
    private val tokenStore: TokenStore,
) : HistoryService {

    override suspend fun list(query: String?, format: Format?): List<ConversationSummary> {
        // Guest short-circuit: no token, no network request (the server route is
        // itself guest-graceful, but this avoids the round-trip entirely).
        if (tokenStore.token() == null) return emptyList()

        val queryItems = buildList {
            val trimmed = query?.trim()
            if (!trimmed.isNullOrEmpty()) add("q" to trimmed)
            format?.let { add("format" to it.rawValue) }
        }
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/conversations",
            queryItems = queryItems,
            requiresAuth = true,
        )
        return apiClient.send(endpoint, ConversationListResponse.serializer()).conversations
    }

    override suspend fun get(id: String): ConversationDetail {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/conversations/$id",
            requiresAuth = true,
        )
        return apiClient.send(endpoint, ConversationDetail.serializer())
    }

    override suspend fun rename(id: String, title: String) {
        val endpoint = Endpoint(
            method = Endpoint.Method.PATCH,
            path = "/api/conversations/$id",
            body = Endpoint.jsonBody(RenameBody.serializer(), RenameBody(title)),
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun setPinned(id: String, pinned: Boolean) {
        val endpoint = Endpoint(
            method = Endpoint.Method.PATCH,
            path = "/api/conversations/$id",
            body = Endpoint.jsonBody(PinnedBody.serializer(), PinnedBody(pinned)),
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun delete(id: String) {
        val endpoint = Endpoint(
            method = Endpoint.Method.DELETE,
            path = "/api/conversations/$id",
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun importGuestThread(sessionId: String, format: Format, turns: List<ChatTurn>): String? {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/conversations/import",
            body = encodeImportBody(sessionId, format, turns),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, ImportResponse.serializer()).id
    }
}

// ---------------------------------------------------------------------------
// Wire bodies & envelopes (private to the service)
// ---------------------------------------------------------------------------

/** `GET /api/conversations` → `{ conversations: ConversationSummary[] }`. */
@Serializable
private data class ConversationListResponse(val conversations: List<ConversationSummary>)

/** `POST /api/conversations/import` → `{ id: string | null }`. */
@Serializable
private data class ImportResponse(val id: String? = null)

/** `PATCH …` body for a rename (`{ title }`). */
@Serializable
private data class RenameBody(val title: String)

/** `PATCH …` body for a pin toggle (`{ pinned }`). */
@Serializable
private data class PinnedBody(val pinned: Boolean)

/**
 * Builds the `POST /api/conversations/import` body (`{ session_id, format, turns }`)
 * as raw JSON text. [ChatTurn] is decode-only (see `Conversation.kt`), so this is the
 * dedicated encode path: a user turn carries its raw `content`; an assistant turn
 * carries the full `answer` (an [OakAnswer], re-validated server-side against
 * `oakAnswerSchema`).
 */
private fun encodeImportBody(sessionId: String, format: Format, turns: List<ChatTurn>): String {
    val body = buildJsonObject {
        put("session_id", sessionId)
        put("format", format.rawValue)
        put("turns", buildJsonArray { turns.forEach { add(encodeImportTurn(it)) } })
    }
    return body.toString()
}

private fun encodeImportTurn(turn: ChatTurn): JsonObject = buildJsonObject {
    put("id", turn.id)
    when (turn) {
        is ChatTurn.User -> {
            put("role", "user")
            put("content", turn.content)
        }
        is ChatTurn.Assistant -> {
            put("role", "assistant")
            put("answer", OakJson.encodeToJsonElement(OakAnswer.serializer(), turn.answer))
        }
    }
}
