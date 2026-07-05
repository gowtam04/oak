import Foundation
import Testing

@testable import OakApp

/// `ChatViewModel` — the SSE reducer — against `FakeChatService` and the committed
/// `.sse` fixtures (testing-strategy.md "ViewModels"; chat-experience.md
/// M-CHAT-US-1/3/4/6). Two layers of coverage:
///   * the reducer transitions applied directly (`apply(_:)`) — deltas append,
///     `answer_start` resets the buffer but keeps tool history, the terminal answer
///     finalizes, an `error` event becomes a banner;
///   * the end-to-end `send` path over the real fixtures parsed by the production
///     `SSEParser`, plus the request-shape checks (`scope_seed`) and the in-domain
///     non-`answered` rendering.
///
/// The view model is `@MainActor`, so the suite is too.
@MainActor
struct ChatViewModelTests {

  // MARK: Helpers

  private func makeViewModel(
    fake: FakeChatService,
    appState: AppState = AppState()
  ) -> ChatViewModel {
    // Disable the UIKit background-task grace so the detach/reattach logic is exercised
    // deterministically without touching real `beginBackgroundTask` machinery.
    ChatViewModel(chat: fake, appState: appState, usesBackgroundGrace: false)
  }

  /// Parse a committed `.sse` fixture into events through the PRODUCTION parser, so
  /// these tests also exercise `SSEParser`'s frame splitting + decoding.
  private func events(fromSSE name: String) throws -> [SSEEvent] {
    let body = try Fixtures.string(name)
    var parser = SSEParser()
    var out: [SSEEvent] = []
    for line in body.components(separatedBy: "\n") {
      out += try parser.consume(line: line)
    }
    out += try parser.finish()
    return out
  }

  // MARK: Reducer transitions (apply directly)

  @Test
  func deltasAppendToTheBuffer() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.apply(.answerStart)
    vm.apply(.answerDelta(text: "Garchomp "))
    vm.apply(.answerDelta(text: "is fast."))
    #expect(vm.streamingText == "Garchomp is fast.")
  }

  @Test
  func answerStartResetsBufferButKeepsToolHistory() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.apply(.toolActivity(tool: "resolve_entity", label: "Resolving \"Garchomp\""))
    vm.apply(.answerDelta(text: "partial draft"))
    // A fresh submit_answer begins streaming (validate-and-re-emit): the buffer
    // clears, the tool-activity history stays.
    vm.apply(.answerStart)
    #expect(vm.streamingText == "")
    #expect(vm.toolActivities.count == 1)
    #expect(vm.toolActivities.first?.label == "Resolving \"Garchomp\"")
  }

  @Test
  func terminalAnswerFinalizesTheTurn() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let vm = makeViewModel(fake: FakeChatService())

    vm.apply(.toolActivity(tool: "get_pokemon", label: "Looking up Garchomp"))
    vm.apply(.answerDelta(text: "streaming…"))
    vm.apply(.answer(answer))

    #expect(vm.turns.count == 1)
    if case let .assistant(rendered) = vm.turns.last?.content {
      #expect(rendered.status == .answered)
    } else {
      Issue.record("expected an assistant turn")
    }
    #expect(vm.streamingText == "")          // buffer replaced by the authoritative answer
    #expect(vm.toolActivities.isEmpty)        // in-progress activity cleared
    #expect(vm.isStreaming == false)
    #expect(vm.errorBanner == nil)
  }

  @Test
  func errorEventBecomesARecoverableBanner() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.apply(.answerDelta(text: "half an answer"))
    vm.apply(.error(code: "model_unavailable", message: "down", status: 503))

    #expect(vm.errorBanner != nil)
    #expect(vm.errorBanner?.isRetryable == true)
    #expect(vm.streamingText == "")           // no half-rendered answer left behind
    #expect(vm.isStreaming == false)
  }

  // MARK: End-to-end over the .sse fixtures

  @Test
  func answeredFullStreamRendersUserThenAnswer() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_answered_full.sse")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "Tell me about Garchomp"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.turns.count == 2)              // user + assistant
    if case let .user(text, _) = vm.turns.first?.content {
      #expect(text == "Tell me about Garchomp")
    } else {
      Issue.record("expected a user turn first")
    }
    if case let .assistant(answer) = vm.turns.last?.content {
      #expect(answer.status == .answered)
      #expect(answer.subjects?.first?.name == "Garchomp")
    } else {
      Issue.record("expected an assistant turn last")
    }
    #expect(vm.streamingText == "")
    #expect(vm.toolActivities.isEmpty)
    #expect(vm.isStreaming == false)
    #expect(vm.errorBanner == nil)
    #expect(vm.composerText == "")            // composer cleared on send
  }

  @Test
  func grokSingleDeltaStreamStillFinalizes() async throws {
    // Grok delivers the whole answer in ONE delta — the reducer must not assume many.
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_single_delta_grok.sse")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "Fastest Dragon type?"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.turns.count == 2)
    if case let .assistant(answer) = vm.turns.last?.content {
      #expect(answer.status == .answered)
    } else {
      Issue.record("expected an assistant turn")
    }
    #expect(vm.isStreaming == false)
  }

  @Test
  func heartbeatStreamFinalizesIgnoringComments() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_heartbeat.sse")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "hi"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.turns.count == 2)
    if case let .assistant(answer) = vm.turns.last?.content {
      #expect(answer.status == .answered)
    } else {
      Issue.record("expected an assistant turn")
    }
  }

  @Test
  func inBandErrorStreamKeepsUserTurnAndShowsBanner() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_error.sse")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "Tell me about Garchomp"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.turns.count == 1)              // only the user turn — no half answer
    if case .user = vm.turns.first?.content {} else {
      Issue.record("expected the user turn to remain")
    }
    #expect(vm.errorBanner != nil)
    #expect(vm.streamingText == "")
    #expect(vm.isStreaming == false)
  }

  @Test
  func thrownTransportFaultBecomesConnectionBanner() async {
    let fake = FakeChatService()
    fake.thrownError = OakError.transport(underlying: "URLError.-1009")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "anything"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.errorBanner?.message == ChatViewModel.connectionMessage)
    #expect(vm.errorBanner?.isRetryable == true)
    #expect(vm.isStreaming == false)
  }

  @Test
  func imageRejectionShowsItsSpecificReasonNotTheGenericBanner() async {
    // A client-side image rejection must surface the ACTUAL reason (the fix for the
    // dead-end "Something went wrong" banner), never the generic fallback.
    let fake = FakeChatService()
    fake.thrownError = OakError.imageRejected(reason: .perImageTooLarge)
    let vm = makeViewModel(fake: fake)

    vm.composerText = "what is this?"
    vm.send()
    await vm.streamTask?.value

    #expect(
      vm.errorBanner?.message == ChatViewModel.imageRejectedMessage(.perImageTooLarge))
    #expect(vm.errorBanner?.message != ChatViewModel.genericMessage)
    #expect(vm.errorBanner?.isRetryable == true)
    #expect(vm.isStreaming == false)
  }

  // MARK: In-domain non-answered statuses render (NOT as errors)

  @Test
  func insufficientDataRendersAsAnAnswerNotAnError() async throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_insufficient_data.json")
    let fake = FakeChatService()
    fake.scriptedEvents = [.answerStart, .answerDelta(text: answer.answerMarkdown), .answer(answer)]
    let vm = makeViewModel(fake: fake)

    vm.composerText = "obscure question"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.errorBanner == nil)            // an in-domain failure is NOT an error
    if case let .assistant(rendered) = vm.turns.last?.content {
      #expect(rendered.status == .insufficientData)
    } else {
      Issue.record("expected an assistant turn with the insufficient_data status")
    }
  }

  @Test
  func clarificationRendersAsAnAnswerNotAnError() async throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_clarification.json")
    let fake = FakeChatService()
    fake.scriptedEvents = [.answer(answer)]
    let vm = makeViewModel(fake: fake)

    vm.composerText = "ambiguous"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.errorBanner == nil)
    if case let .assistant(rendered) = vm.turns.last?.content {
      #expect(rendered.status == .clarificationNeeded)
    } else {
      Issue.record("expected an assistant turn with the clarification_needed status")
    }
  }

  // MARK: Scope chip → scope_seed on the request (GS-C)

  @Test
  func displayFormatDefaultsToChampionsWithNoSeedOrResolvedScope() {
    let vm = makeViewModel(fake: FakeChatService())
    // seed ?? resolved ?? champions — a fresh thread has neither.
    #expect(vm.displayFormat == .champions)
    #expect(vm.scopeSeed == nil)
    #expect(vm.resolvedScope == nil)
  }

  @Test
  func selectScopeSeedsDisplayFormatAndRidesTheNextRequest() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = []  // no `scope` event, so the seed is NOT cleared
    let vm = makeViewModel(fake: fake)

    vm.selectScope(.gen7)
    #expect(vm.displayFormat == .gen7)        // a pending pick outranks resolved/default

    vm.composerText = "in this scope, what changed?"
    vm.send()
    await vm.streamTask?.value

    #expect(fake.lastScopeSeed == .gen7)      // the pick rode the request as scope_seed
  }

  @Test
  func noSeedSendsNilScopeSeed() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_answered_full.sse")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "no explicit scope"
    vm.send()
    await vm.streamTask?.value

    #expect(fake.lastScopeSeed == nil)        // absent scope_seed ⇒ server precedence resolves
  }

  @Test
  func scopeEventAdoptsResolvedScopeAndClearsThePendingSeed() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.selectScope(.gen7)
    #expect(vm.displayFormat == .gen7)

    // A resolved `scope` event lands (e.g. the server honored an in-message signal
    // for a DIFFERENT scope): adopt it, retire the seed, and reflect it in display.
    vm.apply(.scope(format: .gen5, source: .message))

    #expect(vm.resolvedScope == .gen5)
    #expect(vm.resolvedScopeSource == .message)
    #expect(vm.scopeSeed == nil)              // seed cleared once a turn resolved
    #expect(vm.displayFormat == .gen5)        // now shows the resolved scope
  }

  @Test
  func seedRidesOnlyOneTurnThenClearsOnScopeEvent() async throws {
    // A `scope` event in the stream clears the seed mid-turn, so it does NOT leak
    // onto the following send (mirrors web's `scope` effect clearing `scopeSeed`).
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .scope(format: .champions, source: .seed),
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)

    vm.selectScope(.champions)
    vm.composerText = "first"
    vm.send()
    await vm.streamTask?.value
    #expect(fake.lastScopeSeed == .champions) // rode the FIRST turn

    vm.composerText = "second"
    vm.send()
    await vm.streamTask?.value
    #expect(fake.lastScopeSeed == nil)        // NOT re-sent on the next turn
  }

  @Test
  func scopeEventMirrorsResolvedScopeToGuestThread() {
    let appState = AppState()               // defaults to .guest
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)

    vm.apply(.scope(format: .gen8, source: .conversation))

    // The resolved scope is mirrored so the guest→sign-in import uploads under it.
    #expect(appState.guestThreadScope == .gen8)
  }

  @Test
  func selectScopeIsIgnoredMidStream() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.composerText = "q"
    vm.send()                                 // isStreaming → true
    vm.selectScope(.gen6)
    #expect(vm.scopeSeed == nil)              // ignored while a turn streams
  }

  // MARK: Stop / quick-stop (mirrors web `handleStop`)

  @Test
  func quickStopWipesThreadAndRestoresComposer() {
    // A stop within the quick-stop window discards the just-sent turn and restores its
    // message for a redo (web `handleStop`: wipes ALL turns + rotates the session).
    let fake = FakeChatService()
    fake.scriptedEvents = []                 // stream stays "in flight" (never awaited)
    let appState = AppState()                // guest
    let vm = makeViewModel(fake: fake, appState: appState)
    let firstSession = vm.sessionId

    vm.composerText = "Garchomp moveset?"
    vm.send()                                 // isStreaming → true; task NOT awaited
    #expect(vm.isStreaming)
    #expect(vm.turns.count == 1)              // just the user turn
    #expect(appState.guestThread.count == 1)  // mirrored

    vm.performStop(now: Date())               // within quickStopThreshold

    #expect(vm.isStreaming == false)
    #expect(vm.turns.isEmpty)                 // whole thread wiped
    #expect(vm.sessionId != firstSession)     // session rotated
    #expect(vm.composerText == "Garchomp moveset?")  // text restored for redo
    #expect(vm.errorBanner == nil)            // a user-initiated stop is NOT an error
    #expect(appState.guestThread.isEmpty)     // guest mirror cleared with the thread
    #expect(appState.activeConversationId == nil)
  }

  @Test
  func lateStopKeepsAnswerlessUserTurnAndDoesNotRestore() {
    // A stop AFTER the quick-stop window leaves the (now answer-less) user turn in place
    // and does not restore the composer.
    let fake = FakeChatService()
    fake.scriptedEvents = []
    let vm = makeViewModel(fake: fake)

    vm.composerText = "Garchomp moveset?"
    vm.send()
    #expect(vm.turns.count == 1)

    // Stop well past the window (inject a later clock so the test needn't wait).
    vm.performStop(now: Date().addingTimeInterval(ChatViewModel.quickStopThreshold + 5))

    #expect(vm.isStreaming == false)
    #expect(vm.turns.count == 1)              // answer-less user turn stays
    #expect(vm.composerText == "")            // NOT restored on a late stop
    #expect(vm.errorBanner == nil)            // still not an error
  }

  @Test
  func stopWhenNotStreamingIsANoOp() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "draft, not yet sent"

    vm.stopStreaming()                        // nothing in flight

    #expect(vm.composerText == "draft, not yet sent")  // untouched
    #expect(vm.turns.isEmpty)
  }

  // MARK: Background turns — pending-turn id, detach vs stop, reattach (design §6.2)

  private func fullAnswer() throws -> OakAnswer {
    try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
  }

  @Test
  func turnFrameRecordsPendingTurnIdLocallyAndInAppState() {
    let appState = AppState()
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)

    vm.apply(.turn(turnId: "turn-1"))

    #expect(vm.currentTurnId == "turn-1")
    #expect(appState.pendingTurn(for: vm.sessionId) == "turn-1")  // survives view teardown
    #expect(vm.isStreaming == true)
  }

  @Test
  func terminalAnswerClearsThePendingTurn() throws {
    let appState = AppState()
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)

    vm.apply(.turn(turnId: "turn-1"))
    vm.apply(.answer(try fullAnswer()))

    #expect(vm.currentTurnId == nil)                              // cleared on terminal
    #expect(appState.pendingTurn(for: vm.sessionId) == nil)
  }

  @Test
  func turnFrameResetsInFlightBufferForReattachReplay() {
    // On a reattach the replay opens with `turn`; the buffer + tool history must reset
    // so the replayed events repopulate them without duplication.
    let vm = makeViewModel(fake: FakeChatService())
    vm.apply(.toolActivity(tool: "t", label: "stale"))
    vm.apply(.answerDelta(text: "stale half-answer"))

    vm.apply(.turn(turnId: "turn-1"))

    #expect(vm.streamingText == "")
    #expect(vm.toolActivities.isEmpty)
  }

  @Test
  func detachClosesTheSocketButKeepsThePendingTurnAndNeverStops() {
    // Navigating away / backgrounding UNSUBSCRIBES — the turn keeps generating
    // server-side. `detach` must NOT call the stop endpoint and must keep the pending
    // id. The test body is synchronous, so `send`'s consume Task never runs (no
    // suspension point) — `streamTask` stays as beginStreaming left it until detach.
    let fake = FakeChatService()
    fake.scriptedEvents = [.turn(turnId: "turn-1")]  // no terminal → "in flight"
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)

    vm.composerText = "q"
    vm.send()
    vm.apply(.turn(turnId: "turn-1"))                // record the turn id deterministically

    vm.detach()

    #expect(vm.streamTask == nil)                    // socket closed
    #expect(fake.stopCount == 0)                     // NEVER calls the server (BT-7)
    #expect(vm.currentTurnId == "turn-1")            // pending id kept
    #expect(appState.pendingTurn(for: vm.sessionId) == "turn-1")
  }

  @Test
  func stopCallsTheServerStopEndpointAndClearsThePendingTurn() async {
    // The Stop affordance is now an EXPLICIT server call (BT-4), then local teardown.
    let fake = FakeChatService()
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)

    // Put a turn in flight without a live consume task, so the only Task to schedule is
    // the fire-and-forget stop call the assertions are about.
    vm.apply(.turn(turnId: "turn-1"))                // isStreaming + a known turn id

    // A late stop (past the quick-stop window) so the assertions are about the stop
    // call + teardown, not the quick-stop thread wipe.
    vm.performStop(now: Date().addingTimeInterval(ChatViewModel.quickStopThreshold + 5))
    // Let the fire-and-forget stop task run.
    for _ in 0..<20 where fake.stopCount == 0 { await Task.yield() }

    #expect(fake.stopCount == 1)                      // stopped server-side
    #expect(fake.lastStopTurnId == "turn-1")          // stopped the right turn
    #expect(fake.lastStopSessionId == vm.sessionId)
    #expect(vm.isStreaming == false)                  // local teardown ran
    #expect(vm.currentTurnId == nil)                  // pending id cleared (turn discarded)
    #expect(appState.pendingTurn(for: vm.sessionId) == nil)
    #expect(vm.errorBanner == nil)                    // a stop is not a failure
  }

  @Test
  func stoppedEventDiscardsTheTurnWithNoBanner() {
    let appState = AppState()
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)
    vm.apply(.turn(turnId: "turn-1"))
    vm.apply(.answerDelta(text: "partial"))

    vm.apply(.stopped)

    #expect(vm.isStreaming == false)
    #expect(vm.streamingText == "")
    #expect(vm.errorBanner == nil)                    // stopped is intentional, not an error
    #expect(vm.currentTurnId == nil)
    #expect(appState.pendingTurn(for: vm.sessionId) == nil)
  }

  @Test
  func reattachIfNeededResumesARunningTurnFromThePendingPointer() async throws {
    // A thread reopened (or app foregrounded) with a pending turn reattaches to its
    // live stream and rebuilds the in-flight UI from the replay.
    let fake = FakeChatService()
    fake.resumeEvents = [.turn(turnId: "turn-1"), .answer(try fullAnswer())]
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    appState.setPendingTurn(conversationId: vm.sessionId, turnId: "turn-1")

    vm.reattachIfNeeded()
    await vm.streamTask?.value

    #expect(fake.resumeCount == 1)                    // reattached, not re-sent
    #expect(fake.sendCount == 0)
    #expect(fake.lastResumeTurnId == "turn-1")
    #expect(fake.lastResumeSessionId == vm.sessionId)
    if case let .assistant(answer) = vm.turns.last?.content {
      #expect(answer.status == .answered)             // resumed answer rendered
    } else {
      Issue.record("expected the resumed answer to render")
    }
    #expect(vm.isStreaming == false)
    #expect(appState.pendingTurn(for: vm.sessionId) == nil)  // terminal cleared it
  }

  @Test
  func reattachIfNeededIsANoOpWithNoPendingTurn() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)

    vm.reattachIfNeeded()

    #expect(fake.resumeCount == 0)                    // nothing to reattach to
    #expect(vm.streamTask == nil)
  }

  @Test
  func reattachIfNeededDoesNotDoubleAttachWhileAStreamIsLive() {
    let fake = FakeChatService()
    fake.scriptedEvents = []                          // stays in flight
    let vm = makeViewModel(fake: fake)
    vm.composerText = "q"
    vm.send()                                         // a live stream is attached
    vm.apply(.turn(turnId: "turn-1"))

    vm.reattachIfNeeded()                             // must not open a second stream

    #expect(fake.resumeCount == 0)
  }

  @Test
  func resumeNotFoundClearsPendingAndShowsInterruptedRetryBanner() async {
    // A reattach whose turn is gone (resume 404) clears the pending pointer and surfaces
    // the interrupted/Retry affordance.
    let fake = FakeChatService()
    fake.resumeThrownError = .http(status: 404, code: "not_found", message: "Turn not found.")
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    appState.setPendingTurn(conversationId: vm.sessionId, turnId: "turn-gone")

    vm.reattachIfNeeded()
    await vm.streamTask?.value

    #expect(appState.pendingTurn(for: vm.sessionId) == nil)   // pending cleared
    #expect(vm.currentTurnId == nil)
    #expect(vm.isStreaming == false)
    #expect(vm.errorBanner?.message == ChatViewModel.interruptedMessage)
    #expect(vm.errorBanner?.isRetryable == true)
  }

  @Test
  func sendReattachesInsteadOfErroringOn409TurnInProgress() async throws {
    // A send that collides with a turn already generating (409 `turn_in_progress`)
    // reattaches to the returned turn id instead of surfacing an error (BT-5).
    let fake = FakeChatService()
    fake.thrownError = .turnInProgress(turnId: "turn-running")
    fake.resumeEvents = [.turn(turnId: "turn-running"), .answer(try fullAnswer())]
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)

    vm.composerText = "q"
    vm.send()
    await vm.streamTask?.value                         // send → 409 → handleTurnInProgress
    await vm.streamTask?.value                         // the reattach resume completes

    #expect(fake.lastResumeTurnId == "turn-running")   // reattached to the running turn
    #expect(vm.errorBanner == nil)                     // no error surfaced
    if case let .assistant(answer) = vm.turns.last?.content {
      #expect(answer.status == .answered)
    } else {
      Issue.record("expected the running turn's answer to render")
    }
    #expect(vm.isStreaming == false)
  }

  @Test
  func loadResumedReattachesToTheConversationActiveTurn() async throws {
    // Opening a saved conversation whose `active_turn` is still generating reattaches
    // to its live stream (design §5.4).
    let fake = FakeChatService()
    fake.resumeEvents = [.turn(turnId: "active-1"), .answer(try fullAnswer())]
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)

    vm.loadResumed(
      conversationId: "conv-9",
      format: .champions,
      turns: [.user(id: "u1", content: "Tell me about Garchomp")],
      activeTurnId: "active-1"
    )
    await vm.streamTask?.value

    #expect(fake.lastResumeTurnId == "active-1")
    #expect(fake.lastResumeSessionId == "conv-9")
    #expect(vm.turns.count == 2)                        // resumed user turn + streamed answer
    #expect(appState.pendingTurn(for: "conv-9") == nil) // terminal cleared it
  }

  @Test
  func loadResumedWithNoActiveTurnDoesNotReattach() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)

    vm.loadResumed(conversationId: "conv-9", format: .champions, turns: [], activeTurnId: nil)

    #expect(fake.resumeCount == 0)
    #expect(vm.streamTask == nil)
  }

  @Test
  func inBandErrorEventClearsPendingAndIsNeverReattached() throws {
    // An in-band SSE `error` frame is a real model/agent fault over a healthy connection
    // — it becomes a banner, clears the pending turn, and is never reattached.
    let appState = AppState()
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)

    vm.apply(.turn(turnId: "turn-1"))
    vm.apply(.error(code: "model_unavailable", message: "down", status: 503))

    #expect(vm.errorBanner != nil)
    #expect(vm.reconnecting == false)
    #expect(vm.currentTurnId == nil)
    #expect(appState.pendingTurn(for: vm.sessionId) == nil)
  }

  // MARK: Composer + conversation lifecycle

  @Test
  func canSendRequiresTextAndNotStreaming() {
    let vm = makeViewModel(fake: FakeChatService())
    #expect(vm.canSend == false)              // empty composer

    vm.composerText = "   "
    #expect(vm.canSend == false)              // whitespace only

    vm.composerText = "real question"
    #expect(vm.canSend == true)
  }

  @Test
  func emptyMessageDoesNotSend() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "   "
    vm.send()
    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
  }

  @Test
  func startNewConversationClearsThreadAndRotatesSession() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_answered_full.sse")
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    let firstSession = vm.sessionId

    vm.composerText = "first question"
    vm.send()
    await vm.streamTask?.value
    #expect(vm.turns.count == 2)
    #expect(appState.guestThread.isEmpty == false)   // guest thread mirrored

    vm.startNewConversation()

    #expect(vm.turns.isEmpty)
    #expect(vm.sessionId != firstSession)            // rotated → no prior context
    #expect(appState.guestThread.isEmpty)            // guest thread reset
    #expect(appState.activeConversationId == nil)
  }

  @Test
  func guestTurnsAreMirroredIntoAppState() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_answered_full.sse")
    let appState = AppState()                          // defaults to .guest
    let vm = makeViewModel(fake: fake, appState: appState)

    vm.composerText = "Tell me about Garchomp"
    vm.send()
    await vm.streamTask?.value

    #expect(appState.guestThread.count == 2)
    #expect(appState.guestThread.first?.role == .user)
    #expect(appState.guestThread.last?.role == .assistant)
  }

  // MARK: Resuming a saved conversation

  @Test
  func loadResumedSeedsThreadAndSessionFromTurns() throws {
    // Resuming a stored conversation (HistoryDetail → Chat thread): the saved turns
    // rehydrate the visible thread and the session id becomes the conversation id, so
    // follow-ups continue the same conversation (chat-experience.md M-CHAT-US-2/3).
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let vm = makeViewModel(fake: FakeChatService())

    // Dirty the in-flight state first, so we can prove `loadResumed` resets it. Apply
    // `.error` BEFORE the activity/delta — `.error` clears those, so this order leaves
    // the banner, a tool activity, and a streamed buffer all populated together.
    vm.apply(.error(code: "model_unavailable", message: "down", status: 503))
    vm.apply(.toolActivity(tool: "resolve_entity", label: "Resolving \"Garchomp\""))
    vm.apply(.answerDelta(text: "leftover draft"))

    let turns: [ChatTurn] = [
      .user(id: "u1", content: "Tell me about Garchomp"),
      .assistant(id: "a1", answer: answer),
    ]
    vm.loadResumed(conversationId: "conv-42", format: .gen7, turns: turns)

    // The session id becomes the resumed conversation id.
    #expect(vm.sessionId == "conv-42")

    // The stored scope seeds the display immediately (before the first turn re-emits).
    #expect(vm.resolvedScope == .gen7)
    #expect(vm.displayFormat == .gen7)
    #expect(vm.scopeSeed == nil)

    // Turns map one-to-one, preserving order and count: a `.user` turn → a user item
    // with no images, an `.assistant` turn → the rendered answer.
    #expect(vm.turns.count == 2)
    if case let .user(text, imageCount) = vm.turns.first?.content {
      #expect(text == "Tell me about Garchomp")
      #expect(imageCount == 0)                  // resumed user turns carry no attachments
    } else {
      Issue.record("expected the first resumed turn to be the user message")
    }
    if case let .assistant(rendered) = vm.turns.last?.content {
      #expect(rendered.status == .answered)
    } else {
      Issue.record("expected the second resumed turn to be the assistant answer")
    }

    // In-flight streaming state is cleared.
    #expect(vm.streamingText == "")
    #expect(vm.toolActivities.isEmpty)
    #expect(vm.errorBanner == nil)
  }

  // MARK: Streaming phase (the "working vs done" signal)

  @Test
  func streamingPhaseReflectsProgress() {
    let vm = makeViewModel(fake: FakeChatService())
    #expect(vm.streamingPhase == .idle)

    vm.composerText = "q"
    vm.send()                                          // isStreaming → true, no events yet
    #expect(vm.streamingPhase == .thinking)

    vm.apply(.toolActivity(tool: "t", label: "looking up"))
    #expect(vm.streamingPhase == .usingTools)

    vm.apply(.answerStart)
    vm.apply(.answerDelta(text: "answer"))
    #expect(vm.streamingPhase == .answering)
  }
}
