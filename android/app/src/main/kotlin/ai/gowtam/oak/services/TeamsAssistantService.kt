package ai.gowtam.oak.services

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.networking.SseClient
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.TeamsAssistantDraft
import ai.gowtam.oak.wire.TeamsAssistantRequest
import kotlinx.coroutines.flow.Flow

/**
 * One team-builder assistant turn → a live [BuilderSseEvent] stream — the sibling of
 * [ChatService] for `POST /api/teams/assistant` (mirrors iOS `TeamsAssistantService`).
 * View models depend on this **interface** so they unit-test against a fake.
 *
 * [send] is synchronous and returns the flow immediately. The endpoint is
 * SIGNED-IN ONLY (teams are account-scoped): a guest's missing Bearer surfaces as a
 * `401` → [OakError.Unauthorized] thrown from the flow before any event is yielded,
 * and a rate-limit as [OakError.RateLimited]. Every in-domain failure rides a normal
 * `answer` event whose `BuilderAnswer` carries the response — never the `error`
 * channel (mirrors the chat contract).
 */
interface TeamsAssistantService {
    /**
     * Opens the assistant stream for one turn.
     *
     * - [sessionId]: the per-editor conversation id (in-memory history only, server-side).
     * - [message]: the user's typed request.
     * - [draft]: the LIVE, unsaved editor draft (name/format/members) — rides EVERY
     *   turn, since `draft.format` IS the turn's scope and the model reasons over the
     *   current on-screen team.
     */
    fun send(sessionId: String, message: String, draft: TeamsAssistantDraft): Flow<BuilderSseEvent>
}

/**
 * Production [TeamsAssistantService] over [SseClient] (which borrows `OakApiClient`
 * for the Bearer header + base URL).
 */
class LiveTeamsAssistantService(private val sseClient: SseClient) : TeamsAssistantService {
    override fun send(sessionId: String, message: String, draft: TeamsAssistantDraft): Flow<BuilderSseEvent> =
        sseClient.streamBuilder(TeamsAssistantRequest(sessionId = sessionId, message = message, draft = draft))
}
