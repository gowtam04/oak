import Foundation

@testable import OakApp

/// In-memory ``UsageService`` test double (testing-strategy.md "Mocking policy":
/// service protocols are faked for view-model unit tests).
///
/// Compile-fail until P7 adds `UsageService` + the usage wire DTOs
/// (`ios/OakApp/Services/UsageService.swift`, `ios/OakApp/Models/Wire/UsageWire.swift`).
///
/// Expected protocol:
///   `func leaderboard(ladder: UsageLadder) async throws -> UsageLeaderboard`
///   `func species(slug: String, ladder: UsageLadder) async throws -> UsageSpeciesResponse`
/// Live implementation is **public** (`requiresAuth: false`) — GET `/api/usage`
/// and GET `/api/usage/:slug` (CF-USAGE-AC-1.1, CF-AS-1).
///
/// `@unchecked Sendable`: mutable recording state, driven serially from the
/// main actor like `FakeTeamService`.
final class FakeUsageService: UsageService, @unchecked Sendable {
  var nextLeaderboard: UsageLeaderboard = .unavailable(ladder: .doubles)
  var nextSpecies: UsageSpeciesResponse = .unavailable
  var leaderboardError: OakError?
  var speciesError: OakError?

  private(set) var leaderboardCount = 0
  private(set) var lastLeaderboardLadder: UsageLadder?
  private(set) var speciesCount = 0
  private(set) var lastSpeciesSlug: String?
  private(set) var lastSpeciesLadder: UsageLadder?

  func leaderboard(ladder: UsageLadder) async throws -> UsageLeaderboard {
    leaderboardCount += 1
    lastLeaderboardLadder = ladder
    if let leaderboardError { throw leaderboardError }
    return nextLeaderboard
  }

  func species(slug: String, ladder: UsageLadder) async throws -> UsageSpeciesResponse {
    speciesCount += 1
    lastSpeciesSlug = slug
    lastSpeciesLadder = ladder
    if let speciesError { throw speciesError }
    return nextSpecies
  }
}
