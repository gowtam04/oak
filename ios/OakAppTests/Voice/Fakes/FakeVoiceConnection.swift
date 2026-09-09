import Foundation

@testable import OakApp

/// Scripted ``VoiceRealtimeConnection`` test double — the analog of the web
/// suite's `FakeSocket`. The test pushes inbound frames through ``emit(_:)`` and
/// reads back every frame the session ``send(_:)``s (decoded to JSON for
/// assertions). ``close()`` / ``finishInbound()`` finish the inbound stream.
///
/// `@unchecked Sendable`: every touchpoint runs serially on the main actor (the
/// session's spawned tasks all inherit `@MainActor`), so the mutable recording
/// state is never accessed concurrently — the standard test-fake pattern
/// (matches `FakeChatService`).
final class FakeVoiceConnection: VoiceRealtimeConnection, @unchecked Sendable {
  /// Captured by the session's `connect` closure so tests can assert the URL /
  /// subprotocol the session opened with.
  var connectURL: URL?
  var subprotocol: String?

  private(set) var sent: [String] = []
  private(set) var closed = false

  /// When set, ``send(_:)`` records this as ``failureMessage()`` and finishes
  /// inbound — the handshake-failed production path.
  var nextFailureMessage: String?

  private var closeFailure: String?
  private var continuation: AsyncStream<String>.Continuation?
  /// Frames emitted before the session began iterating are buffered and flushed
  /// on the first ``inbound()`` call, so a test is never order-sensitive to when
  /// the consumer task starts.
  private var buffer: [String] = []

  func inbound() -> AsyncStream<String> {
    AsyncStream { continuation in
      self.continuation = continuation
      for frame in self.buffer { continuation.yield(frame) }
      self.buffer = []
      if self.closed {
        continuation.finish()
        self.continuation = nil
      }
    }
  }

  func send(_ text: String) async {
    sent.append(text)
    if let message = nextFailureMessage {
      nextFailureMessage = nil
      closeFailure = message
      finishInbound()
    }
  }

  func close() {
    closed = true
    continuation?.finish()
    continuation = nil
  }

  func failureMessage() async -> String? {
    closeFailure
  }

  // MARK: Test drivers

  /// Push one raw inbound JSON frame to the session.
  func emit(_ text: String) {
    if let continuation {
      continuation.yield(text)
    } else {
      buffer.append(text)
    }
  }

  /// Push a server event built from a JSON object.
  func emit(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object)
    emit(String(decoding: data, as: UTF8.self))
  }

  /// Finish the inbound stream as if the socket dropped/closed remotely (without
  /// the session having called ``close()``).
  func finishInbound() {
    continuation?.finish()
    continuation = nil
  }

  /// Every sent frame decoded back to a JSON object, for assertions.
  func sentObjects() -> [[String: Any]] {
    sent.compactMap { text in
      guard let data = text.data(using: .utf8),
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      else { return nil }
      return object
    }
  }
}
