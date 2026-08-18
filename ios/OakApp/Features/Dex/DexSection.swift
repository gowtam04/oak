import Foundation

/// The four browse sections of the Dex tab — mirrors web `ReferenceNav` minus Meta
/// (Meta has no public mobile API yet; types stay reachable via matchup drill-ins).
enum DexSection: String, CaseIterable, Identifiable, Hashable, Sendable {
  case pokemon
  case move
  case ability
  case item

  var id: String { rawValue }

  var title: String {
    switch self {
    case .pokemon: return "Pokémon"
    case .move: return "Moves"
    case .ability: return "Abilities"
    case .item: return "Items"
    }
  }

  /// The `EntityKind` passed to `GET /api/search` and `GET /api/entity`.
  var entityKind: EntityKind {
    switch self {
    case .pokemon: return .pokemon
    case .move: return .move
    case .ability: return .ability
    case .item: return .item
    }
  }

  init?(entityKind: EntityKind) {
    switch entityKind {
    case .pokemon: self = .pokemon
    case .move: self = .move
    case .ability: self = .ability
    case .item: self = .item
    case .type, .unsupported: return nil
    }
  }
}

/// One navigation-stack entry for a Dex entity detail (list row or drill-in).
struct DexEntityRoute: Hashable, Sendable {
  let kind: EntityKind
  let query: String

  /// Pokémon profile hop from an "Open X in Dex" chip query. `nil` when empty after trim.
  static func pokemonPage(named query: String) -> DexEntityRoute? {
    let name = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return nil }
    return DexEntityRoute(kind: .pokemon, query: name)
  }
}

/// Pure consume of a Dex-tab hop from ``AppDestination``.
///
/// TabView may create ``DexView`` after `pendingDestination` is already set, so
/// the view must apply this from both `onAppear` and `onChange`.
struct PendingDexHop: Equatable, Sendable {
  /// Trimmed search-field text (may be empty when the hop is just "open Dex").
  let query: String
  /// Pokémon detail to push, or `nil` when `query` is empty.
  let route: DexEntityRoute?

  static func consume(_ destination: AppDestination?) -> PendingDexHop? {
    guard case let .dex(query) = destination else { return nil }
    let name = (query ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return PendingDexHop(query: name, route: DexEntityRoute.pokemonPage(named: name))
  }
}
