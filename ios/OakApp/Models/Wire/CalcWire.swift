import Foundation

/// Portable `POST /api/calc` wire + helpers (CALC-US-4/5/7/8).
///
/// Clones `web/src/lib/calc/calc-schema.ts`, `default-level.ts`, and
/// `explain-prompt.ts`. Incomplete sides still construct so the engine can
/// return 200 `incomplete` instead of inventing a 0 roll (CALC-BR-8).

// MARK: - Scenario

struct CalcSide: Codable, Sendable, Equatable {
  var species: String?
  var ability: String?
  var item: String?
  var nature: String?
  var evs: [String: Int]?
  var ivs: [String: Int]?
  var tera: String?
  var level: Int?

  init(
    species: String? = nil,
    ability: String? = nil,
    item: String? = nil,
    nature: String? = nil,
    evs: [String: Int]? = nil,
    ivs: [String: Int]? = nil,
    tera: String? = nil,
    level: Int? = nil
  ) {
    self.species = species
    self.ability = ability
    self.item = item
    self.nature = nature
    self.evs = evs
    self.ivs = ivs
    self.tera = tera
    self.level = level
  }
}

enum CalcMoveCategory: String, Codable, Sendable, Equatable {
  case physical
  case special
  case status
}

struct CalcMove: Codable, Sendable, Equatable {
  var slug: String?
  var name: String?
  var power: Double?
  var type: String?
  var category: CalcMoveCategory?

  init(
    slug: String? = nil,
    name: String? = nil,
    power: Double? = nil,
    type: String? = nil,
    category: CalcMoveCategory? = nil
  ) {
    self.slug = slug
    self.name = name
    self.power = power
    self.type = type
    self.category = category
  }
}

enum CalcWeather: String, Codable, Sendable, Equatable {
  case none
  case sun
  case rain
  case sand
  case snow
}

struct CalcField: Codable, Sendable, Equatable {
  var weather: CalcWeather?
  var reflect: Bool?
  var lightScreen: Bool?

  init(weather: CalcWeather? = nil, reflect: Bool? = nil, lightScreen: Bool? = nil) {
    self.weather = weather
    self.reflect = reflect
    self.lightScreen = lightScreen
  }

  enum CodingKeys: String, CodingKey {
    case weather
    case reflect
    case lightScreen = "light_screen"
  }
}

struct CalcScenario: Codable, Sendable, Equatable {
  var format: Format
  var attacker: CalcSide
  var defender: CalcSide
  var move: CalcMove
  var field: CalcField?

  init(
    format: Format,
    attacker: CalcSide,
    defender: CalcSide,
    move: CalcMove,
    field: CalcField? = nil
  ) {
    self.format = format
    self.attacker = attacker
    self.defender = defender
    self.move = move
    self.field = field
  }

  /// True when a side or the move is missing the identity the engine needs.
  var isIncomplete: Bool {
    attacker.species == nil
      || defender.species == nil
      || (move.slug == nil && move.name == nil)
  }
}

// MARK: - Result

struct CalcKo: Codable, Sendable, Equatable {
  var hits: Int
}

struct CalcSpreadEstimate: Codable, Sendable, Equatable {
  var minDamage: Int
  var maxDamage: Int
  var percentMin: Double
  var percentMax: Double
  var ko: CalcKo

  enum CodingKeys: String, CodingKey {
    case minDamage = "min_damage"
    case maxDamage = "max_damage"
    case percentMin = "percent_min"
    case percentMax = "percent_max"
    case ko
  }
}

struct CalcEstimate: Codable, Sendable, Equatable {
  var minDamage: Int
  var maxDamage: Int
  var percentMin: Double
  var percentMax: Double
  var ko: CalcKo
  var isEstimate: Bool

  enum CodingKeys: String, CodingKey {
    case minDamage = "min_damage"
    case maxDamage = "max_damage"
    case percentMin = "percent_min"
    case percentMax = "percent_max"
    case ko
    case isEstimate = "is_estimate"
  }
}

struct CalcApplied: Codable, Sendable, Equatable {
  var stab: Bool
  var typeEffectiveness: Double
  var otherModifier: Double
  var weather: String?
  var screens: [String]?
  var item: String?
  var unsupported: [String]

  enum CodingKeys: String, CodingKey {
    case stab
    case typeEffectiveness = "type_effectiveness"
    case otherModifier = "other_modifier"
    case weather
    case screens
    case item
    case unsupported
  }
}

enum CalcSpreadLabel: String, Codable, Sendable, Equatable {
  case min
  case bulky
  case max
}

struct CalcCommonSpread: Codable, Sendable, Equatable {
  var label: CalcSpreadLabel
  var estimate: CalcSpreadEstimate
}

struct CalcSuccess: Codable, Sendable, Equatable {
  var format: Format
  var estimate: CalcEstimate
  var breakdown: String
  var applied: CalcApplied
  var commonSpreads: [CalcCommonSpread]?
  var caveat: String?

  init(
    format: Format,
    estimate: CalcEstimate,
    breakdown: String,
    applied: CalcApplied,
    commonSpreads: [CalcCommonSpread]? = nil,
    caveat: String? = nil
  ) {
    self.format = format
    self.estimate = estimate
    self.breakdown = breakdown
    self.applied = applied
    self.commonSpreads = commonSpreads
    self.caveat = caveat
  }

  enum CodingKeys: String, CodingKey {
    case ok
    case format
    case estimate
    case breakdown
    case applied
    case commonSpreads = "common_spreads"
    case caveat
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    format = try container.decode(Format.self, forKey: .format)
    estimate = try container.decode(CalcEstimate.self, forKey: .estimate)
    breakdown = try container.decode(String.self, forKey: .breakdown)
    applied = try container.decode(CalcApplied.self, forKey: .applied)
    commonSpreads = try container.decodeIfPresent([CalcCommonSpread].self, forKey: .commonSpreads)
    caveat = try container.decodeIfPresent(String.self, forKey: .caveat)
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(true, forKey: .ok)
    try container.encode(format, forKey: .format)
    try container.encode(estimate, forKey: .estimate)
    try container.encode(breakdown, forKey: .breakdown)
    try container.encode(applied, forKey: .applied)
    try container.encodeIfPresent(commonSpreads, forKey: .commonSpreads)
    try container.encodeIfPresent(caveat, forKey: .caveat)
  }
}

enum CalcErrorCode: String, Codable, Sendable, Equatable {
  case incomplete
  case unresolved
  case indexUnavailable = "index_unavailable"
  case statusMove = "status_move"
}

struct CalcFailure: Codable, Sendable, Equatable {
  var error: CalcErrorCode
  var detail: String?
  var suggestions: [String]?

  /// Failures never carry a damage range (CALC-BR-8).
  var estimate: CalcEstimate? { nil }

  init(error: CalcErrorCode, detail: String? = nil, suggestions: [String]? = nil) {
    self.error = error
    self.detail = detail
    self.suggestions = suggestions
  }

  enum CodingKeys: String, CodingKey {
    case ok
    case error
    case detail
    case suggestions
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    error = try container.decode(CalcErrorCode.self, forKey: .error)
    detail = try container.decodeIfPresent(String.self, forKey: .detail)
    suggestions = try container.decodeIfPresent([String].self, forKey: .suggestions)
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(false, forKey: .ok)
    try container.encode(error, forKey: .error)
    try container.encodeIfPresent(detail, forKey: .detail)
    try container.encodeIfPresent(suggestions, forKey: .suggestions)
  }
}

enum CalcResult: Codable, Sendable, Equatable {
  case success(CalcSuccess)
  case failure(CalcFailure)

  var isIncomplete: Bool {
    if case .failure(let miss) = self { return miss.error == .incomplete }
    return false
  }

  private enum Discriminator: String, CodingKey {
    case ok
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: Discriminator.self)
    if try container.decode(Bool.self, forKey: .ok) {
      self = .success(try CalcSuccess(from: decoder))
    } else {
      self = .failure(try CalcFailure(from: decoder))
    }
  }

  func encode(to encoder: any Encoder) throws {
    switch self {
    case .success(let ok):
      try ok.encode(to: encoder)
    case .failure(let miss):
      try miss.encode(to: encoder)
    }
  }
}

// MARK: - Portable helpers

/// Champions-first calc is always L50 (CF-CALC-US-1). Leftover format strings
/// do not reopen a gen-N / National Dex calculator.
func defaultCalcLevel(_ format: Format) -> Int {
  _ = format
  return 50
}

/// Deterministic "Explain this calc" chat message (CALC-US-8). Not JSON.
func explainCalcPrompt(scenario: CalcScenario, result: CalcResult) -> String {
  let weather = scenario.field?.weather?.rawValue ?? "none"
  return [
    "Explain this damage estimate (do not re-roll unless needed).",
    "Format: \(scenario.format.rawValue)",
    "Attacker: \(formatCalcSide(scenario.attacker))",
    "Defender: \(formatCalcSide(scenario.defender))",
    "Move: \(formatCalcMove(scenario))",
    "Field: \(weather), screens \(formatCalcScreens(scenario))",
    "Estimate: \(formatCalcEstimate(result))",
    "Unsupported: \(formatCalcUnsupported(result))",
  ].joined(separator: "\n")
}

private func dash(_ value: String?) -> String {
  guard let value, !value.isEmpty else { return "—" }
  return value
}

private func dash(_ value: Int?) -> String {
  guard let value else { return "—" }
  return String(value)
}

private func formatCalcEvs(_ evs: [String: Int]?) -> String {
  guard let evs else { return "—" }
  let parts = evs.map { "\($0.value) \($0.key)" }
  return parts.isEmpty ? "—" : parts.joined(separator: " / ")
}

private func formatCalcSide(_ side: CalcSide) -> String {
  "\(dash(side.species)) @ \(dash(side.item)) / \(dash(side.ability)) / "
    + "\(dash(side.nature)) / \(formatCalcEvs(side.evs)) / L\(dash(side.level)) / "
    + "Tera \(dash(side.tera))"
}

private func formatCalcScreens(_ scenario: CalcScenario) -> String {
  var screens: [String] = []
  if scenario.field?.reflect == true { screens.append("Reflect") }
  if scenario.field?.lightScreen == true { screens.append("Light Screen") }
  return screens.isEmpty ? "none" : screens.joined(separator: ", ")
}

private func formatCalcMove(_ scenario: CalcScenario) -> String {
  let named = scenario.move.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  if !named.isEmpty { return named }
  let slug = scenario.move.slug?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  return slug.isEmpty ? "—" : slug
}

private func formatCalcUnsupported(_ result: CalcResult) -> String {
  guard case .success(let ok) = result else { return "—" }
  return ok.applied.unsupported.isEmpty ? "none" : ok.applied.unsupported.joined(separator: ", ")
}

private func formatCalcEstimate(_ result: CalcResult) -> String {
  guard case .success(let ok) = result else { return "unavailable" }
  let estimate = ok.estimate
  return
    "\(estimate.minDamage)–\(estimate.maxDamage) (\(formatNumber(estimate.percentMin))–\(formatNumber(estimate.percentMax))%); \(estimate.ko.hits)HKO"
}

private func formatNumber(_ value: Double) -> String {
  value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
}

// MARK: - Endpoint

enum CalcEndpoints {
  static func estimate(_ scenario: CalcScenario) -> Endpoint {
    Endpoint(method: .post, path: "/api/calc", body: scenario, requiresAuth: false)
  }
}
