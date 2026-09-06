import Foundation
import Testing

@testable import OakApp

/// Verifies the `(HTTPURLResponse, Data) → success | OakError` mapping
/// (`OakError.validate`) and the transport-error wrapper (`OakError.transportFailure`)
/// against the api-design.md table: `2xx` → success, `401` → `.unauthorized`,
/// `429` with body `code: "rate_limited"` (or no body) → `.rateLimited`,
/// `429` with body `code: "daily_limit"` and `403` with `{ code, message }` → `.http`,
/// other non-2xx with a `{ code, message }` envelope → `.http`, and a `URLSession`
/// failure → `.transport`. Spend-control codes: SC-AC-5.4, SC-AC-6.5, SC-BR-14.
struct OakErrorMappingTests {

  private func response(_ status: Int, headers: [String: String] = [:]) -> HTTPURLResponse {
    HTTPURLResponse(
      url: URL(string: "https://oak.gowtam.ai/api/test")!,
      statusCode: status,
      httpVersion: "HTTP/1.1",
      headerFields: headers
    )!
  }

  @Test
  func twoHundredReturnsBody() throws {
    let body = Data("{\"ok\":true}".utf8)
    let result = OakError.validate(response(200), data: body)
    guard case let .success(data) = result else {
      Issue.record("expected success, got \(result)")
      return
    }
    #expect(data == body)
  }

  @Test
  func twoOhFourReturnsEmptyBody() {
    let result = OakError.validate(response(204), data: Data())
    guard case .success = result else {
      Issue.record("expected success for 204, got \(result)")
      return
    }
  }

  @Test
  func unauthorizedMapsToUnauthorized() {
    let result = OakError.validate(response(401), data: Data())
    #expect(result == .failure(.unauthorized))
  }

  @Test
  func rateLimitedParsesNumericRetryAfter() {
    let result = OakError.validate(response(429, headers: ["Retry-After": "30"]), data: Data())
    #expect(result == .failure(.rateLimited(retryAfter: 30)))
  }

  @Test
  func rateLimitedWithoutRetryAfterHasNilDelta() {
    let result = OakError.validate(response(429), data: Data())
    #expect(result == .failure(.rateLimited(retryAfter: nil)))
  }

  @Test
  func rateLimited429WithBodyCodeStaysRateLimited() {
    // Per-minute limiter (SC-BR-7): a 429 whose envelope code is `rate_limited`
    // must keep the dedicated `.rateLimited` case (Retry-After still parsed).
    let body = Data(
      "{\"code\":\"rate_limited\",\"message\":\"Too many requests. Please wait a moment and try again.\"}"
        .utf8)
    let result = OakError.validate(response(429, headers: ["Retry-After": "30"]), data: body)
    #expect(result == .failure(.rateLimited(retryAfter: 30)))
  }

  @Test
  func dailyLimit429DoesNotCollapseToRateLimited() {
    // Daily cap (SC-AC-5.4 / SC-AC-6.5 / SC-BR-14): the server sends 429
    // `{ code: "daily_limit", message, reset_at }` + Retry-After. That must NOT
    // become `.rateLimited` — collapsing every 429 would show the per-minute
    // "too quickly" copy. Parse the body code the same way 403 does.
    let message =
      "Daily limit reached. Try again tomorrow (resets at 2026-09-07T00:00:00.000Z UTC)."
    let body = Data(
      "{\"code\":\"daily_limit\",\"message\":\"\(message)\",\"reset_at\":\"2026-09-07T00:00:00.000Z\"}"
        .utf8)
    let result = OakError.validate(response(429, headers: ["Retry-After": "45"]), data: body)
    if case .failure(.rateLimited) = result {
      Issue.record("daily_limit 429 must not collapse to .rateLimited, got \(result)")
    }
    #expect(
      result == .failure(.http(status: 429, code: "daily_limit", message: message)))
  }

  @Test
  func accountDenied403MapsToHttpWithCodeAndMessage() {
    // Denylist (SC-AC-6.1 / SC-AC-6.5 / SC-BR-14): 403 `{ code: "account_denied" }`
    // is already `.http` today — pin the code and server message so a 429-parse
    // change cannot swallow them.
    let message = "This account can't use chat."
    let body = Data("{\"code\":\"account_denied\",\"message\":\"\(message)\"}".utf8)
    let result = OakError.validate(response(403), data: body)
    #expect(
      result == .failure(.http(status: 403, code: "account_denied", message: message)))
  }

  @Test
  func clientErrorDecodesCodeMessageEnvelope() {
    let body = Data("{\"code\":\"invalid_request\",\"message\":\"Bad body\"}".utf8)
    let result = OakError.validate(response(400), data: body)
    #expect(result == .failure(.http(status: 400, code: "invalid_request", message: "Bad body")))
  }

  @Test
  func serverErrorDecodesCodeMessageEnvelope() {
    let body = Data("{\"code\":\"model_unavailable\",\"message\":\"Down\"}".utf8)
    let result = OakError.validate(response(503), data: body)
    #expect(result == .failure(.http(status: 503, code: "model_unavailable", message: "Down")))
  }

  @Test
  func nonEnvelopeBodyFallsBackToUnknownCode() {
    let result = OakError.validate(response(500), data: Data("not json".utf8))
    #expect(result == .failure(.http(status: 500, code: "unknown", message: "")))
  }

  @Test
  func turnInProgress409CapturesTheTurnId() {
    // The chat route's 409 body adds `turn_id` to the envelope; the client must keep it
    // so it can reattach instead of surfacing an error (background-turns §4 / BT-5).
    let body = Data(
      "{\"code\":\"turn_in_progress\",\"message\":\"Already generating.\",\"turn_id\":\"turn-77\"}".utf8)
    let result = OakError.validate(response(409), data: body)
    #expect(result == .failure(.turnInProgress(turnId: "turn-77")))
  }

  @Test
  func other409FallsBackToGenericHttp() {
    // A 409 that is NOT `turn_in_progress` maps to the generic `.http` case.
    let body = Data("{\"code\":\"conflict\",\"message\":\"Nope\"}".utf8)
    let result = OakError.validate(response(409), data: body)
    #expect(result == .failure(.http(status: 409, code: "conflict", message: "Nope")))
  }

  @Test
  func transportFailureWrapsURLError() {
    let mapped = OakError.transportFailure(URLError(.notConnectedToInternet))
    guard case .transport = mapped else {
      Issue.record("expected .transport, got \(mapped)")
      return
    }
  }

  @Test
  func transportFailureWrapsArbitraryError() {
    struct Boom: Error {}
    let mapped = OakError.transportFailure(Boom())
    guard case .transport = mapped else {
      Issue.record("expected .transport, got \(mapped)")
      return
    }
  }
}
