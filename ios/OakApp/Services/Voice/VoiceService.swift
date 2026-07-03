import Foundation

/// The voice-mode HTTP seam: `POST /api/voice/*` (voice-mode plan §5; T1's
/// `VoiceWire.swift` DTOs). This is NOT the realtime WebSocket connection itself
/// (that's a later task) — it's the three ordinary REST calls the realtime
/// session makes around the socket: mint an ephemeral token to open it, relay
/// each function call it makes back through Oak's existing tool layer, and
/// persist the finished turn into unified chat history.
///
/// Signed-in only (component-design.md voice-mode section): every endpoint sets
/// `requiresAuth: true`; a guest call surfaces as `OakError.unauthorized`
/// through the normal client error path.
protocol VoiceService: Sendable {
  /// `POST /api/voice/token` — mints a short-lived ephemeral token plus the
  /// session bootstrap (model/voice/instructions/tool defs) the client uses to
  /// open and configure the realtime WebSocket.
  func fetchToken(sessionId: String, format: Format) async throws -> VoiceTokenResponse

  /// `POST /api/voice/tool` — relays one realtime function call into Oak's tool
  /// layer and returns its structured `output`, to be echoed back to the socket
  /// as a `function_call_output`. `arguments` is the raw JSON string xAI
  /// delivers, forwarded verbatim.
  func execTool(sessionId: String, format: Format, name: String, arguments: String) async throws -> JSONValue

  /// `POST /api/voice/transcript` — persists one completed voice turn into the
  /// signed-in conversation's unified history. Fire-and-forget by contract: it
  /// never throws — every fault is caught and logged internally so a persist
  /// failure never surfaces to (or blocks) the realtime session.
  func postTranscript(sessionId: String, format: Format, userText: String, assistantText: String) async
}

// MARK: - Endpoints

/// Pure `Endpoint` construction for the three voice routes, factored out of the
/// actor-bound `Live…` service so their shape (method/path/auth/body) is
/// testable without a running `OakAPIClient`.
enum VoiceEndpoints {
  static func token(sessionId: String, format: Format) -> Endpoint {
    Endpoint(
      method: .post,
      path: "/api/voice/token",
      body: VoiceTokenRequest(sessionId: sessionId, format: format.rawValue),
      requiresAuth: true
    )
  }

  static func tool(sessionId: String, format: Format, name: String, arguments: String) -> Endpoint {
    Endpoint(
      method: .post,
      path: "/api/voice/tool",
      body: VoiceToolRequest(sessionId: sessionId, format: format.rawValue, name: name, arguments: arguments),
      requiresAuth: true
    )
  }

  static func transcript(sessionId: String, format: Format, userText: String, assistantText: String) -> Endpoint {
    Endpoint(
      method: .post,
      path: "/api/voice/transcript",
      body: VoiceTranscriptRequest(
        sessionId: sessionId,
        format: format.rawValue,
        userText: userText,
        assistantText: assistantText
      ),
      requiresAuth: true
    )
  }
}

// MARK: - Live implementation

/// Production ``VoiceService`` over ``OakAPIClient``. A value type holding one
/// immutable actor reference, so it is `Sendable` without ceremony (matches
/// ``LiveArtifactService``/``LiveDexLookupService``).
struct LiveVoiceService: VoiceService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func fetchToken(sessionId: String, format: Format) async throws -> VoiceTokenResponse {
    try await apiClient.send(VoiceEndpoints.token(sessionId: sessionId, format: format), as: VoiceTokenResponse.self)
  }

  func execTool(sessionId: String, format: Format, name: String, arguments: String) async throws -> JSONValue {
    let response = try await apiClient.send(
      VoiceEndpoints.tool(sessionId: sessionId, format: format, name: name, arguments: arguments),
      as: VoiceToolResponse.self
    )
    return response.output
  }

  func postTranscript(sessionId: String, format: Format, userText: String, assistantText: String) async {
    do {
      try await apiClient.sendNoContent(
        VoiceEndpoints.transcript(sessionId: sessionId, format: format, userText: userText, assistantText: assistantText)
      )
    } catch {
      // Never log userText/assistantText (conventions.md "Logging") — only that
      // the persist failed. A failed transcript persist never surfaces to the
      // realtime session; it's a best-effort side effect.
      Log.chat.error("voice transcript persist failed")
    }
  }
}
