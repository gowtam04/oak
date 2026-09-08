import Foundation

/// The realtime WebSocket seam the ``VoiceSession`` state machine drives — the
/// Swift analog of the web client's `VoiceSocket` (`web/src/lib/voice/voice-session.ts`),
/// reshaped for Swift structured concurrency: inbound frames arrive as an
/// `AsyncStream` the session iterates, rather than the web's callback quartet
/// (`onOpen`/`onMessage`/`onClose`/`onError`).
///
/// Tests drive a scripted fake, so the session never opens a real socket.
protocol VoiceRealtimeConnection: Sendable {
  /// Inbound text frames from the socket. The stream FINISHES when the socket
  /// closes (whether cleanly or because it dropped).
  func inbound() -> AsyncStream<String>

  /// Send one text frame. A send on a closing/closed socket is a no-op, never a
  /// fault (the close/finish path drives teardown instead).
  func send(_ text: String) async

  /// Close the socket, releasing it and finishing ``inbound()``.
  func close()

  /// A user-facing reason when the socket died before a successful handshake
  /// (or with close code 4401 — expired ephemeral). `nil` after a clean close
  /// of a live session. Read after ``inbound()`` finishes or after a send that
  /// may have raced a handshake failure.
  func failureMessage() async -> String?
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
///
/// Receive starts in `init` (xAI iOS cookbook): `URLSessionWebSocketTask` often
/// does not fire `didOpenWithProtocol` until `receive()` is running. Frames that
/// arrive before ``inbound()`` attaches are buffered.
actor LiveVoiceRealtimeConnection: VoiceRealtimeConnection {
  /// Cookbook silent-handshake timeout — if `didOpen` never arrives, fail the
  /// gate rather than hang ``VoiceSession/start()`` in `.connecting`.
  private static let openTimeout: Duration = .seconds(10)

  /// xAI uses WebSocket close code 4401 to signal an expired ephemeral token.
  private static let ephemeralExpiredCloseCode = 4401

  private let session: URLSession
  private let task: URLSessionWebSocketTask
  private let delegate: WebSocketDelegate

  /// Open gate: `true` once the handshake completes; sends before then park in
  /// ``openWaiters`` and resume in FIFO order when it opens (or when closed, so a
  /// parked send unblocks and no-ops instead of hanging forever).
  private var isOpen = false
  private var openedOnce = false
  private var openWaiters: [CheckedContinuation<Void, Never>] = []

  private var closed = false
  private var explicitClose = false
  private var inboundAttached = false
  private var inboundContinuation: AsyncStream<String>.Continuation?
  private var pendingInbound: [String] = []
  private var closeFailure: String?
  private var openTimeoutTask: Task<Void, Never>?

  init(url: URL, subprotocol: String) {
    let delegate = WebSocketDelegate()
    self.delegate = delegate
    let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
    self.session = session
    self.task = session.webSocketTask(with: url, protocols: [subprotocol])
    self.task.resume()
    // Bridge the delegate's Sendable event stream into the actor. Start receive
    // immediately — waiting until inbound() is attached is how didOpen never
    // fires on Apple platforms.
    Task { await self.bootstrapLoops() }
  }

  // MARK: Protocol

  nonisolated func inbound() -> AsyncStream<String> {
    AsyncStream { continuation in
      Task { await self.attachInbound(continuation) }
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
    Task { await self.shutdown(explicit: true) }
  }

  func failureMessage() async -> String? {
    closeFailure
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
    openedOnce = true
    cancelOpenTimeout()
    resumeWaiters()
  }

  private func resumeWaiters() {
    let waiters = openWaiters
    openWaiters = []
    for waiter in waiters { waiter.resume() }
  }

  private func bootstrapLoops() {
    openTimeoutTask = Task { await self.runOpenTimeout() }
    Task { await self.consumeDelegateEvents() }
    Task { await self.receiveLoop() }
  }

  private func runOpenTimeout() async {
    do {
      try await Task.sleep(for: Self.openTimeout)
    } catch {
      return
    }
    guard !isOpen, !closed else { return }
    Log.network.error("voice websocket open timed out")
    recordFailure("Voice connection failed.")
    handleClosed()
  }

  private func cancelOpenTimeout() {
    openTimeoutTask?.cancel()
    openTimeoutTask = nil
  }

  // MARK: Inbound

  private func attachInbound(_ continuation: AsyncStream<String>.Continuation) {
    // Only VoiceSession calls inbound(), exactly once; a second call no-ops.
    guard !inboundAttached else { continuation.finish(); return }
    inboundAttached = true
    guard !closed else { continuation.finish(); return }
    inboundContinuation = continuation
    for frame in pendingInbound { continuation.yield(frame) }
    pendingInbound = []
  }

  private func yieldInbound(_ text: String) {
    if let inboundContinuation {
      inboundContinuation.yield(text)
    } else {
      pendingInbound.append(text)
    }
  }

  private func receiveLoop() async {
    while !closed {
      let message: URLSessionWebSocketTask.Message
      do {
        message = try await task.receive()
      } catch {
        if !closed, !explicitClose, !openedOnce {
          recordFailure("Voice connection failed.")
        }
        break
      }
      switch message {
      case let .string(text):
        yieldInbound(text)
      case let .data(data):
        // Cookbook + xAIRealtimeKit treat binary frames as UTF-8 JSON too.
        if let text = String(data: data, encoding: .utf8) {
          yieldInbound(text)
        }
      @unknown default:
        break
      }
    }
    handleClosed()
  }

  // MARK: Close

  private func shutdown(explicit: Bool) {
    explicitClose = explicit
    cancelOpenTimeout()
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
    cancelOpenTimeout()
    inboundContinuation?.finish()
    inboundContinuation = nil
    pendingInbound = []
    guard !closed else { return }
    closed = true
    if !openedOnce, closeFailure == nil, !explicitClose {
      recordFailure("Voice connection failed.")
    }
    resumeWaiters()
  }

  private func recordFailure(_ message: String) {
    if closeFailure == nil { closeFailure = message }
  }

  private func consumeDelegateEvents() async {
    for await event in delegate.events {
      switch event {
      case .open:
        markOpen()
      case let .close(httpStatus, closeCode, errorDomain, errorCode):
        applyClose(
          httpStatus: httpStatus,
          closeCode: closeCode,
          errorDomain: errorDomain,
          errorCode: errorCode
        )
      }
    }
  }

  private func applyClose(
    httpStatus: Int?,
    closeCode: Int?,
    errorDomain: String?,
    errorCode: Int?
  ) {
    if let httpStatus, httpStatus != 101 {
      Log.network.error("voice websocket upgrade HTTP \(httpStatus)")
      if !openedOnce { recordFailure("Voice connection failed.") }
    }
    if let errorDomain, let errorCode, errorCode != NSURLErrorCancelled {
      Log.network.error("voice websocket failed domain=\(errorDomain, privacy: .public) code=\(errorCode)")
      if !openedOnce { recordFailure("Voice connection failed.") }
    }
    if closeCode == Self.ephemeralExpiredCloseCode {
      Log.network.error("voice websocket close 4401 (ephemeral expired)")
      recordFailure("Voice session expired. Start again.")
    }
    handleClosed()
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
  enum Event: Sendable {
    case open
    case close(httpStatus: Int?, closeCode: Int?, errorDomain: String?, errorCode: Int?)
  }

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
    let status = (webSocketTask.response as? HTTPURLResponse)?.statusCode
    continuation.yield(
      .close(httpStatus: status, closeCode: closeCode.rawValue, errorDomain: nil, errorCode: nil)
    )
    continuation.finish()
  }

  // A handshake failure surfaces here (not didCloseWith) — unblock the actor so
  // parked sends resume and the inbound stream finishes.
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    let status = (task.response as? HTTPURLResponse)?.statusCode
    let closeCode = (task as? URLSessionWebSocketTask)?.closeCode.rawValue
    let ns = error.map { $0 as NSError }
    continuation.yield(
      .close(
        httpStatus: status,
        closeCode: closeCode,
        errorDomain: ns?.domain,
        errorCode: ns?.code
      )
    )
    continuation.finish()
  }
}
