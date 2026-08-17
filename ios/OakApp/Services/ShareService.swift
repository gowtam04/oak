import Foundation

/// Public-share create / list / revoke / view / import (SHARE-US-1…5).
protocol ShareService: Sendable {
  func create(conversationId: String, assistantMessageId: String) async throws -> CreatedShare
  func list() async throws -> [ShareSummary]
  func revoke(id: String) async throws
  func getPublic(id: String) async throws -> PublicShare
  func importTeam(id: String) async throws -> String
}

struct LiveShareService: ShareService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func create(conversationId: String, assistantMessageId: String) async throws -> CreatedShare {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/shares",
      body: CreateShareBody(
        conversationId: conversationId,
        assistantMessageId: assistantMessageId
      ),
      requiresAuth: true
    )
    return try await apiClient.send(endpoint, as: CreatedShare.self)
  }

  func list() async throws -> [ShareSummary] {
    let endpoint = Endpoint(method: .get, path: "/api/shares", requiresAuth: true)
    let response = try await apiClient.send(endpoint, as: ShareListResponse.self)
    return response.shares
  }

  func revoke(id: String) async throws {
    let endpoint = Endpoint(method: .delete, path: "/api/shares/\(id)", requiresAuth: true)
    try await apiClient.sendNoContent(endpoint)
  }

  func getPublic(id: String) async throws -> PublicShare {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/shares/public/\(id)",
      requiresAuth: false
    )
    return try await apiClient.send(endpoint, as: PublicShare.self)
  }

  func importTeam(id: String) async throws -> String {
    let endpoint = Endpoint(
      method: .post,
      path: "/api/shares/\(id)/import-team",
      requiresAuth: true
    )
    let response = try await apiClient.send(endpoint, as: ImportShareTeamResponse.self)
    return response.teamId
  }
}

private struct CreateShareBody: Encodable, Sendable {
  let conversationId: String
  let assistantMessageId: String

  enum CodingKeys: String, CodingKey {
    case conversationId = "conversation_id"
    case assistantMessageId = "assistant_message_id"
  }
}

private struct ShareListResponse: Decodable, Sendable {
  let shares: [ShareSummary]
}
