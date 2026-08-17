import SwiftUI
import UIKit

/// Dependency container for the app's services, injected through the SwiftUI
/// environment so view models resolve **service protocols** (never `Live…`
/// concretes) and previews/tests can substitute stub implementations
/// (conventions.md "SwiftUI / state").
///
/// This is the app's **composition root**: `live()` constructs the real network
/// stack once (a single ``TokenStore`` + ``OakAPIClient``, shared by every
/// service) and the three feature services over it. Views read the container
/// from the environment and hand the needed service to a screen's view model —
/// e.g. `AccountViewModel(auth: services.auth, …)`.
///
/// Keeping the container itself `Sendable` is fine because every service protocol
/// is declared `: Sendable` (and each `Live…` service is a value type over an
/// immutable actor reference).
struct ServiceContainer: Sendable {
  /// The sign-in lifecycle (email-OTP request/verify, launch restore, sign-out,
  /// account deletion). Backed by ``LiveAuthService`` in production.
  let auth: any AuthService

  /// Durable, signed-in-only chat history (list, load, rename/pin/delete, the
  /// guest→sign-in import). Backed by ``LiveHistoryService`` in production.
  let history: any HistoryService

  /// One chat turn → a live `SSEEvent` stream. Backed by ``LiveChatService`` in
  /// production.
  let chat: any ChatService

  /// The artifact-viewer data seam (entity profiles + saved-team detail) read by
  /// ``ArtifactViewModel``. Backed by ``LiveArtifactService`` in production.
  let artifact: any ArtifactService

  /// The team-builder seam (list/create/update/delete/duplicate/import/export)
  /// read by ``TeamsListViewModel``/``TeamEditorViewModel``. Backed by
  /// ``LiveTeamService`` in production. (The protocol + live implementation have
  /// existed since the Teams feature was built; this is the container wiring that
  /// was missing — see `RootView`'s Teams tab.)
  let teams: any TeamService

  /// The team-builder entity-picker seam (typeahead search, per-species learnsets, batch
  /// sprites) read by ``TeamEditorViewModel``'s pickers. Backed by ``LiveDexLookupService``
  /// in production. Public/read-only — no auth gate.
  let dexLookup: any DexLookupService

  /// The team-builder assistant seam — one turn → a live ``BuilderSSEEvent`` stream,
  /// read by ``TeamsAssistantViewModel``. Backed by ``LiveTeamsAssistantService`` in
  /// production (over the same ``SSEClient`` the chat stream borrows). Signed-in only.
  let teamsAssistant: any TeamsAssistantService

  /// The voice-mode HTTP seam — token mint, tool relay, transcript persist
  /// (`POST /api/voice/*`). Backed by ``LiveVoiceService`` in production.
  /// Signed-in only.
  let voice: any VoiceService

  /// Soft-update seam (App Store Lookup). Backed by ``LiveUpdateService`` in
  /// production — a separate host from the Oak API, no Bearer token.
  let updates: any UpdateService

  /// The production wiring (real `Live…` services).
  ///
  /// All services share **one** ``TokenStore`` (the Keychain) and **one**
  /// ``OakAPIClient`` (the `URLSession`, base URL, and Bearer-header policy), so a
  /// token written on `verify` is read identically by every authed request and the
  /// chat byte stream alike. ``SSEClient`` borrows the same client for the chat
  /// stream. ``updates`` is independent (iTunes Lookup).
  static func live() -> ServiceContainer {
    let tokenStore = TokenStore()
    let api = OakAPIClient(baseURL: BaseURL.current, tokenStore: tokenStore)
    return ServiceContainer(
      auth: LiveAuthService(apiClient: api, tokenStore: tokenStore),
      history: LiveHistoryService(apiClient: api),
      chat: LiveChatService(sseClient: SSEClient(apiClient: api)),
      artifact: LiveArtifactService(apiClient: api),
      teams: LiveTeamService(apiClient: api),
      dexLookup: LiveDexLookupService(apiClient: api),
      teamsAssistant: LiveTeamsAssistantService(sseClient: SSEClient(apiClient: api)),
      voice: LiveVoiceService(apiClient: api),
      updates: LiveUpdateService()
    )
  }

  /// A preview/test-friendly container whose services never touch the network.
  ///
  /// In DEBUG it is built from the in-file `PreviewStub…` services below (so
  /// SwiftUI previews render instantly and offline); in release there is no preview
  /// surface, so it falls back to ``live()``.
  static func preview() -> ServiceContainer {
    #if DEBUG
    ServiceContainer(
      auth: PreviewStubAuthService(),
      history: PreviewStubHistoryService(),
      chat: PreviewStubChatService(),
      artifact: PreviewStubArtifactService(),
      teams: PreviewStubTeamService(),
      dexLookup: EmptyDexLookupService(),
      teamsAssistant: PreviewStubTeamsAssistantService(),
      voice: PreviewStubVoiceService(),
      updates: PreviewStubUpdateService()
    )
    #else
    live()
    #endif
  }
}

private struct ServiceContainerKey: EnvironmentKey {
  static let defaultValue = ServiceContainer.live()
}

extension EnvironmentValues {
  /// The injected service container. Read it from a view, then hand the needed
  /// service to the screen's view model.
  var services: ServiceContainer {
    get { self[ServiceContainerKey.self] }
    set { self[ServiceContainerKey.self] = newValue }
  }
}

extension View {
  /// Injects the service container into the environment for descendant views.
  func oakServices(_ container: ServiceContainer) -> some View {
    environment(\.services, container)
  }
}

// MARK: - Preview stubs (DEBUG only)

#if DEBUG

/// No-network ``AuthService`` for SwiftUI previews: stays a guest, and `verify`
/// echoes back a returning ``Account`` so the auth flow renders without a server.
///
/// Named `PreviewStub…` (not `Fake…`) so it never collides with the `private`
/// per-view preview services already declared inside individual feature files.
struct PreviewStubAuthService: AuthService {
  func requestCode(email: String) async throws {}

  func verify(email: String, code: String) async throws -> Account {
    Account(email: email, created: false)
  }

  func me() async throws -> MeSnapshot { .guest }

  func signOut() async throws {}

  func deleteAccount() async throws {}
}

/// No-network ``HistoryService`` for SwiftUI previews: an empty conversation list,
/// a trivially-empty detail on load, and a no-op import.
struct PreviewStubHistoryService: HistoryService {
  func list(query: String?, format: Format?) async throws -> [ConversationSummary] { [] }

  func get(id: String) async throws -> ConversationDetail {
    ConversationDetail(
      id: id,
      title: "Preview conversation",
      format: .scarletViolet,
      pinned: false,
      turns: []
    )
  }

  func rename(id: String, title: String) async throws {}

  func setPinned(id: String, pinned: Bool) async throws {}

  func delete(id: String) async throws {}

  func importGuestThread(
    sessionId: String,
    format: Format,
    turns: [ChatTurn]
  ) async throws -> String? { nil }
}

/// No-network ``ArtifactService`` for SwiftUI previews: every fetch resolves to
/// `nil`, so a preview that happens to open the viewer shows the honest
/// "couldn't load" state instead of touching the network.
struct PreviewStubArtifactService: ArtifactService {
  func entity(kind: EntityKind, q: String, format: Format) async -> EntityArtifact? { nil }

  func savedTeam(id: String) async -> (team: Team, validation: TeamValidationResult)? { nil }
}

/// No-network ``TeamService`` for SwiftUI previews: an empty library, and every
/// mutation throws `.http(404)` (previews never drive Teams mutations, but a
/// stray call fails loudly rather than fabricating a fake saved team).
struct PreviewStubTeamService: TeamService {
  private var notFound: OakError { .http(status: 404, code: "not_found", message: "Preview stub.") }

  func list(format: Format?) async throws -> [TeamSummary] { [] }

  func get(id: String) async throws -> (team: Team, validation: TeamValidationResult) {
    throw notFound
  }

  func create(
    format: Format,
    name: String?,
    members: [TeamMember]?
  ) async throws -> (team: Team, validation: TeamValidationResult) {
    throw notFound
  }

  func update(
    id: String,
    name: String?,
    members: [TeamMember]?
  ) async throws -> (team: Team, validation: TeamValidationResult) {
    throw notFound
  }

  func delete(id: String) async throws { throw notFound }

  func duplicate(id: String) async throws -> (team: Team, validation: TeamValidationResult) {
    throw notFound
  }

  func importPaste(
    format: Format,
    paste: String
  ) async throws -> (team: Team, validation: TeamValidationResult, notes: [ImportNote]) {
    throw notFound
  }

  func exportPaste(id: String) async throws -> String { throw notFound }

  func analyze(format: Format, members: [TeamMember]) async throws -> TeamAnalysis {
    .unavailable(format: format)
  }
}

/// No-network ``ChatService`` for SwiftUI previews: a tiny scripted stream that
/// opens the answer and yields one markdown chunk, then finishes — enough for the
/// thread to render its streaming state without a server or terminal `OakAnswer`.
struct PreviewStubChatService: ChatService {
  func send(
    sessionId: String,
    message: String,
    images: [UIImage],
    scopeSeed: Format?
  ) -> AsyncThrowingStream<SSEEvent, Error> {
    AsyncThrowingStream { continuation in
      continuation.yield(.answerStart)
      continuation.yield(.answerDelta(text: "Preview answer."))
      continuation.finish()
    }
  }

  func resumeStream(turnId: String, sessionId: String) -> AsyncThrowingStream<SSEEvent, Error> {
    AsyncThrowingStream { $0.finish() }
  }

  func stop(turnId: String, sessionId: String) async throws {}
}

/// No-network ``TeamsAssistantService`` for SwiftUI previews: a tiny scripted stream
/// that streams one markdown chunk and finishes with an advice-only ``BuilderAnswer``
/// (no patch), so the panel renders its streaming + answer states without a server.
struct PreviewStubTeamsAssistantService: TeamsAssistantService {
  func send(
    sessionId: String,
    message: String,
    draft: TeamsAssistantDraft
  ) -> AsyncThrowingStream<BuilderSSEEvent, Error> {
    AsyncThrowingStream { continuation in
      continuation.yield(.answerStart)
      continuation.yield(.answerDelta(text: "Here's a thought on your team."))
      continuation.yield(
        .answer(
          BuilderAnswer(answerMarkdown: "Here's a thought on your team.", teamPatch: nil)))
      continuation.finish()
    }
  }
}

/// No-network ``VoiceService`` for SwiftUI previews: `fetchToken`/`execTool` fail
/// honestly (previews never have a real ephemeral token or realtime session to
/// back them) and `postTranscript` is a no-op, matching its fire-and-forget
/// contract.
struct PreviewStubVoiceService: VoiceService {
  func fetchToken(sessionId: String, format: Format) async throws -> VoiceTokenResponse {
    throw OakError.http(status: 503, code: "unavailable", message: "Preview stub.")
  }

  func execTool(sessionId: String, format: Format, name: String, arguments: String) async throws -> JSONValue {
    throw OakError.http(status: 503, code: "unavailable", message: "Preview stub.")
  }

  func postTranscript(sessionId: String, format: Format, userText: String, assistantText: String) async {}
}

/// No-network ``UpdateService`` for SwiftUI previews: always reports up-to-date so
/// the soft-update sheet never appears over a canvas preview.
struct PreviewStubUpdateService: UpdateService {
  func checkForUpdate(localVersion: String) async -> UpdateCheckResult { .upToDate }
}

#endif
