import Foundation

/// Public live Champions ladder (CF-USAGE-US-1, ADR-5). Guests and signed-in
/// users share the same `GET /api/usage` path (`requiresAuth: false`).
protocol UsageService: Sendable {
  func leaderboard(ladder: UsageLadder) async throws -> UsageLeaderboard
  func species(slug: String, ladder: UsageLadder) async throws -> UsageSpeciesResponse
}

struct LiveUsageService: UsageService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func leaderboard(ladder: UsageLadder) async throws -> UsageLeaderboard {
    let endpoint = Endpoint(
      method: .get,
      path: "/api/usage",
      queryItems: [URLQueryItem(name: "ladder", value: ladder.rawValue)],
      requiresAuth: false
    )
    return try await apiClient.send(endpoint, as: UsageLeaderboard.self)
  }

  func species(slug: String, ladder: UsageLadder) async throws -> UsageSpeciesResponse {
    let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug
    let endpoint = Endpoint(
      method: .get,
      path: "/api/usage/\(encoded)",
      queryItems: [URLQueryItem(name: "ladder", value: ladder.rawValue)],
      requiresAuth: false
    )
    return try await apiClient.send(endpoint, as: UsageSpeciesResponse.self)
  }
}
