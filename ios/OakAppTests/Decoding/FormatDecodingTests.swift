import Foundation
import Testing

@testable import OakApp

/// `Format` widened from 2 to 11 known cases plus a tolerant `.unknown(String)`
/// fallback (Phase 1 of the iOS↔web parity plan, then the national-dex-scope
/// widening) — this is a correctness fix, not just added coverage: before the
/// widening, a web-created gen-scoped conversation/team (`gen-5`…`gen-8`, then
/// `national-dex`/`gen-1`…`gen-4`) would fail to decode at all, breaking the
/// whole list for that user. These tests pin both directions: every known raw
/// value round-trips through its case, and ANY unrecognized string still decodes
/// (never throws) by falling back to `.unknown`, re-encoding as its original raw
/// string.
struct FormatDecodingTests {

  // MARK: Known cases — decode + round-trip

  /// Each of the eleven known wire strings (`web/src/data/formats.ts` `FORMATS`)
  /// decodes to its case and re-encodes byte-identically.
  @Test
  func knownFormatsDecodeAndRoundTrip() throws {
    let cases: [(raw: String, expected: Format)] = [
      ("national-dex", .nationalDex),
      ("scarlet-violet", .scarletViolet),
      ("champions", .champions),
      ("gen-5", .gen5),
      ("gen-6", .gen6),
      ("gen-7", .gen7),
      ("gen-8", .gen8),
      ("gen-4", .gen4),
      ("gen-3", .gen3),
      ("gen-2", .gen2),
      ("gen-1", .gen1),
    ]
    for (raw, expected) in cases {
      let decoded = try JSONDecoder().decode(FormatBox.self, from: box(raw)).value
      #expect(decoded == expected)
      #expect(decoded.rawValue == raw)

      let reencoded = try JSONEncoder().encode(FormatBox(value: decoded))
      let roundTripped = try JSONDecoder().decode(FormatBox.self, from: reencoded).value
      #expect(roundTripped == expected)
    }
    // `Format.knownCases` is exactly the eleven known cases, in scope-picker
    // DISPLAY order: the default (National Dex) first, then Champions/
    // Scarlet-Violet, then release-date descending (Gen 8 → Gen 1). This no
    // longer mirrors the `FORMATS` array order — web exposes the same order via a
    // separate `SCOPE_PICKER_ORDER` constant.
    #expect(
      Format.knownCases.map(\.rawValue) == [
        "national-dex", "champions", "scarlet-violet", "gen-8", "gen-7", "gen-6", "gen-5",
        "gen-4", "gen-3", "gen-2", "gen-1",
      ])
  }

  // MARK: Unknown format — tolerant decode

  /// A format string outside the known eleven decodes to `.unknown(raw)` rather
  /// than throwing — the core tolerance guarantee.
  @Test
  func unrecognizedFormatDecodesAsUnknown() throws {
    let decoded = try JSONDecoder().decode(FormatBox.self, from: box("gen-99-mystery")).value
    #expect(decoded == .unknown("gen-99-mystery"))
    #expect(decoded.rawValue == "gen-99-mystery")
  }

  /// `.unknown` re-encodes as its original raw string — so a value that merely
  /// passes through this client (never inspected, only possibly resent) is
  /// preserved verbatim rather than corrupted or dropped.
  @Test
  func unknownFormatReencodesOriginalRawValue() throws {
    let decoded = try JSONDecoder().decode(FormatBox.self, from: box("gen-99-mystery")).value
    let reencoded = try JSONEncoder().encode(FormatBox(value: decoded))
    let roundTripped = try JSONDecoder().decode(FormatBox.self, from: reencoded).value
    #expect(roundTripped == decoded)
    #expect(roundTripped.rawValue == "gen-99-mystery")
  }

  /// Display labels degrade gracefully for `.unknown` — echo the raw slug rather
  /// than rendering blank/"undefined" (mirrors the web `scopeLabel`/
  /// `scopeLabelShort` defensive fallback).
  @Test
  func unknownFormatDisplayLabelsEchoRawValue() {
    let format = Format.unknown("gen-99-mystery")
    #expect(format.shortLabel == "gen-99-mystery")
    #expect(format.displayLabel == "gen-99-mystery")
  }

  // MARK: Parent-DTO tolerance — the actual live-bug fixture

  /// The real-world case this all guards: a conversations list mixing all eleven
  /// known formats with one from-the-future unrecognized format must still
  /// decode as a whole — a single bad `format` value must never fail the list.
  @Test
  func conversationsListDecodesAllKnownFormatsPlusUnknownTolerantly() throws {
    let env = try Fixtures.decode(
      ConversationsListAllFormatsEnvelope.self,
      from: "conversations_list_all_formats.json"
    )
    #expect(env.conversations.count == 12)
    #expect(env.conversations[0].format == .scarletViolet)
    #expect(env.conversations[1].format == .champions)
    #expect(env.conversations[2].format == .gen5)
    #expect(env.conversations[3].format == .gen6)
    #expect(env.conversations[4].format == .gen7)
    #expect(env.conversations[5].format == .gen8)
    #expect(env.conversations[6].format == .nationalDex)
    #expect(env.conversations[7].format == .gen4)
    #expect(env.conversations[8].format == .gen3)
    #expect(env.conversations[9].format == .gen2)
    #expect(env.conversations[10].format == .gen1)
    #expect(env.conversations[11].format == .unknown("gen-99-mystery"))
  }

  // MARK: Helpers

  /// A bare JSON string literal, boxed under `"value"` (avoids relying on
  /// top-level JSON fragment decoding, mirroring `JSONScalarRoundTripTests`).
  private func box(_ raw: String) -> Data {
    Data("{\"value\":\"\(raw)\"}".utf8)
  }
}

/// Single-key wrapper used to decode/encode a bare `Format` without relying on
/// top-level JSON fragment support.
private struct FormatBox: Codable, Equatable {
  let value: Format
}

/// Test-local decode target for the all-formats fixture — a `ConversationSummary`
/// list envelope, same shape as `FixtureDecodingTests`' private
/// `ConversationsListEnvelope` (kept file-scoped rather than shared, per that
/// file's own convention).
private struct ConversationsListAllFormatsEnvelope: Decodable {
  let conversations: [ConversationSummary]
}
