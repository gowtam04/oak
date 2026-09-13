import Foundation
import Testing
import UIKit

@testable import OakApp

/// Pins Pad Chat list | thread contracts for Phase 3 (inspector closed).
///
/// `PadChatColumns` lives in Pad chat files (`ios/OakApp/Pad/Chat/…`).
/// Phase 5 extends **this same helper** (do not add a parallel policy type).
/// Default `inspectorOpen: false` keeps these P3 call sites compiling:
///
/// ```
/// enum PadChatColumns {
///   static func showsListColumn(mode: PadLayoutMode, inspectorOpen: Bool = false) -> Bool
///   static func showsInspector(mode: PadLayoutMode, inspectorOpen: Bool) -> Bool
///   static func stacksInspectorUnderThread(mode: PadLayoutMode) -> Bool // compact true
///   static func listShowsSignIn(isSignedIn: Bool) -> Bool
/// }
/// ```
///
/// Inspector-closed pane policy (`api-design.md` chat pane table, left column):
///   regular  → list | thread          → `showsListColumn` true
///   medium   → list | thread          → `showsListColumn` true
///   compact  → thread; list overlay   → `showsListColumn` false
///     (no persistent list column; overlay is not a second helper)
///
/// Inspector-open table (regular/medium/compact × open) is **only** in
/// `PadLayoutTests` — do not duplicate it here.
///
/// Live thread (ADR-P3, P-CHAT-AC-1.1 / 1.3 / 1.4): Pad Chat selects a row by
/// calling `ChatViewModel.loadResumed` on the **one** `PadRootView`-owned VM
/// (not a new `ChatViewModel` per row). `startNewConversation()` rotates that
/// same VM. Those VM methods already exist — these pins may pass before Pad
/// chat types land; `PadChatColumns` must still fail to compile until added.
///
/// Not encoded here (covered elsewhere or later phases):
///   P-CHAT-AC-1.2 list actions / secondary-click — HistoryList / iPhone
///   P-CHAT-AC-1.6–1.7 / inspector-open table — Phase 5 `PadLayoutTests`
///   P-CHAT-AC-2.4 streaming / transport retry — `ChatViewModelTests`
///   P-CHAT-AC-6.1–6.2 composer placement / keyboard — UI, not this suite
///   P-SHELL-BR-1 Chat default destination — `PadShellModelTests`
///
/// Requirement refs: P-CHAT-US-1, P-CHAT-AC-1.1–1.5, P-CHAT-AC-2.4,
/// P-CHAT-AC-6.1–6.3, P-SHELL-BR-1, P-AUTH-AC-1.3, ADR-P3.
@MainActor
struct PadChatSessionTests {

  // MARK: Helpers

  private func makeViewModel(
    fake: FakeChatService = FakeChatService(),
    appState: AppState = AppState()
  ) -> ChatViewModel {
    ChatViewModel(chat: fake, appState: appState, usesBackgroundGrace: false)
  }

  // MARK: List visibility — inspector closed (P-SHELL-AC-5.4 left column)
  // P-CHAT-US-1 / P-CHAT-AC-1.1 (wide list | thread), compact overlay (AC-1.7
  // inspector-closed half: no permanent skinny list).

  @Test
  func showsListColumnOnRegular() {
    #expect(PadChatColumns.showsListColumn(mode: .regular) == true)
  }

  @Test
  func showsListColumnOnMedium() {
    #expect(PadChatColumns.showsListColumn(mode: .medium) == true)
  }

  @Test
  func compactDoesNotShowPersistentListColumn() {
    #expect(PadChatColumns.showsListColumn(mode: .compact) == false)
  }

  @Test
  func inspectorClosedListColumnFollowsLayoutModeWidths() {
    #expect(PadChatColumns.showsListColumn(mode: PadLayout.mode(for: 1200)) == true)
    #expect(PadChatColumns.showsListColumn(mode: PadLayout.mode(for: 900)) == true)
    #expect(PadChatColumns.showsListColumn(mode: PadLayout.mode(for: 600)) == false)
  }

  // MARK: Guest list column (P-CHAT-AC-1.5, P-AUTH-AC-1.3, P-CHAT-BR-5)
  // Guests do not get a fake empty history; the list column is sign-in copy.

  @Test
  func guestListColumnShowsSignIn() {
    #expect(PadChatColumns.listShowsSignIn(isSignedIn: false) == true)
  }

  @Test
  func signedInListColumnDoesNotShowSignIn() {
    #expect(PadChatColumns.listShowsSignIn(isSignedIn: true) == false)
  }

  // MARK: Live thread session (P-CHAT-AC-1.1, AC-1.3, AC-1.4, ADR-P3)
  // Same `ChatViewModel` instance — PadRootView owns it; list rows call
  // `loadResumed` / New calls `startNewConversation` on that VM.

  @Test
  func loadResumedBindsSessionAndSeedsTurnsOnTheLiveViewModel() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let vm = makeViewModel()
    let turns: [ChatTurn] = [
      .user(id: "u1", content: "Tell me about Garchomp"),
      .assistant(id: "a1", answer: answer),
    ]

    vm.loadResumed(conversationId: "conv-42", format: .champions, turns: turns)

    #expect(vm.sessionId == "conv-42")
    #expect(vm.turns.count == 2)
    if case let .user(text, _) = vm.turns.first?.content {
      #expect(text == "Tell me about Garchomp")
    } else {
      Issue.record("expected the seeded user turn on the live thread")
    }
    if case let .assistant(rendered) = vm.turns.last?.content {
      #expect(rendered.status == .answered)
    } else {
      Issue.record("expected the seeded assistant answer on the live thread")
    }
  }

  @Test
  func selectingAnotherConversationReplacesTheLiveThreadOnTheSameViewModel() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let vm = makeViewModel()

    vm.loadResumed(
      conversationId: "conv-a",
      format: .champions,
      turns: [
        .user(id: "a-u1", content: "Tell me about Garchomp"),
        .assistant(id: "a-a1", answer: answer),
      ]
    )
    #expect(vm.sessionId == "conv-a")
    #expect(vm.turns.count == 2)

    vm.loadResumed(
      conversationId: "conv-b",
      format: .champions,
      turns: [.user(id: "b-u1", content: "What is Intimidate?")]
    )

    #expect(vm.sessionId == "conv-b")
    #expect(vm.turns.count == 1)
    if case let .user(text, _) = vm.turns.first?.content {
      #expect(text == "What is Intimidate?")
    } else {
      Issue.record("expected conv-b's turn, not leftover conv-a context")
    }
  }

  @Test
  func startNewConversationClearsLiveThreadAndRotatesSession() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    let vm = makeViewModel()
    vm.loadResumed(
      conversationId: "conv-42",
      format: .champions,
      turns: [
        .user(id: "u1", content: "Tell me about Garchomp"),
        .assistant(id: "a1", answer: answer),
      ]
    )
    let resumedSession = vm.sessionId
    #expect(resumedSession == "conv-42")
    #expect(!vm.turns.isEmpty)

    vm.startNewConversation()

    #expect(vm.sessionId != resumedSession)
    #expect(vm.turns.isEmpty)
  }

  // MARK: Regulation chrome (P-CHAT-AC-6.3)
  // Display-only Champions chip — not a scope picker. Composer layout (AC-6.1)
  // and keyboard avoidance (AC-6.2) are UI and are not asserted here.

  @Test
  func liveThreadRegulationChipIsDisplayOnly() {
    let vm = makeViewModel()
    #expect(vm.displayFormat == .champions)
    #expect(vm.isRegulationChipPicker == false)
  }
}
