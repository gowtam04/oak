package ai.gowtam.oak.support

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.Account
import ai.gowtam.oak.services.ArtifactService
import ai.gowtam.oak.services.AuthService
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.services.ChatService
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.services.HistoryService
import ai.gowtam.oak.services.SourceImage
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.services.TeamsAssistantService
import ai.gowtam.oak.wire.BuilderAnswer
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.ConversationDetail
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ImportNote
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.SearchMatch
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamSummary
import ai.gowtam.oak.wire.TeamWarning
import ai.gowtam.oak.wire.TeamsAssistantDraft
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Fake implementations of every service interface, for later VM-phase unit tests
 * (implementation-plan.md P4 deliverables). Each fake is configurable (scripted
 * results / a thrown [OakError]) and records the calls it received so a test can
 * assert what a view model actually asked for. Mirrors the `Fake…`/`PreviewStub…`
 * doubles iOS keeps beside `ServiceContainer`, kept out of `main/` since only tests
 * (this module and later VM phases) construct them.
 */

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

class FakeAuthService(
    var meResult: AuthState = AuthState.Guest,
    var verifyResult: Account = Account(email = "fake@example.com", created = false),
    var requestCodeError: OakError? = null,
    var verifyError: OakError? = null,
    var meError: OakError? = null,
    var signOutError: OakError? = null,
    var deleteAccountError: OakError? = null,
) : AuthService {
    val requestCodeCalls = mutableListOf<String>()
    val verifyCalls = mutableListOf<Pair<String, String>>()
    var meCallCount = 0
    var signOutCallCount = 0
    var deleteAccountCallCount = 0

    override suspend fun requestCode(email: String) {
        requestCodeCalls += email
        requestCodeError?.let { throw it }
    }

    override suspend fun verify(email: String, code: String): Account {
        verifyCalls += email to code
        verifyError?.let { throw it }
        return verifyResult
    }

    override suspend fun me(): AuthState {
        meCallCount++
        meError?.let { throw it }
        return meResult
    }

    override suspend fun signOut() {
        signOutCallCount++
        signOutError?.let { throw it }
    }

    override suspend fun deleteAccount() {
        deleteAccountCallCount++
        deleteAccountError?.let { throw it }
    }
}

// ---------------------------------------------------------------------------
// ChatService
// ---------------------------------------------------------------------------

class FakeChatService(
    var scriptedEvents: List<ai.gowtam.oak.wire.SseEvent> = emptyList(),
    var error: OakError? = null,
    /** Events replayed by [resume] (the reattach path); defaults to [scriptedEvents]. */
    var resumeEvents: List<ai.gowtam.oak.wire.SseEvent>? = null,
    /** A pre-stream failure thrown by [resume] (e.g. `OakError.Http(404, …)` for a dead turn). */
    var resumeError: OakError? = null,
) : ChatService {
    val sendWithImagesCalls = mutableListOf<Quadruple>()
    val sendRequestCalls = mutableListOf<ChatRequest>()
    val resumeCalls = mutableListOf<Pair<String, String>>()
    val stopCalls = mutableListOf<Pair<String, String>>()

    data class Quadruple(val sessionId: String, val message: String, val images: List<SourceImage>, val scopeSeed: Format?)

    override fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
    ): Flow<ai.gowtam.oak.wire.SseEvent> {
        sendWithImagesCalls += Quadruple(sessionId, message, images, scopeSeed)
        return scriptedFlow()
    }

    override fun send(request: ChatRequest): Flow<ai.gowtam.oak.wire.SseEvent> {
        sendRequestCalls += request
        return scriptedFlow()
    }

    override fun resume(turnId: String, sessionId: String): Flow<ai.gowtam.oak.wire.SseEvent> {
        resumeCalls += turnId to sessionId
        return flow {
            resumeError?.let { throw it }
            (resumeEvents ?: scriptedEvents).forEach { emit(it) }
        }
    }

    override suspend fun stop(turnId: String, sessionId: String) {
        stopCalls += turnId to sessionId
    }

    private fun scriptedFlow(): Flow<ai.gowtam.oak.wire.SseEvent> = flow {
        error?.let { throw it }
        scriptedEvents.forEach { emit(it) }
    }
}

// ---------------------------------------------------------------------------
// HistoryService
// ---------------------------------------------------------------------------

class FakeHistoryService(
    var listResult: List<ConversationSummary> = emptyList(),
    var getResult: (String) -> ConversationDetail = { id ->
        ConversationDetail(id = id, title = "Fake conversation", format = Format.Champions, pinned = false, turns = emptyList())
    },
    var importResult: String? = null,
    var listError: OakError? = null,
    var getError: OakError? = null,
    var renameError: OakError? = null,
    var setPinnedError: OakError? = null,
    var deleteError: OakError? = null,
    var importError: OakError? = null,
) : HistoryService {
    val listCalls = mutableListOf<Pair<String?, Format?>>()
    val getCalls = mutableListOf<String>()
    val renameCalls = mutableListOf<Pair<String, String>>()
    val setPinnedCalls = mutableListOf<Pair<String, Boolean>>()
    val deleteCalls = mutableListOf<String>()
    val importCalls = mutableListOf<Triple<String, Format, List<ChatTurn>>>()

    override suspend fun list(query: String?, format: Format?): List<ConversationSummary> {
        listCalls += query to format
        listError?.let { throw it }
        return listResult
    }

    override suspend fun get(id: String): ConversationDetail {
        getCalls += id
        getError?.let { throw it }
        return getResult(id)
    }

    override suspend fun rename(id: String, title: String) {
        renameCalls += id to title
        renameError?.let { throw it }
    }

    override suspend fun setPinned(id: String, pinned: Boolean) {
        setPinnedCalls += id to pinned
        setPinnedError?.let { throw it }
    }

    override suspend fun delete(id: String) {
        deleteCalls += id
        deleteError?.let { throw it }
    }

    override suspend fun importGuestThread(sessionId: String, format: Format, turns: List<ChatTurn>): String? {
        importCalls += Triple(sessionId, format, turns)
        importError?.let { throw it }
        return importResult
    }
}

// ---------------------------------------------------------------------------
// TeamService
// ---------------------------------------------------------------------------

class FakeTeamService(
    var listResult: List<TeamSummary> = emptyList(),
    var teamResult: Pair<Team, List<TeamWarning>> = fakeTeam() to emptyList(),
    var importPasteResult: Triple<Team, List<TeamWarning>, List<ImportNote>> = Triple(fakeTeam(), emptyList(), emptyList()),
    var exportPasteResult: String = "",
    var error: OakError? = null,
) : TeamService {
    val listCalls = mutableListOf<Format?>()
    val getCalls = mutableListOf<String>()
    val createCalls = mutableListOf<Triple<Format, String?, List<TeamMember>?>>()
    val updateCalls = mutableListOf<Triple<String, String?, List<TeamMember>?>>()
    val deleteCalls = mutableListOf<String>()
    val duplicateCalls = mutableListOf<String>()
    val importPasteCalls = mutableListOf<Pair<Format, String>>()
    val exportPasteCalls = mutableListOf<String>()

    override suspend fun list(format: Format?): List<TeamSummary> {
        listCalls += format
        error?.let { throw it }
        return listResult
    }

    override suspend fun get(id: String): Pair<Team, List<TeamWarning>> {
        getCalls += id
        error?.let { throw it }
        return teamResult
    }

    override suspend fun create(format: Format, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>> {
        createCalls += Triple(format, name, members)
        error?.let { throw it }
        return teamResult
    }

    override suspend fun update(id: String, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>> {
        updateCalls += Triple(id, name, members)
        error?.let { throw it }
        return teamResult
    }

    override suspend fun delete(id: String) {
        deleteCalls += id
        error?.let { throw it }
    }

    override suspend fun duplicate(id: String): Pair<Team, List<TeamWarning>> {
        duplicateCalls += id
        error?.let { throw it }
        return teamResult
    }

    override suspend fun importPaste(format: Format, paste: String): Triple<Team, List<TeamWarning>, List<ImportNote>> {
        importPasteCalls += format to paste
        error?.let { throw it }
        return importPasteResult
    }

    override suspend fun exportPaste(id: String): String {
        exportPasteCalls += id
        error?.let { throw it }
        return exportPasteResult
    }
}

/** A minimal, complete-enough [Team] fixture for fakes that need a default. */
fun fakeTeam(id: String = "team-1"): Team = Team(
    id = id,
    name = "Fake Team",
    format = Format.Champions,
    members = emptyList(),
    createdAt = 0L,
    updatedAt = 0L,
)

// ---------------------------------------------------------------------------
// ArtifactService (never throws — configure the returned value directly)
// ---------------------------------------------------------------------------

class FakeArtifactService(
    var entityResult: EntityArtifact? = null,
    var savedTeamResult: Pair<Team, List<TeamWarning>>? = null,
) : ArtifactService {
    val entityCalls = mutableListOf<Triple<EntityKind, String, Format>>()
    val savedTeamCalls = mutableListOf<String>()

    override suspend fun entity(kind: EntityKind, q: String, format: Format): EntityArtifact? {
        entityCalls += Triple(kind, q, format)
        return entityResult
    }

    override suspend fun savedTeam(id: String): Pair<Team, List<TeamWarning>>? {
        savedTeamCalls += id
        return savedTeamResult
    }
}

// ---------------------------------------------------------------------------
// DexLookupService (never throws — configure the returned value directly)
// ---------------------------------------------------------------------------

class FakeDexLookupService(
    var searchResult: List<SearchMatch> = emptyList(),
    var learnsetResult: List<LearnsetMove> = emptyList(),
    var spritesResult: Map<String, DexSpriteRef> = emptyMap(),
) : DexLookupService {
    val searchCalls = mutableListOf<Triple<EntityKind, String, Format>>()
    val learnsetCalls = mutableListOf<Pair<String, Format>>()
    val spritesCalls = mutableListOf<Pair<List<String>, Format>>()

    override suspend fun search(kind: EntityKind, query: String, format: Format): List<SearchMatch> {
        searchCalls += Triple(kind, query, format)
        return searchResult
    }

    override suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove> {
        learnsetCalls += pokemon to format
        return learnsetResult
    }

    override suspend fun sprites(names: List<String>, format: Format): Map<String, DexSpriteRef> {
        spritesCalls += names to format
        return spritesResult
    }
}

// ---------------------------------------------------------------------------
// TeamsAssistantService
// ---------------------------------------------------------------------------

class FakeTeamsAssistantService(
    var scriptedEvents: List<BuilderSseEvent> = listOf(
        BuilderSseEvent.AnswerStart,
        BuilderSseEvent.Answer(BuilderAnswer(answerMarkdown = "Fake answer.", teamPatch = null)),
    ),
    var error: OakError? = null,
) : TeamsAssistantService {
    val sendCalls = mutableListOf<Triple<String, String, TeamsAssistantDraft>>()

    override fun send(sessionId: String, message: String, draft: TeamsAssistantDraft): Flow<BuilderSseEvent> {
        sendCalls += Triple(sessionId, message, draft)
        return flow {
            error?.let { throw it }
            scriptedEvents.forEach { emit(it) }
        }
    }
}
