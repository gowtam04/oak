import Foundation

/// Wire DTOs for `POST /api/voice/*` (the voice-mode plan §5; `web/src/lib/voice/voice-types.ts`).
///
/// Faithful mirror of the TypeScript contract — the TS source is authoritative.
/// Mapping rule (conventions.md, same as `ChatWire.swift`): explicit `CodingKeys`
/// per type, never `.convertFromSnakeCase`.
///
/// `format` is carried as a plain `String` here rather than the app's `Format`
/// enum — this file is the pure protocol layer (T1); wiring it to `Format` is a
/// later task's concern, so this stays decoupled.

// MARK: - POST /api/voice/token

/// Request body for `POST /api/voice/token`.
struct VoiceTokenRequest: Encodable, Sendable {
  let sessionId: String
  let format: String

  private enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case format
  }
}

/// Response body for `POST /api/voice/token`.
struct VoiceTokenResponse: Codable, Sendable, Equatable {
  let token: String
  /// Unix seconds — when the ephemeral token expires.
  let expiresAt: Double
  let session: VoiceSessionBootstrap

  private enum CodingKeys: String, CodingKey {
    case token
    case expiresAt = "expires_at"
    case session
  }
}

/// Everything the client needs to configure the realtime session via a single
/// `session.update` after the socket opens (plus the client-side auto-end cap).
struct VoiceSessionBootstrap: Codable, Sendable, Equatable {
  let model: String
  let voice: String
  let instructions: String
  let reasoningEffort: String
  let idleTimeoutMs: Int
  let maxSessionMs: Int
  let tools: [VoiceToolDef]

  private enum CodingKeys: String, CodingKey {
    case model
    case voice
    case instructions
    case reasoningEffort = "reasoning_effort"
    case idleTimeoutMs = "idle_timeout_ms"
    case maxSessionMs = "max_session_ms"
    case tools
  }
}

/// One tool advertised to the realtime voice model (xAI's FLATTENED Responses
/// function shape: `{ type, name, description, parameters }`). `parameters` is
/// the tool's JSON Schema, kept as `JSONValue` to preserve arbitrary nesting
/// without an SDK dependency.
struct VoiceToolDef: Codable, Sendable, Equatable {
  let type: String
  let name: String
  let description: String
  let parameters: JSONValue
}

// MARK: - POST /api/voice/tool

/// Request body for `POST /api/voice/tool` — one realtime function call relayed
/// from the socket. `arguments` is the raw JSON STRING xAI delivers.
struct VoiceToolRequest: Encodable, Sendable {
  let sessionId: String
  let format: String
  let name: String
  let arguments: String

  private enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case format
    case name
    case arguments
  }
}

/// Response body for `POST /api/voice/tool` — the tool's structured result,
/// echoed back to the socket as a `function_call_output`. `output` is whatever
/// shape Oak's tool layer returned.
struct VoiceToolResponse: Codable, Sendable, Equatable {
  let output: JSONValue
}

// MARK: - POST /api/voice/transcript

/// Request body for `POST /api/voice/transcript` — one completed voice turn.
struct VoiceTranscriptRequest: Encodable, Sendable {
  let sessionId: String
  let format: String
  let userText: String
  let assistantText: String

  private enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case format
    case userText = "user_text"
    case assistantText = "assistant_text"
  }
}
