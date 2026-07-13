import Foundation

/// The `POST /api/teams/analyze` response — a faithful, tolerant mirror of
/// `TeamAnalysisResponse` in `web/src/lib/teams/team-analysis.ts` (the ONE definition
/// every client builds to). The endpoint takes a draft team `{ format, members }` and
/// returns the whole-team analysis for the current draft (per-member stats, a defensive
/// type matrix, offensive coverage, speed tiers, caveat notes).
///
/// A discriminated union on `status`:
/// ```ts
/// export const teamAnalysisResponseSchema = z.discriminatedUnion("status", [
///   teamAnalysisOkSchema,           // status: "ok"
///   teamAnalysisUnavailableSchema,  // status: "unavailable" (index unbuilt/unreadable)
/// ]);
/// ```
///
/// Received-only (`Decodable`). Decoding is deliberately **tolerant** (snake_case keys,
/// `decodeIfPresent` + empty/zero defaults, an unknown `status` degrading to
/// `.unavailable`) so a widened `web/` contract never fails the whole panel — matching the
/// `EntityArtifact`/`Format` forward-compat idiom. `Equatable` so the view model can
/// diff/replace results.
enum TeamAnalysis: Decodable, Sendable, Equatable {
  case ok(TeamAnalysisOk)
  case unavailable(format: Format)

  private enum StatusKey: String, CodingKey {
    case status
    case format
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: StatusKey.self)
    let status = try container.decode(String.self, forKey: .status)
    switch status {
    case "ok":
      self = .ok(try TeamAnalysisOk(from: decoder))
    default:
      // "unavailable" and any unknown status both resolve to the honest miss, carrying the
      // format when present (a `.unknown` format tolerates a widened scope vocabulary).
      let format = try container.decodeIfPresent(Format.self, forKey: .format) ?? .unknown(status)
      self = .unavailable(format: format)
    }
  }
}

// ---------------------------------------------------------------------------
// ok envelope
// ---------------------------------------------------------------------------

/// The `ok` analysis — `teamAnalysisOkSchema`:
/// ```ts
/// { status: "ok", format, members: AnalyzedMember[], defense: DefenseRow[],
///   offense: { covered, uncovered }, speed_tiers: SpeedTier[], notes: string[] }
/// ```
struct TeamAnalysisOk: Decodable, Sendable, Equatable {
  let format: Format
  let members: [AnalyzedMember]
  let defense: [DefenseRow]
  let offense: TeamOffense
  let speedTiers: [SpeedTier]
  let notes: [String]
  let roles: [MemberRolesWire]
  let rolesPresent: [String]
  let rolesMissing: [String]
  let physicalSpecial: PhysicalSpecialWire
  let defenseNotes: [String]
  let threats: [ThreatRowWire]
  let metaAttribution: String?

  private enum CodingKeys: String, CodingKey {
    case format
    case members
    case defense
    case offense
    case speedTiers = "speed_tiers"
    case notes
    case roles
    case rolesPresent = "roles_present"
    case rolesMissing = "roles_missing"
    case physicalSpecial = "physical_special"
    case defenseNotes = "defense_notes"
    case threats
    case metaAttribution = "meta_attribution"
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.format = try container.decode(Format.self, forKey: .format)
    self.members = try container.decodeIfPresent([AnalyzedMember].self, forKey: .members) ?? []
    self.defense = try container.decodeIfPresent([DefenseRow].self, forKey: .defense) ?? []
    self.offense = try container.decodeIfPresent(TeamOffense.self, forKey: .offense)
      ?? TeamOffense(covered: [], uncovered: [])
    self.speedTiers = try container.decodeIfPresent([SpeedTier].self, forKey: .speedTiers) ?? []
    self.notes = try container.decodeIfPresent([String].self, forKey: .notes) ?? []
    self.roles = try container.decodeIfPresent([MemberRolesWire].self, forKey: .roles) ?? []
    self.rolesPresent = try container.decodeIfPresent([String].self, forKey: .rolesPresent) ?? []
    self.rolesMissing = try container.decodeIfPresent([String].self, forKey: .rolesMissing) ?? []
    self.physicalSpecial = try container.decodeIfPresent(PhysicalSpecialWire.self, forKey: .physicalSpecial)
      ?? PhysicalSpecialWire()
    self.defenseNotes = try container.decodeIfPresent([String].self, forKey: .defenseNotes) ?? []
    self.threats = try container.decodeIfPresent([ThreatRowWire].self, forKey: .threats) ?? []
    self.metaAttribution = try container.decodeIfPresent(String.self, forKey: .metaAttribution)
  }
}

struct MemberRolesWire: Decodable, Sendable, Equatable {
  let member: String
  let flags: [String]

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    member = try c.decodeIfPresent(String.self, forKey: .member) ?? ""
    flags = try c.decodeIfPresent([String].self, forKey: .flags) ?? []
  }

  private enum CodingKeys: String, CodingKey { case member, flags }
}

struct PhysicalSpecialWire: Decodable, Sendable, Equatable {
  let physicalMoves: Int
  let specialMoves: Int
  let statusMoves: Int
  let attackerBias: String

  init(
    physicalMoves: Int = 0,
    specialMoves: Int = 0,
    statusMoves: Int = 0,
    attackerBias: String = "none"
  ) {
    self.physicalMoves = physicalMoves
    self.specialMoves = specialMoves
    self.statusMoves = statusMoves
    self.attackerBias = attackerBias
  }

  private enum CodingKeys: String, CodingKey {
    case physicalMoves = "physical_moves"
    case specialMoves = "special_moves"
    case statusMoves = "status_moves"
    case attackerBias = "attacker_bias"
  }

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    physicalMoves = try c.decodeIfPresent(Int.self, forKey: .physicalMoves) ?? 0
    specialMoves = try c.decodeIfPresent(Int.self, forKey: .specialMoves) ?? 0
    statusMoves = try c.decodeIfPresent(Int.self, forKey: .statusMoves) ?? 0
    attackerBias = try c.decodeIfPresent(String.self, forKey: .attackerBias) ?? "none"
  }
}

struct ThreatCalcWire: Decodable, Sendable, Equatable {
  let attacker: String
  let defender: String
  let move: String
  let minPct: Double
  let maxPct: Double

  private enum CodingKeys: String, CodingKey {
    case attacker, defender, move
    case minPct = "min_pct"
    case maxPct = "max_pct"
  }

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    attacker = try c.decodeIfPresent(String.self, forKey: .attacker) ?? ""
    defender = try c.decodeIfPresent(String.self, forKey: .defender) ?? ""
    move = try c.decodeIfPresent(String.self, forKey: .move) ?? ""
    minPct = try c.decodeIfPresent(Double.self, forKey: .minPct) ?? 0
    maxPct = try c.decodeIfPresent(Double.self, forKey: .maxPct) ?? 0
  }
}

struct ThreatRowWire: Decodable, Sendable, Equatable {
  let species: String
  let displayName: String
  let usagePct: Double?
  let rank: Int?
  let status: String
  let reasons: [String]
  let sampleCalcs: [ThreatCalcWire]

  private enum CodingKeys: String, CodingKey {
    case species
    case displayName = "display_name"
    case usagePct = "usage_pct"
    case rank, status, reasons
    case sampleCalcs = "sample_calcs"
  }

  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    species = try c.decodeIfPresent(String.self, forKey: .species) ?? ""
    displayName = try c.decodeIfPresent(String.self, forKey: .displayName) ?? ""
    usagePct = try c.decodeIfPresent(Double.self, forKey: .usagePct)
    rank = try c.decodeIfPresent(Int.self, forKey: .rank)
    status = try c.decodeIfPresent(String.self, forKey: .status) ?? "soft"
    reasons = try c.decodeIfPresent([String].self, forKey: .reasons) ?? []
    sampleCalcs = try c.decodeIfPresent([ThreatCalcWire].self, forKey: .sampleCalcs) ?? []
  }
}

// ---------------------------------------------------------------------------
// Members (two-case union on `found`)
// ---------------------------------------------------------------------------

/// One analyzed member — `analyzedMemberSchema`, a two-case union on the `found` flag: a
/// resolved species carries its full readout; an unresolved one degrades to `{ slug,
/// found: false }` (never fails the call). Mirrors the codebase's discriminant-first union
/// decode (e.g. `EntityArtifact` on `status`).
enum AnalyzedMember: Decodable, Sendable, Equatable {
  case found(AnalyzedMemberDetail)
  case notFound(slug: String)

  private enum CodingKeys: String, CodingKey {
    case slug
    case found
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let found = try container.decodeIfPresent(Bool.self, forKey: .found) ?? false
    if found {
      self = .found(try AnalyzedMemberDetail(from: decoder))
    } else {
      self = .notFound(slug: try container.decodeIfPresent(String.self, forKey: .slug) ?? "")
    }
  }

  /// The member's species slug regardless of arm (`""` for an empty slot).
  var slug: String {
    switch self {
    case let .found(detail): return detail.slug
    case let .notFound(slug): return slug
    }
  }
}

/// A resolved member's full readout — the `found: true` arm of `analyzedMemberSchema`.
struct AnalyzedMemberDetail: Decodable, Sendable, Equatable {
  let slug: String
  let displayName: String
  let types: [String]
  let bst: Int
  let stats: AnalyzedStats
  let level: Int
  /// `z.string().nullable()` — present, possibly null.
  let nature: String?

  private enum CodingKeys: String, CodingKey {
    case slug
    case displayName = "display_name"
    case types
    case bst
    case stats
    case level
    case nature
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.slug = try container.decodeIfPresent(String.self, forKey: .slug) ?? ""
    self.displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
    self.types = try container.decodeIfPresent([String].self, forKey: .types) ?? []
    self.bst = try container.decodeIfPresent(Int.self, forKey: .bst) ?? 0
    self.stats = try container.decodeIfPresent(AnalyzedStats.self, forKey: .stats) ?? AnalyzedStats()
    self.level = try container.decodeIfPresent(Int.self, forKey: .level) ?? 0
    self.nature = try container.decodeIfPresent(String.self, forKey: .nature)
  }
}

/// A member's six computed final stats — `analyzedStatsSchema`; `null` where a stat couldn't
/// be computed.
struct AnalyzedStats: Decodable, Sendable, Equatable {
  let hp: Int?
  let atk: Int?
  let def: Int?
  let spa: Int?
  let spd: Int?
  let spe: Int?

  init(
    hp: Int? = nil, atk: Int? = nil, def: Int? = nil,
    spa: Int? = nil, spd: Int? = nil, spe: Int? = nil
  ) {
    self.hp = hp
    self.atk = atk
    self.def = def
    self.spa = spa
    self.spd = spd
    self.spe = spe
  }
}

// ---------------------------------------------------------------------------
// Defense / offense / speed leaves
// ---------------------------------------------------------------------------

/// One row of the defensive matrix — `defenseRowSchema`: for the attacking `type`, the member
/// slugs that are weak to / resist / immune to it. Counts derive client-side from array lengths.
struct DefenseRow: Decodable, Sendable, Equatable {
  let type: String
  let weak: [String]
  let resists: [String]
  let immune: [String]

  private enum CodingKeys: String, CodingKey {
    case type
    case weak
    case resists
    case immune
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.type = try container.decodeIfPresent(String.self, forKey: .type) ?? ""
    self.weak = try container.decodeIfPresent([String].self, forKey: .weak) ?? []
    self.resists = try container.decodeIfPresent([String].self, forKey: .resists) ?? []
    self.immune = try container.decodeIfPresent([String].self, forKey: .immune) ?? []
  }
}

/// Offensive coverage — `offenseSchema`: super-effectively covered types (with their sources)
/// plus the uncovered rest.
struct TeamOffense: Decodable, Sendable, Equatable {
  let covered: [OffenseCoverage]
  let uncovered: [String]

  init(covered: [OffenseCoverage], uncovered: [String]) {
    self.covered = covered
    self.uncovered = uncovered
  }

  private enum CodingKeys: String, CodingKey {
    case covered
    case uncovered
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.covered = try container.decodeIfPresent([OffenseCoverage].self, forKey: .covered) ?? []
    self.uncovered = try container.decodeIfPresent([String].self, forKey: .uncovered) ?? []
  }
}

/// One super-effectively covered type and the `{ member, move }` pairs hitting it —
/// `offenseCoverageSchema`.
struct OffenseCoverage: Decodable, Sendable, Equatable {
  let type: String
  let by: [OffenseSource]

  private enum CodingKeys: String, CodingKey {
    case type
    case by
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.type = try container.decodeIfPresent(String.self, forKey: .type) ?? ""
    self.by = try container.decodeIfPresent([OffenseSource].self, forKey: .by) ?? []
  }
}

/// One `{ member, move }` slug pair that makes a type covered — `offenseCoverageSchema.by[]`.
struct OffenseSource: Decodable, Sendable, Equatable {
  let member: String
  let move: String
}

/// One member's computed Speed for the speed-tier ordering (sorted desc) — `speedTierSchema`.
struct SpeedTier: Decodable, Sendable, Equatable {
  let member: String
  let speed: Int

  private enum CodingKeys: String, CodingKey {
    case member
    case speed
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.member = try container.decodeIfPresent(String.self, forKey: .member) ?? ""
    self.speed = try container.decodeIfPresent(Int.self, forKey: .speed) ?? 0
  }
}
