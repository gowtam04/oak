import Foundation
import Testing

@testable import OakApp

/// `VoiceSession` — the voice state machine — driven through fully scripted seams
/// (fake socket + fake audio + fake HTTP + manual clock), never a real
/// WebSocket/AVAudioEngine/network. A Swift port of the web suite
/// (`web/src/components/voice/voice-session.test.tsx`); the transitions asserted
/// here mirror `web/src/lib/voice/voice-session.ts`.
///
/// The session is `@MainActor`, so this suite is too. Its spawned tasks (inbound
/// consumer, tool calls, transcript persist, max-session timer) all inherit the
/// main actor, so ``settle()`` — a bounded batch of `Task.yield()`s — drains
/// their work deterministically between steps.
@MainActor
struct VoiceSessionTests {

  // MARK: Harness

  private struct Harness {
    let session: VoiceSession
    let service: FakeVoiceService
    let connection: FakeVoiceConnection
    let audio: FakeVoiceAudioIO
    let clock: FakeVoiceClock
  }

  private func makeHarness(
    service: FakeVoiceService = FakeVoiceService(),
    audio: FakeVoiceAudioIO = FakeVoiceAudioIO(),
    clock: FakeVoiceClock = FakeVoiceClock()
  ) -> Harness {
    let connection = FakeVoiceConnection()
    let session = VoiceSession(
      service: service,
      connect: { url, subprotocol in
        connection.connectURL = url
        connection.subprotocol = subprotocol
        return connection
      },
      audio: audio,
      clock: clock,
      sessionId: "conv-1",
      format: .champions
    )
    return Harness(session: session, service: service, connection: connection, audio: audio, clock: clock)
  }

  /// Drain the session's spawned main-actor tasks. Generous but cheap — each round
  /// is a single actor hop.
  private func settle(_ rounds: Int = 30) async {
    for _ in 0..<rounds { await Task.yield() }
  }

  /// Bring a session up to `.listening` (start + drain, so the inbound consumer
  /// and max-session timer are both live).
  private func connect(_ h: Harness) async {
    await h.session.start()
    await settle()
  }

  // MARK: Connection + configuration

  @Test
  func startReachesListeningAndSendsSessionUpdate() async {
    let h = makeHarness()
    #expect(h.session.phase == .idle)

    await connect(h)

    #expect(h.session.phase == .listening)
    #expect(h.session.startedAt != nil)

    // fetchToken carried the session id + the wire format string.
    #expect(h.service.fetchTokenCalls.count == 1)
    #expect(h.service.fetchTokenCalls.first?.sessionId == "conv-1")
    #expect(h.service.fetchTokenCalls.first?.format == .champions)

    // The socket opened at the bootstrap model, with the token subprotocol.
    #expect(h.connection.connectURL?.absoluteString.contains("grok-voice-latest") == true)
    #expect(h.connection.subprotocol == "xai-client-secret.tok-123")

    // The first (and only, until ping/audio) frame is session.update.
    let types = h.connection.sentObjects().compactMap { $0["type"] as? String }
    #expect(types == ["session.update"])
    let first = h.connection.sentObjects().first
    #expect(first?["type"] as? String == "session.update")
    let session = first?["session"] as? [String: Any]
    #expect(session?["voice"] as? String == "rex")
    #expect(session?["instructions"] as? String == "You are Oak's Pokédex voice.")

    let turnDetection = session?["turn_detection"] as? [String: Any]
    #expect(turnDetection?["idle_timeout_ms"] as? Int == 30_000)

    let rate = ((session?["audio"] as? [String: Any])?["input"] as? [String: Any])?["format"] as? [String: Any]
    #expect(rate?["rate"] as? Int == 24_000)

    let tools = session?["tools"] as? [[String: Any]]
    #expect(tools?.count == 1)
    #expect(tools?.first?["name"] as? String == "get_move")
  }

  @Test
  func micChunksAreForwardedAsInputAudioAppend() async {
    let h = makeHarness()
    await connect(h)

    h.audio.feedChunk("BASE64CHUNK")
    await settle()

    let appends = h.connection.sentObjects().filter { $0["type"] as? String == "input_audio_buffer.append" }
    #expect(appends.count == 1)
    #expect(appends.first?["audio"] as? String == "BASE64CHUNK")
    let types = h.connection.sentObjects().compactMap { $0["type"] as? String }
    #expect(types.filter { $0 != "session.update" } == ["input_audio_buffer.append"])
  }

  @Test
  func tokenMintFailureSurfacesAGenericError() async {
    let service = FakeVoiceService()
    service.tokenError = .http(status: 502, code: "mint", message: "mint 502")
    let h = makeHarness(service: service)

    await h.session.start()
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == "Couldn't start voice mode.")
    // Never connected → nothing sent.
    #expect(h.connection.sent.isEmpty)
  }

  @Test
  func unauthorizedTokenFailurePromptsSignIn() async {
    let service = FakeVoiceService()
    service.tokenError = .unauthorized
    let h = makeHarness(service: service)

    await h.session.start()
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == "Sign in to use voice mode.")
  }

  @Test
  func accountDeniedTokenFailureShowsServerMessage() async {
    let service = FakeVoiceService()
    let message = "This account can't use voice."
    service.tokenError = .http(status: 403, code: "account_denied", message: message)
    let h = makeHarness(service: service)

    await h.session.start()
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == message)
    #expect(h.connection.sent.isEmpty)
  }

  @Test
  func dailyLimitTokenFailureShowsServerMessage() async {
    let service = FakeVoiceService()
    let message =
      "Daily limit reached. Try again tomorrow (resets at 2026-09-07T00:00:00.000Z UTC)."
    service.tokenError = .http(status: 429, code: "daily_limit", message: message)
    let h = makeHarness(service: service)

    await h.session.start()
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == message)
    #expect(h.connection.sent.isEmpty)
  }

  // MARK: Turn phases + barge-in

  @Test
  func responseCreatedThenAudioDeltaDrivesThinkingThenSpeaking() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit(["type": "response.created"])
    await settle()
    #expect(h.session.phase == .thinking)

    h.connection.emit(["type": "response.output_audio.delta", "delta": "AA=="])
    await settle()
    #expect(h.session.phase == .speaking)
    #expect(h.audio.enqueued == ["AA=="])
  }

  @Test
  func bargeInFlushesBeforeClearingCaptionAndTicker() async {
    let h = makeHarness()
    await connect(h)

    // Snapshot the assistant caption at the instant flush() is called.
    let session = h.session
    h.audio.captionProbe = { session.caption.assistant }

    h.connection.emit(["type": "response.output_audio_transcript.delta", "delta": "partial answer"])
    h.connection.emit([
      "type": "response.function_call_arguments.done",
      "name": "get_move", "call_id": "c1", "arguments": "{}",
    ])
    await settle()
    #expect(h.session.caption.assistant == "partial answer")
    #expect(h.session.toolActivities.count == 1)

    h.connection.emit(["type": "input_audio_buffer.speech_started"])
    await settle()

    // flush() observed the caption BEFORE the reset → it ran first.
    #expect(h.audio.probedCaptions.last == "partial answer")
    #expect(h.session.caption.assistant == "")
    #expect(h.session.toolActivities.isEmpty)
    #expect(h.session.phase == .listening)
  }

  @Test
  func pingIsAnsweredWithAPongEchoingTheTimestamp() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit(["type": "ping", "ping_timestamp": 777])
    await settle()

    let pong = h.connection.sentObjects().first { $0["type"] as? String == "pong" }
    #expect(pong?["ping_timestamp"] as? Double == 777)
    let types = h.connection.sentObjects().compactMap { $0["type"] as? String }
    #expect(types.filter { $0 != "session.update" } == ["pong"])
  }

  // MARK: Tool calls

  @Test
  func toolBatchSendsAllOutputsInOrderThenOneResponseCreate() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit([
      "type": "response.function_call_arguments.done",
      "name": "get_move", "call_id": "call_1", "arguments": "{\"name\":\"earthquake\"}",
    ])
    h.connection.emit([
      "type": "response.function_call_arguments.done",
      "name": "get_ability", "call_id": "call_2", "arguments": "{\"name\":\"levitate\"}",
    ])
    h.connection.emit(["type": "response.done"])
    await settle()

    #expect(h.service.execToolCalls.count == 2)

    let outputs = h.connection.sentObjects().filter { $0["type"] as? String == "conversation.item.create" }
    let creates = h.connection.sentObjects().filter { $0["type"] as? String == "response.create" }
    #expect(outputs.count == 2)
    #expect(creates.count == 1)

    // Outputs ride in call-id insertion order, each an item with a JSON-STRING output.
    let callIds = outputs.compactMap { ($0["item"] as? [String: Any])?["call_id"] as? String }
    #expect(callIds == ["call_1", "call_2"])
    let firstOutput = (outputs.first?["item"] as? [String: Any])?["output"]
    #expect(firstOutput is String)

    // The single response.create comes strictly after both outputs.
    let types = h.connection.sentObjects().compactMap { $0["type"] as? String }
    let lastOutputIdx = types.lastIndex(of: "conversation.item.create")!
    let createIdx = types.firstIndex(of: "response.create")!
    #expect(createIdx > lastOutputIdx)

    // Both calls surfaced in the ticker with friendly labels.
    #expect(h.session.toolActivities.map(\.name) == ["get_move", "get_ability"])
    #expect(h.session.toolActivities.map(\.label) == [voiceToolLabel("get_move"), voiceToolLabel("get_ability")])
  }

  @Test
  func aThrownToolCallIsFoldedIntoAnErrorOutputStillOneCreate() async {
    let service = FakeVoiceService()
    service.toolErrors["get_move"] = .http(status: 500, code: "boom", message: "kaboom")
    let h = makeHarness(service: service)
    await connect(h)

    h.connection.emit([
      "type": "response.function_call_arguments.done",
      "name": "get_move", "call_id": "call_1", "arguments": "{}",
    ])
    h.connection.emit(["type": "response.done"])
    await settle()

    let outputs = h.connection.sentObjects().filter { $0["type"] as? String == "conversation.item.create" }
    let creates = h.connection.sentObjects().filter { $0["type"] as? String == "response.create" }
    #expect(outputs.count == 1)
    #expect(creates.count == 1)

    // The folded output parses to the tool_failed error object.
    let outputString = (outputs.first?["item"] as? [String: Any])?["output"] as? String
    let parsed = outputString
      .flatMap { $0.data(using: .utf8) }
      .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    #expect(parsed?["error"] as? String == "tool_failed")
    #expect(h.session.phase != .error)
  }

  // MARK: Transcript persistence

  @Test
  func aSpokenTurnPersistsBothTextsAndResets() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit([
      "type": "conversation.item.input_audio_transcription.completed",
      "transcript": "how fast is garchomp",
    ])
    h.connection.emit(["type": "response.created"])
    h.connection.emit([
      "type": "response.output_audio_transcript.delta", "delta": "Base one-oh-two Speed.",
    ])
    await settle()
    #expect(h.session.caption.user == "how fast is garchomp")
    #expect(h.session.caption.assistant == "Base one-oh-two Speed.")

    h.connection.emit(["type": "response.done"])
    await settle()

    #expect(h.service.postTranscriptCalls.count == 1)
    #expect(h.service.postTranscriptCalls.first?.userText == "how fast is garchomp")
    #expect(h.service.postTranscriptCalls.first?.assistantText == "Base one-oh-two Speed.")
    #expect(h.session.caption == VoiceCaption(user: "", assistant: ""))
    #expect(h.session.phase == .listening)
  }

  @Test
  func aTurnMissingOneTextIsNotPersisted() async {
    let h = makeHarness()
    await connect(h)

    // Assistant text but no user transcript → no persist.
    h.connection.emit(["type": "response.created"])
    h.connection.emit(["type": "response.output_audio_transcript.delta", "delta": "hello"])
    h.connection.emit(["type": "response.done"])
    await settle()

    #expect(h.service.postTranscriptCalls.isEmpty)
  }

  // MARK: Teardown

  @Test
  func endFromIdleMarksEndedSoASpuriousDisappearCannotLeaveConnecting() {
    let h = makeHarness()
    h.session.end()
    #expect(h.session.phase == .ended)
    #expect(h.connection.sent.isEmpty)
  }

  @Test
  func endStopsCaptureClosesTheSocketAndMarksEnded() async {
    let h = makeHarness()
    await connect(h)

    h.session.end()

    #expect(h.session.phase == .ended)
    #expect(h.audio.calls.contains("stopCapture"))
    #expect(h.audio.calls.contains("close"))
    #expect(h.connection.closed)
  }

  @Test
  func aTimeoutErrorCodeIsACleanEndNotAnError() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit(["type": "error", "code": "timeout", "message": "idle"])
    await settle()

    #expect(h.session.phase == .ended)
    #expect(h.audio.calls.contains("close"))
    #expect(h.connection.closed)
  }

  @Test
  func aNonTimeoutServerErrorSurfacesAsPhaseError() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit(["type": "error", "code": "server_fault", "message": "boom"])
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == "boom")
    #expect(h.audio.calls.contains("close"))
    #expect(h.connection.closed)
  }

  @Test
  func aNestedServerErrorSurfacesItsMessage() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit([
      "type": "error",
      "error": ["type": "invalid_request_error", "code": "bad_request", "message": "nested boom"],
    ])
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == "nested boom")
  }

  @Test
  func aNestedInvalidEventSurfacesTheRejectedTypeFromParams() async {
    let h = makeHarness()
    await connect(h)

    let params =
      "1 validation error for RealtimeClientEvent\ntype\n  Input should be '<enum>' [type=enum, input_value='not.a.real.event', input_type=str]"
    h.connection.emit([
      "type": "error",
      "event_id": "evt_1",
      "error": [
        "type": "invalid_request_error",
        "code": "invalid_event",
        "message": "Invalid event received",
        "params": params,
      ],
    ])
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == "Invalid event received (rejected type: not.a.real.event)")
    #expect(h.session.errorMessage?.contains("not.a.real.event") == true)
  }

  @Test
  func aNestedTimeoutErrorCodeIsACleanEnd() async {
    let h = makeHarness()
    await connect(h)

    h.connection.emit([
      "type": "error",
      "error": ["code": "timeout", "message": "idle"],
    ])
    await settle()

    #expect(h.session.phase == .ended)
  }

  @Test
  func aHandshakeFailureDuringStartSurfacesAsError() async {
    let h = makeHarness()
    h.connection.nextFailureMessage = "Voice connection failed."

    await h.session.start()
    await settle()

    #expect(h.session.phase == .error)
    #expect(h.session.errorMessage == "Voice connection failed.")
    #expect(h.audio.calls.contains("close") || h.session.phase == .error)
  }

  @Test
  func theMaxSessionTimerEndsTheSession() async {
    let service = FakeVoiceService()
    service.tokenResponse = .fixture(maxSessionMs: 5_000)
    let h = makeHarness(service: service)
    await connect(h)
    #expect(h.session.phase == .listening)

    h.clock.fireSleep()
    await settle()

    #expect(h.session.phase == .ended)
    #expect(h.connection.closed)
    #expect(h.audio.calls.contains("close"))
  }

  @Test
  func anUnexpectedInboundFinishEndsTheSession() async {
    let h = makeHarness()
    await connect(h)

    h.connection.finishInbound()
    await settle()

    #expect(h.session.phase == .ended)
    #expect(h.audio.calls.contains("close"))
  }

  @Test
  func endIsIdempotentSoTeardownRunsOnce() async {
    let h = makeHarness()
    await connect(h)

    h.session.end()
    let closesAfterFirst = h.audio.calls.filter { $0 == "close" }.count
    h.session.end()
    let closesAfterSecond = h.audio.calls.filter { $0 == "close" }.count

    #expect(closesAfterFirst == 1)
    #expect(closesAfterSecond == 1)
    #expect(h.session.phase == .ended)
  }
}
