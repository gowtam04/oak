/// Team-builder wire DTOs — faithful Swift mirrors of the backend's team model.
///
/// Authoritative TS sources (the TS wins on any disagreement with the docs):
///   - `web/src/data/teams/team-schema.ts` — `statSpreadSchema`, `teamMemberSchema`,
///     `warningCodeSchema`, `teamWarningSchema`.
///   - `web/src/data/formats.ts` — the `Format` discriminator (`"scarlet-violet" | "champions"`).
///   - `web/src/server/teams/validate-team.ts` + `web/src/app/api/teams/route.ts`
///     — the validation result is a FLAT `TeamWarning[]` (the route returns
///     `{ team, validation }`, `validation: TeamWarning[]`).
///
/// Pure value types, no app-specific imports (the would-be shared package if an
/// Android client ever happens). Wire is `snake_case`; Swift is `camelCase`,
/// mapped with explicit per-type `CodingKeys` only where they differ — never a
/// global `.convertFromSnakeCase` (payloads mix conventions).

/// Data-scope format — the discriminator that scopes the index to a game
/// (`web/src/data/formats.ts` `FORMATS`). `scarletViolet` is Gen 9 / standard
/// mode; `champions` is the Pokémon Champions regulation scope; `gen5`…`gen8`
/// are the mainline generation-scope formats.
///
/// **Tolerant decoding (`.unknown`):** the wire can widen this set independently
/// of when this app ships (it already has: `gen-5`…`gen-8` postdate the app's
/// original 2-case `Format`, and a web-created conversation/team in one of those
/// formats would otherwise fail to decode — silently breaking the whole list for
/// that user). `.unknown(rawValue)` absorbs any string this enum doesn't
/// recognize so a single unrecognized `format` value can never fail a parent
/// `Decodable` (`ConversationSummary`/`ConversationDetail`/`Team`/`TeamSummary`/
/// `EntityArtifactOk`/…) — decoding always succeeds. It carries the original raw
/// string so it re-encodes byte-identically if it is ever sent back (see
/// `encode(to:)` below), and every known case round-trips through `rawValue`
/// unchanged.
enum Format: Sendable, Hashable {
  case scarletViolet
  case champions
  case gen5
  case gen6
  case gen7
  case gen8
  /// A format string not in the known six — preserves the original wire value.
  case unknown(String)

  /// The known, orderable formats — mirrors `FORMATS` in `formats.ts`. Backs the
  /// six-way format pickers/filters; `.unknown` is deliberately excluded (it has
  /// no fixed identity to list).
  static let knownCases: [Format] = [.scarletViolet, .champions, .gen5, .gen6, .gen7, .gen8]

  /// The wire string for a known case, or the original raw string for `.unknown`.
  var rawValue: String {
    switch self {
    case .scarletViolet: return "scarlet-violet"
    case .champions: return "champions"
    case .gen5: return "gen-5"
    case .gen6: return "gen-6"
    case .gen7: return "gen-7"
    case .gen8: return "gen-8"
    case let .unknown(raw): return raw
    }
  }

  /// Maps a wire string to its case, falling back to `.unknown` for anything
  /// outside the known six.
  init(rawValue: String) {
    switch rawValue {
    case "scarlet-violet": self = .scarletViolet
    case "champions": self = .champions
    case "gen-5": self = .gen5
    case "gen-6": self = .gen6
    case "gen-7": self = .gen7
    case "gen-8": self = .gen8
    default: self = .unknown(rawValue)
    }
  }

  /// A short display label, e.g. for a compact list-row badge or filter chip —
  /// mirrors `scopeLabelShort` in `web/src/lib/scope/scope-label.ts` exactly.
  /// `.unknown` echoes its raw value (never renders as blank/"undefined").
  var shortLabel: String {
    switch self {
    case .champions: return "Champions"
    case .scarletViolet: return "Gen 9"
    case .gen8: return "Gen 8"
    case .gen7: return "Gen 7"
    case .gen6: return "Gen 6"
    case .gen5: return "Gen 5"
    case let .unknown(raw): return raw
    }
  }

  /// A fuller display label with the game-pair/regulation suffix — mirrors
  /// `scopeLabel` in `web/src/lib/scope/scope-label.ts` exactly. The Champions
  /// regulation string is duplicated from web's `CHAMPIONS_REGULATION` (no
  /// shared module between the two clients); update it here when that rotates.
  /// `.unknown` echoes its raw value.
  var displayLabel: String {
    switch self {
    case .champions: return "Champions · Reg M-B"
    case .scarletViolet: return "Gen 9 · Scarlet/Violet"
    case .gen8: return "Gen 8 · Sword/Shield"
    case .gen7: return "Gen 7 · USUM"
    case .gen6: return "Gen 6 · XY/ORAS"
    case .gen5: return "Gen 5 · Black/White"
    case let .unknown(raw): return raw
    }
  }
}

extension Format: Codable {
  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    self.init(rawValue: try container.decode(String.self))
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

/// One EV or IV spread. Raw `0..255` per stat on the wire (Showdown permits the
/// full byte range on input); legality (≤252 per EV, ≤508 total, IV `0..31`) is
/// a warn-only concern handled server-side, never enforced by this DTO. All keys
/// match the wire 1:1, so no `CodingKeys` are needed.
struct StatSpread: Codable, Sendable, Equatable {
  let hp: Int
  let atk: Int
  let def: Int
  let spa: Int
  let spd: Int
  let spe: Int
}

/// One team member (set). Slugs are stored, not display names; `nil` means
/// "empty / not set". Mirrors `teamMemberSchema`.
///
/// Wire-fidelity nuance (why the custom `encode(to:)`): `species`, `ability`,
/// `item`, `nature` and `tera_type` are `.nullable()` in Zod — the KEY is
/// required and the value may be `null` (the server always emits e.g.
/// `"item": null`). The cosmetic `nickname`/`gender`/`shiny` are `.optional()`
/// — the key may be ABSENT. Swift's synthesized `encode(to:)` would omit every
/// nil, which would drop the required nullable keys and fail the server's
/// `.strict()` parse. So we encode the nullable-required fields explicitly (as
/// `null` when nil) and `encodeIfPresent` only the truly-optional cosmetics.
/// Decoding is the synthesized one (`decodeIfPresent` tolerates both null and
/// absent), so only `encode(to:)` is hand-written.
struct TeamMember: Codable, Sendable, Equatable {
  /// Pokémon slug; `nil` = empty slot.
  let species: String?
  /// Ability slug; `nil` = not set.
  let ability: String?
  /// Held-item slug; `nil` = none.
  let item: String?
  /// Move slugs; may hold fewer than 4 (a partial team is valid).
  let moves: [String]
  /// Nature slug; `nil` = not set.
  let nature: String?
  /// EV spread (raw `0..255` per stat).
  let evs: StatSpread
  /// IV spread (`0..31` expected; warned, not blocked).
  let ivs: StatSpread
  /// Tera-type slug (wire `tera_type`); `nil` = not set.
  let teraType: String?
  /// Level (`1..100`; default 50 in both formats).
  let level: Int
  /// Cosmetic — round-tripped on import/export, not competitively significant.
  let nickname: String?
  /// Cosmetic gender flag.
  let gender: Gender?
  /// Cosmetic shiny flag.
  let shiny: Bool?

  /// Cosmetic gender (`z.enum(["M", "F", "N"])`).
  enum Gender: String, Codable, Sendable, Equatable {
    case male = "M"
    case female = "F"
    case neutral = "N"
  }

  enum CodingKeys: String, CodingKey {
    case species
    case ability
    case item
    case moves
    case nature
    case evs
    case ivs
    case teraType = "tera_type"
    case level
    case nickname
    case gender
    case shiny
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    // `.nullable()` required keys — always present, explicit `null` when nil.
    try container.encode(species, forKey: .species)
    try container.encode(ability, forKey: .ability)
    try container.encode(item, forKey: .item)
    try container.encode(moves, forKey: .moves)
    try container.encode(nature, forKey: .nature)
    try container.encode(evs, forKey: .evs)
    try container.encode(ivs, forKey: .ivs)
    try container.encode(teraType, forKey: .teraType)
    try container.encode(level, forKey: .level)
    // `.optional()` cosmetics — omitted when nil.
    try container.encodeIfPresent(nickname, forKey: .nickname)
    try container.encodeIfPresent(gender, forKey: .gender)
    try container.encodeIfPresent(shiny, forKey: .shiny)
  }
}

/// One advisory team warning (`teamWarningSchema`). Advisory-only: warnings are
/// rendered, never thrown (in-domain failures are values). `slot` absent ⇒
/// team-level (e.g. species/item clauses). All keys match the wire 1:1.
struct TeamWarning: Codable, Sendable, Equatable {
  /// The validity/legality rules `validateTeam` can flag (`warningCodeSchema`).
  enum Code: String, Codable, Sendable, Equatable {
    case incomplete
    case evTotalExceeded = "ev_total_exceeded"
    case evStatExceeded = "ev_stat_exceeded"
    case ivOutOfRange = "iv_out_of_range"
    case speciesIllegal = "species_illegal"
    case abilityNotForSpecies = "ability_not_for_species"
    case itemIllegal = "item_illegal"
    case moveNotInLearnset = "move_not_in_learnset"
    case duplicateSpecies = "duplicate_species"
    case duplicateItem = "duplicate_item"
  }

  let code: Code
  let message: String
  /// `0..5`; absent ⇒ team-level.
  let slot: Int?
  /// e.g. `"evs.atk"`, `"moves[2]"`, `"ability"`.
  let field: String?
}

/// The advisory result of `validateTeam`, returned alongside a created/updated
/// team. The server shape is a FLAT `TeamWarning[]` (the route's `validation`
/// field), so this wrapper encodes/decodes the bare array directly via a
/// single-value container — making it usable as the decode target for
/// `validation` while still exposing a named `warnings` property.
struct TeamValidationResult: Codable, Sendable, Equatable {
  let warnings: [TeamWarning]

  init(warnings: [TeamWarning]) {
    self.warnings = warnings
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    self.warnings = try container.decode([TeamWarning].self)
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(warnings)
  }
}
