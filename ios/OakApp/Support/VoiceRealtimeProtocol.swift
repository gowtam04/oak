import Foundation

/// The xAI Grok Voice Agent realtime WebSocket wire — a faithful Swift port of
/// `web/src/lib/voice/voice-protocol.ts`'s connection helpers + client/server
/// event types. Pure and framework-free (no `URLSession`, no audio types): this
/// is only the URL/subprotocol builders, the JSON shapes sent/received on the
/// socket, and the friendly tool-activity labels. All types are `Sendable`.

// MARK: - Connection

/// xAI realtime WebSocket base + subprotocol helpers.
///
/// Browsers (and, here, the app) strip `Authorization` headers on the socket
/// upgrade, so the ephemeral token rides as the `xai-client-secret.<token>`
/// subprotocol instead. The model is a query param, taken from the session
/// bootstrap.
enum VoiceRealtimeProtocol {
  static let baseURLString = "wss://api.x.ai/v1/realtime"

  /// Build the realtime connect URL for a given voice model.
  static func realtimeURL(model: String) -> URL {
    var components = URLComponents(string: baseURLString)!
    components.queryItems = [URLQueryItem(name: "model", value: model)]
    guard let url = components.url else {
      // `baseURLString` is a fixed, valid URL and `model` is percent-encoded
      // by URLComponents, so this is unreachable in practice.
      preconditionFailure("Failed to build realtime URL for model \(model)")
    }
    return url
  }

  /// The WebSocket subprotocol that carries the ephemeral client secret.
  /// Idempotent: a mint `value` that already includes the `xai-client-secret.`
  /// prefix is returned as-is so we never double-wrap.
  static func clientSecretSubprotocol(token: String) -> String {
    if token.hasPrefix("xai-client-secret.") { return token }
    return "xai-client-secret.\(token)"
  }
}

/// The transcription model xAI uses for the user's input audio.
let voiceTranscribeModel = "grok-transcribe"

// MARK: - Client → server events

/// Thrown when a client event cannot be serialized to a UTF-8 JSON frame.
enum VoiceClientEncodeError: Error {
  /// `JSONEncoder` produced empty bytes or non-UTF-8 output.
  case invalidOutput
}

/// One outbound realtime socket frame. `encode()` produces the exact JSON text
/// xAI expects — field names, nesting, and the flattened tool shape all mirror
/// the web client's `ClientEvent` builders verbatim. Encoding is fail-closed:
/// callers must not send a blank or partial frame (a lost `session.update` is a
/// dead session).
enum VoiceClientEvent: Sendable {
  case sessionUpdate(
    instructions: String,
    voice: String,
    idleTimeoutMs: Int,
    sampleRate: Int,
    reasoningEffort: String,
    tools: [VoiceToolDef]
  )
  case inputAudioAppend(base64: String)
  case functionCallOutput(callId: String, output: String)
  case responseCreate
  case pong(pingTimestamp: Double?)

  /// JSON text to send on the socket. Throws rather than returning an empty
  /// string — a silent empty encode used to drop `session.update` on the floor.
  func encode() throws -> String {
    let encoder = JSONEncoder()
    let data: Data
    switch self {
    case let .sessionUpdate(instructions, voice, idleTimeoutMs, sampleRate, reasoningEffort, tools):
      let payload = SessionUpdatePayload(
        type: "session.update",
        session: .init(
          instructions: instructions,
          voice: voice,
          turnDetection: .init(type: "server_vad", idleTimeoutMs: idleTimeoutMs),
          audio: .init(
            input: .init(
              format: .init(type: "audio/pcm", rate: sampleRate),
              transcription: .init(model: voiceTranscribeModel)
            ),
            output: .init(format: .init(type: "audio/pcm", rate: sampleRate))
          ),
          reasoning: .init(effort: reasoningEffort),
          tools: tools
        )
      )
      data = try encoder.encode(payload)
    case let .inputAudioAppend(base64):
      let payload = InputAudioAppendPayload(type: "input_audio_buffer.append", audio: base64)
      data = try encoder.encode(payload)
    case let .functionCallOutput(callId, output):
      let payload = FunctionCallOutputPayload(
        type: "conversation.item.create",
        item: .init(type: "function_call_output", callId: callId, output: output)
      )
      data = try encoder.encode(payload)
    case .responseCreate:
      data = try encoder.encode(ResponseCreatePayload(type: "response.create"))
    case let .pong(pingTimestamp):
      let payload = PongPayload(type: "pong", pingTimestamp: pingTimestamp)
      data = try encoder.encode(payload)
    }
    guard !data.isEmpty, let text = String(data: data, encoding: .utf8), !text.isEmpty else {
      throw VoiceClientEncodeError.invalidOutput
    }
    return text
  }
}

private struct SessionUpdatePayload: Encodable {
  let type: String
  let session: Session

  struct Session: Encodable {
    let instructions: String
    let voice: String
    let turnDetection: TurnDetection
    let audio: Audio
    let reasoning: Reasoning
    let tools: [VoiceToolDef]

    enum CodingKeys: String, CodingKey {
      case instructions, voice
      case turnDetection = "turn_detection"
      case audio, reasoning, tools
    }
  }

  struct TurnDetection: Encodable {
    let type: String
    let idleTimeoutMs: Int

    enum CodingKeys: String, CodingKey {
      case type
      case idleTimeoutMs = "idle_timeout_ms"
    }
  }

  struct Audio: Encodable {
    let input: AudioInput
    let output: AudioOutput
  }

  struct AudioInput: Encodable {
    let format: PCMFormat
    let transcription: Transcription
  }

  struct AudioOutput: Encodable {
    let format: PCMFormat
  }

  struct PCMFormat: Encodable {
    let type: String
    let rate: Int
  }

  struct Transcription: Encodable {
    let model: String
  }

  struct Reasoning: Encodable {
    let effort: String
  }
}

private struct InputAudioAppendPayload: Encodable {
  let type: String
  let audio: String
}

private struct FunctionCallOutputPayload: Encodable {
  let type: String
  let item: Item

  struct Item: Encodable {
    let type: String
    let callId: String
    let output: String

    enum CodingKeys: String, CodingKey {
      case type
      case callId = "call_id"
      case output
    }
  }
}

private struct ResponseCreatePayload: Encodable {
  let type: String
}

private struct PongPayload: Encodable {
  let type: String
  let pingTimestamp: Double?

  enum CodingKeys: String, CodingKey {
    case type
    case pingTimestamp = "ping_timestamp"
  }
}

// MARK: - Server → client events

/// The realtime frames the client acts on, normalized from xAI's wire names
/// (including the `response.audio*` ↔ `response.output_audio*` aliases — see
/// `parseServerEvent`). Speech-stopped/committed are folded to a single
/// ignorable case each, matching how the web client treats them.
enum VoiceServerEvent: Sendable, Equatable {
  case sessionCreated
  case sessionUpdated
  case speechStarted
  case speechStopped
  case committed
  case responseCreated
  case audioDelta(base64: String)
  case transcriptDelta(String)
  case transcriptDone
  case userTranscript(String)
  case functionCallDone(name: String, callId: String, arguments: String)
  case responseDone
  case ping(timestamp: Double?)
  case errorEvent(code: String?, message: String?, params: String?, eventId: String?)
}

/// Server event type strings that are aliased to a canonical name (mirrors
/// `TYPE_ALIASES` in the web source).
private let voiceServerEventTypeAliases: [String: String] = [
  "response.audio.delta": "response.output_audio.delta",
  "response.audio_transcript.delta": "response.output_audio_transcript.delta",
  "response.audio_transcript.done": "response.output_audio_transcript.done",
]

/// Parse a raw socket text frame into a normalized `VoiceServerEvent`, or `nil`
/// for malformed JSON / a frame with no string `type` / a `type` this client
/// does not handle (forward-compatible ignore — an unknown event never crashes
/// the session).
func parseServerEvent(_ text: String) -> VoiceServerEvent? {
  guard let data = text.data(using: .utf8) else { return nil }
  guard let raw = try? JSONSerialization.jsonObject(with: data) else { return nil }
  guard let obj = raw as? [String: Any] else { return nil }
  guard let rawType = obj["type"] as? String else { return nil }

  let type = voiceServerEventTypeAliases[rawType] ?? rawType

  switch type {
  case "session.created":
    return .sessionCreated
  case "session.updated":
    return .sessionUpdated
  case "input_audio_buffer.speech_started":
    return .speechStarted
  case "input_audio_buffer.speech_stopped":
    return .speechStopped
  case "input_audio_buffer.committed":
    return .committed
  case "response.created":
    return .responseCreated
  case "response.output_audio_transcript.done":
    return .transcriptDone
  case "response.done":
    return .responseDone
  case "response.output_audio.delta":
    guard let delta = obj["delta"] as? String else { return nil }
    return .audioDelta(base64: delta)
  case "response.output_audio_transcript.delta":
    guard let delta = obj["delta"] as? String else { return nil }
    return .transcriptDelta(delta)
  case "conversation.item.input_audio_transcription.completed":
    guard let transcript = obj["transcript"] as? String else { return nil }
    return .userTranscript(transcript)
  case "response.function_call_arguments.done":
    guard let name = obj["name"] as? String,
      let callId = obj["call_id"] as? String,
      let arguments = obj["arguments"] as? String
    else { return nil }
    return .functionCallDone(name: name, callId: callId, arguments: arguments)
  case "ping":
    return .ping(timestamp: obj["ping_timestamp"] as? Double)
  case "error":
    // xAI (and the OpenAI-compatible realtime wire) nests the payload under
    // `error: { code, message, params }`. Older / test frames put `code`/
    // `message` at the top level. Prefer the nested object, fall back to
    // top-level. `params` carries pydantic's `input_value='…'` for invalid_event.
    let nested = obj["error"] as? [String: Any]
    let code = (nested?["code"] as? String) ?? (obj["code"] as? String)
    let message = (nested?["message"] as? String) ?? (obj["message"] as? String)
    let params = jsonTextField(nested, "params") ?? jsonTextField(obj, "params")
    let eventId = (nested?["event_id"] as? String) ?? (obj["event_id"] as? String)
    return .errorEvent(code: code, message: message, params: params, eventId: eventId)
  default:
    return nil
  }
}

/// Top-level `type` of an outbound JSON frame, or `nil` if the text is not a
/// JSON object with a string `type`. Used for logs — never log the body
/// (audio / session.update instructions+tools).
func voiceOutboundType(from json: String) -> String? {
  guard let data = json.data(using: .utf8),
    let raw = try? JSONSerialization.jsonObject(with: data),
    let obj = raw as? [String: Any],
    let type = obj["type"] as? String,
    !type.isEmpty
  else { return nil }
  return type
}

/// Overlay/log copy for a server `error` frame. When pydantic's `params` include
/// `input_value='…'`, that rejected type is appended so the overlay is never a
/// bare "Invalid event received".
func formatVoiceServerError(message: String?, params: String?) -> String {
  let trimmedMessage = message?.trimmingCharacters(in: .whitespacesAndNewlines)
  let msg = (trimmedMessage?.isEmpty == false) ? trimmedMessage! : "Voice connection failed."
  let trimmedParams = params?.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let trimmedParams, !trimmedParams.isEmpty else { return msg }
  if let value = extractVoiceErrorInputValue(from: trimmedParams) {
    return "\(msg) (rejected type: \(value))"
  }
  return "\(msg) — \(trimmedParams)"
}

func extractVoiceErrorInputValue(from params: String) -> String? {
  let patterns = [
    #"input_value='([^']*)'"#,
    #"input_value=\"([^\"]*)\""#,
    #""input_value"\s*:\s*"([^"]*)""#,
  ]
  for pattern in patterns {
    guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
    let range = NSRange(params.startIndex..., in: params)
    guard let match = regex.firstMatch(in: params, range: range),
      match.numberOfRanges >= 2,
      let group = Range(match.range(at: 1), in: params)
    else { continue }
    let value = String(params[group])
    if !value.isEmpty { return value }
  }
  return nil
}

/// Read a JSON object field as text: a string as-is, an object/array as compact
/// JSON. Used for xAI `error.params` which is usually a pydantic string but may
/// arrive as a structured object.
private func jsonTextField(_ obj: [String: Any]?, _ key: String) -> String? {
  guard let obj, let value = obj[key] else { return nil }
  if let s = value as? String { return s }
  if value is NSNull { return nil }
  guard JSONSerialization.isValidJSONObject(value),
    let data = try? JSONSerialization.data(withJSONObject: value),
    let s = String(data: data, encoding: .utf8)
  else { return nil }
  return s
}

// MARK: - Tool-activity labels

/// A short, friendly label for a tool the voice model calls (presentational
/// mirror of `voiceToolLabel` in the web source — same emoji + phrasing so the
/// overlay ticker speaks the same visual language as chat's progress labels).
/// An unknown tool falls back to a generic label rather than crashing.
private let voiceToolLabels: [String: String] = [
  "resolve_entity": "🔍 Resolving name…",
  "query_pokedex": "📊 Searching the Pokédex…",
  "get_pokemon": "📇 Looking up Pokémon…",
  "get_move": "⚔️ Looking up move…",
  "get_ability": "✨ Looking up ability…",
  "get_type_matchups": "🛡️ Checking type matchups…",
  "get_evolution_chain": "🧬 Tracing evolution…",
  "get_item": "🎒 Looking up item…",
  "compute_stat": "🧮 Computing stat…",
  "estimate_damage": "💥 Estimating damage…",
  "get_team": "📋 Reading your team…",
  "save_team": "💾 Saving your team…",
  "get_encounters": "🗺️ Checking where to find it…",
  "get_usage_stats": "📈 Checking live usage…",
  "list_teams": "📋 Finding your teams…",
  "get_learnset": "📖 Checking the learnset…",
]

func voiceToolLabel(_ tool: String) -> String {
  voiceToolLabels[tool] ?? "Running \(tool)…"
}
