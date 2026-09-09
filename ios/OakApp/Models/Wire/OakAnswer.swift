import Foundation

/// The single structured answer the agent emits per turn — the field-by-field
/// render target for the chat UI.
///
/// Faithful Swift mirror of `oakAnswerSchema` (and its sub-objects) in
/// `web/src/agent/schemas.ts`. The TypeScript/Zod definition is authoritative; if
/// it changes, this mirror must change (a round-trip decode test guards the drift).
///
/// Wire keys are `snake_case`; Swift properties are `camelCase`. The mapping is
/// declared with **explicit `CodingKeys`** on every type that has a key to rename
/// — there is no global `.convertFromSnakeCase` decoding strategy (payloads across
/// the app mix conventions, so the conversion is opt-in per type). Types whose
/// properties already equal their wire key (e.g. `BaseStats`, `ProposedTeam`) rely
/// on the synthesized coding keys, which produce the exact wire names.
///
/// `Format`, `TeamMember`, and `TeamWarning` live in `Team.swift`; `JSONScalar`
/// lives in `JSONScalar.swift` — referenced here, never redefined (one module).
///
/// In-domain failures are **values, not errors**: a non-`answered` status, empty
/// `subjects`, `resolution_failed` `suggestions`, etc. are normal results rendered
/// in the UI, never thrown.
struct OakAnswer: Codable, Sendable, Equatable {
  /// The outcome of the turn. Drives which optional blocks the UI expects.
  ///
  /// **Tolerant decoding (`.unknown`)** mirrors the `Format` idiom in `Team.swift`:
  /// the backend can widen this vocabulary independently of when this app ships, and
  /// a single unrecognized `status` string must never fail the whole `OakAnswer`
  /// decode (which would lose the user's answer). `.unknown(raw)` absorbs any string
  /// this enum doesn't recognize, preserving the original wire value so it re-encodes
  /// byte-identically; every known case round-trips through `rawValue` unchanged.
  enum Status: Sendable, Hashable {
    case answered
    case clarificationNeeded
    case resolutionFailed
    case insufficientData
    /// A status string not in the known four — preserves the original wire value.
    case unknown(String)

    /// The wire string for a known case, or the original raw string for `.unknown`.
    var rawValue: String {
      switch self {
      case .answered: return "answered"
      case .clarificationNeeded: return "clarification_needed"
      case .resolutionFailed: return "resolution_failed"
      case .insufficientData: return "insufficient_data"
      case let .unknown(raw): return raw
      }
    }

    /// Maps a wire string to its case, falling back to `.unknown` for anything else.
    init(rawValue: String) {
      switch rawValue {
      case "answered": self = .answered
      case "clarification_needed": self = .clarificationNeeded
      case "resolution_failed": self = .resolutionFailed
      case "insufficient_data": self = .insufficientData
      default: self = .unknown(rawValue)
      }
    }
  }

  let status: Status
  let answerMarkdown: String
  let reasoningMarkdown: String
  let citations: [Citation]
  let inferences: [Inference]
  let generationBasis: GenerationBasis

  // Optional, render-if-present.
  let subjects: [Subject]?
  let candidates: Candidates?
  let damageCalc: DamageCalc?
  let suggestions: [String]?
  let question: ClarifyQuestion?
  let uncertaintyFlags: [String]?

  // Team-builder fields. `proposedTeam` is model-emitted; `savedTeam` and
  // `proposedTeamWarnings` are server-stamped onto the answer.
  let proposedTeam: ProposedTeam?
  let savedTeam: SavedTeamRef?
  let proposedTeamWarnings: [TeamWarning]?

  /// Server-owned (VOICE-AC-1.2). Present on spoken turns; never model-emitted.
  let origin: Origin?

  enum Origin: String, Codable, Sendable, Equatable {
    case voice
  }

  enum CodingKeys: String, CodingKey {
    case status
    case answerMarkdown = "answer_markdown"
    case reasoningMarkdown = "reasoning_markdown"
    case citations
    case inferences
    case generationBasis = "generation_basis"
    case subjects
    case candidates
    case damageCalc = "damage_calc"
    case suggestions
    case question
    case uncertaintyFlags = "uncertainty_flags"
    case proposedTeam = "proposed_team"
    case savedTeam = "saved_team"
    case proposedTeamWarnings = "proposed_team_warnings"
    case origin
  }

  init(
    status: Status,
    answerMarkdown: String,
    reasoningMarkdown: String,
    citations: [Citation],
    inferences: [Inference],
    generationBasis: GenerationBasis,
    subjects: [Subject]?,
    candidates: Candidates?,
    damageCalc: DamageCalc?,
    suggestions: [String]?,
    question: ClarifyQuestion?,
    uncertaintyFlags: [String]?,
    proposedTeam: ProposedTeam?,
    savedTeam: SavedTeamRef?,
    proposedTeamWarnings: [TeamWarning]?,
    origin: Origin? = nil
  ) {
    self.status = status
    self.answerMarkdown = answerMarkdown
    self.reasoningMarkdown = reasoningMarkdown
    self.citations = citations
    self.inferences = inferences
    self.generationBasis = generationBasis
    self.subjects = subjects
    self.candidates = candidates
    self.damageCalc = damageCalc
    self.suggestions = suggestions
    self.question = question
    self.uncertaintyFlags = uncertaintyFlags
    self.proposedTeam = proposedTeam
    self.savedTeam = savedTeam
    self.proposedTeamWarnings = proposedTeamWarnings
    self.origin = origin
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    status = try container.decode(Status.self, forKey: .status)
    answerMarkdown = try container.decode(String.self, forKey: .answerMarkdown)
    reasoningMarkdown = try container.decode(String.self, forKey: .reasoningMarkdown)
    citations = try container.decode([Citation].self, forKey: .citations)
    inferences = try container.decode([Inference].self, forKey: .inferences)
    generationBasis = try container.decode(GenerationBasis.self, forKey: .generationBasis)
    subjects = try container.decodeIfPresent([Subject].self, forKey: .subjects)
    candidates = try container.decodeIfPresent(Candidates.self, forKey: .candidates)
    damageCalc = try container.decodeIfPresent(DamageCalc.self, forKey: .damageCalc)
    suggestions = try container.decodeIfPresent([String].self, forKey: .suggestions)
    question = try container.decodeIfPresent(ClarifyQuestion.self, forKey: .question)
    uncertaintyFlags = try container.decodeIfPresent([String].self, forKey: .uncertaintyFlags)
    proposedTeam = try container.decodeIfPresent(ProposedTeam.self, forKey: .proposedTeam)
    savedTeam = try container.decodeIfPresent(SavedTeamRef.self, forKey: .savedTeam)
    proposedTeamWarnings = try container.decodeIfPresent([TeamWarning].self, forKey: .proposedTeamWarnings)
    origin = try container.decodeIfPresent(Origin.self, forKey: .origin)
  }
}

extension OakAnswer.Status: Codable {
  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    self.init(rawValue: try container.decode(String.self))
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

/// Highlight target on a citation (CIT-US-1). Invalid anchors are stripped server-side.
struct CitationAnchor: Codable, Sendable, Equatable {
  enum Target: String, Codable, Sendable, Equatable {
    case answerSpan = "answer_span"
    case factRow = "fact_row"
  }

  let target: Target
  let id: String
}

/// A cited source backing the answer (mirrors `citationSchema`).
struct Citation: Codable, Sendable, Equatable {
  let source: String
  let detail: String
  let endpointUrl: String?
  let anchor: CitationAnchor?

  enum CodingKeys: String, CodingKey {
    case source
    case detail
    case endpointUrl = "endpoint_url"
    case anchor
  }

  init(source: String, detail: String, endpointUrl: String?, anchor: CitationAnchor? = nil) {
    self.source = source
    self.detail = detail
    self.endpointUrl = endpointUrl
    self.anchor = anchor
  }
}

/// Compact / full answer-card density (COMPACT-US-1).
enum AnswerDensity: String, Codable, Sendable, Equatable {
  case full
  case compact
}

/// A claim the agent deduced rather than read directly (mirrors `inferenceSchema`).
struct Inference: Codable, Sendable, Equatable {
  /// The agent's confidence in a deduced claim. **Tolerant decoding (`.unknown`)**
  /// mirrors the `Format` idiom: a widened confidence vocabulary must never fail the
  /// parent `OakAnswer` decode. `.unknown(raw)` preserves the original wire string
  /// (rendered verbatim) and re-encodes byte-identically.
  enum Confidence: Sendable, Hashable {
    case high
    case medium
    case low
    /// A confidence string not in the known three — preserves the raw wire value.
    case unknown(String)

    var rawValue: String {
      switch self {
      case .high: return "high"
      case .medium: return "medium"
      case .low: return "low"
      case let .unknown(raw): return raw
      }
    }

    init(rawValue: String) {
      switch rawValue {
      case "high": self = .high
      case "medium": self = .medium
      case "low": self = .low
      default: self = .unknown(rawValue)
      }
    }
  }

  let claim: String
  let confidence: Confidence
  let note: String?
}

extension Inference.Confidence: Codable {
  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    self.init(rawValue: try container.decode(String.self))
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

/// The generation/format the answer is based on (mirrors `generationBasisSchema`).
struct GenerationBasis: Codable, Sendable, Equatable {
  let generation: String
  let fallback: Bool
  let note: String?
}

/// A primary entity the answer is about, for the header sprite/badges
/// (mirrors `subjectSchema`).
struct Subject: Codable, Sendable, Equatable {
  let name: String
  let dexNumber: Int?
  let spriteUrl: String
  let types: [String]
  let isFallback: Bool
  let sourceGeneration: String?

  enum CodingKeys: String, CodingKey {
    case name
    case dexNumber = "dex_number"
    case spriteUrl = "sprite_url"
    case types
    case isFallback = "is_fallback"
    case sourceGeneration = "source_generation"
  }
}

/// A result set the answer enumerates (mirrors `candidatesSchema`).
struct Candidates: Codable, Sendable, Equatable {
  let totalCount: Int
  let truncated: Bool
  /// Present-or-null on the wire (`z.string().nullable().optional()`); both map to nil.
  let sort: String?
  let shown: [CandidateRow]
  /// The rows BEYOND `shown`, populated server-side (never model-emitted) when the
  /// full set was fetchable (≤200 rows). Optional + additive: missing field decodes
  /// to nil, so older payloads are unaffected. When present and non-empty, the
  /// "Show all N" control expands the table locally instead of sending a follow-up
  /// turn (mirrors `candidatesSchema.hidden_rows` in `web/src/agent/schemas.ts`).
  let hiddenRows: [CandidateRow]?

  enum CodingKeys: String, CodingKey {
    case totalCount = "total_count"
    case truncated
    case sort
    case shown
    case hiddenRows = "hidden_rows"
  }

  /// `hiddenRows` defaults to nil so existing call sites (and Decodable payloads
  /// without the additive field) stay source- and wire-compatible.
  init(totalCount: Int, truncated: Bool, sort: String?, shown: [CandidateRow], hiddenRows: [CandidateRow]? = nil) {
    self.totalCount = totalCount
    self.truncated = truncated
    self.sort = sort
    self.shown = shown
    self.hiddenRows = hiddenRows
  }

  /// True when the server shipped the withheld rows inline (`hiddenRows` non-empty),
  /// so the "Show all N" control can expand the table in place with no follow-up
  /// turn. False for older answers / >200-row sets, which keep the follow-up path.
  var canExpandLocally: Bool { !(hiddenRows ?? []).isEmpty }

  /// `shown` followed by any hidden rows — the full result set once expanded.
  var allRows: [CandidateRow] { shown + (hiddenRows ?? []) }
}

/// One row in a `candidates` table (mirrors `candidateRowSchema`).
struct CandidateRow: Codable, Sendable, Equatable {
  let name: String
  let dexNumber: Int?
  let spriteUrl: String?
  let types: [String]
  let baseStats: BaseStats?
  /// Free-form scalar map; `CandidateTable` falls back to this when `baseStats` is absent.
  let keyStats: [String: JSONScalar]?
  let ability: String?

  enum CodingKeys: String, CodingKey {
    case name
    case dexNumber = "dex_number"
    case spriteUrl = "sprite_url"
    case types
    case baseStats = "base_stats"
    case keyStats = "key_stats"
    case ability
  }
}

/// The six-stat block, in fixed order — mirrors `baseStatsSchema` in
/// `web/src/agent/schemas.ts` (the source for `candidateRowSchema.base_stats`,
/// `pokedexRowSchema`, and `pokemonProfileSchema`/the entity artifact). Unlike the
/// team `StatSpread` (`statSpreadSchema`, which uses the abbreviated `atk/def/spa`
/// wire keys), `baseStatsSchema` sends the FULL stat names
/// (`attack/defense/special_attack/special_defense/speed`), so the abbreviated
/// Swift properties are mapped with explicit `CodingKeys`.
struct BaseStats: Codable, Sendable, Equatable {
  let hp: Int
  let atk: Int
  let def: Int
  let spa: Int
  let spd: Int
  let spe: Int

  enum CodingKeys: String, CodingKey {
    case hp
    case atk = "attack"
    case def = "defense"
    case spa = "special_attack"
    case spd = "special_defense"
    case spe = "speed"
  }
}

/// A non-authoritative damage estimate (mirrors `damageCalcSchema`).
struct DamageCalc: Codable, Sendable, Equatable {
  let assumptions: [String: JSONScalar]
  let result: [String: JSONScalar]
  /// Always `true` on the wire (`z.literal(true)`); kept a `Bool` for decode tolerance.
  let isEstimate: Bool
  let breakdown: String?

  enum CodingKeys: String, CodingKey {
    case assumptions
    case result
    case isEstimate = "is_estimate"
    case breakdown
  }
}

/// A focused multiple-choice question shown on a `clarification_needed` answer
/// (mirrors `questionSchema`).
struct ClarifyQuestion: Codable, Sendable, Equatable {
  let options: [ClarifyOption]
}

/// One selectable option in a `ClarifyQuestion` (mirrors `questionOptionSchema`).
/// `label` is sent verbatim as the next user message when tapped.
struct ClarifyOption: Codable, Sendable, Equatable {
  let label: String
  let description: String?
}

/// A buildable team the agent proposes for the user to Apply (mirrors
/// `proposedTeamSchema`). `format`/`members` come from `Team.swift`.
struct ProposedTeam: Codable, Sendable, Equatable {
  let name: String
  let format: Format
  let members: [TeamMember]
}

/// A reference to a team the agent saved this turn (mirrors `savedTeamSchema`),
/// server-stamped so the UI can render a "Saved ✓ — open in viewer" card.
struct SavedTeamRef: Codable, Sendable, Equatable {
  let id: String
  let name: String
  let format: Format
}
