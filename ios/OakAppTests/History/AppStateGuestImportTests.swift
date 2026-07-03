import Foundation
import Testing

@testable import OakApp

/// `AppState.importGuestThread(using:)` against `FakeHistoryService` (P9 AppState
/// extension; M-ACCT-US-4 / component-design.md "Guest→sign-in"): the in-memory
/// guest thread maps to the import payload, the returned id becomes the active
/// conversation, and a failure (or empty thread) is non-fatal. `AppState` is
/// `@MainActor`, so the suite is too.
@MainActor
struct AppStateGuestImportTests {

  @Test
  func importMapsInMemoryTurnsToPayloadNonLossy() async throws {
    // The guest→sign-in import must carry the COMPLETE OakAnswer, not just the prose:
    // reasoning, citations, inferences, and subjects all survive sign-in.
    let fullAnswer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let state = AppState()
    state.guestThread = [
      GuestTurn(content: .user(text: "What's the fastest dragon?")),
      GuestTurn(content: .assistant(answer: fullAnswer)),
    ]
    let fake = FakeHistoryService()
    fake.importResult = .success("conv_new")

    let id = await state.importGuestThread(using: fake)

    #expect(id == "conv_new")
    #expect(state.activeConversationId == "conv_new")  // becomes the active conversation
    #expect(fake.importCount == 1)

    let turns = fake.lastImportTurns
    #expect(turns?.count == 2)

    guard let first = turns?.first, case let .user(_, content) = first else {
      Issue.record("first imported turn should be a user turn")
      return
    }
    #expect(content == "What's the fastest dragon?")

    guard let last = turns?.last, case let .assistant(_, answer) = last else {
      Issue.record("second imported turn should be an assistant answer")
      return
    }
    // Fields BEYOND answer_markdown survive the round-trip — the import is non-lossy.
    #expect(answer.answerMarkdown == fullAnswer.answerMarkdown)
    #expect(answer.status == .answered)
    #expect(answer.citations.count == 2)                 // citations preserved
    #expect(answer.citations == fullAnswer.citations)
    #expect(answer.reasoningMarkdown == fullAnswer.reasoningMarkdown)
    #expect(answer.subjects?.first?.name == "Garchomp")  // structured blocks preserved
  }

  @Test
  func importForwardsResolvedScopeAndSessionId() async {
    // The guest thread's resolved scope (GS-C) rides the import as `format`, not
    // the removed `champions_mode` — a thread that switched to gen-7 imports as gen-7.
    let state = AppState()
    state.guestThreadScope = .gen7
    state.activeConversationId = "existing_session"  // reused as the import session id
    state.guestThread = [GuestTurn(content: .user(text: "hi"))]
    let fake = FakeHistoryService()
    fake.importResult = .success("existing_session")

    _ = await state.importGuestThread(using: fake)

    #expect(fake.lastImportFormat == .gen7)
    #expect(fake.lastImportSessionId == "existing_session")
  }

  @Test
  func importDefaultsToChampionsScopeWhenNoTurnResolvedOne() async {
    // A guest who never had a turn resolve a scope imports under the champions
    // default (web: `resolvedScope ?? "champions"`).
    let state = AppState()  // guestThreadScope defaults to .champions
    state.guestThread = [GuestTurn(content: .user(text: "hi"))]
    let fake = FakeHistoryService()
    fake.importResult = .success("conv_x")

    _ = await state.importGuestThread(using: fake)

    #expect(fake.lastImportFormat == .champions)
  }

  @Test
  func emptyGuestThreadImportsNothing() async {
    let state = AppState()  // guestThread defaults to []
    let fake = FakeHistoryService()

    let id = await state.importGuestThread(using: fake)

    #expect(id == nil)
    #expect(fake.importCount == 0)
    #expect(state.activeConversationId == nil)
  }

  @Test
  func importFailureIsNonFatalAndKeepsThread() async {
    let state = AppState()
    state.guestThread = [GuestTurn(content: .user(text: "hi"))]
    let fake = FakeHistoryService()
    fake.importResult = .failure(.transport(underlying: "URLError.-1009"))

    let id = await state.importGuestThread(using: fake)

    #expect(id == nil)
    #expect(state.activeConversationId == nil)        // unchanged on failure
    #expect(state.guestThread.count == 1)             // on-screen thread preserved (M-AC-4.1)
  }
}
