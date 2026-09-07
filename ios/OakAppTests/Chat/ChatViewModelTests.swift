import Foundation
import Testing
import UIKit

@testable import OakApp

/// `ChatViewModel` — the SSE reducer — against `FakeChatService` and the committed
/// `.sse` fixtures (testing-strategy.md "ViewModels"; chat-experience.md
/// M-CHAT-US-1/3/4/6). Two layers of coverage:
///   * the reducer transitions applied directly (`apply(_:)`) — deltas append,
///     `answer_start` resets the buffer but keeps tool history, the terminal answer
///     finalizes, an `error` event becomes a banner;
///   * the end-to-end `send` path over the real fixtures parsed by the production
///     `SSEParser`, plus the request-shape checks (`scope_seed` is never an
///     other-format seed — CF-CHAT-US-1) and the in-domain non-`answered` rendering.
///
/// Champions-first P7 expected API:
///   `displayFormat` is always `.champions`
///   `isRegulationChipPicker == false` (informational regulation chip)
///   `regulationLabel` contains the current regulation (Reg M-B)
///   `selectScope` is a no-op for other formats and does not persist them
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

  // MARK: Spend-control banners (SC-AC-5.4 / SC-AC-6.5 / SC-BR-14)

  @Test
  func accountDeniedBannerIsNotRetryableAndOmitsGuestRateLimitHint() async {
    // Denylist copy is the server message; Retry is hidden; the guest
    // per-minute "sign in to raise the limit" hint must not attach.
    let fake = FakeChatService()
    let message = "This account can't use chat."
    fake.thrownError = .http(status: 403, code: "account_denied", message: message)
    let vm = makeViewModel(fake: fake)  // AppState defaults to guest

    vm.composerText = "hello"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.errorBanner?.message == message)
    #expect(vm.errorBanner?.isRetryable == false)
    #expect(vm.errorBanner?.message.contains("Sign in to raise the limit.") != true)
  }

  @Test
  func dailyLimitBannerIsNotRetryableAndOmitsGuestRateLimitHint() async {
    // Daily-cap copy is the server message (includes reset time); Retry is
    // hidden; guests must not get the per-minute sign-in hint on this path.
    let fake = FakeChatService()
    let message =
      "Daily limit reached. Try again tomorrow (resets at 2026-09-07T00:00:00.000Z UTC)."
    fake.thrownError = .http(status: 429, code: "daily_limit", message: message)
    let vm = makeViewModel(fake: fake)  // AppState defaults to guest

    vm.composerText = "hello"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.errorBanner?.message == message)
    #expect(vm.errorBanner?.isRetryable == false)
    #expect(vm.errorBanner?.message.contains("Sign in to raise the limit.") != true)
  }

  @Test
  func perMinuteRateLimitBannerIsRetryableAndGuestsGetSignInHint() async {
    let fake = FakeChatService()
    fake.thrownError = .rateLimited(retryAfter: 30)
    let vm = makeViewModel(fake: fake)  // AppState defaults to guest

    vm.composerText = "hello"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.errorBanner?.isRetryable == true)
    #expect(
      vm.errorBanner?.message
        == ChatViewModel.rateLimitMessage(retryAfter: 30) + " Sign in to raise the limit.")
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

  // MARK: Regulation chip — not a format picker (CF-CHAT-US-1, CF-UI-US-2)

  @Test
  func displayFormatDefaultsToChampionsWithNoPicker() {
    let vm = makeViewModel(fake: FakeChatService())
    #expect(vm.displayFormat == .champions)
    #expect(vm.scopeSeed == nil)
    #expect(vm.resolvedScope == nil)
    #expect(vm.isRegulationChipPicker == false)
    #expect(
      vm.regulationLabel.contains("Reg M-B")
        || vm.regulationLabel.contains("Regulation M-B")
        || vm.displayFormat.displayLabel.contains("Reg M-B"))
  }

  @Test
  func leftoverLastUsedScopeDoesNotReopenAnotherGame() {
    let appState = AppState()
    appState.completeSignIn(email: "ash@pallet.town", lastUsedScope: .gen7)
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)
    #expect(vm.displayFormat == .champions)
    #expect(vm.scopeSeed == nil)
  }

  @Test
  func selectScopeDoesNotSendOtherFormatScopeSeedAndIsNotAPicker() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = []
    let vm = makeViewModel(fake: fake)

    vm.selectScope(.gen7)
    #expect(vm.displayFormat == .champions)
    #expect(vm.scopeSeed == nil || vm.scopeSeed == .champions)
    #expect(vm.isRegulationChipPicker == false)

    vm.composerText = "in this scope, what changed?"
    vm.send()
    await vm.streamTask?.value

    #expect(fake.lastScopeSeed != .gen7)
    #expect(fake.lastScopeSeed == nil || fake.lastScopeSeed == .champions)
    #expect(fake.lastPersistedScope != .gen7)
    #expect(fake.persistScopeCount == 0)
  }

  @Test
  func noSeedSendsNilScopeSeed() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = try events(fromSSE: "chat_answered_full.sse")
    let vm = makeViewModel(fake: fake)

    vm.composerText = "no explicit scope"
    vm.send()
    await vm.streamTask?.value

    #expect(fake.lastScopeSeed == nil || fake.lastScopeSeed == .champions)
    #expect(fake.lastScopeSeed != .gen7)
    #expect(fake.lastScopeSeed != .nationalDex)
  }

  @Test
  func otherFormatScopeEventDoesNotBecomeAPickerOrSeed() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.selectScope(.gen7)

    vm.apply(.scope(format: .gen5, source: .message))

    #expect(vm.displayFormat == .champions)
    #expect(vm.scopeSeed == nil || vm.scopeSeed == .champions)
    #expect(vm.isRegulationChipPicker == false)
  }

  @Test
  func aChampionsScopeEventDoesNotLeakASeedOntoTheNextSend() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .scope(format: .champions, source: .default),
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)

    vm.composerText = "first"
    vm.send()
    await vm.streamTask?.value
    #expect(fake.lastScopeSeed == nil || fake.lastScopeSeed == .champions)

    vm.composerText = "second"
    vm.send()
    await vm.streamTask?.value
    #expect(fake.lastScopeSeed == nil || fake.lastScopeSeed == .champions)
    #expect(fake.lastScopeSeed != .gen7)
  }

  @Test
  func scopeEventMirrorsChampionsOntoTheGuestThread() {
    let appState = AppState()               // defaults to .guest
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)

    vm.apply(.scope(format: .gen8, source: .conversation))

    #expect(appState.guestThreadScope == .champions)
    #expect(vm.displayFormat == .champions)
  }

  @Test
  func selectScopeIsIgnoredMidStream() {
    let vm = makeViewModel(fake: FakeChatService())
    vm.composerText = "q"
    vm.send()                                 // isStreaming → true
    vm.selectScope(.gen6)
    #expect(vm.scopeSeed == nil || vm.scopeSeed == .champions)
    #expect(vm.displayFormat == .champions)
  }

  // MARK: Stop / quick-stop (mirrors web `handleStop`)

  @Test
  func quickStopWipesThreadAndRestoresComposer() {
    // Undo (Stop within 3s) discards the just-sent user bubble and restores
    // composer state. Prior turns stay; the session is not rotated (ADR-3).
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
    #expect(vm.turns.isEmpty)                 // just-sent bubble removed
    #expect(vm.sessionId == firstSession)     // session kept
    #expect(vm.composerText == "Garchomp moveset?")  // text restored for redo
    #expect(vm.errorBanner == nil)            // a user-initiated stop is NOT an error
    #expect(appState.guestThread.isEmpty)     // guest mirror popped the user turn
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
  func stopBeforeTurnFrameDefersTheStopUntilTheIdArrives() async {
    // The pre-`turn`-frame stop race (design §6.2): a Stop before `turn { turn_id }`
    // must NOT tear down locally and leave the server turn running (a ghost answer).
    // It arms a pending stop, finalizes the UI, keeps the read alive to capture the id,
    // then fires the stop endpoint against the ORIGINAL session.
    let fake = FakeChatService()
    fake.scriptedEvents = []  // stays "in flight"; the consume task never runs (no await)
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)
    let originalSession = vm.sessionId

    vm.composerText = "q"
    vm.send()
    #expect(vm.currentTurnId == nil)   // no id yet — the race window

    // Stop inside the quick-stop window (no id): the UI finalizes now (quick stop wipes
    // + rotates the session), but the stop endpoint is NOT called yet.
    vm.performStop(now: Date())
    #expect(vm.isStreaming == false)   // UI finalized immediately
    #expect(fake.stopCount == 0)       // deferred — no id to POST to yet
    #expect(vm.sessionId == originalSession)  // undo does not rotate the session

    // The `turn` frame finally arrives (delivered by the still-alive read): now the stop
    // fires with the captured id, against the ORIGINAL session (guest authorization).
    vm.apply(.turn(turnId: "turn-late"))
    for _ in 0..<20 where fake.stopCount == 0 { await Task.yield() }

    #expect(fake.stopCount == 1)
    #expect(fake.lastStopTurnId == "turn-late")
    #expect(fake.lastStopSessionId == originalSession)
    #expect(vm.streamTask == nil)      // connection torn down after the deferred stop
  }

  @Test
  func stopBeforeTurnFrameStaysSilentlyIdleIfTheConnectionDiesFirst() async {
    // If the connection dies before the `turn` frame arrives, there is nothing to stop —
    // stay silently idle (no stop call, no error banner).
    let fake = FakeChatService()
    fake.thrownError = .transport(underlying: "URLError.-1005")  // the send stream dies
    let appState = AppState()
    let vm = makeViewModel(fake: fake, appState: appState)

    vm.composerText = "q"
    vm.send()
    vm.performStop(now: Date())        // arm the deferred stop (no id yet)
    await vm.streamTask?.value         // the read dies before any `turn` frame

    #expect(fake.stopCount == 0)       // nothing to stop
    #expect(vm.errorBanner == nil)     // silent — not surfaced as a failure
    #expect(vm.isStreaming == false)
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

    // Old threads may still store gen-7, but the chip is Champions-only
    // (CF-CHAT-US-1 / CF-DATA-BR-21) and follow-ups must not send that seed.
    #expect(vm.displayFormat == .champions)
    #expect(vm.scopeSeed == nil || vm.scopeSeed == .champions)

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
  func slashNewDoesNotStartATurn() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "/new"
    vm.send()
    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(vm.composerText == "")
  }

  @Test
  func retryLastAnswerSendsRecoveryRetryWithoutAppendingAUserTurn() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "Tell me about Garchomp"
    vm.send()
    await vm.streamTask?.value
    #expect(vm.turns.count == 2)

    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    vm.retryLastAnswer()
    await vm.streamTask?.value

    #expect(fake.lastRecovery == .retry)
    #expect(fake.lastMessage == "Tell me about Garchomp")
    #expect(vm.turns.count == 2)
    if case .assistant = vm.turns.last?.content {
      // replaced in place
    } else {
      Issue.record("expected the last turn to stay an assistant card")
    }
  }

  @Test
  func editTargetsLastUserAfterCompletedPair() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "Tell me about Garchomp"
    vm.send()
    await vm.streamTask?.value

    #expect(vm.turns.count == 2)
    #expect(vm.lastUserTurnId == vm.turns.first?.id)
    #expect(vm.isLastUser(vm.turns[0]))
    #expect(!vm.isLastUser(vm.turns[1]))
    #expect(vm.isLastAssistant(vm.turns[1]))
    #expect(vm.canEditLastUser)

    vm.beginEditLast()
    #expect(vm.composerText == "Tell me about Garchomp")
    #expect(vm.isEditingLast)
  }

  @Test
  func beginEditLastRestoresInMemoryImages() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    let image = UIImage(systemName: "photo") ?? UIImage()
    #expect(vm.attachImages([image]) == 1)
    vm.composerText = "what is this?"
    vm.send()
    await vm.streamTask?.value
    #expect(vm.pendingImages.isEmpty)

    vm.beginEditLast()
    #expect(vm.pendingImages.count == 1)
    #expect(vm.missingImagesNote == nil)
  }

  @Test
  func freeTypedMentionBindsSavedTeamId() async {
    let fake = FakeChatService()
    let teams = FakeTeamService(seed: [
      Team(
        id: "team-rain-1",
        name: "Rain Offense",
        format: .scarletViolet,
        members: [],
        createdAt: 1,
        updatedAt: 1
      ),
    ])
    let appState = AppState()
    appState.completeSignIn(email: "ash@pallet.town")
    let vm = ChatViewModel(
      chat: fake,
      appState: appState,
      teams: teams,
      usesBackgroundGrace: false
    )
    await vm.loadMentionTeams()

    vm.composerText = "How does @Rain Offense look?"
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMentionedTeamIds == ["team-rain-1"])
    #expect(vm.deadMentionIds.isEmpty)
  }

  @Test
  func unmatchedAtTokenBlocksSend() async {
    let fake = FakeChatService()
    let teams = FakeTeamService(seed: [
      Team(
        id: "team-rain-1",
        name: "Rain Offense",
        format: .scarletViolet,
        members: [],
        createdAt: 1,
        updatedAt: 1
      ),
    ])
    let appState = AppState()
    appState.completeSignIn(email: "ash@pallet.town")
    let vm = ChatViewModel(
      chat: fake,
      appState: appState,
      teams: teams,
      usesBackgroundGrace: false
    )
    await vm.loadMentionTeams()

    vm.composerText = "Ask @notateam about rain"
    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.deadMentionIds.contains("notateam"))
    #expect(vm.composerText == "Ask @notateam about rain")
  }

  @Test
  func slashIsNotInterceptedWhileEditing() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "first"
    vm.send()
    await vm.streamTask?.value

    vm.beginEditLast()
    vm.composerText = "/new"
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    vm.send()
    await vm.streamTask?.value

    #expect(fake.sendCount == 2)
    #expect(fake.lastRecovery == .edit)
    #expect(fake.lastMessage == "/new")
  }

  @Test
  func guestFollowUpChipsOmitTeam() throws {
    let vm = makeViewModel(fake: FakeChatService())
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    // Force a saved-team hop if the fixture has none — still no team chip for guests.
    let chips = vm.followUpChips(for: answer)
    #expect(chips.filter { $0.kind == .team }.isEmpty)
  }

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

  // MARK: /calc dispatch (CALC-US-3 / CALC-BR-4) — handled slash, not a chat turn

  /// Expected ChatViewModel surface (P7 implementer):
  ///   `isCalculatorPresented`, `calculatorHop` (rest + format + overlay)
  ///   `openCalculator(rest:)`, `dismissCalculator()`, `explainCalculator()`
  ///   `showsAddToTeam` / `showsPinArtifact` — false for guests (AUTH-BR-1)
  ///   `retryVoiceHydrate(assistantMessageId:)` → `POST /api/voice/hydrate`
  ///   `showsVoiceMic(for:)`, `voiceHydrateBanner(for:)` (VOICE-US-1–3)
  /// Parser already classifies `.calc` (P5). Dispatch lives here.

  @Test
  func bareCalcOpensTheOverlayAndDoesNotPostChat() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.selectScope(.gen7)
    vm.composerText = "/calc"

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(vm.isStreaming == false)
    #expect(vm.composerText == "")
    #expect(vm.isCalculatorPresented)
    #expect(vm.calculatorHop?.kind == .overlay)
    #expect(vm.calculatorHop?.rest == "")
    #expect(vm.calculatorHop?.format == .champions)
    #expect(vm.errorBanner == nil)
  }

  @Test
  func calcWithArgsOpensTheOverlayCarryingTrimmedRestAndDoesNotPost() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "/calc garchomp earthquake vs gholdengo"

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.turns.isEmpty)
    #expect(vm.isCalculatorPresented)
    #expect(vm.calculatorHop?.rest == "garchomp earthquake vs gholdengo")
    #expect(vm.errorBanner == nil)
  }

  @Test
  func unresolvedCalcTokensStillOpenTheOverlayWithoutAToast() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "/calc not-a-species vs also-fake"

    vm.send()

    #expect(fake.sendCount == 0)
    #expect(vm.isCalculatorPresented)
    #expect(vm.calculatorHop?.rest == "not-a-species vs also-fake")
    #expect(vm.errorBanner == nil)
  }

  @Test
  func calcMidSentenceIsStillANormalChatTurn() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "please open /calc"

    vm.send()
    await vm.streamTask?.value

    #expect(fake.sendCount == 1)
    #expect(fake.lastMessage == "please open /calc")
    #expect(vm.isCalculatorPresented == false)
  }

  @Test
  func explainCalculatorSendsATurnAndLeavesTheOverlayOpen() async throws {
    let fake = FakeChatService()
    fake.scriptedEvents = [
      .answer(try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")),
    ]
    let vm = makeViewModel(fake: fake)
    vm.composerText = "/calc garchomp earthquake vs farigiraf"
    vm.send()
    #expect(vm.isCalculatorPresented)

    vm.explainCalculator()
    await vm.streamTask?.value

    #expect(fake.sendCount == 1)
    #expect(fake.lastMessage?.hasPrefix("Explain this damage estimate") == true)
    #expect(fake.lastScopeSeed == nil || fake.lastScopeSeed == .champions)
    #expect(fake.lastScopeSeed != .gen7)
    #expect(vm.isCalculatorPresented)
    #expect(vm.calculatorHop?.rest == "garchomp earthquake vs farigiraf")
    #expect(vm.calculatorHop?.format == .champions)
  }

  // MARK: Guest hide Add / Pin (AUTH-BR-1)

  @Test
  func guestHidesAddToTeamAndPin() {
    let vm = makeViewModel(fake: FakeChatService())
    #expect(vm.isSignedIn == false)
    #expect(vm.showsAddToTeam == false)
    #expect(vm.showsPinArtifact == false)
  }

  @Test
  func signedInShowsAddToTeamAndPin() {
    let appState = AppState()
    appState.completeSignIn(email: "ash@pallet.town")
    let vm = makeViewModel(fake: FakeChatService(), appState: appState)

    #expect(vm.isSignedIn)
    #expect(vm.showsAddToTeam)
    #expect(vm.showsPinArtifact)
  }

  // MARK: Voice hydrate retry + mic / finishing / Retry (VOICE-US-1–3)

  @Test
  func retryVoiceHydratePostsTheHydrateEndpoint() async {
    let fake = FakeChatService()
    let voice = FakeVoiceService()
    let appState = AppState()
    appState.completeSignIn(email: "ash@pallet.town")
    let vm = ChatViewModel(
      chat: fake,
      appState: appState,
      voice: voice,
      usesBackgroundGrace: false
    )
    vm.loadResumed(
      conversationId: "conv-voice",
      format: .nationalDex,
      turns: [],
      activeTurnId: nil
    )

    await vm.retryVoiceHydrate(assistantMessageId: "a-voice-1")

    #expect(voice.hydrateCount == 1)
    #expect(voice.lastHydrateConversationId == "conv-voice")
    #expect(voice.lastHydrateAssistantMessageId == "a-voice-1")
    #expect(fake.sendCount == 0)
  }

  @Test
  func hydrateRetryEndpointIsPostVoiceHydrateWithSnakeCaseBody() throws {
    let endpoint = VoiceEndpoints.hydrate(
      conversationId: "conv-9",
      assistantMessageId: "msg-a1"
    )
    #expect(endpoint.method == .post)
    #expect(endpoint.path == "/api/voice/hydrate")
    #expect(endpoint.requiresAuth == true)

    let request = try endpoint.urlRequest(
      baseURL: URL(string: "https://oak.example.com")!,
      token: "tok",
      encoder: JSONEncoder()
    )
    #expect(request.url?.path == "/api/voice/hydrate")
    let body = try #require(request.httpBody)
    let object = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    #expect(object["conversation_id"] as? String == "conv-9")
    #expect(object["assistant_message_id"] as? String == "msg-a1")
  }

  private func spokenAnswer(origin: OakAnswer.Origin? = .voice) -> OakAnswer {
    OakAnswer(
      status: .answered,
      answerMarkdown: "Garchomp is fast.",
      reasoningMarkdown: "",
      citations: [],
      inferences: [],
      generationBasis: GenerationBasis(generation: "", fallback: false, note: nil),
      subjects: nil,
      candidates: nil,
      damageCalc: nil,
      suggestions: nil,
      question: nil,
      uncertaintyFlags: nil,
      proposedTeam: nil,
      savedTeam: nil,
      proposedTeamWarnings: nil,
      origin: origin
    )
  }

  @Test
  func voiceOriginShowsAMicGlyph() {
    let vm = makeViewModel(fake: FakeChatService())
    #expect(vm.showsVoiceMic(for: spokenAnswer(origin: .voice)))
    #expect(vm.showsVoiceMic(for: spokenAnswer(origin: nil)) == false)
  }

  @Test
  func runningHydrateShowsFinishingBannerOnTheSameTurn() {
    let vm = makeViewModel(fake: FakeChatService())
    let spoken = spokenAnswer()
    let item = ChatViewModel.ChatTurnItem(
      serverMessageId: "a1",
      content: .assistant(spoken)
    )

    vm.applyVoiceHydrate(assistantMessageId: "a1", status: .running)

    #expect(vm.voiceHydrateBanner(for: item) == .finishing)
    #expect(vm.showsVoiceMic(for: spoken))
  }

  @Test
  func failedHydrateKeepsSpokenTextAndOffersRetry() {
    let vm = makeViewModel(fake: FakeChatService())
    let spoken = spokenAnswer()
    let item = ChatViewModel.ChatTurnItem(
      serverMessageId: "a1",
      content: .assistant(spoken)
    )

    vm.applyVoiceHydrate(assistantMessageId: "a1", status: .failed)

    #expect(vm.voiceHydrateBanner(for: item) == .retry)
    #expect(vm.showsVoiceMic(for: spoken))
    if case let .assistant(answer) = item.content {
      #expect(answer.answerMarkdown == "Garchomp is fast.")
    }
  }
}
