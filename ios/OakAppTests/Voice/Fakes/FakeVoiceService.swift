import Foundation

@testable import OakApp

/// Scripted ``VoiceService`` test double: a fixed token response, per-tool
/// scripted outputs/errors, and a recording of every call. ``postTranscript``
/// never throws (contract), so it only records.
///
/// `@unchecked Sendable`: all access is serial on the main actor (the session's
/// tool/transcript tasks inherit `@MainActor`).
final class FakeVoiceService: VoiceService, @unchecked Sendable {
  /// Returned by ``fetchToken`` unless ``tokenError`` is set.
  var tokenResponse = VoiceTokenResponse.fixture()
  /// When set, ``fetchToken`` throws this.
  var tokenError: OakError?

  /// Per-tool scripted structured output; a missing tool falls back to
  /// ``defaultToolOutput``.
  var toolOutputs: [String: JSONValue] = [:]
  /// Per-tool scripted throw (folded by the session into a `tool_failed` object).
  var toolErrors: [String: OakError] = [:]
  var defaultToolOutput: JSONValue = .object(["ok": .bool(true)])

  private(set) var fetchTokenCalls: [(sessionId: String, format: Format)] = []
  private(set) var execToolCalls: [(name: String, arguments: String)] = []
  private(set) var postTranscriptCalls:
    [(sessionId: String, format: Format, userText: String, assistantText: String)] = []

  /// `POST /api/voice/hydrate` recording (VOICE-US-3). Extra methods until
  /// ``VoiceService`` grows `hydrate` — Chat VM tests assert these after
  /// ``ChatViewModel/retryVoiceHydrate(assistantMessageId:)``.
  var hydrateResult: Result<VoiceHydrateResponse, OakError> = .success(
    VoiceHydrateResponse(status: .running)
  )
  private(set) var hydrateCount = 0
  private(set) var lastHydrateConversationId: String?
  private(set) var lastHydrateAssistantMessageId: String?

  func fetchToken(sessionId: String, format: Format) async throws -> VoiceTokenResponse {
    fetchTokenCalls.append((sessionId, format))
    if let tokenError { throw tokenError }
    return tokenResponse
  }

  func execTool(sessionId: String, format: Format, name: String, arguments: String) async throws -> JSONValue {
    execToolCalls.append((name, arguments))
    if let error = toolErrors[name] { throw error }
    return toolOutputs[name] ?? defaultToolOutput
  }

  func postTranscript(sessionId: String, format: Format, userText: String, assistantText: String) async {
    postTranscriptCalls.append((sessionId, format, userText, assistantText))
  }

  func hydrate(conversationId: String, assistantMessageId: String) async throws -> VoiceHydrateResponse {
    hydrateCount += 1
    lastHydrateConversationId = conversationId
    lastHydrateAssistantMessageId = assistantMessageId
    return try hydrateResult.get()
  }
}

// MARK: - Fixtures

extension VoiceTokenResponse {
  /// A minimal, valid token response for driving the session (mirrors the web
  /// suite's `bootstrap()` helper).
  static func fixture(
    token: String = "tok-123",
    model: String = "grok-voice-latest",
    idleTimeoutMs: Int = 30_000,
    maxSessionMs: Int = 600_000,
    tools: [VoiceToolDef] = [.fixture()]
  ) -> VoiceTokenResponse {
    VoiceTokenResponse(
      token: token,
      expiresAt: 0,
      session: VoiceSessionBootstrap(
        model: model,
        voice: "rex",
        instructions: "You are Oak's Pokédex voice.",
        reasoningEffort: "none",
        idleTimeoutMs: idleTimeoutMs,
        maxSessionMs: maxSessionMs,
        tools: tools
      )
    )
  }
}

extension VoiceToolDef {
  static func fixture(name: String = "get_move") -> VoiceToolDef {
    VoiceToolDef(type: "function", name: name, description: "look up a move", parameters: .object([:]))
  }
}
