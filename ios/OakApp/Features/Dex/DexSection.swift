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
}

/// One navigation-stack entry for a Dex entity detail (list row or drill-in).
struct DexEntityRoute: Hashable, Sendable {
  let kind: EntityKind
  let query: String
}
