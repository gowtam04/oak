import Foundation

/// The durable chat-history seam (component-design.md "Services layer";
/// history-and-teams.md A. — M-HIST-US-1/2/3, M-BR-H1…H4). View models depend on
/// this **protocol** (never `LiveHistoryService`) so they unit-test against
/// `FakeHistoryService`.
///
/// History is **signed-in only** (M-BR-H1): every call attaches the Bearer token
/// when present. The list route is graceful — a guest (no token) gets an empty
/// list, never an error — so ``list(query:format:)`` returns `[]` for guests; the
/// per-conversation reads/writes return `401` (``OakError/unauthorized``) for a
/// guest and the app gates them behind a sign-in prompt. Every method is
/// `async throws` and surfaces failures as the single typed ``OakError`` — except
/// the in-domain "nothing to import" case, which is a normal `nil` result.
protocol HistoryService: Sendable {
  /// Lists the signed-in account's conversations, pinned first then most-recent
  /// (`GET /api/conversations`). `query` filters by title/message text (`?q=`),
  /// `format` filters by data scope (`?format=`). `folderId` is a folder UUID
  /// or the literal `"unfiled"`. `archived` is `false` for the default list
  /// and `true` for Archive; `includeArchived` is search-only. Returns `[]`
  /// for guests (M-BR-H1).
  func list(
    query: String?,
    format: Format?,
    folderId: String?,
    archived: Bool?,
    includeArchived: Bool
  ) async throws -> [ConversationSummary]

  /// Loads one full conversation with its rehydrated turns
  /// (`GET /api/conversations/{id}`), so earlier answers re-render with full
  /// fidelity (M-AC-H3.2). Throws `.unauthorized` for a guest and `.http(404)` for
  /// a conversation that is missing or not owned (isolation, M-BR-H2).
  func get(id: String) async throws -> ConversationDetail

  /// Renames a conversation (`PATCH /api/conversations/{id}` with `{ title }`,
  /// M-AC-H2.4). The server trims + bounds the title (1–120 chars).
  func rename(id: String, title: String) async throws

  /// Pins or unpins a conversation (`PATCH …` with `{ pinned }`, M-AC-H2.4).
  func setPinned(id: String, pinned: Bool) async throws

  /// Permanently deletes a conversation (`DELETE /api/conversations/{id}`,
  /// M-AC-H2.4). The server returns `404` for an already-gone or not-owned id; the
  /// caller (the list view model) treats that as success for idempotent UX.
  func delete(id: String) async throws

  /// The guest→sign-in bulk save (`POST /api/conversations/import`, M-ACCT-US-4).
  /// Uploads the in-memory guest thread's turns under `sessionId` and the scope the
  /// thread resolved to (`format`); the returned id becomes the active
  /// conversation. An empty thread imports nothing and returns `nil` (a normal
  /// value, not an error). The import route prefers `format` over the legacy
  /// `champions_mode` seed (GS-C import flow).
  func importGuestThread(
    sessionId: String,
    format: Format,
    turns: [ChatTurn]
  ) async throws -> String?

  func listFolders() async throws -> [ConversationFolder]
  func createFolder(name: String) async throws -> ConversationFolder
  func renameFolder(id: String, name: String) async throws
  func deleteFolder(id: String) async throws

  func setArchived(id: String, archived: Bool) async throws
  func setFolder(id: String, folderId: String?) async throws

  func bulkUpdate(ids: [String], action: BulkConversationAction, folderId: String?) async throws -> BulkUpdateResponse

  func setTurnPinned(conversationId: String, messageId: String, pinned: Bool) async throws -> [String]
  func fork(conversationId: String, throughMessageId: String) async throws -> ForkResponse
  func exportConversation(id: String, format: ConversationExportFormat) async throws -> Data
}

extension HistoryService {
  func list(query: String?, format: Format?) async throws -> [ConversationSummary] {
    try await list(query: query, format: format, folderId: nil, archived: nil, includeArchived: false)
  }
}

/// Production ``HistoryService`` over ``OakAPIClient``. A value type holding one
/// immutable actor reference, so it is `Sendable` without ceremony. Wire shapes are
/// decoded into the conversation DTOs in `Conversation.swift`; error mapping happens
/// inside ``OakAPIClient``.
struct LiveHistoryService: HistoryService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func list(
    query: String?,
    format: Format?,
    folderId: String?,
    archived: Bool?,
    includeArchived: Bool
  ) async throws -> [ConversationSummary] {
    var queryItems: [URLQueryItem] = []
    if let query {
      let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        queryItems.append(URLQueryItem(name: "q", value: trimmed))
      }
    }
    if let format {
      queryItems.append(URLQueryItem(name: "format", value: format.rawValue))
    }
    if let folderId {
      queryItems.append(URLQueryItem(name: "folder_id", value: folderId))
    }
    if let archived {
      queryItems.append(URLQueryItem(name: "archived", value: archived ? "1" : "0"))
    }
    if includeArchived {
      queryItems.append(URLQueryItem(name: "include_archived", value: "1"))
    }
    let endpoint = Endpoint(
      method: .get,
      path: "/api/conversations",
      queryItems: queryItems,
      requiresAuth: true
    )
    let response = try await apiClient.send(endpoint, as: ConversationListResponse.self)
    return response.conversations
  }

  func get(id: String) async throws -> ConversationDetail {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/conversations/\(id)",
      requiresAuth: true
    )
    return try await apiClient.send(endpoint, as: ConversationDetail.self)
  }

  func rename(id: String, title: String) async throws {
    let endpoint = Endpoint(
      method: .patch,
      path: "/api/conversations/\(id)",
      body: RenameBody(title: title),
      requiresAuth: true
    )
    try await apiClient.sendNoContent(endpoint)
  }

  func setPinned(id: String, pinned: Bool) async throws {
    let endpoint = Endpoint(
      method: .patch,
      path: "/api/conversations/\(id)",
      body: PinnedBody(pinned: pinned),
      requiresAuth: true
    )
    try await apiClient.sendNoContent(endpoint)
  }

  func delete(id: String) async throws {
    let endpoint = Endpoint(
      method: .delete,
      path: "/api/conversations/\(id)",
      requiresAuth: true
    )
    try await apiClient.sendNoContent(endpoint)
  }

  func importGuestThread(
    sessionId: String,
    format: Format,
    turns: [ChatTurn]
  ) async throws -> String? {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/conversations/import",
      body: ImportRequestBody(
        sessionId: sessionId,
        format: format,
        turns: turns.map(ImportTurn.init)
      ),
      requiresAuth: true
    )
    let response = try await apiClient.send(endpoint, as: ImportResponse.self)
    return response.id
  }

  func listFolders() async throws -> [ConversationFolder] {
    let endpoint = Endpoint(method: .get, path: "/api/folders", requiresAuth: true)
    let response = try await apiClient.send(endpoint, as: FolderListResponse.self)
    return response.folders
  }

  func createFolder(name: String) async throws -> ConversationFolder {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/folders",
      body: FolderNameBody(name: name),
      requiresAuth: true
    )
    return try await apiClient.send(endpoint, as: ConversationFolder.self)
  }

  func renameFolder(id: String, name: String) async throws {
    let endpoint = Endpoint(
      method: .patch,
      path: "/api/folders/\(id)",
      body: FolderNameBody(name: name),
      requiresAuth: true
    )
    try await apiClient.sendNoContent(endpoint)
  }

  func deleteFolder(id: String) async throws {
    let endpoint = Endpoint(method: .delete, path: "/api/folders/\(id)", requiresAuth: true)
    try await apiClient.sendNoContent(endpoint)
  }

  func setArchived(id: String, archived: Bool) async throws {
    let endpoint = Endpoint(
      method: .patch,
      path: "/api/conversations/\(id)",
      body: ArchivedBody(archived: archived),
      requiresAuth: true
    )
    try await apiClient.sendNoContent(endpoint)
  }

  func setFolder(id: String, folderId: String?) async throws {
    let endpoint = Endpoint(
      method: .patch,
      path: "/api/conversations/\(id)",
      body: FolderIdBody(folderId: folderId),
      requiresAuth: true
    )
    try await apiClient.sendNoContent(endpoint)
  }

  func bulkUpdate(
    ids: [String],
    action: BulkConversationAction,
    folderId: String?
  ) async throws -> BulkUpdateResponse {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/conversations/bulk",
      body: BulkBody(ids: ids, action: action, folderId: folderId),
      requiresAuth: true
    )
    return try await apiClient.send(endpoint, as: BulkUpdateResponse.self)
  }

  func setTurnPinned(conversationId: String, messageId: String, pinned: Bool) async throws -> [String] {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/conversations/\(conversationId)/pins",
      body: PinBody(messageId: messageId, pinned: pinned),
      requiresAuth: true
    )
    let response = try await apiClient.send(endpoint, as: PinsResponse.self)
    return response.pinnedMessageIds
  }

  func fork(conversationId: String, throughMessageId: String) async throws -> ForkResponse {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/conversations/\(conversationId)/fork",
      body: ForkBody(throughMessageId: throughMessageId),
      requiresAuth: true
    )
    return try await apiClient.send(endpoint, as: ForkResponse.self)
  }

  func exportConversation(id: String, format: ConversationExportFormat) async throws -> Data {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/conversations/\(id)/export",
      queryItems: [URLQueryItem(name: "format", value: format.rawValue)],
      requiresAuth: true
    )
    return try await apiClient.sendData(endpoint)
  }
}

// MARK: - Wire bodies & envelopes (private to the service)

/// `GET /api/conversations` → `{ conversations: ConversationSummary[] }`.
private struct ConversationListResponse: Decodable, Sendable {
  let conversations: [ConversationSummary]
}

/// `POST /api/conversations/import` → `{ id: string | null }`.
private struct ImportResponse: Decodable, Sendable {
  let id: String?
}

/// `PATCH …` body for a rename (`{ title }`). `title` is identical on the wire.
private struct RenameBody: Encodable, Sendable {
  let title: String
}

/// `PATCH …` body for a pin toggle (`{ pinned }`). `pinned` is identical on the wire.
private struct PinnedBody: Encodable, Sendable {
  let pinned: Bool
}

/// `POST /api/conversations/import` body (`{ session_id, format, turns }`). The
/// import route prefers `format` (the resolved scope) over the deprecated
/// `champions_mode` seed, so we send the current field; `format` encodes as its
/// `Format` rawValue string.
private struct ImportRequestBody: Encodable, Sendable {
  let sessionId: String
  let format: Format
  let turns: [ImportTurn]

  enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case format
    case turns
  }
}

/// One import turn on the wire, discriminated by `role`: a user turn carries its
/// raw `content`; an assistant turn carries the full `answer` (an ``OakAnswer``,
/// validated server-side against `oakAnswerSchema`). The wire ``ChatTurn`` is
/// decode-only, so this is the dedicated **encode** mirror (kept out of the shared
/// DTO file so `Conversation.swift` stays a pure decode target).
private struct ImportTurn: Encodable, Sendable {
  let turn: ChatTurn

  init(_ turn: ChatTurn) {
    self.turn = turn
  }

  enum CodingKeys: String, CodingKey {
    case id
    case role
    case content
    case answer
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch turn {
    case let .user(id, content):
      try container.encode(id, forKey: .id)
      try container.encode("user", forKey: .role)
      try container.encode(content, forKey: .content)
    case let .assistant(id, answer):
      try container.encode(id, forKey: .id)
      try container.encode("assistant", forKey: .role)
      try container.encode(answer, forKey: .answer)
    }
  }
}

private struct FolderListResponse: Decodable, Sendable {
  let folders: [ConversationFolder]
}

private struct FolderNameBody: Encodable, Sendable {
  let name: String
}

private struct ArchivedBody: Encodable, Sendable {
  let archived: Bool
}

private struct FolderIdBody: Encodable, Sendable {
  let folderId: String?

  enum CodingKeys: String, CodingKey {
    case folderId = "folder_id"
  }
}

private struct BulkBody: Encodable, Sendable {
  let ids: [String]
  let action: BulkConversationAction
  let folderId: String?

  enum CodingKeys: String, CodingKey {
    case ids
    case action
    case folderId = "folder_id"
  }
}

private struct PinBody: Encodable, Sendable {
  let messageId: String
  let pinned: Bool

  enum CodingKeys: String, CodingKey {
    case messageId = "message_id"
    case pinned
  }
}

private struct ForkBody: Encodable, Sendable {
  let throughMessageId: String

  enum CodingKeys: String, CodingKey {
    case throughMessageId = "through_message_id"
  }
}
