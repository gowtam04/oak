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

// MARK: - Live implementation

/// Production ``VoiceRealtimeConnection`` over `URLSessionWebSocketTask` — the
/// direct browser-less socket to xAI's Grok Voice Agent realtime API. The
/// ephemeral client secret rides as the WebSocket subprotocol (never a header,
/// never logged).
///
/// An `actor` so the non-`Sendable` task/session/continuation stay confined to
/// one isolation domain. The two SYNCHRONOUS protocol requirements (`inbound()`,
/// `close()`) are `nonisolated` and hop into the actor via a `Task` — the actor's
/// real work runs isolated.
///
/// OPEN-HANDSHAKE GUARANTEE (critical): ``VoiceSession`` sends the lone
/// `session.update` immediately after `connect()`, before the WebSocket handshake
/// finishes. ``send(_:)`` therefore AWAITS an explicit open gate (driven by the
/// delegate's `didOpenWithProtocol`) so that first frame is queued, never dropped
/// — a lost `session.update` is an undebuggable dead session.
actor LiveVoiceRealtimeConnection: VoiceRealtimeConnection {
  private let session: URLSession
  private let task: URLSessionWebSocketTask
  private let delegate: WebSocketDelegate

  /// Open gate: `true` once the handshake completes; sends before then park in
  /// ``openWaiters`` and resume in FIFO order when it opens (or when closed, so a
  /// parked send unblocks and no-ops instead of hanging forever).
  private var isOpen = false
  private var openWaiters: [CheckedContinuation<Void, Never>] = []

  private var closed = false
  private var receiveStarted = false
  private var inboundContinuation: AsyncStream<String>.Continuation?

  init(url: URL, subprotocol: String) {
    let delegate = WebSocketDelegate()
    self.delegate = delegate
    let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
    self.session = session
    self.task = session.webSocketTask(with: url, protocols: [subprotocol])
    self.task.resume()
    // Bridge the delegate's Sendable event stream into the actor.
    Task { await self.consumeDelegateEvents() }
  }

  // MARK: Protocol

  nonisolated func inbound() -> AsyncStream<String> {
    AsyncStream { continuation in
      Task { await self.startReceiving(continuation) }
    }
  }

  func send(_ text: String) async {
    await awaitOpen()
    guard !closed else { return }
    // A failed send is non-fatal — the close/receive-error path drives teardown,
    // mirroring the web client. Never log frame contents (they carry audio).
    try? await task.send(.string(text))
  }

  nonisolated func close() {
    Task { await self.shutdown() }
  }

  // MARK: Open gate

  private func awaitOpen() async {
    if isOpen || closed { return }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      // Re-check under isolation: the gate may have opened/closed between the
      // fast path above and this resumption.
      if isOpen || closed {
        continuation.resume()
      } else {
        openWaiters.append(continuation)
      }
    }
  }

  private func markOpen() {
    guard !isOpen, !closed else { return }
    isOpen = true
    resumeWaiters()
  }

  private func resumeWaiters() {
    let waiters = openWaiters
    openWaiters = []
    for waiter in waiters { waiter.resume() }
  }

  // MARK: Inbound

  private func startReceiving(_ continuation: AsyncStream<String>.Continuation) {
    // Only VoiceSession calls inbound(), exactly once; a second call no-ops.
    guard !receiveStarted else { continuation.finish(); return }
    receiveStarted = true
    guard !closed else { continuation.finish(); return }
    inboundContinuation = continuation
    Task { await self.receiveLoop() }
  }

  private func receiveLoop() async {
    while !closed {
      let message: URLSessionWebSocketTask.Message
      do {
        message = try await task.receive()
      } catch {
        // Any throw (close, cancel, transport fault) ends the stream — the
        // session treats an inbound finish as a clean end.
        break
      }
      if case let .string(text) = message {
        inboundContinuation?.yield(text)
      }
      // Ignore .data frames — the realtime protocol is JSON text only.
    }
    handleClosed()
  }

  // MARK: Close

  private func shutdown() {
    task.cancel(with: .goingAway, reason: nil)
    // Release the delegate URLSession strongly retains, after the going-away
    // frame drains.
    session.finishTasksAndInvalidate()
    handleClosed()
  }

  /// Idempotent terminal cleanup: flips the closed flag, finishes the inbound
  /// stream, and unblocks any parked sends. Reached from a receive error, a
  /// delegate close/complete, or an explicit ``close()`` — whichever wins.
  private func handleClosed() {
    inboundContinuation?.finish()
    inboundContinuation = nil
    guard !closed else { return }
    closed = true
    resumeWaiters()
  }

  private func consumeDelegateEvents() async {
    for await event in delegate.events {
      switch event {
      case .open: markOpen()
      case .close: handleClosed()
      }
    }
  }
}

/// URLSession delegate that forwards the two socket-lifecycle callbacks the
/// connection needs — handshake open and close/complete — as a `Sendable`
/// `AsyncStream`. Holding only the Sendable continuation (never an actor
/// reference) sidesteps the delegate/actor construction cycle and the callbacks'
/// off-actor delivery queue.
///
/// `@unchecked Sendable`: its only mutable state is the `AsyncStream.Continuation`
/// (itself Sendable and thread-safe); the URLSession delivers callbacks serially
/// on its delegate queue.
private final class WebSocketDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
  enum Event: Sendable { case open, close }

  let events: AsyncStream<Event>
  private let continuation: AsyncStream<Event>.Continuation

  override init() {
    var captured: AsyncStream<Event>.Continuation!
    events = AsyncStream { captured = $0 }
    continuation = captured
    super.init()
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    continuation.yield(.open)
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    continuation.yield(.close)
    continuation.finish()
  }

  // A handshake failure surfaces here (not didCloseWith) — unblock the actor so
  // parked sends resume and the inbound stream finishes.
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    continuation.yield(.close)
    continuation.finish()
  }
}
