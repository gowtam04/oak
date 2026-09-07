import Foundation

/// Live Champions ladder (GET `/api/usage`, CF-USAGE-US-1 / ADR-5).
/// Doubles is the default; Singles is the other view. Not persisted.
enum UsageLadder: String, Codable, Sendable, CaseIterable, Hashable {
  case doubles
  case singles

  var title: String {
    switch self {
    case .doubles: return "Doubles"
    case .singles: return "Singles"
    }
  }
}

/// One ranked species on the public leaderboard.
struct UsageLeaderboardRow: Codable, Sendable, Equatable, Identifiable {
  var id: String { slug }
  let rank: Int
  let name: String
  let slug: String
  let usagePct: Double?
  let sprite: String?

  init(rank: Int, name: String, slug: String, usagePct: Double? = nil, sprite: String? = nil) {
    self.rank = rank
    self.name = name
    self.slug = slug
    self.usagePct = usagePct
    self.sprite = sprite
  }

  enum CodingKeys: String, CodingKey {
    case rank
    case name
    case slug
    case usagePct = "usage_pct"
    case sprite
  }
}

/// `GET /api/usage` envelope. 200 even when the community API is down
/// (`available: false`, `error: "upstream_unavailable"`).
struct UsageLeaderboard: Codable, Sendable, Equatable {
  let available: Bool
  let ladder: UsageLadder
  let season: String?
  let fetchedAt: Int64?
  let attribution: String?
  let error: String?
  let rows: [UsageLeaderboardRow]

  init(
    available: Bool,
    ladder: UsageLadder,
    season: String?,
    fetchedAt: Int64?,
    attribution: String?,
    error: String?,
    rows: [UsageLeaderboardRow]
  ) {
    self.available = available
    self.ladder = ladder
    self.season = season
    self.fetchedAt = fetchedAt
    self.attribution = attribution
    self.error = error
    self.rows = rows
  }

  enum CodingKeys: String, CodingKey {
    case available
    case ladder
    case season
    case fetchedAt = "fetched_at"
    case attribution
    case error
    case rows
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    available = try container.decode(Bool.self, forKey: .available)
    ladder = try container.decodeIfPresent(UsageLadder.self, forKey: .ladder) ?? .doubles
    season = try container.decodeIfPresent(String.self, forKey: .season)
    fetchedAt = try container.decodeIfPresent(Int64.self, forKey: .fetchedAt)
    attribution = try container.decodeIfPresent(String.self, forKey: .attribution)
    error = try container.decodeIfPresent(String.self, forKey: .error)
    rows = try container.decodeIfPresent([UsageLeaderboardRow].self, forKey: .rows) ?? []
  }

  /// Fail-soft envelope when the community API is down (CF-USAGE-AC-1.6).
  static func unavailable(ladder: UsageLadder) -> UsageLeaderboard {
    UsageLeaderboard(
      available: false,
      ladder: ladder,
      season: nil,
      fetchedAt: nil,
      attribution: nil,
      error: "upstream_unavailable",
      rows: []
    )
  }
}

/// One named usage share (moves / items / abilities / …).
struct UsageEntry: Codable, Sendable, Equatable {
  let name: String
  let pct: Double?
  let rank: Int
}

/// `GET /api/usage/:slug` envelope. Extra usage lists are optional so a
/// compact test fixture still constructs.
struct UsageSpeciesResponse: Codable, Sendable, Equatable {
  let available: Bool
  let found: Bool?
  let slug: String?
  let season: String?
  let fetchedAt: Int64?
  let attribution: String?
  let error: String?
  var savedName: String? = nil
  var suggestions: [String]? = nil
  var moves: [UsageEntry]? = nil
  var items: [UsageEntry]? = nil
  var abilities: [UsageEntry]? = nil
  var natures: [UsageEntry]? = nil
  var spreads: [UsageEntry]? = nil
  var teammates: [UsageEntry]? = nil
  var sourceUrl: String? = nil

  init(
    available: Bool,
    found: Bool?,
    slug: String?,
    season: String?,
    fetchedAt: Int64?,
    attribution: String?,
    error: String?,
    savedName: String? = nil,
    suggestions: [String]? = nil,
    moves: [UsageEntry]? = nil,
    items: [UsageEntry]? = nil,
    abilities: [UsageEntry]? = nil,
    natures: [UsageEntry]? = nil,
    spreads: [UsageEntry]? = nil,
    teammates: [UsageEntry]? = nil,
    sourceUrl: String? = nil
  ) {
    self.available = available
    self.found = found
    self.slug = slug
    self.season = season
    self.fetchedAt = fetchedAt
    self.attribution = attribution
    self.error = error
    self.savedName = savedName
    self.suggestions = suggestions
    self.moves = moves
    self.items = items
    self.abilities = abilities
    self.natures = natures
    self.spreads = spreads
    self.teammates = teammates
    self.sourceUrl = sourceUrl
  }

  enum CodingKeys: String, CodingKey {
    case available
    case found
    case slug
    case season
    case fetchedAt = "fetched_at"
    case attribution
    case error
    case savedName = "saved_name"
    case suggestions
    case moves
    case items
    case abilities
    case natures
    case spreads
    case teammates
    case sourceUrl = "source_url"
  }

  static var unavailable: UsageSpeciesResponse {
    UsageSpeciesResponse(
      available: false,
      found: nil,
      slug: nil,
      season: nil,
      fetchedAt: nil,
      attribution: nil,
      error: "upstream_unavailable"
    )
  }
}
