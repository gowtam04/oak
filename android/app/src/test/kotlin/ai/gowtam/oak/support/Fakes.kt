package ai.gowtam.oak.support

import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.Account
import ai.gowtam.oak.services.ArtifactService
import ai.gowtam.oak.services.AuthService
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.services.ChatService
import ai.gowtam.oak.services.MeSnapshot
import ai.gowtam.oak.services.DexLookupService
import ai.gowtam.oak.services.HistoryService
import ai.gowtam.oak.services.ScopeService
import ai.gowtam.oak.services.ShareService
import ai.gowtam.oak.services.SourceImage
import ai.gowtam.oak.services.TeamService
import ai.gowtam.oak.services.TeamsAssistantService
import ai.gowtam.oak.wire.BuilderAnswer
import ai.gowtam.oak.wire.BuilderSseEvent
import ai.gowtam.oak.wire.BulkAction
import ai.gowtam.oak.wire.BulkUpdateResult
import ai.gowtam.oak.wire.ChatRecovery
import ai.gowtam.oak.wire.ChatRequest
import ai.gowtam.oak.wire.ChatTurn
import ai.gowtam.oak.wire.ConversationDetail
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.CreatedShare
import ai.gowtam.oak.wire.Folder
import ai.gowtam.oak.wire.ForkResult
import ai.gowtam.oak.wire.PersistScopeResult
import ai.gowtam.oak.wire.RegulationMeta
import ai.gowtam.oak.wire.PublicShare
import ai.gowtam.oak.wire.ShareListItem
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ImportNote
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.SearchMatch
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.TeamAnalysis
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamSummary
import ai.gowtam.oak.wire.TeamWarning
import ai.gowtam.oak.wire.TeamsAssistantDraft
import kotlinx.coroutines.CompletableDeferred
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
    var meResult: MeSnapshot = MeSnapshot.Guest,
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

    override suspend fun me(): MeSnapshot {
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

    data class Quadruple(
        val sessionId: String,
        val message: String,
        val images: List<SourceImage>,
        val scopeSeed: Format?,
        val recovery: ChatRecovery? = null,
        val mentionedTeamIds: List<String>? = null,
    )

    override fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
    ): Flow<ai.gowtam.oak.wire.SseEvent> =
        send(sessionId, message, images, scopeSeed, recovery = null, mentionedTeamIds = null)

    override fun send(
        sessionId: String,
        message: String,
        images: List<SourceImage>,
        scopeSeed: Format?,
        recovery: ChatRecovery?,
        mentionedTeamIds: List<String>?,
    ): Flow<ai.gowtam.oak.wire.SseEvent> {
        sendWithImagesCalls += Quadruple(sessionId, message, images, scopeSeed, recovery, mentionedTeamIds)
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
    val listFoldersCalls = mutableListOf<Unit>()
    val setArchivedCalls = mutableListOf<Pair<String, Boolean>>()
    val setFolderCalls = mutableListOf<Pair<String, String?>>()
    val bulkCalls = mutableListOf<Triple<List<String>, BulkAction, String?>>()
    val forkCalls = mutableListOf<Pair<String, String>>()
    val pinCalls = mutableListOf<Triple<String, String, Boolean>>()
    var folders: List<Folder> = emptyList()
    var bulkResult: BulkUpdateResult = BulkUpdateResult()
    var forkResult: ForkResult = ForkResult(id = "fork-1", title = "Fork")
    var pinnedMessageIds: List<String> = emptyList()

    override suspend fun list(query: String?, format: Format?): List<ConversationSummary> {
        listCalls += query to format
        listError?.let { throw it }
        return listResult
    }

    override suspend fun list(
        query: String?,
        format: Format?,
        folderId: String?,
        archived: Boolean?,
        includeArchived: Boolean,
    ): List<ConversationSummary> {
        listCalls += query to format
        listError?.let { throw it }
        return listResult.filter { row ->
            val folderOk = folderId == null ||
                (folderId == "unfiled" && row.folderId == null) ||
                row.folderId == folderId
            val archiveOk = when {
                includeArchived -> true
                archived == true -> row.archived
                else -> !row.archived
            }
            folderOk && archiveOk
        }
    }

    override suspend fun setArchived(id: String, archived: Boolean) {
        setArchivedCalls += id to archived
    }

    override suspend fun setFolder(id: String, folderId: String?) {
        setFolderCalls += id to folderId
    }

    override suspend fun listFolders(): List<Folder> {
        listFoldersCalls += Unit
        return folders
    }

    override suspend fun createFolder(name: String): Folder {
        val folder = Folder(id = "folder-${folders.size + 1}", name = name, createdAt = 0L)
        folders = folders + folder
        return folder
    }

    override suspend fun renameFolder(id: String, name: String): Folder {
        val updated = folders.first { it.id == id }.copy(name = name)
        folders = folders.map { if (it.id == id) updated else it }
        return updated
    }

    override suspend fun deleteFolder(id: String) {
        folders = folders.filterNot { it.id == id }
        listResult = listResult.map { if (it.folderId == id) it.copy(folderId = null) else it }
    }

    override suspend fun bulkUpdate(ids: List<String>, action: BulkAction, folderId: String?): BulkUpdateResult {
        bulkCalls += Triple(ids, action, folderId)
        return bulkResult
    }

    override suspend fun fork(id: String, throughMessageId: String): ForkResult {
        forkCalls += id to throughMessageId
        return forkResult
    }

    override suspend fun export(id: String, format: String): Pair<ByteArray, String> {
        return ByteArray(0) to "conversation.$format"
    }

    override suspend fun setMessagePinned(conversationId: String, messageId: String, pinned: Boolean): List<String> {
        pinCalls += Triple(conversationId, messageId, pinned)
        pinnedMessageIds = if (pinned) {
            (pinnedMessageIds + messageId).distinct()
        } else {
            pinnedMessageIds.filterNot { it == messageId }
        }
        return pinnedMessageIds
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
    /** Default analyze result when [analyzeScript] is exhausted / unset. */
    var analyzeResult: TeamAnalysis = TeamAnalysis.Unavailable(Format.Champions),
    /** Default analyze error when [analyzeScript] is exhausted / unset (thrown before returning). */
    var analyzeError: OakError? = null,
    /** Optional per-call script (result / thrown error / a gate to suspend on) — overrides the defaults while non-empty. */
    var analyzeScript: ArrayDeque<AnalyzeStep>? = null,
    /** When set, every create parks on this gate until the test completes it. */
    var createGate: CompletableDeferred<Unit>? = null,
) : TeamService {
    val listCalls = mutableListOf<Boolean>()
    val getCalls = mutableListOf<String>()
    val createCalls = mutableListOf<Triple<Format, String?, List<TeamMember>?>>()
    val updateCalls = mutableListOf<Triple<String, String?, List<TeamMember>?>>()
    val deleteCalls = mutableListOf<String>()
    val duplicateCalls = mutableListOf<String>()
    val importPasteCalls = mutableListOf<Pair<Format, String>>()
    val exportPasteCalls = mutableListOf<String>()
    val analyzeCalls = mutableListOf<Pair<Format, List<TeamMember>>>()

    /** One scripted `analyze` outcome: optionally suspend on [gate], then throw [error] or return [result]. */
    data class AnalyzeStep(
        val result: TeamAnalysis? = null,
        val error: OakError? = null,
        val gate: CompletableDeferred<Unit>? = null,
    )

    override suspend fun list(archived: Boolean): List<TeamSummary> {
        listCalls += archived
        error?.let { throw it }
        return listResult.filter { it.format.isArchived == archived }
    }

    override suspend fun get(id: String): Pair<Team, List<TeamWarning>> {
        getCalls += id
        error?.let { throw it }
        return teamResult
    }

    override suspend fun create(format: Format, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>> {
        createCalls += Triple(format, name, members)
        createGate?.await()
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

    override suspend fun analyze(format: Format, members: List<TeamMember>): TeamAnalysis {
        analyzeCalls += format to members
        val step = analyzeScript?.removeFirstOrNull()
        if (step != null) {
            step.gate?.await()
            step.error?.let { throw it }
            return step.result ?: analyzeResult
        }
        analyzeError?.let { throw it }
        return analyzeResult
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

// ---------------------------------------------------------------------------
// ScopeService / ShareService
// ---------------------------------------------------------------------------

class FakeScopeService(
    var result: PersistScopeResult = PersistScopeResult(format = Format.NationalDex),
    var currentResult: RegulationMeta? = null,
    var error: OakError? = null,
) : ScopeService {
    val persistCalls = mutableListOf<Triple<Format, String?, String>>()

    override suspend fun persist(format: Format, conversationId: String?, sessionId: String): PersistScopeResult {
        persistCalls += Triple(format, conversationId, sessionId)
        error?.let { throw it }
        return result.copy(format = format)
    }

    override suspend fun current(): RegulationMeta? = currentResult
}

class FakeShareService(
    var created: CreatedShare = CreatedShare(id = "share-1", url = "https://oak.gowtam.ai/a/share-1"),
    var listResult: List<ShareListItem> = emptyList(),
    var publicResult: PublicShare? = null,
    var importTeamId: String = "team-imported",
    var error: OakError? = null,
) : ShareService {
    val createCalls = mutableListOf<Pair<String, String>>()
    val revokeCalls = mutableListOf<String>()
    val publicCalls = mutableListOf<String>()

    override suspend fun create(conversationId: String, assistantMessageId: String): CreatedShare {
        createCalls += conversationId to assistantMessageId
        error?.let { throw it }
        return created
    }

    override suspend fun list(): List<ShareListItem> {
        error?.let { throw it }
        return listResult
    }

    override suspend fun revoke(id: String) {
        revokeCalls += id
        error?.let { throw it }
        listResult = listResult.filterNot { it.id == id }
    }

    override suspend fun getPublic(id: String): PublicShare {
        publicCalls += id
        error?.let { throw it }
        return publicResult ?: throw OakError.Http(404, "not_found", "Share not found")
    }

    override suspend fun importTeam(id: String): String {
        error?.let { throw it }
        return importTeamId
    }
}

// ---------------------------------------------------------------------------
// P8 answer-cards fakes (compile-fail until the production interfaces land)
// ---------------------------------------------------------------------------

/**
 * `POST /api/calc` — never-throw. Configure [result] (`null` = transport fold).
 * Requirement refs: CALC-BR-1.
 */
class FakeCalcService(
    var result: ai.gowtam.oak.wire.CalcResult? = null,
) : ai.gowtam.oak.services.CalcService {
    val estimateCalls = mutableListOf<ai.gowtam.oak.wire.CalcScenario>()

    override suspend fun estimate(scenario: ai.gowtam.oak.wire.CalcScenario): ai.gowtam.oak.wire.CalcResult? {
        estimateCalls += scenario
        return result
    }
}

/**
 * `POST /api/voice/hydrate` retry. Android has no mic session — this is the
 * history-path Retry only (VOICE-AC-3.1).
 */
class FakeVoiceHydrateService(
    var status: ai.gowtam.oak.wire.VoiceHydrateStatus = ai.gowtam.oak.wire.VoiceHydrateStatus(
        assistantMessageId = "a1",
        status = ai.gowtam.oak.wire.VoiceHydrateStatus.Status.Running,
    ),
) : ai.gowtam.oak.services.VoiceHydrateService {
    val retryCalls = mutableListOf<Pair<String, String>>()

    override suspend fun retry(
        conversationId: String,
        assistantMessageId: String,
    ): ai.gowtam.oak.wire.VoiceHydrateStatus {
        retryCalls += conversationId to assistantMessageId
        return status.copy(
            assistantMessageId = assistantMessageId,
            status = ai.gowtam.oak.wire.VoiceHydrateStatus.Status.Running,
        )
    }
}

/**
 * Conversation pin strip (`/api/conversations/:id/artifact-pins`).
 * Requirement refs: PIN-US-1, PIN-AC-3.1, AUTH-BR-1.
 */
class FakeArtifactPinService(
    var listResult: List<ai.gowtam.oak.wire.PinnedArtifactSummary> = emptyList(),
    var createResult: CreateResult = CreateResult.Ok,
) : ai.gowtam.oak.services.ArtifactPinService {
    data class CreateCall(
        val conversationId: String,
        val kind: ai.gowtam.oak.features.artifact.ArtifactPinKind,
        val title: String,
    )

    sealed interface CreateResult {
        data object Ok : CreateResult
        data object Cap : CreateResult
        data object Error : CreateResult
    }

    val createCalls = mutableListOf<CreateCall>()
    val deleteCalls = mutableListOf<Pair<String, String>>()
    val getCalls = mutableListOf<Pair<String, String>>()
    private val snapshots = mutableMapOf<String, Any?>()

    override suspend fun list(conversationId: String): List<ai.gowtam.oak.wire.PinnedArtifactSummary> = listResult

    override suspend fun create(
        conversationId: String,
        kind: ai.gowtam.oak.features.artifact.ArtifactPinKind,
        title: String,
        snapshot: Any?,
    ): ai.gowtam.oak.services.CreatePinResult {
        createCalls += CreateCall(conversationId, kind, title)
        return when (createResult) {
            CreateResult.Ok -> {
                val pin = ai.gowtam.oak.wire.PinnedArtifactSummary(
                    id = "pin-${createCalls.size}",
                    kind = kind.rawValue,
                    title = title,
                    createdAt = 0L,
                )
                listResult = listResult + pin
                snapshots[pin.id] = snapshot
                ai.gowtam.oak.services.CreatePinResult.Ok(pin, listResult)
            }
            CreateResult.Cap -> ai.gowtam.oak.services.CreatePinResult.Cap(max = 5)
            CreateResult.Error -> ai.gowtam.oak.services.CreatePinResult.Error("couldnt_pin")
        }
    }

    override suspend fun get(conversationId: String, pinId: String): ai.gowtam.oak.services.PinnedArtifact? {
        getCalls += conversationId to pinId
        val summary = listResult.firstOrNull { it.id == pinId } ?: return null
        val snapshot = when (val stored = snapshots[pinId]) {
            is kotlinx.serialization.json.JsonElement -> stored
            is ai.gowtam.oak.features.artifact.PinSnapshotBody ->
                ai.gowtam.oak.wire.OakJson.encodeToJsonElement(
                    ai.gowtam.oak.features.artifact.PinSnapshotBody.serializer(),
                    stored,
                )
            else -> null
        }
        return ai.gowtam.oak.services.PinnedArtifact(
            id = summary.id,
            kind = summary.kind,
            title = summary.title,
            snapshot = snapshot,
        )
    }

    override suspend fun delete(conversationId: String, pinId: String): List<ai.gowtam.oak.wire.PinnedArtifactSummary>? {
        deleteCalls += conversationId to pinId
        listResult = listResult.filterNot { it.id == pinId }
        return listResult
    }
}

/**
 * `PATCH /api/account/preferences` — signed-in compact/full (COMPACT-US-2).
 * Guest writes must not call [setAnswerDensity].
 */
class FakePreferencesService : ai.gowtam.oak.services.PreferencesService {
    val patchCalls = mutableListOf<ai.gowtam.oak.wire.AnswerDensity>()
    var lastWritten: ai.gowtam.oak.wire.AnswerDensity? = null

    override suspend fun setAnswerDensity(density: ai.gowtam.oak.wire.AnswerDensity): ai.gowtam.oak.wire.AnswerDensity {
        patchCalls += density
        lastWritten = density
        return density
    }
}
