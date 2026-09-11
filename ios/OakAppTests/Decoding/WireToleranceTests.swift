import Foundation
import Testing

@testable import OakApp

/// Forward-compatibility guard for the oak-v2 sync (plan §B3): the backend may widen
/// enum vocabularies independently of when this app ships, and a single unrecognized
/// value must NEVER fail the whole decode (which would lose the user's answer or break
/// the artifact viewer). These tests assert the tolerant `.unknown` / `.unsupported`
/// arms (the same idiom `Format`/`ScopeSource` already use) absorb unknown wire values
/// and round-trip them byte-identically.
///
/// Unlike `FixtureDecodingTests`, these build from inline JSON literals on purpose:
/// an *unknown* wire value has no contract-valid committed fixture to mirror.
struct WireToleranceTests {

  private func decodeAnswer(_ json: String) throws -> OakAnswer {
    try JSONDecoder().decode(OakAnswer.self, from: Data(json.utf8))
  }

  private func decodeArtifact(_ json: String) throws -> EntityArtifact {
    try JSONDecoder().decode(EntityArtifact.self, from: Data(json.utf8))
  }

  /// The minimal required `OakAnswer` fields, so a tolerance case can vary just the
  /// enum under test.
  private static let baseAnswerFields = """
    "answer_markdown":"body","reasoning_markdown":"why","citations":[],\
    "inferences":[],"generation_basis":{"generation":"Gen 9","fallback":false}
    """

  // MARK: OakAnswer.Status

  /// An unrecognized `status` string decodes to `.unknown(raw)` (the whole answer is
  /// preserved) rather than throwing.
  @Test
  func unknownStatusDecodesToUnknownArm() throws {
    let answer = try decodeAnswer("{\"status\":\"needs_review\",\(Self.baseAnswerFields)}")
    #expect(answer.status == .unknown("needs_review"))
    // The rest of the answer survived.
    #expect(answer.answerMarkdown == "body")
    #expect(answer.status != .answered)
  }

  /// A known status still decodes to its named case (no regression from the tolerant
  /// shape).
  @Test
  func knownStatusStillDecodesToNamedCase() throws {
    let answer = try decodeAnswer("{\"status\":\"clarification_needed\",\(Self.baseAnswerFields)}")
    #expect(answer.status == .clarificationNeeded)
  }

  /// An `.unknown` status re-encodes to its original raw wire string (round-trip
  /// fidelity), so a resumed conversation never silently rewrites the value.
  @Test
  func unknownStatusRoundTripsRawString() throws {
    let answer = try decodeAnswer("{\"status\":\"needs_review\",\(Self.baseAnswerFields)}")
    let reencoded = try JSONEncoder().encode(answer)
    let roundTripped = try JSONDecoder().decode(OakAnswer.self, from: reencoded)
    #expect(roundTripped.status == .unknown("needs_review"))
    #expect(roundTripped == answer)
  }

  // MARK: Inference.Confidence

  /// An unrecognized inference `confidence` decodes to `.unknown(raw)`, keeping the
  /// raw string, instead of failing the parent `OakAnswer`.
  @Test
  func unknownConfidenceDecodesToUnknownArm() throws {
    let json = """
      {"status":"answered","answer_markdown":"body","reasoning_markdown":"why",\
      "citations":[],"inferences":[{"claim":"c","confidence":"very_high"}],\
      "generation_basis":{"generation":"Gen 9","fallback":false}}
      """
    let answer = try decodeAnswer(json)
    #expect(answer.inferences.first?.confidence == .unknown("very_high"))
  }

  /// An `.unknown` confidence re-encodes to its raw wire string.
  @Test
  func unknownConfidenceRoundTripsRawString() throws {
    let confidence = Inference.Confidence(rawValue: "very_high")
    #expect(confidence == .unknown("very_high"))
    let data = try JSONEncoder().encode(confidence)
    #expect(String(decoding: data, as: UTF8.self) == "\"very_high\"")
  }

  // MARK: EntityKind + EntityArtifact

  /// An `ok` artifact whose `kind` is unknown decodes to the graceful
  /// `EntityData.unsupported` arm (the viewer shows "can't display this yet") rather
  /// than throwing on the unrecognized `data` shape.
  @Test
  func unknownEntityKindDecodesToUnsupportedData() throws {
    let json = """
      {"status":"ok","kind":"nature","format":"scarlet-violet",\
      "resolved":{"slug":"adamant","display_name":"Adamant"},"generation":"Gen 9",\
      "is_fallback":false,"citations":[],"data":{"anything":"the app can't map"}}
      """
    guard case let .ok(ok) = try decodeArtifact(json) else {
      Issue.record("expected an ok artifact")
      return
    }
    #expect(ok.kind == .unsupported("nature"))
    guard case .unsupported = ok.data else {
      Issue.record("expected the unsupported data arm")
      return
    }
  }

  /// An unknown envelope `status` degrades to the honest `.unavailable` miss (the
  /// viewer's graceful state), never throwing.
  @Test
  func unknownArtifactStatusDegradesToUnavailable() throws {
    let json = """
      {"status":"rate_limited","kind":"pokemon","format":"champions"}
      """
    guard case let .unavailable(unavailable) = try decodeArtifact(json) else {
      Issue.record("expected an unavailable artifact for an unknown status")
      return
    }
    #expect(unavailable.kind == .pokemon)
    #expect(unavailable.format == .champions)
  }

  /// An unknown `EntityKind` on a `not_found` miss preserves the raw kind string.
  @Test
  func unknownEntityKindOnMissPreservesRawValue() throws {
    let json = """
      {"status":"not_found","kind":"nature","format":"scarlet-violet",\
      "query":"adamant","suggestions":[]}
      """
    guard case let .notFound(miss) = try decodeArtifact(json) else {
      Issue.record("expected a not_found artifact")
      return
    }
    #expect(miss.kind == .unsupported("nature"))
    #expect(miss.kind.rawValue == "nature")
  }

  /// A known `EntityKind` still decodes to its named case.
  @Test
  func knownEntityKindStillDecodes() throws {
    #expect(EntityKind(rawValue: "move") == .move)
    #expect(EntityKind.move.rawValue == "move")
  }

  /// Additive `flags` on a move artifact: missing key is nil, present list decodes.
  @Test
  func moveFlagsDecodeWhenPresentAndStayNilWhenAbsent() throws {
    let withFlags = """
      {"status":"ok","kind":"move","format":"champions",\
      "resolved":{"slug":"aura-sphere","display_name":"Aura Sphere"},\
      "generation":"Champions","is_fallback":false,"citations":[],\
      "data":{"display_name":"Aura Sphere","type":"fighting",\
      "damage_class":"special","power":80,"accuracy":null,"pp":20,\
      "priority":0,"target":"any","effect_short":"Never misses.",\
      "effect_full":"Never misses.","flags":["bullet","pulse"]}}
      """
    guard case let .ok(ok) = try decodeArtifact(withFlags),
      case let .move(data) = ok.data
    else {
      Issue.record("expected an ok move artifact")
      return
    }
    #expect(data.flags == ["bullet", "pulse"])

    let withoutFlags = """
      {"status":"ok","kind":"move","format":"champions",\
      "resolved":{"slug":"fake-out","display_name":"Fake Out"},\
      "generation":"Champions","is_fallback":false,"citations":[],\
      "data":{"display_name":"Fake Out","type":"normal",\
      "damage_class":"physical","power":40,"accuracy":100,"pp":10,\
      "priority":3,"target":"normal","effect_short":"Flinch.",\
      "effect_full":"Flinch."}}
      """
    guard case let .ok(ok2) = try decodeArtifact(withoutFlags),
      case let .move(data2) = ok2.data
    else {
      Issue.record("expected an ok move artifact without flags")
      return
    }
    #expect(data2.flags == nil)
  }

  // MARK: EntityArtifactOk.source_format (National-Dex fallback marker, #2)

  /// A minimal `ok` type envelope, optionally carrying the additive `source_format` marker.
  private func okTypeArtifact(sourceFormat: String?) -> String {
    let source = sourceFormat.map { "\"source_format\":\"\($0)\"," } ?? ""
    return """
      {"status":"ok","kind":"type","format":"national-dex",\(source)\
      "resolved":{"slug":"dragon","display_name":"Dragon"},"generation":"Gen 9",\
      "is_fallback":false,"citations":[],\
      "data":{"types":["dragon"],"defensive":{"weak_to":[],"resists":[],"immune_to":[]}}}
      """
  }

  /// The National-Dex fallback path stamps `source_format`; it decodes into `sourceFormat`.
  @Test
  func sourceFormatDecodesWhenPresent() throws {
    guard case let .ok(ok) = try decodeArtifact(okTypeArtifact(sourceFormat: "national-dex")) else {
      Issue.record("expected an ok artifact")
      return
    }
    #expect(ok.sourceFormat == .nationalDex)
    #expect(ok.format == .nationalDex)
  }

  /// The normal in-scope path omits `source_format`; it decodes to nil without throwing (the
  /// field is additive/optional, so pre-existing payloads still parse).
  @Test
  func sourceFormatAbsentDecodesAsNil() throws {
    guard case let .ok(ok) = try decodeArtifact(okTypeArtifact(sourceFormat: nil)) else {
      Issue.record("expected an ok artifact")
      return
    }
    #expect(ok.sourceFormat == nil)
  }
}
