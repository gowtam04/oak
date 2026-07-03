import Foundation

@testable import OakApp

/// In-memory ``DexLookupService`` test double (testing-strategy.md "Mocking policy":
/// service protocols are faked for view-model unit tests). Every call is scripted from a
/// fixed table keyed by the request's identifying field (kind+query / pokemon / the sorted
/// name batch), plus call recording so tests can assert exactly what a picker searched for.
///
/// `@unchecked Sendable`: mutable state, but every test drives it serially from the main
/// actor and `await`s each call — mirrors `FakeTeamService`.
final class FakeDexLookupService: DexLookupService, @unchecked Sendable {
  // MARK: Scripted responses

  /// Keyed by `"<kind>:<query>"`; an absent key returns `[]` (mirrors the live service's
  /// never-throw empty-on-miss behavior).
  var searchResults: [String: [SearchMatch]] = [:]
  /// Keyed by the species slug; an absent key returns `[]`.
  var learnsetResults: [String: [LearnsetMove]] = [:]
  /// Keyed by the sorted, comma-joined name batch; an absent key returns `[:]`.
  var spriteResults: [String: [String: DexSpriteRef]] = [:]

  // MARK: Recording

  private(set) var searchCalls: [(kind: EntityKind, query: String, format: Format)] = []
  private(set) var learnsetCalls: [(pokemon: String, format: Format)] = []
  private(set) var spriteCalls: [(names: [String], format: Format)] = []

  func search(kind: EntityKind, query: String, format: Format) async -> [SearchMatch] {
    searchCalls.append((kind, query, format))
    return searchResults["\(kind.rawValue):\(query)"] ?? []
  }

  func learnset(pokemon: String, format: Format) async -> [LearnsetMove] {
    learnsetCalls.append((pokemon, format))
    return learnsetResults[pokemon] ?? []
  }

  func sprites(names: [String], format: Format) async -> [String: DexSpriteRef] {
    spriteCalls.append((names, format))
    guard !names.isEmpty else { return [:] }
    return spriteResults[names.sorted().joined(separator: ",")] ?? [:]
  }
}
