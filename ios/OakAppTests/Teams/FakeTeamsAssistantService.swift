import Foundation

@testable import OakApp

/// In-memory ``TeamsAssistantService`` test double (mirrors `FakeChatService`): it
/// records the call parameters — crucially the LIVE `draft` that rides each turn — and
/// replays a scripted sequence of ``BuilderSSEEvent``s, optionally finishing with a
/// thrown `OakError` to exercise the reducer's transport-fault / rate-limit path.
///
/// `@unchecked Sendable`: the recording/config state is mutable, but every test drives
/// it serially from the main actor and awaits the stream, so there is no concurrent
/// access — the standard test-fake pattern.
final class FakeTeamsAssistantService: TeamsAssistantService, @unchecked Sendable {
  /// Events yielded (in order) before the stream finishes.
  var scriptedEvents: [BuilderSSEEvent] = []

  /// When set, the stream finishes by THROWING this after yielding `scriptedEvents`
  /// (models a mid-stream drop / a pre-stream HTTP failure like a 401 or 429).
  var thrownError: OakError?

  // MARK: Recording

  private(set) var sendCount = 0
  private(set) var lastSessionId: String?
  private(set) var lastMessage: String?
  private(set) var lastDraft: TeamsAssistantDraft?

  func send(
    sessionId: String,
    message: String,
    draft: TeamsAssistantDraft
  ) -> AsyncThrowingStream<BuilderSSEEvent, Error> {
    sendCount += 1
    lastSessionId = sessionId
    lastMessage = message
    lastDraft = draft

    let events = scriptedEvents
    let error = thrownError
    return AsyncThrowingStream { continuation in
      for event in events {
        continuation.yield(event)
      }
      if let error {
        continuation.finish(throwing: error)
      } else {
        continuation.finish()
      }
    }
  }
}
