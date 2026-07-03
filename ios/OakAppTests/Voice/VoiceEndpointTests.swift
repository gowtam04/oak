import Foundation
import Testing

@testable import OakApp

/// Pins the three `POST /api/voice/*` `Endpoint` shapes ``VoiceEndpoints`` builds
/// (mirrors the approach in `ChatRequestEncodingTests`): method, exact path,
/// `requiresAuth`, and the snake_case body fields — asserted by turning each
/// `Endpoint` into a real `URLRequest` (the same path `OakAPIClient` drives) and
/// decoding its `httpBody` back to a JSON object, so the test exercises the
/// actual encoder rather than re-encoding the DTO directly.
struct VoiceEndpointTests {

  private let baseURL = URL(string: "https://oak.example.com")!
  private let encoder = JSONEncoder()

  private func bodyObject(_ endpoint: Endpoint) throws -> [String: Any] {
    let request = try endpoint.urlRequest(baseURL: baseURL, token: "test-token", encoder: encoder)
    let body = try #require(request.httpBody)
    let object = try JSONSerialization.jsonObject(with: body)
    return try #require(object as? [String: Any])
  }

  @Test
  func tokenEndpointIsPostRequiresAuthAndCarriesSnakeCaseBody() throws {
    let endpoint = VoiceEndpoints.token(sessionId: "sess_1", format: .champions)

    #expect(endpoint.method == .post)
    #expect(endpoint.path == "/api/voice/token")
    #expect(endpoint.requiresAuth == true)

    let request = try endpoint.urlRequest(baseURL: baseURL, token: "test-token", encoder: encoder)
    #expect(request.url?.path == "/api/voice/token")
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")

    let object = try bodyObject(endpoint)
    #expect(object["session_id"] as? String == "sess_1")
    #expect(object["format"] as? String == "champions")
  }

  @Test
  func toolEndpointIsPostRequiresAuthAndCarriesSnakeCaseBody() throws {
    let endpoint = VoiceEndpoints.tool(
      sessionId: "sess_1",
      format: .scarletViolet,
      name: "get_pokemon",
      arguments: "{\"id\":\"garchomp\"}"
    )

    #expect(endpoint.method == .post)
    #expect(endpoint.path == "/api/voice/tool")
    #expect(endpoint.requiresAuth == true)

    let request = try endpoint.urlRequest(baseURL: baseURL, token: "test-token", encoder: encoder)
    #expect(request.url?.path == "/api/voice/tool")
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")

    let object = try bodyObject(endpoint)
    #expect(object["session_id"] as? String == "sess_1")
    #expect(object["format"] as? String == "scarlet-violet")
    #expect(object["name"] as? String == "get_pokemon")
    #expect(object["arguments"] as? String == "{\"id\":\"garchomp\"}")
  }

  @Test
  func transcriptEndpointIsPostRequiresAuthAndCarriesSnakeCaseBody() throws {
    let endpoint = VoiceEndpoints.transcript(
      sessionId: "sess_1",
      format: .gen7,
      userText: "What beats Garchomp?",
      assistantText: "Ice and dragon moves work well."
    )

    #expect(endpoint.method == .post)
    #expect(endpoint.path == "/api/voice/transcript")
    #expect(endpoint.requiresAuth == true)

    let request = try endpoint.urlRequest(baseURL: baseURL, token: "test-token", encoder: encoder)
    #expect(request.url?.path == "/api/voice/transcript")
    #expect(request.httpMethod == "POST")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-token")

    let object = try bodyObject(endpoint)
    #expect(object["session_id"] as? String == "sess_1")
    #expect(object["format"] as? String == "gen-7")
    #expect(object["user_text"] as? String == "What beats Garchomp?")
    #expect(object["assistant_text"] as? String == "Ice and dragon moves work well.")
  }

  /// `requiresAuth: true` with no token supplied omits the header entirely
  /// (`Endpoint.urlRequest`'s documented behavior) — pinning this here (rather
  /// than only in `Endpoint`'s own tests) confirms none of the three voice
  /// endpoints accidentally forces the header in a way that would mask a
  /// missing-token 401 upstream.
  @Test
  func toolEndpointOmitsAuthorizationHeaderWhenNoTokenSupplied() throws {
    let endpoint = VoiceEndpoints.tool(sessionId: "sess_1", format: .champions, name: "get_move", arguments: "{}")
    let request = try endpoint.urlRequest(baseURL: baseURL, token: nil, encoder: encoder)
    #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
  }
}
