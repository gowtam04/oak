import Foundation
import UIKit

@testable import OakApp

/// In-memory ``ChatService`` test double (testing-strategy.md "Mocking policy":
/// service protocols are faked for view-model unit tests). It records the call
/// parameters — crucially the `scopeSeed` chip pick — and replays a scripted
/// sequence of ``SSEEvent``s, optionally finishing with a thrown error to exercise
/// the reducer's transport-fault path.
///
/// `@unchecked Sendable`: the recording/config state is mutable, but every test
/// drives it serially from the main actor and awaits the stream, so there is no
/// concurrent access — the standard test-fake pattern.
final class FakeChatService: ChatService, @unchecked Sendable {
  // MARK: Configurable script

  /// Events yielded (in order) before the stream finishes.
  var scriptedEvents: [SSEEvent] = []

  /// When set, the stream finishes by THROWING this after yielding `scriptedEvents`
  /// (models a mid-stream transport drop / pre-stream HTTP failure). Typed
  /// ``OakError`` (a `Sendable` error) so it can be captured into the stream's
  /// `@Sendable` builder closure under Swift 6 strict concurrency.
  var thrownError: OakError?

  /// When non-empty, each `send` call consumes the NEXT entry (events + optional throw)
  /// so a test can script DIFFERENT behavior per attempt — e.g. a transport drop on the
  /// first attempt then a clean answer on the auto-retry — to exercise the reconnect
  /// path deterministically. Falls back to `scriptedEvents`/`thrownError` once exhausted.
  var attemptScripts: [(events: [SSEEvent], error: OakError?)] = []

  /// Events yielded (in order) by ``resumeStream`` before it finishes — the reattach
  /// replay (opens with a `turn` frame, then buffered events, then the terminal). When
  /// set, ``resumeThrownError`` finishes the resume by throwing (e.g. a 404 → an
  /// interrupted turn) after these events.
  var resumeEvents: [SSEEvent] = []

  /// When set, ``resumeStream`` finishes by THROWING this after yielding
  /// ``resumeEvents`` — e.g. `OakError.http(status: 404, …)` to model a gone turn.
  var resumeThrownError: OakError?

  // MARK: Recording

  private(set) var sendCount = 0
  private(set) var lastSessionId: String?
  private(set) var lastMessage: String?
  private(set) var lastScopeSeed: Format?
  private(set) var lastImageCount: Int?

  private(set) var resumeCount = 0
  private(set) var lastResumeTurnId: String?
  private(set) var lastResumeSessionId: String?

  private(set) var stopCount = 0
  private(set) var lastStopTurnId: String?
  private(set) var lastStopSessionId: String?

  private(set) var lastRecovery: ChatRecovery?
  private(set) var lastMentionedTeamIds: [String]?
  private(set) var persistScopeCount = 0
  private(set) var lastPersistedScope: Format?
  var persistScopeResult: [Format] = []

  func send(
    sessionId: String,
    message: String,
    images: [UIImage],
    scopeSeed: Format?,
    recovery: ChatRecovery?,
    mentionedTeamIds: [String]?
  ) -> AsyncThrowingStream<SSEEvent, Error> {
    sendCount += 1
    lastSessionId = sessionId
    lastMessage = message
    lastScopeSeed = scopeSeed
    lastImageCount = images.count
    lastRecovery = recovery
    lastMentionedTeamIds = mentionedTeamIds

    let events: [SSEEvent]
    let error: OakError?
    if !attemptScripts.isEmpty {
      let next = attemptScripts.removeFirst()
      events = next.events
      error = next.error
    } else {
      events = scriptedEvents
      error = thrownError
    }
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

  func resumeStream(turnId: String, sessionId: String) -> AsyncThrowingStream<SSEEvent, Error> {
    resumeCount += 1
    lastResumeTurnId = turnId
    lastResumeSessionId = sessionId
    let events = resumeEvents
    let error = resumeThrownError
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

  func stop(turnId: String, sessionId: String) async throws {
    stopCount += 1
    lastStopTurnId = turnId
    lastStopSessionId = sessionId
  }

  func persistScope(
    format: Format,
    conversationId: String?,
    sessionId: String
  ) async throws -> [Format] {
    persistScopeCount += 1
    lastPersistedScope = format
    return persistScopeResult
  }
}
