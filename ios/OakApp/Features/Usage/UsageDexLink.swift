import Foundation

/// Usage-species list sections. Only moves, items, abilities, and teammates
/// have a Dex page; natures and EV spreads do not.
enum UsageListKind: String, Sendable {
  case moves
  case items
  case abilities
  case natures
  case spreads
  case teammates

  var dexKind: EntityKind? {
    switch self {
    case .moves: return .move
    case .items: return .item
    case .abilities: return .ability
    case .teammates: return .pokemon
    case .natures, .spreads: return nil
    }
  }
}

/// Maps a usage-share row onto a Dex entity route. Pure — no I/O.
enum UsageDexLink {
  /// `nil` when the section has no Dex page or the name is blank after trim.
  static func route(kind: UsageListKind, name: String) -> DexEntityRoute? {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let entityKind = kind.dexKind else { return nil }
    return DexEntityRoute(kind: entityKind, query: trimmed)
  }

  /// Header “View in Dex” for the species being inspected.
  static func speciesRoute(nameOrSlug: String) -> DexEntityRoute? {
    DexEntityRoute.pokemonPage(named: nameOrSlug)
  }
}
