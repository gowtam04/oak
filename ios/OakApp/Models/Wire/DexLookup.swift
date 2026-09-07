import Foundation

/// Team-builder dex-lookup wire DTOs — read-only enrichment for the entity pickers
/// (species / ability / item / move search, learnset filtering, batch sprites). Faithful
/// mirrors of the three public GET routes; the TS route handlers are authoritative
/// (CLAUDE.md — "the TS source wins"):
///   - `web/src/app/api/search/route.ts` — `GET /api/search` → `{ matches: SearchMatch[] }`.
///   - `web/src/app/api/learnset/route.ts` — `GET /api/learnset` → `{ moves: LearnsetMove[] }`.
///   - `web/src/app/api/sprites/route.ts` — `GET /api/sprites` → `{ refs: { [name]: DexSpriteRef } }`.
///
/// All three routes are public (no auth — Pokédex reference data) and never throw for an
/// in-domain miss: an unreadable index degrades to an empty list/map on a 200. The three
/// client helpers on `DexLookupService` mirror that by folding every transport/decode
/// fault to the same empty result rather than throwing (`search-client.ts` /
/// `learnset-client.ts` / `sprites-client.ts` never throw either).

/// One typeahead candidate from `GET /api/search` — mirrors `SearchMatch` in
/// `web/src/lib/api/search-client.ts`.
///
/// `sprite_url` is additive and Pokémon-only: present on Pokémon matches when
/// the index has a sprite, omitted (decode → `nil`) when unknown or for
/// moves/abilities/items. Older responses without the key still decode.
struct SearchMatch: Decodable, Sendable, Equatable, Identifiable {
  let slug: String
  let displayName: String
  let kind: EntityKind
  let spriteUrl: String?

  enum CodingKeys: String, CodingKey {
    case slug
    case displayName = "display_name"
    case kind
    case spriteUrl = "sprite_url"
  }

  init(slug: String, displayName: String, kind: EntityKind, spriteUrl: String? = nil) {
    self.slug = slug
    self.displayName = displayName
    self.kind = kind
    self.spriteUrl = spriteUrl
  }

  var id: String { slug }
}

/// One legal move for a species' movepool from `GET /api/learnset` — mirrors
/// `LearnsetOption` in `web/src/lib/api/learnset-client.ts`. `type`/`damageClass`/`power`
/// are the F1 metadata columns the moves table renders alongside each picker; they ride
/// along only when the move has cached reference detail, so all three are optional.
struct LearnsetMove: Decodable, Sendable, Equatable, Identifiable {
  /// The three move damage classes — mirrors `MoveDamageClass`.
  enum DamageClass: String, Decodable, Sendable, Equatable {
    case physical
    case special
    case status
  }

  let slug: String
  let displayName: String
  let type: String?
  let damageClass: DamageClass?
  let power: Int?

  enum CodingKeys: String, CodingKey {
    case slug
    case displayName = "display_name"
    case type
    case damageClass = "damage_class"
    case power
  }

  var id: String { slug }
}

/// Batch sprite/type/ability/base-stat ref for one species from `GET /api/sprites` —
/// mirrors `SpriteRef` in `web/src/data/repos/pokedex-repo.ts`. `requiredItem` is the
/// Mega-stone slug the team builder auto-forces onto the held-item field; `abilities` is
/// the form's legal ability slugs (the Ability picker's ONLY offered options). Both are
/// optional so older cached responses without the columns still decode.
struct DexSpriteRef: Decodable, Sendable, Equatable {
  let displayName: String
  let spriteUrl: String
  let dexNumber: Int
  let types: [String]
  let requiredItem: String?
  let abilities: [String]?
  /// Reuses `BaseStats` (`web/src/agent/schemas.ts` `baseStatsSchema` shape) — the sprite
  /// batch route's `base_stats` field is structurally identical (full stat-name keys).
  let baseStats: BaseStats

  enum CodingKeys: String, CodingKey {
    case displayName = "display_name"
    case spriteUrl = "sprite_url"
    case dexNumber = "dex_number"
    case types
    case requiredItem = "required_item"
    case abilities
    case baseStats = "base_stats"
  }
}
