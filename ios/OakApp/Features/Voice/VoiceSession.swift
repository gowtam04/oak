import Foundation
import Observation

/// The heart of voice mode — the framework-free state machine that drives one
/// spoken conversation with xAI's Grok Voice Agent over a direct WebSocket. A
/// faithful port of `web/src/lib/voice/voice-session.ts`; the web source is
/// authoritative on every transition.
///
/// `@MainActor @Observable` (like ``ChatViewModel``): all state mutates on the
/// main actor and the overlay observes it directly. It is DEPENDENCY-INJECTED —
/// every side effect (the socket, audio IO, the `/api/voice/*` HTTP calls, the
/// clock) arrives through a protocol, so tests drive it with scripted fakes and
/// never touch a real `URLSessionWebSocketTask` / `AVAudioEngine` / the network.
///
/// Lifecycle: `idle → connecting → listening ⇄ thinking ⇄ speaking → … →
/// ended | error`. Responsibilities: mint an ephemeral token, open the socket
/// with the `xai-client-secret.<token>` subprotocol, push a single
/// `session.update`, stream mic audio, drive phase transitions, flush playback on
/// barge-in BEFORE any bookkeeping, batch parallel tool calls (all outputs then
/// exactly one `response.create`), persist each finished turn fire-and-forget,
/// answer pings, and auto-end at the session cap.
@MainActor
@Observable
final class VoiceSession {

  // MARK: Observable state

  /// The coarse conversation phase, driving the overlay's orb + status copy.
  private(set) var phase: VoicePhase = .idle

  /// A user-readable message when ``phase`` is ``VoicePhase/error``, else `nil`.
  private(set) var errorMessage: String?

  /// Live captions for the CURRENT turn (both fields reset when a turn completes).
  private(set) var caption = VoiceCaption(user: "", assistant: "")

  /// The tools the model invoked this turn, for the overlay ticker. Cleared on a
  /// fresh user utterance (barge-in).
  private(set) var toolActivities: [VoiceToolActivity] = []

  /// When the session started streaming (set once capture begins), for an
  /// elapsed-time readout. `nil` before connect.
  private(set) var startedAt: Date?

  // MARK: Dependencies + identity

  @ObservationIgnored private let service: any VoiceService
  @ObservationIgnored private let connect: @Sendable (URL, String) -> any VoiceRealtimeConnection
  @ObservationIgnored private let audio: any VoiceAudioIO
  @ObservationIgnored private let clock: any VoiceClock
  @ObservationIgnored private let sessionId: String
  @ObservationIgnored private let format: Format

  // MARK: Internal machine state (not observed)

  @ObservationIgnored private var connection: (any VoiceRealtimeConnection)?
  @ObservationIgnored private var inboundTask: Task<Void, Never>?
  @ObservationIgnored private var captureTask: Task<Void, Never>?
  @ObservationIgnored private var maxSessionTask: Task<Void, Never>?

  /// Function calls collected during the in-flight model response, kept until
  /// `response.done` closes the batch (all parallel calls are in by then). Each
  /// tool executes eagerly as its own task; the result is gathered at the batch
  /// boundary.
  @ObservationIgnored private var pendingCalls: [(callId: String, task: Task<JSONValue, Never>)] = []

  /// `end()` called, or a terminal error/timeout/close reached. Guards every
  /// await resumption so a torn-down session never mutates state or sends.
  @ObservationIgnored private var finished = false

  init(
    service: any VoiceService,
    connect: @escaping @Sendable (URL, String) -> any VoiceRealtimeConnection,
    audio: any VoiceAudioIO,
    clock: any VoiceClock,
    sessionId: String,
    format: Format
  ) {
    self.service = service
    self.connect = connect
    self.audio = audio
    self.clock = clock
    self.sessionId = sessionId
    self.format = format
  }

  // MARK: Lifecycle

  /// Mints a token, opens the socket, configures the session, and starts capture.
  /// A no-op unless the session is still idle.
  func start() async {
    guard phase == .idle else { return }
    phase = .connecting

    // 1. Mint the ephemeral token + session bootstrap.
    let bootstrap: VoiceTokenResponse
    do {
      bootstrap = try await service.fetchToken(sessionId: sessionId, format: format)
    } catch {
      fail(Self.startFailureMessage(error))
      return
    }
    guard !finished else { return }

    // 2. Open the socket with the token as the client-secret subprotocol.
    let conn = connect(
      VoiceRealtimeProtocol.realtimeURL(model: bootstrap.session.model),
      VoiceRealtimeProtocol.clientSecretSubprotocol(token: bootstrap.token)
    )
    connection = conn

    // 3. Consume inbound frames; an unexpected finish is a clean end (web onClose).
    inboundTask = Task { [weak self] in
      for await text in conn.inbound() {
        guard let self, !self.finished else { return }
        self.handle(parseServerEvent(text))
      }
      self?.end()
    }

    // 4. Push the single session.update built from the bootstrap + our sample rate.
    await conn.send(
      VoiceClientEvent.sessionUpdate(
        instructions: bootstrap.session.instructions,
        voice: bootstrap.session.voice,
        idleTimeoutMs: bootstrap.session.idleTimeoutMs,
        sampleRate: audio.sampleRate,
        reasoningEffort: bootstrap.session.reasoningEffort,
        tools: bootstrap.session.tools
      ).encode()
    )
    guard !finished else { return }

    // 5. Arm the client-side auto-end at the session cap.
    let maxMs = bootstrap.session.maxSessionMs
    if maxMs > 0 {
      maxSessionTask = Task { [weak self, clock] in
        try? await clock.sleep(forMilliseconds: maxMs)
        guard let self, !self.finished else { return }
        self.end()
      }
    }

    startedAt = clock.now()

    // 6. Start mic capture; forward each chunk as an input-audio append.
    let chunks: AsyncStream<String>
    do {
      chunks = try await audio.startCapture()
    } catch {
      fail("Microphone unavailable.")
      return
    }
    guard !finished else { return }
    captureTask = Task { [weak self] in
      for await chunk in chunks {
        guard let self, !self.finished else { return }
        await self.connection?.send(VoiceClientEvent.inputAudioAppend(base64: chunk).encode())
      }
    }

    phase = .listening
  }

  /// Ends the session and releases every resource. Idempotent — a second call
  /// (or a race with a terminal error/timeout/close) is a no-op, so teardown runs
  /// exactly once.
  func end() {
    guard !finished else { return }
    finished = true
    teardown()
    if phase != .error { phase = .ended }
  }

  // MARK: Server event handling

  /// Folds one parsed server event into the machine. `nil` (malformed / unknown
  /// frame) and the ignorable session/lifecycle events are no-ops. Every
  /// transition mirrors `handleMessage` in the web source.
  private func handle(_ event: VoiceServerEvent?) {
    guard !finished, let event else { return }
    switch event {
    case .speechStarted:
      // BARGE-IN: flush playback FIRST, before any state bookkeeping. A new user
      // utterance starts a fresh turn — clear the ticker + the interrupted
      // assistant caption so the next answer renders clean.
      audio.flush()
      caption.assistant = ""
      toolActivities = []
      phase = .listening

    case .responseCreated:
      caption.assistant = ""
      phase = .thinking

    case let .audioDelta(base64):
      audio.enqueue(base64)
      phase = .speaking

    case let .transcriptDelta(text):
      caption.assistant += text
      phase = .speaking

    case .transcriptDone:
      break

    case let .userTranscript(text):
      caption.user = text

    case let .functionCallDone(name, callId, arguments):
      collectFunctionCall(name: name, callId: callId, arguments: arguments)

    case .responseDone:
      handleResponseDone()

    case let .ping(timestamp):
      let ts = timestamp ?? clock.now().timeIntervalSince1970 * 1000
      Task { [weak self] in
        await self?.connection?.send(VoiceClientEvent.pong(pingTimestamp: ts).encode())
      }

    case let .errorEvent(code, message):
      if code == "timeout" || code == "max_duration" {
        // A benign end-of-session signal — tear down cleanly, not as an error.
        end()
      } else {
        fail(message ?? "Voice connection failed.")
      }

    case .sessionCreated, .sessionUpdated, .speechStopped, .committed:
      break
    }
  }

  private func collectFunctionCall(name: String, callId: String, arguments: String) {
    // Surface the call in the ticker immediately (the persona also says a filler
    // before it calls, so this is visible in step with the speech).
    toolActivities.append(VoiceToolActivity(id: callId, name: name, label: voiceToolLabel(name)))
    phase = .thinking
    // Execute eagerly (concurrently across parallel calls); the result is
    // gathered at the batch boundary (response.done). Capture the seam + ids by
    // value so the task holds no reference back to the session.
    let call = Task { [service, sessionId, format] () -> JSONValue in
      do {
        return try await service.execTool(sessionId: sessionId, format: format, name: name, arguments: arguments)
      } catch {
        return Self.toolFailure(error)
      }
    }
    pendingCalls.append((callId: callId, task: call))
  }

  private func handleResponseDone() {
    if !pendingCalls.isEmpty {
      // This response was a batch of function calls — send every output IN ORDER,
      // then exactly ONE response.create so the model continues from the results.
      let batch = pendingCalls
      pendingCalls = []
      Task { [weak self] in
        for (callId, task) in batch {
          let output = await task.value
          guard let self, !self.finished else { return }
          await self.connection?.send(
            VoiceClientEvent.functionCallOutput(callId: callId, output: output.serialized()).encode()
          )
        }
        guard let self, !self.finished else { return }
        await self.connection?.send(VoiceClientEvent.responseCreate.encode())
      }
      return
    }

    // A spoken turn finished. Persist the pair fire-and-forget (never awaited on
    // the live path), then reset the per-turn accumulators and return to listening.
    let hasUser = !caption.user.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hasAssistant = !caption.assistant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    if hasUser && hasAssistant {
      let userText = caption.user
      let assistantText = caption.assistant
      Task { [service, sessionId, format] in
        await service.postTranscript(
          sessionId: sessionId,
          format: format,
          userText: userText,
          assistantText: assistantText
        )
      }
    }
    caption = VoiceCaption(user: "", assistant: "")
    phase = .listening
  }

  // MARK: Teardown

  /// Cancels every task, releases audio + the socket. Called exactly once, from
  /// ``end()`` or ``fail(_:)``. Mirrors the web teardown order (timer, audio, then
  /// socket).
  private func teardown() {
    maxSessionTask?.cancel()
    maxSessionTask = nil
    inboundTask?.cancel()
    inboundTask = nil
    captureTask?.cancel()
    captureTask = nil
    audio.stopCapture()
    audio.flush()
    audio.close()
    connection?.close()
    connection = nil
  }

  private func fail(_ message: String) {
    guard !finished else { return }
    finished = true
    teardown()
    errorMessage = message
    phase = .error
  }

  // MARK: Helpers

  /// Maps a token-mint failure to user-facing copy. An auth failure (voice is
  /// signed-in only) points the user at signing in; everything else is generic.
  private static func startFailureMessage(_ error: Error) -> String {
    if let oak = error as? OakError, case .unauthorized = oak {
      return "Sign in to use voice mode."
    }
    return "Couldn't start voice mode."
  }

  /// Folds a thrown tool call into the error object the web sends back as the
  /// function's output (`{ error: "tool_failed", detail: <message> }`), so the
  /// model can recover instead of the socket stalling on a missing output.
  static func toolFailure(_ error: Error) -> JSONValue {
    .object(["error": .string("tool_failed"), "detail": .string(toolFailureDetail(error))])
  }

  private static func toolFailureDetail(_ error: Error) -> String {
    if let oak = error as? OakError {
      switch oak {
      case let .http(_, _, message) where !message.isEmpty: return message
      case let .transport(underlying): return underlying
      default: break
      }
    }
    return "tool request failed"
  }
}

// MARK: - Observable value types

/// The coarse phase of a voice conversation, driving the overlay orb + status.
enum VoicePhase: Equatable, Sendable {
  case idle
  case connecting
  case listening
  case thinking
  case speaking
  case ended
  case error
}

/// Live captions for the current turn — both reset when the turn completes.
struct VoiceCaption: Equatable, Sendable {
  var user: String
  var assistant: String
}

/// One tool the model invoked this turn, for the overlay ticker. `id` is the
/// call id (stable + unique per call).
struct VoiceToolActivity: Identifiable, Equatable, Sendable {
  let id: String
  let name: String
  let label: String
}
