import Foundation

/// The realtime WebSocket seam the ``VoiceSession`` state machine drives — the
/// Swift analog of the web client's `VoiceSocket` (`web/src/lib/voice/voice-session.ts`),
/// reshaped for Swift structured concurrency: inbound frames arrive as an
/// `AsyncStream` the session iterates, rather than the web's callback quartet
/// (`onOpen`/`onMessage`/`onClose`/`onError`).
///
/// PROTOCOL ONLY — the live `URLSessionWebSocketTask` implementation is a later
/// task. Tests drive a scripted fake, so the session never opens a real socket.
protocol VoiceRealtimeConnection: Sendable {
  /// Inbound text frames from the socket. The stream FINISHES when the socket
  /// closes (whether cleanly or because it dropped) — the session treats an
  /// unexpected finish as a clean end, mirroring the web client's `onClose`.
  func inbound() -> AsyncStream<String>

  /// Send one text frame. A send on a closing/closed socket is a no-op, never a
  /// fault (the close/finish path drives teardown instead).
  func send(_ text: String) async

  /// Close the socket, releasing it and finishing ``inbound()``.
  func close()
}
