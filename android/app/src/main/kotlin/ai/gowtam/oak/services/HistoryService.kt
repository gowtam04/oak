package ai.gowtam.oak.services

import ai.gowtam.oak.networking.Endpoint
import ai.gowtam.oak.networking.OakApiClient
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.TokenStore
import ai.gowtam.oak.wire.BulkAction
import ai.gowtam.oak.wire.BulkUpdateResult
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.ConversationDetail
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.Folder
import ai.gowtam.oak.wire.FolderListResponse
import ai.gowtam.oak.wire.ForkResult
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.PinResult
import kotlinx.serialization.SerialName
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
     * List with organize filters (ORG-US-1/2). Default implementation ignores
     * the extras so existing test doubles keep compiling.
     */
    suspend fun list(
        query: String?,
        format: Format?,
        folderId: String?,
        archived: Boolean?,
        includeArchived: Boolean,
    ): List<ConversationSummary> = list(query, format)

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

    suspend fun setArchived(id: String, archived: Boolean) {
        throw UnsupportedOperationException("setArchived")
    }

    suspend fun setFolder(id: String, folderId: String?) {
        throw UnsupportedOperationException("setFolder")
    }

    suspend fun listFolders(): List<Folder> = emptyList()

    suspend fun createFolder(name: String): Folder {
        throw UnsupportedOperationException("createFolder")
    }

    suspend fun renameFolder(id: String, name: String): Folder {
        throw UnsupportedOperationException("renameFolder")
    }

    suspend fun deleteFolder(id: String) {
        throw UnsupportedOperationException("deleteFolder")
    }

    suspend fun bulkUpdate(ids: List<String>, action: BulkAction, folderId: String? = null): BulkUpdateResult {
        throw UnsupportedOperationException("bulkUpdate")
    }

    suspend fun fork(id: String, throughMessageId: String): ForkResult {
        throw UnsupportedOperationException("fork")
    }

    suspend fun setMessagePinned(conversationId: String, messageId: String, pinned: Boolean): List<String> {
        throw UnsupportedOperationException("setMessagePinned")
    }

    /**
     * `GET /api/conversations/:id/export?format=md|pdf`. Returns bytes + a
     * suggested filename. Guest / empty / fault throw [OakError].
     */
    suspend fun export(id: String, format: String): Pair<ByteArray, String> {
        throw UnsupportedOperationException("export")
    }
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

        return list(query = query, format = format, folderId = null, archived = false, includeArchived = false)
    }

    override suspend fun list(
        query: String?,
        format: Format?,
        folderId: String?,
        archived: Boolean?,
        includeArchived: Boolean,
    ): List<ConversationSummary> {
        if (tokenStore.token() == null) return emptyList()

        val queryItems = buildList {
            val trimmed = query?.trim()
            if (!trimmed.isNullOrEmpty()) add("q" to trimmed)
            format?.let { add("format" to it.rawValue) }
            folderId?.let { add("folder_id" to it) }
            when (archived) {
                true -> add("archived" to "1")
                false, null -> Unit
            }
            if (includeArchived) add("include_archived" to "1")
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

    override suspend fun setArchived(id: String, archived: Boolean) {
        val endpoint = Endpoint(
            method = Endpoint.Method.PATCH,
            path = "/api/conversations/$id",
            body = Endpoint.jsonBody(ArchivedBody.serializer(), ArchivedBody(archived)),
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun setFolder(id: String, folderId: String?) {
        val endpoint = Endpoint(
            method = Endpoint.Method.PATCH,
            path = "/api/conversations/$id",
            body = encodeFolderPatch(folderId),
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun listFolders(): List<Folder> {
        if (tokenStore.token() == null) return emptyList()
        val endpoint = Endpoint(method = Endpoint.Method.GET, path = "/api/folders", requiresAuth = true)
        return apiClient.send(endpoint, FolderListResponse.serializer()).folders
    }

    override suspend fun createFolder(name: String): Folder {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/folders",
            body = Endpoint.jsonBody(FolderNameBody.serializer(), FolderNameBody(name)),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, Folder.serializer())
    }

    override suspend fun renameFolder(id: String, name: String): Folder {
        val endpoint = Endpoint(
            method = Endpoint.Method.PATCH,
            path = "/api/folders/$id",
            body = Endpoint.jsonBody(FolderNameBody.serializer(), FolderNameBody(name)),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, Folder.serializer())
    }

    override suspend fun deleteFolder(id: String) {
        val endpoint = Endpoint(
            method = Endpoint.Method.DELETE,
            path = "/api/folders/$id",
            requiresAuth = true,
        )
        apiClient.sendNoContent(endpoint)
    }

    override suspend fun bulkUpdate(ids: List<String>, action: BulkAction, folderId: String?): BulkUpdateResult {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/conversations/bulk",
            body = encodeBulkBody(ids, action, folderId),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, BulkUpdateResult.serializer())
    }

    override suspend fun fork(id: String, throughMessageId: String): ForkResult {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/conversations/$id/fork",
            body = Endpoint.jsonBody(ForkBody.serializer(), ForkBody(throughMessageId)),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, ForkResult.serializer())
    }

    override suspend fun setMessagePinned(conversationId: String, messageId: String, pinned: Boolean): List<String> {
        val endpoint = Endpoint(
            method = Endpoint.Method.POST,
            path = "/api/conversations/$conversationId/pins",
            body = Endpoint.jsonBody(PinBody.serializer(), PinBody(messageId, pinned)),
            requiresAuth = true,
        )
        return apiClient.send(endpoint, PinResult.serializer()).pinnedMessageIds
    }

    override suspend fun export(id: String, format: String): Pair<ByteArray, String> {
        val endpoint = Endpoint(
            method = Endpoint.Method.GET,
            path = "/api/conversations/$id/export",
            queryItems = listOf("format" to format),
            requiresAuth = true,
        )
        // Export is bytes, not JSON — use the generic send path via a raw GET
        // through OakApiClient.send which expects JSON. Fall back to a dedicated
        // perform via a tiny envelope isn't available, so we decode as a last
        // resort: the client still maps HTTP errors. For md/pdf we need raw
        // bytes; OakApiClient.send will try to JSON-decode. Use sendNoContent
        // is wrong. We encode the request the same way and let callers share
        // via a JSON-less path: POST-style isn't needed. See [OakApiClient]
        // — we'll fetch through send and accept Decoding only if the body
        // isn't JSON. Prefer a dedicated raw method if added later.
        val bytes = apiClient.sendBytes(endpoint)
        return bytes to "conversation.$format"
    }
}

@Serializable
private data class ArchivedBody(val archived: Boolean)

@Serializable
private data class FolderNameBody(val name: String)

@Serializable
private data class ForkBody(@SerialName("through_message_id") val throughMessageId: String)

@Serializable
private data class PinBody(@SerialName("message_id") val messageId: String, val pinned: Boolean)

private fun encodeFolderPatch(folderId: String?): String =
    buildJsonObject { put("folder_id", folderId) }.toString()

private fun encodeBulkBody(ids: List<String>, action: BulkAction, folderId: String?): String =
    buildJsonObject {
        put("ids", buildJsonArray { ids.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) } })
        put(
            "action",
            when (action) {
                BulkAction.Delete -> "delete"
                BulkAction.Archive -> "archive"
                BulkAction.Unarchive -> "unarchive"
                BulkAction.Move -> "move"
            },
        )
        if (folderId != null || action == BulkAction.Move) {
            put("folder_id", folderId)
        }
    }.toString()

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
