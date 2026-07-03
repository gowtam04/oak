import Foundation
import Testing

@testable import OakApp

/// Contract-drift guard for the voice HTTP DTOs (mirrors `FixtureDecodingTests`'
/// approach): decode the committed fixtures into their Swift DTOs, and prove
/// nested/heterogeneous `JSONValue` payloads (JSON-Schema tool parameters, tool
/// output) survive a decode → encode → decode round trip with no data loss.
struct VoiceWireDecodeTests {

  @Test
  func voiceTokenResponseDecodesFixture() throws {
    let response = try Fixtures.decode(VoiceTokenResponse.self, from: "voice_token.json")

    #expect(response.token == "eph_abc123xyz")
    #expect(response.expiresAt == 1_735_689_600)
    #expect(response.session.model == "grok-voice-latest")
    #expect(response.session.voice == "rex")
    #expect(response.session.reasoningEffort == "none")
    #expect(response.session.idleTimeoutMs == 30000)
    #expect(response.session.maxSessionMs == 600000)
    #expect(response.session.tools.count == 3)
    #expect(response.session.tools[0].name == "get_pokemon")
    #expect(response.session.tools[1].name == "get_move")
    #expect(response.session.tools[2].name == "estimate_damage")
  }

  @Test
  func voiceTokenResponseNestedToolParametersRoundTripLosslessly() throws {
    let original = try Fixtures.decode(VoiceTokenResponse.self, from: "voice_token.json")

    // The nested move tool's parameters carry an object with a nested array
    // schema (`tags: { type: array, items: { type: string } }`) — confirm it
    // decoded into a structured JSONValue, not a flattened/lossy shape.
    guard case let .object(moveParams) = original.session.tools[1].parameters,
      case let .object(properties) = moveParams["properties"]!,
      case let .object(tagsSchema) = properties["tags"]!,
      case .object = tagsSchema["items"]!
    else {
      Issue.record("expected get_move's `tags` parameter to be a nested object schema")
      return
    }

    let reencoded = try JSONEncoder().encode(original)
    let roundTripped = try JSONDecoder().decode(VoiceTokenResponse.self, from: reencoded)
    #expect(roundTripped == original)

    // The deeply-nested estimate_damage schema (object → object → object)
    // survives the round trip structurally intact.
    guard case let .object(damageParams) = roundTripped.session.tools[2].parameters,
      case let .object(damageProps) = damageParams["properties"]!,
      case .object = damageProps["attacker"]!
    else {
      Issue.record("expected estimate_damage's `attacker` parameter to remain a nested object")
      return
    }
  }

  @Test
  func voiceToolResponseDecodesFixture() throws {
    let response = try Fixtures.decode(VoiceToolResponse.self, from: "voice_tool.json")

    guard case let .object(output) = response.output else {
      Issue.record("expected voice_tool.json's output to decode as an object")
      return
    }
    #expect(output["found"] == .bool(true))

    guard case let .object(pokemon) = output["pokemon"]! else {
      Issue.record("expected nested pokemon object")
      return
    }
    #expect(pokemon["name"] == .string("Garchomp"))
    #expect(pokemon["national_dex_number"] == .number(445))
    #expect(pokemon["held_item"] == .null)

    guard case let .array(types) = pokemon["types"]! else {
      Issue.record("expected nested types array")
      return
    }
    #expect(types == [.string("dragon"), .string("ground")])
  }

  @Test
  func voiceToolResponseOutputRoundTripsLosslessly() throws {
    let original = try Fixtures.decode(VoiceToolResponse.self, from: "voice_tool.json")
    let reencoded = try JSONEncoder().encode(original)
    let roundTripped = try JSONDecoder().decode(VoiceToolResponse.self, from: reencoded)
    #expect(roundTripped == original)
  }

  @Test
  func voiceTokenRequestEncodesSnakeCaseFields() throws {
    let request = VoiceTokenRequest(sessionId: "sess_1", format: "champions")
    let data = try JSONEncoder().encode(request)
    let obj = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(obj["session_id"] as? String == "sess_1")
    #expect(obj["format"] as? String == "champions")
  }

  @Test
  func voiceToolRequestEncodesSnakeCaseFields() throws {
    let request = VoiceToolRequest(
      sessionId: "sess_1",
      format: "champions",
      name: "get_pokemon",
      arguments: "{\"id\":\"garchomp\"}"
    )
    let data = try JSONEncoder().encode(request)
    let obj = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(obj["session_id"] as? String == "sess_1")
    #expect(obj["format"] as? String == "champions")
    #expect(obj["name"] as? String == "get_pokemon")
    #expect(obj["arguments"] as? String == "{\"id\":\"garchomp\"}")
  }

  @Test
  func voiceTranscriptRequestEncodesSnakeCaseFields() throws {
    let request = VoiceTranscriptRequest(
      sessionId: "sess_1",
      format: "champions",
      userText: "What beats Garchomp?",
      assistantText: "Ice and dragon moves work well."
    )
    let data = try JSONEncoder().encode(request)
    let obj = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(obj["session_id"] as? String == "sess_1")
    #expect(obj["user_text"] as? String == "What beats Garchomp?")
    #expect(obj["assistant_text"] as? String == "Ice and dragon moves work well.")
  }
}
