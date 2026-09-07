import Foundation
import Testing

@testable import OakApp

/// Round-trips the outbound `ChatRequest` body (testing-strategy.md "encode/decode
/// request bodies"). `ChatRequest` is `Encodable`-only, so the round-trip encodes
/// it and re-decodes through a wire mirror, asserting the snake_case mapping
/// (`session_id`, `scope_seed`) AND that the image's `mimeType` stays camelCase —
/// the exact mixed-convention case the explicit per-type `CodingKeys` exist to
/// handle. It also pins the generation-scope contract: `scope_seed` carries the
/// `Format` rawValue when a chip pick is set, and the deprecated `champions_mode`
/// field is NEVER on the wire.
struct ChatRequestEncodingTests {

  private func encodedObject(_ request: ChatRequest) throws -> [String: Any] {
    let data = try JSONEncoder().encode(request)
    let object = try JSONSerialization.jsonObject(with: data)
    return try #require(object as? [String: Any])
  }

  /// A text-only turn with no scope pick maps to snake_case keys and omits the
  /// optional `images` / `scope_seed`. `champions_mode` never appears.
  @Test
  func textOnlyTurnEncodesSnakeCaseAndOmitsNilOptionals() throws {
    let request = ChatRequest(
      sessionId: "sess-123",
      message: "What is Garchomp's typing?",
      images: nil,
      scopeSeed: nil
    )
    let object = try encodedObject(request)

    #expect(object["session_id"] as? String == "sess-123")
    #expect(object["message"] as? String == "What is Garchomp's typing?")
    // nil optionals are omitted (synthesized encode uses encodeIfPresent).
    #expect(object["scope_seed"] == nil)
    #expect(object["images"] == nil)
    // The deprecated field is gone entirely — never emitted.
    #expect(object["champions_mode"] == nil)
    #expect(object["recovery"] == nil)
    #expect(object["mentioned_team_ids"] == nil)
    // No camelCase leakage of the renamed keys.
    #expect(object["sessionId"] == nil)
    #expect(object["scopeSeed"] == nil)
  }

  @Test
  func recoveryAndMentionedTeamIdsEncodeSnakeCase() throws {
    let request = ChatRequest(
      sessionId: "sess-rec",
      message: "retry this",
      images: nil,
      scopeSeed: nil,
      recovery: .retry,
      mentionedTeamIds: ["team-1", "team-2"]
    )
    let object = try encodedObject(request)
    #expect(object["recovery"] as? String == "retry")
    #expect(object["mentioned_team_ids"] as? [String] == ["team-1", "team-2"])
    #expect(object["mentionedTeamIds"] == nil)
  }

  /// An image-bearing turn may carry an empty `message`; a Champions seed (if the
  /// client still sends `scope_seed` at all) encodes as its `Format` rawValue;
  /// each image keeps camelCase `mimeType` and raw base64. Other-format seeds are
  /// a decode leftover — ChatViewModel must not send them (CF-CHAT-US-1).
  @Test
  func imageTurnEncodesScopeSeedAndRawBase64Images() throws {
    let request = ChatRequest(
      sessionId: "sess-456",
      message: "",
      images: [
        ChatImage(mimeType: "image/jpeg", data: "AQIDBA=="),
        ChatImage(mimeType: "image/png", data: "BQYHCA=="),
      ],
      scopeSeed: .champions
    )
    let object = try encodedObject(request)

    #expect(object["session_id"] as? String == "sess-456")
    #expect(object["message"] as? String == "")
    // scope_seed carries the wire rawValue, not a case name.
    #expect(object["scope_seed"] as? String == "champions")
    #expect(object["champions_mode"] == nil)

    let images = try #require(object["images"] as? [[String: Any]])
    #expect(images.count == 2)
    // mimeType is intentionally camelCase on the wire (server re-sniffs anyway).
    #expect(images[0]["mimeType"] as? String == "image/jpeg")
    // Raw base64, no "data:" prefix.
    let raw = try #require(images[0]["data"] as? String)
    #expect(raw == "AQIDBA==")
    #expect(raw.hasPrefix("data:") == false)
  }

  /// Encode → decode (through a wire mirror) → field equality: a true round-trip
  /// that fails if any key name or value is dropped or coerced.
  @Test
  func roundTripsThroughWireMirror() throws {
    let request = ChatRequest(
      sessionId: "sess-789",
      message: "Build me a rain team",
      images: [ChatImage(mimeType: "image/webp", data: "CQoLDA==")],
      scopeSeed: .champions
    )
    let data = try JSONEncoder().encode(request)
    let mirror = try JSONDecoder().decode(ChatRequestWireMirror.self, from: data)

    #expect(mirror.sessionId == request.sessionId)
    #expect(mirror.message == request.message)
    #expect(mirror.scopeSeed == "champions")
    #expect(mirror.images?.count == 1)
    #expect(mirror.images?.first?.mimeType == "image/webp")
    #expect(mirror.images?.first?.data == "CQoLDA==")
  }
}

/// A `Decodable` mirror of the `ChatRequest` wire frame — the decode half of the
/// round-trip (the production `ChatRequest` is `Encodable`-only by design).
/// `scopeSeed` is decoded as the raw wire string so the test asserts the exact
/// `Format` rawValue mapping.
private struct ChatRequestWireMirror: Decodable, Equatable {
  let sessionId: String
  let message: String
  let scopeSeed: String?
  let images: [ImageMirror]?

  enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case message
    case scopeSeed = "scope_seed"
    case images
  }

  struct ImageMirror: Decodable, Equatable {
    let mimeType: String
    let data: String
  }
}
