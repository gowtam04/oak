import Foundation
import Observation

/// Loads `GET /api/usage/:slug` for a Pokémon artifact's Usage tab.
/// Summary never waits on this — fetch starts when Usage is shown.
@MainActor
@Observable
final class PokemonUsageModel {
  private(set) var ladder: UsageLadder = .doubles
  private(set) var detail: UsageSpeciesResponse?
  private(set) var isLoading = false

  private let usage: any UsageService
  private let slug: String

  init(slug: String, usage: any UsageService) {
    self.slug = slug
    self.usage = usage
  }

  func load() async {
    let trimmed = slug.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      detail = .unavailable
      isLoading = false
      return
    }
    isLoading = true
    defer { isLoading = false }
    do {
      detail = try await usage.species(slug: trimmed, ladder: ladder)
    } catch {
      detail = .unavailable
    }
  }

  func selectLadder(_ next: UsageLadder) async {
    guard next != ladder else { return }
    ladder = next
    await load()
  }
}
