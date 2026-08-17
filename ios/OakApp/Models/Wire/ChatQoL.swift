import Foundation

// Chat-QoL wire DTOs — folders, shares, scope persist, fork, pins, bulk.

/// One history folder (`GET /api/folders`).
struct ConversationFolder: Decodable, Sendable, Identifiable, Hashable {
  let id: String
  let name: String
  let createdAt: Int64
}

/// `PUT /api/scope` success body.
struct ScopePersistResponse: Decodable, Sendable {
  let format: Format
  var lastUsedScopes: [Format]? = nil
}

/// `POST /api/conversations/:id/fork` success body.
struct ForkResponse: Decodable, Sendable {
  let id: String
  let title: String
}

/// `POST /api/conversations/:id/pins` success body.
struct PinsResponse: Decodable, Sendable {
  let pinnedMessageIds: [String]
}

/// `POST /api/conversations/bulk` success body.
struct BulkUpdateResponse: Decodable, Sendable {
  let updated: [String]
  let skipped: [String]
}

enum BulkConversationAction: String, Encodable, Sendable {
  case delete
  case archive
  case unarchive
  case move
}

/// A live share on Shared-by-me (`GET /api/shares`).
struct ShareSummary: Decodable, Sendable, Identifiable, Hashable {
  let id: String
  let url: String
  let conversationTitle: String
  let createdAt: Int64
}

/// `POST /api/shares` success body.
struct CreatedShare: Decodable, Sendable {
  let id: String
  let url: String
}

/// Public snapshot (`GET /api/shares/public/:id`).
struct PublicShare: Decodable, Sendable {
  let id: String
  let question: String
  let answer: OakAnswer
  let conversationTitle: String
  let createdAt: Int64
}

/// `POST /api/shares/:id/import-team` success body.
struct ImportShareTeamResponse: Decodable, Sendable {
  let teamId: String

  enum CodingKeys: String, CodingKey {
    case teamId = "team_id"
  }
}

/// Conversation export format (`GET /api/conversations/:id/export`).
enum ConversationExportFormat: String, Sendable {
  case markdown = "md"
  case pdf

  var fileExtension: String { rawValue }
}
