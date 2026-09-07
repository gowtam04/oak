import Foundation
import Observation

/// Public live Champions usage (ADR-5 / ADR-6). Doubles default, Singles as
/// the other view, fail-soft when the community API is down. Not persisted.
@MainActor
@Observable
final class UsageViewModel {
  private(set) var ladder: UsageLadder = .doubles
  private(set) var available = false
  private(set) var rows: [UsageLeaderboardRow] = []
  private(set) var season: String?
  private(set) var fetchedAt: Int64?
  private(set) var attribution: String?
  private(set) var errorMessage: String?
  private(set) var unavailableMessage: String?
  private(set) var speciesDetail: UsageSpeciesResponse?
  private(set) var isLoading = false

  /// Public surface (CF-USAGE-AC-1.1 / CF-AS-1) — never a sign-in gate.
  let isSignedIn: Bool
  var requiresSignIn: Bool { false }

  var isUnavailable: Bool { !available }

  static let connectionMessage = "No connection. Check your network and try again."
  static let unavailableCopy =
    "Live Champions usage is unavailable right now. Chat, Dex, Teams, and Calc still work — try this page again in a bit."

  private let usage: any UsageService

  init(usage: any UsageService, isSignedIn: Bool) {
    self.usage = usage
    self.isSignedIn = isSignedIn
  }

  func start() async {
    await loadLeaderboard()
  }

  func selectLadder(_ next: UsageLadder) async {
    guard next != ladder else { return }
    ladder = next
    speciesDetail = nil
    await loadLeaderboard()
  }

  func openSpecies(_ slug: String) async {
    do {
      speciesDetail = try await usage.species(slug: slug, ladder: ladder)
    } catch {
      speciesDetail = .unavailable
      if errorMessage == nil {
        errorMessage = Self.connectionMessage
      }
    }
  }

  func dismissError() {
    errorMessage = nil
  }

  private func loadLeaderboard() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      apply(try await usage.leaderboard(ladder: ladder))
    } catch {
      applyUnavailable(connection: true)
    }
  }

  private func apply(_ board: UsageLeaderboard) {
    available = board.available
    season = board.season
    fetchedAt = board.fetchedAt
    attribution = board.attribution
    if board.available {
      rows = board.rows
      unavailableMessage = nil
    } else {
      rows = []
      unavailableMessage = Self.unavailableCopy
    }
  }

  private func applyUnavailable(connection: Bool) {
    available = false
    rows = []
    season = nil
    fetchedAt = nil
    attribution = nil
    unavailableMessage = Self.unavailableCopy
    if connection {
      errorMessage = Self.connectionMessage
    }
  }
}
