import Foundation
import Testing

@testable import OakApp

/// Unit tests for `VoiceRealtimeProtocol.swift` — the xAI realtime socket wire
/// (URL/subprotocol builders, client-event encoding, server-event parsing incl.
/// aliases, and the tool-activity label map).
struct VoiceRealtimeProtocolTests {

  // MARK: connection builders

  @Test
  func realtimeURLBuildsExpectedURL() {
    let url = VoiceRealtimeProtocol.realtimeURL(model: "grok-voice-latest")
    #expect(url.absoluteString == "wss://api.x.ai/v1/realtime?model=grok-voice-latest")
  }

  @Test
  func clientSecretSubprotocolFormatsToken() {
    #expect(VoiceRealtimeProtocol.clientSecretSubprotocol(token: "tok_123") == "xai-client-secret.tok_123")
  }

  @Test
  func clientSecretSubprotocolDoesNotDoublePrefix() {
    #expect(
      VoiceRealtimeProtocol.clientSecretSubprotocol(token: "xai-client-secret.tok_123")
        == "xai-client-secret.tok_123"
    )
  }

  // MARK: client event encoding

  private func decodeJSONObject(_ text: String) throws -> [String: Any] {
    let data = Data(text.utf8)
    let raw = try JSONSerialization.jsonObject(with: data)
    return try #require(raw as? [String: Any])
  }

  /// JSONSerialization can ignore trailing bytes that pydantic will still see.
  /// Walk the first object and require the remainder to be whitespace-only.
  private func assertSingleJSONObject(_ text: String) throws {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    #expect(trimmed.first == "{")
    var depth = 0
    var inString = false
    var escape = false
    var end: String.Index?
    var i = trimmed.startIndex
    while i < trimmed.endIndex {
      let c = trimmed[i]
      if inString {
        if escape {
          escape = false
        } else if c == "\\" {
          escape = true
        } else if c == "\"" {
          inString = false
        }
      } else if c == "\"" {
        inString = true
      } else if c == "{" {
        depth += 1
      } else if c == "}" {
        depth -= 1
        if depth == 0 {
          end = trimmed.index(after: i)
          break
        }
      }
      i = trimmed.index(after: i)
    }
    let close = try #require(end)
    let trailing = trimmed[close...].trimmingCharacters(in: .whitespacesAndNewlines)
    #expect(trailing.isEmpty, "trailing JSON after first object: \(trailing.prefix(40))")
  }

  @Test
  func sessionUpdateEncodesExactStructure() throws {
    let tools = [
      VoiceToolDef(
        type: "function",
        name: "get_pokemon",
        description: "Look up a Pokémon.",
        parameters: .object(["type": .string("object")])
      )
    ]
    let event = VoiceClientEvent.sessionUpdate(
      instructions: "Speak as Oak.",
      voice: "rex",
      idleTimeoutMs: 30000,
      sampleRate: 24000,
      reasoningEffort: "none",
      tools: tools
    )

    let encoded = try event.encode()
    try assertSingleJSONObject(encoded)
    // JSONEncoder does not guarantee key order; pin the value, not the prefix.
    #expect(encoded.contains("\"type\":\"session.update\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "session.update")
    #expect(Set(obj.keys) == ["type", "session"])

    let session = try #require(obj["session"] as? [String: Any])
    #expect(session["instructions"] as? String == "Speak as Oak.")
    #expect(session["voice"] as? String == "rex")

    let turnDetection = try #require(session["turn_detection"] as? [String: Any])
    #expect(turnDetection["type"] as? String == "server_vad")
    #expect(turnDetection["idle_timeout_ms"] as? Int == 30000)

    let audio = try #require(session["audio"] as? [String: Any])
    let input = try #require(audio["input"] as? [String: Any])
    let inputFormat = try #require(input["format"] as? [String: Any])
    #expect(inputFormat["type"] as? String == "audio/pcm")
    #expect(inputFormat["rate"] as? Int == 24000)
    let transcription = try #require(input["transcription"] as? [String: Any])
    #expect(transcription["model"] as? String == "grok-transcribe")

    let output = try #require(audio["output"] as? [String: Any])
    let outputFormat = try #require(output["format"] as? [String: Any])
    #expect(outputFormat["type"] as? String == "audio/pcm")
    #expect(outputFormat["rate"] as? Int == 24000)

    let reasoning = try #require(session["reasoning"] as? [String: Any])
    #expect(reasoning["effort"] as? String == "none")

    let toolsOut = try #require(session["tools"] as? [[String: Any]])
    #expect(toolsOut.count == 1)
    #expect(toolsOut[0]["name"] as? String == "get_pokemon")
    #expect(toolsOut[0]["type"] as? String == "function")
    let params = try #require(toolsOut[0]["parameters"] as? [String: Any])
    #expect(params["type"] as? String == "object")
  }

  @Test
  func inputAudioAppendEncodesStructure() throws {
    let encoded = try VoiceClientEvent.inputAudioAppend(base64: "AQA=").encode()
    try assertSingleJSONObject(encoded)
    #expect(encoded.contains("\"type\":\"input_audio_buffer.append\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "input_audio_buffer.append")
    #expect(obj["audio"] as? String == "AQA=")
  }

  @Test
  func functionCallOutputEncodesStructure() throws {
    let encoded = try VoiceClientEvent.functionCallOutput(
      callId: "call_1", output: "{\"found\":true}"
    ).encode()
    try assertSingleJSONObject(encoded)
    #expect(encoded.contains("\"type\":\"conversation.item.create\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "conversation.item.create")
    let item = try #require(obj["item"] as? [String: Any])
    #expect(item["type"] as? String == "function_call_output")
    #expect(item["call_id"] as? String == "call_1")
    #expect(item["output"] as? String == "{\"found\":true}")
  }

  @Test
  func responseCreateEncodesStructure() throws {
    let encoded = try VoiceClientEvent.responseCreate.encode()
    try assertSingleJSONObject(encoded)
    #expect(encoded.contains("\"type\":\"response.create\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "response.create")
    #expect(obj.count == 1)
  }

  @Test
  func pongEncodesWithTimestamp() throws {
    let encoded = try VoiceClientEvent.pong(pingTimestamp: 42.5).encode()
    try assertSingleJSONObject(encoded)
    #expect(encoded.contains("\"type\":\"pong\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "pong")
    #expect(obj["ping_timestamp"] as? Double == 42.5)
  }

  @Test
  func pongEncodesWithoutTimestampWhenNil() throws {
    let encoded = try VoiceClientEvent.pong(pingTimestamp: nil).encode()
    try assertSingleJSONObject(encoded)
    #expect(encoded.contains("\"type\":\"pong\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "pong")
    #expect(obj["ping_timestamp"] == nil)
  }

  @Test
  func everyClientEventTypeIsInTheLiveAllowedSet() throws {
    let allowed: Set<String> = [
      "session.update",
      "input_audio_buffer.append",
      "conversation.item.create",
      "response.create",
      "pong",
    ]
    let events: [VoiceClientEvent] = [
      .sessionUpdate(
        instructions: "x",
        voice: "rex",
        idleTimeoutMs: 1,
        sampleRate: 24_000,
        reasoningEffort: "none",
        tools: []
      ),
      .inputAudioAppend(base64: "AQA="),
      .functionCallOutput(callId: "c", output: "{}"),
      .responseCreate,
      .pong(pingTimestamp: 1),
      .pong(pingTimestamp: nil),
    ]
    for event in events {
      let encoded = try event.encode()
      try assertSingleJSONObject(encoded)
      let type = try #require(voiceOutboundType(from: encoded))
      #expect(allowed.contains(type), "unexpected outbound type \(type)")
    }
  }

  @Test
  func sessionUpdateFromTokenFixtureIsASingleEnvelope() throws {
    let bootstrap = try Fixtures.decode(VoiceTokenResponse.self, from: "voice_token.json").session
    let encoded = try VoiceClientEvent.sessionUpdate(
      instructions: bootstrap.instructions,
      voice: bootstrap.voice,
      idleTimeoutMs: bootstrap.idleTimeoutMs,
      sampleRate: 24_000,
      reasoningEffort: bootstrap.reasoningEffort,
      tools: bootstrap.tools
    ).encode()
    try assertSingleJSONObject(encoded)
    #expect(encoded.contains("\"type\":\"session.update\""))
    let obj = try decodeJSONObject(encoded)
    #expect(obj["type"] as? String == "session.update")
    #expect(Set(obj.keys) == ["type", "session"])
    let session = try #require(obj["session"] as? [String: Any])
    let toolsOut = try #require(session["tools"] as? [[String: Any]])
    #expect(toolsOut.count == 3)
    #expect(toolsOut[0]["type"] as? String == "function")
  }

  // MARK: server event parsing

  @Test
  func parsesSimpleTypedEvents() {
    #expect(parseServerEvent(#"{"type":"session.created"}"#) == .sessionCreated)
    #expect(parseServerEvent(#"{"type":"session.updated"}"#) == .sessionUpdated)
    #expect(parseServerEvent(#"{"type":"input_audio_buffer.speech_started"}"#) == .speechStarted)
    #expect(parseServerEvent(#"{"type":"input_audio_buffer.speech_stopped"}"#) == .speechStopped)
    #expect(parseServerEvent(#"{"type":"input_audio_buffer.committed"}"#) == .committed)
    #expect(parseServerEvent(#"{"type":"response.created"}"#) == .responseCreated)
    #expect(parseServerEvent(#"{"type":"response.output_audio_transcript.done"}"#) == .transcriptDone)
    #expect(parseServerEvent(#"{"type":"response.done"}"#) == .responseDone)
  }

  @Test
  func parsesAudioAndTranscriptDeltas() {
    #expect(
      parseServerEvent(#"{"type":"response.output_audio.delta","delta":"AQA="}"#)
        == .audioDelta(base64: "AQA=")
    )
    #expect(
      parseServerEvent(#"{"type":"response.output_audio_transcript.delta","delta":"hi"}"#)
        == .transcriptDelta("hi")
    )
  }

  @Test
  func parsesAliasedEventTypes() {
    // response.audio.delta → response.output_audio.delta
    #expect(
      parseServerEvent(#"{"type":"response.audio.delta","delta":"AQA="}"#)
        == .audioDelta(base64: "AQA=")
    )
    // response.audio_transcript.delta → response.output_audio_transcript.delta
    #expect(
      parseServerEvent(#"{"type":"response.audio_transcript.delta","delta":"hi"}"#)
        == .transcriptDelta("hi")
    )
    // response.audio_transcript.done → response.output_audio_transcript.done
    #expect(parseServerEvent(#"{"type":"response.audio_transcript.done"}"#) == .transcriptDone)
  }

  @Test
  func parsesUserTranscriptFunctionCallPingAndError() {
    #expect(
      parseServerEvent(
        #"{"type":"conversation.item.input_audio_transcription.completed","transcript":"hello"}"#
      ) == .userTranscript("hello")
    )
    #expect(
      parseServerEvent(
        #"{"type":"response.function_call_arguments.done","name":"get_pokemon","call_id":"call_1","arguments":"{}"}"#
      ) == .functionCallDone(name: "get_pokemon", callId: "call_1", arguments: "{}")
    )
    #expect(parseServerEvent(#"{"type":"ping","ping_timestamp":1234.5}"#) == .ping(timestamp: 1234.5))
    #expect(parseServerEvent(#"{"type":"ping"}"#) == .ping(timestamp: nil))
    #expect(
      parseServerEvent(#"{"type":"error","code":"bad_request","message":"oops"}"#)
        == .errorEvent(code: "bad_request", message: "oops", params: nil, eventId: nil)
    )
    #expect(
      parseServerEvent(#"{"type":"error"}"#)
        == .errorEvent(code: nil, message: nil, params: nil, eventId: nil)
    )
    #expect(
      parseServerEvent(
        #"{"type":"error","error":{"type":"invalid_request_error","code":"bad_request","message":"nested oops"}}"#
      ) == .errorEvent(code: "bad_request", message: "nested oops", params: nil, eventId: nil)
    )
  }

  @Test
  func nestedInvalidEventKeepsParamsAndEventId() throws {
    let params =
      "1 validation error for RealtimeClientEvent\ntype\n  Input should be '<enum>' [type=enum, input_value='not.a.real.event', input_type=str]"
    let payload: [String: Any] = [
      "type": "error",
      "event_id": "evt_1",
      "error": [
        "type": "invalid_request_error",
        "code": "invalid_event",
        "message": "Invalid event received",
        "params": params,
      ],
    ]
    let data = try JSONSerialization.data(withJSONObject: payload)
    let frame = String(decoding: data, as: UTF8.self)
    let parsed = parseServerEvent(frame)
    #expect(
      parsed
        == .errorEvent(
          code: "invalid_event",
          message: "Invalid event received",
          params: params,
          eventId: "evt_1"
        )
    )
    #expect(
      formatVoiceServerError(message: "Invalid event received", params: params)
        == "Invalid event received (rejected type: not.a.real.event)"
    )
  }

  @Test
  func formatVoiceServerErrorFallsBackToParamsThenMessage() {
    #expect(
      formatVoiceServerError(message: "Invalid event received", params: nil)
        == "Invalid event received"
    )
    #expect(
      formatVoiceServerError(message: nil, params: nil) == "Voice connection failed."
    )
    #expect(
      formatVoiceServerError(message: "boom", params: "field x is required")
        == "boom — field x is required"
    )
    #expect(
      extractVoiceErrorInputValue(
        from: #""input_value": "session.Update""#
      ) == "session.Update"
    )
  }

  @Test
  func unknownEventTypeReturnsNil() {
    #expect(parseServerEvent(#"{"type":"some.future.event","foo":"bar"}"#) == nil)
  }

  @Test
  func malformedJSONReturnsNil() {
    #expect(parseServerEvent("not json") == nil)
    #expect(parseServerEvent("{") == nil)
    #expect(parseServerEvent(#"{"no_type_field":true}"#) == nil)
    #expect(parseServerEvent(#"[]"#) == nil)
  }

  @Test
  func missingRequiredFieldsReturnsNil() {
    // audio delta without a `delta` string.
    #expect(parseServerEvent(#"{"type":"response.output_audio.delta"}"#) == nil)
    // function_call_arguments.done missing arguments.
    #expect(
      parseServerEvent(#"{"type":"response.function_call_arguments.done","name":"x","call_id":"y"}"#) == nil
    )
  }

  // MARK: tool labels

  @Test
  func voiceToolLabelReturnsKnownLabels() {
    #expect(voiceToolLabel("get_pokemon") == "📇 Looking up Pokémon…")
    #expect(voiceToolLabel("resolve_entity") == "🔍 Resolving name…")
    #expect(voiceToolLabel("get_learnset") == "📖 Checking the learnset…")
  }

  @Test
  func voiceToolLabelFallsBackForUnknownTool() {
    #expect(voiceToolLabel("some_new_tool") == "Running some_new_tool…")
  }
}
