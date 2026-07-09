import Foundation
import Testing

@testable import OakApp

/// Decode guard for the `POST /api/teams/analyze` wire contract (#9) — the tolerant
/// ``TeamAnalysis`` DTOs against `web/src/lib/teams/team-analysis.ts`. Like `WireToleranceTests`,
/// these build from inline JSON literals: the analyze endpoint has no committed fixture, and the
/// point is to prove the DTOs (a) map a full `ok` payload faithfully, (b) tolerate unknown keys
/// and a widened scope, (c) decode the `found: false` member arm, and (d) degrade an
/// `unavailable` envelope honestly.
struct TeamAnalysisDecodeTests {

  private func decode(_ json: String) throws -> TeamAnalysis {
    try JSONDecoder().decode(TeamAnalysis.self, from: Data(json.utf8))
  }

  /// A full `ok` payload maps every leaf: members (found), the defense matrix (member-slug
  /// arrays), offense (covered `{member,move}` pairs + uncovered), speed tiers, and notes.
  @Test
  func okPayloadDecodesEveryLeaf() throws {
    let json = """
      {
        "status": "ok",
        "format": "scarlet-violet",
        "members": [
          {
            "slug": "garchomp", "found": true, "display_name": "Garchomp",
            "types": ["dragon", "ground"], "bst": 600,
            "stats": { "hp": 183, "atk": 182, "def": 115, "spa": 90, "spd": 105, "spe": 169 },
            "level": 50, "nature": "jolly"
          }
        ],
        "defense": [
          { "type": "ice", "weak": ["garchomp"], "resists": [], "immune": [] },
          { "type": "electric", "weak": [], "resists": [], "immune": ["garchomp"] }
        ],
        "offense": {
          "covered": [{ "type": "steel", "by": [{ "member": "garchomp", "move": "earthquake" }] }],
          "uncovered": ["ghost", "flying"]
        },
        "speed_tiers": [{ "member": "garchomp", "speed": 169 }],
        "notes": ["Coverage is type-based only."]
      }
      """
    guard case let .ok(ok) = try decode(json) else {
      Issue.record("expected an ok analysis")
      return
    }
    #expect(ok.format == .scarletViolet)
    #expect(ok.members.count == 1)
    guard case let .found(detail) = ok.members[0] else {
      Issue.record("expected a found member")
      return
    }
    #expect(detail.displayName == "Garchomp")
    #expect(detail.types == ["dragon", "ground"])
    #expect(detail.bst == 600)
    #expect(detail.stats.spe == 169)
    #expect(detail.nature == "jolly")

    #expect(ok.defense.count == 2)
    #expect(ok.defense[0].type == "ice")
    #expect(ok.defense[0].weak == ["garchomp"])
    #expect(ok.defense[1].immune == ["garchomp"])

    #expect(ok.offense.covered.count == 1)
    #expect(ok.offense.covered[0].type == "steel")
    #expect(ok.offense.covered[0].by.first?.member == "garchomp")
    #expect(ok.offense.covered[0].by.first?.move == "earthquake")
    #expect(ok.offense.uncovered == ["ghost", "flying"])

    #expect(ok.speedTiers.first?.speed == 169)
    #expect(ok.notes == ["Coverage is type-based only."])
  }

  /// An unresolved member decodes to the `found: false` arm (never fails the whole call), and a
  /// null stat maps to nil.
  @Test
  func notFoundMemberAndNullStatDecode() throws {
    let json = """
      {
        "status": "ok", "format": "champions",
        "members": [
          { "slug": "not-a-mon", "found": false },
          {
            "slug": "pikachu", "found": true, "display_name": "Pikachu", "types": ["electric"],
            "bst": 320, "stats": { "hp": 111, "atk": null, "def": 70, "spa": 70, "spd": 70, "spe": 130 },
            "level": 50, "nature": null
          }
        ],
        "defense": [], "offense": { "covered": [], "uncovered": [] },
        "speed_tiers": [], "notes": []
      }
      """
    guard case let .ok(ok) = try decode(json) else {
      Issue.record("expected an ok analysis")
      return
    }
    guard case let .notFound(slug) = ok.members[0] else {
      Issue.record("expected a not-found member arm")
      return
    }
    #expect(slug == "not-a-mon")
    #expect(ok.members[0].slug == "not-a-mon")

    guard case let .found(detail) = ok.members[1] else {
      Issue.record("expected a found member")
      return
    }
    #expect(detail.stats.atk == nil)
    #expect(detail.stats.hp == 111)
    #expect(detail.nature == nil)
  }

  /// Unknown top-level/leaf keys are ignored (forward-compat with a widened contract).
  @Test
  func unknownKeysAreTolerated() throws {
    let json = """
      {
        "status": "ok", "format": "scarlet-violet", "future_field": 42,
        "members": [], "defense": [], "offense": { "covered": [], "uncovered": [] },
        "speed_tiers": [], "notes": [], "extra": { "nested": true }
      }
      """
    guard case let .ok(ok) = try decode(json) else {
      Issue.record("expected an ok analysis")
      return
    }
    #expect(ok.members.isEmpty)
    #expect(ok.notes.isEmpty)
  }

  /// The `unavailable` envelope decodes to the honest miss, carrying its format.
  @Test
  func unavailableEnvelopeDecodes() throws {
    let json = """
      {"status":"unavailable","format":"gen-3"}
      """
    guard case let .unavailable(format) = try decode(json) else {
      Issue.record("expected an unavailable analysis")
      return
    }
    #expect(format == .gen3)
  }

  /// An unknown envelope `status` degrades to `.unavailable` (never throws).
  @Test
  func unknownStatusDegradesToUnavailable() throws {
    let json = """
      {"status":"rate_limited","format":"champions"}
      """
    guard case let .unavailable(format) = try decode(json) else {
      Issue.record("expected an unavailable analysis for an unknown status")
      return
    }
    #expect(format == .champions)
  }
}
