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
    ChatViewModel(chat: fake, appState: appState)
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

  // MARK: Stream resilience — auto-reconnect after a backgrounding drop
  // (mirrors web `sse-client.ts`: MAX_RETRIES=1, only a drop while backgrounded)

  @Test
  func transportDropWhileBackgroundedAutoRetriesOnceThenSucceeds() async throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let fake = FakeChatService()
    fake.attemptScripts = [
      (events: [], error: .transport(underlying: "URLError.-1005")),  // attempt 1: drop
      (events: [.answer(answer)], error: nil),                        // attempt 2: recovers
    ]
    let vm = makeViewModel(fake: fake)

    vm.composerText = "q"
    vm.send()
    vm.sceneDidEnterBackground()              // arm the screen-off gate (turn in flight)
    vm.sceneWillEnterForeground()             // back in foreground before the drop lands
    await vm.streamTask?.value                // attempt 1 drops → fires the retry
    await vm.streamTask?.value                // attempt 2 (the retry) succeeds

    #expect(fake.sendCount == 2)              // exactly ONE auto-retry
    #expect(vm.turns.count == 2)              // user + recovered answer
    #expect(vm.errorBanner == nil)            // recovered, no error surfaced
    #expect(vm.reconnecting == false)         // cleared once output resumed
    #expect(vm.isStreaming == false)
  }

  @Test
  func transportDropStillBackgroundedDefersRetryUntilForeground() async throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let fake = FakeChatService()
    fake.attemptScripts = [
      (events: [], error: .transport(underlying: "URLError.-1005")),
      (events: [.answer(answer)], error: nil),
    ]
    let vm = makeViewModel(fake: fake)

    vm.composerText = "q"
    vm.send()
    vm.sceneDidEnterBackground()              // STILL backgrounded when the drop is seen
    await vm.streamTask?.value                // attempt 1 drops → retry DEFERRED

    #expect(fake.sendCount == 1)              // not retried yet (still backgrounded)
    #expect(vm.reconnecting == true)          // "Reconnecting…" shown
    #expect(vm.isStreaming == true)           // turn kept in flight
    #expect(vm.errorBanner == nil)            // no dead-end error

    vm.sceneWillEnterForeground()             // resume → fire the deferred retry
    await vm.streamTask?.value                // attempt 2 succeeds

    #expect(fake.sendCount == 2)
    #expect(vm.turns.count == 2)
    #expect(vm.reconnecting == false)
    #expect(vm.errorBanner == nil)
  }

  @Test
  func transportDropWhileForegroundedIsNotRetried() async {
    // A connection drop that never coincided with backgrounding is a plain failure —
    // it surfaces a banner and is NOT auto-retried.
    let fake = FakeChatService()
    fake.thrownError = .transport(underlying: "URLError.-1005")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "q"
    vm.send()                                 // no background transition
    await vm.streamTask?.value

    #expect(fake.sendCount == 1)              // NOT retried
    #expect(vm.errorBanner?.message == ChatViewModel.connectionMessage)
    #expect(vm.reconnecting == false)
    #expect(vm.isStreaming == false)
  }

  @Test
  func cleanServerErrorIsNeverAutoRetriedEvenWhenBackgrounded() async {
    // A clean server fault (rate limit / HTTP status) is never a "drop": it surfaces
    // immediately and is never auto-retried, even if the app was backgrounded.
    let fake = FakeChatService()
    fake.thrownError = .rateLimited(retryAfter: 5)
    let vm = makeViewModel(fake: fake)

    vm.composerText = "q"
    vm.send()
    vm.sceneDidEnterBackground()
    vm.sceneWillEnterForeground()
    await vm.streamTask?.value

    #expect(fake.sendCount == 1)              // NOT retried — a clean server fault
    #expect(vm.errorBanner != nil)            // surfaced instead
    #expect(vm.reconnecting == false)
  }

  @Test
  func inBandErrorEventIsNeverAutoRetried() async throws {
    // An in-band SSE `error` frame is a real model/agent fault, delivered over a healthy
    // connection — it becomes a banner and is never auto-retried, even if backgrounded.
    let fake = FakeChatService()
    fake.scriptedEvents = [.error(code: "model_unavailable", message: "down", status: 503)]
    let vm = makeViewModel(fake: fake)

    vm.composerText = "q"
    vm.send()
    vm.sceneDidEnterBackground()
    vm.sceneWillEnterForeground()
    await vm.streamTask?.value

    #expect(fake.sendCount == 1)              // never retried
    #expect(vm.errorBanner != nil)
    #expect(vm.reconnecting == false)
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
