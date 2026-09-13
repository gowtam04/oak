import Foundation
import Testing

@testable import OakApp

/// Pins `ChatViewModel.extraMentionedTeamIds` (Phase 6 iPad context chip hook).
///
/// Expected API (`docs/features/ipad-app/architecture/api-design.md`):
/// ```
/// /// Extra team ids merged into send's mentionedTeamIds. iPhone leaves empty.
/// var extraMentionedTeamIds: [String] = []
/// ```
///
/// `send()` already binds `@` mentions. Merge:
/// ```
/// mentionedTeamIds = unique(parsedMentions + extraMentionedTeamIds)
/// ```
/// first-seen order: parsed `@` ids, then extras not already present.
/// iPhone never assigns extras (default `[]`). `prepareOutgoingSend` maps a
/// local copy (Pad chip); extras are `applied.mentionedTeamIds ?? []` and
/// are committed only if the stream starts. Abort (dead mentions) clears
/// extras and leaves `composerText` unchanged. Do not add a new
/// `ChatService.send` parameter.
///
/// Requirement refs: P-SHELL-US-3, P-SHELL-AC-3.3, P-CHAT-BR-4, ADR-P4.
@MainActor
struct ChatViewModelExtraMentionsTests {

  // MARK: Helpers

  private func makeViewModel(
    fake: FakeChatService = FakeChatService(),
    appState: AppState = AppState(),
    teams: FakeTeamService? = nil
  ) -> ChatViewModel {
    ChatViewModel(
      chat: fake,
      appState: appState,
      teams: teams,
      usesBackgroundGrace: false
    )
  }

  private func rainTeam() -> Team {
    Team(
      id: "team-rain-1",
      name: "Rain Offense",
      format: .scarletViolet,
      members: [],
      createdAt: 1,
      updatedAt: 1
    )
  }

  private func sunTeam() -> Team {
    Team(
      id: "team-sun-1",
      name: "Sun Core",
      format: .scarletViolet,
      members: [],
      createdAt: 1,
      updatedAt: 1
    )
  }

  private func signedInState() -> AppState {
    let appState = AppState()
    appState.completeSignIn(email: "ash@pallet.town")
    return appState
  }

  // MARK: Default — iPhone never sets extras

  @Test
  func extraMentionedTeamIdsDefaultsEmpty() {
    let vm = makeViewModel()
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func sendWithoutExtrasDoesNotInjectTeamIds() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    #expect(vm.extraMentionedTeamIds.isEmpty)

    vm.composerText = "Tell me about Garchomp"
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMentionedTeamIds == nil || fake.lastMentionedTeamIds == [])
    #expect(fake.lastMessage == "Tell me about Garchomp")
  }

  @Test
  func iphoneMentionSendWithEmptyExtrasBindsOnlyTheAtMention() async {
    let fake = FakeChatService()
    let teams = FakeTeamService(seed: [rainTeam()])
    let vm = makeViewModel(fake: fake, appState: signedInState(), teams: teams)
    await vm.loadMentionTeams()
    #expect(vm.extraMentionedTeamIds.isEmpty)

    vm.composerText = "How does @Rain Offense look?"
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMentionedTeamIds == ["team-rain-1"])
  }

  // MARK: Merge unique(parsedMentions + extraMentionedTeamIds)

  @Test
  func extrasAloneBindMentionedTeamIdsOnSend() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.extraMentionedTeamIds = ["team-chip-1"]
    vm.composerText = "thoughts?"
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMessage == "thoughts?")
    #expect(fake.lastMentionedTeamIds == ["team-chip-1"])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func extrasMergeUniquelyAfterParsedAtMentions() async {
    let fake = FakeChatService()
    let teams = FakeTeamService(seed: [rainTeam(), sunTeam()])
    let vm = makeViewModel(fake: fake, appState: signedInState(), teams: teams)
    await vm.loadMentionTeams()

    vm.extraMentionedTeamIds = ["team-chip-1"]
    vm.composerText = "How does @Rain Offense look?"
    vm.send()

    #expect(fake.lastMentionedTeamIds == ["team-rain-1", "team-chip-1"])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func extraThatDuplicatesAnAtMentionIsNotRepeated() async {
    let fake = FakeChatService()
    let teams = FakeTeamService(seed: [rainTeam()])
    let vm = makeViewModel(fake: fake, appState: signedInState(), teams: teams)
    await vm.loadMentionTeams()

    vm.extraMentionedTeamIds = ["team-rain-1"]
    vm.composerText = "How does @Rain Offense look?"
    vm.send()

    #expect(fake.lastMentionedTeamIds == ["team-rain-1"])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func duplicateExtrasCollapseToFirstSeen() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.extraMentionedTeamIds = ["team-chip-1", "team-chip-1", "team-chip-2"]
    vm.composerText = "thoughts?"
    vm.send()

    #expect(fake.lastMentionedTeamIds == ["team-chip-1", "team-chip-2"])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func extrasDoNotRewriteTheUserMessage() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.extraMentionedTeamIds = ["team-chip-1"]
    vm.composerText = "thoughts?"
    vm.send()

    #expect(fake.lastMessage == "thoughts?")
    #expect(fake.lastMessage?.contains("team-chip-1") != true)
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  // MARK: Clear extras + abort path (chip mapping is a local copy)

  @Test
  func extrasAreEmptyAfterSuccessfulSend() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.extraMentionedTeamIds = ["team-chip-1"]
    vm.composerText = "thoughts?"
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMentionedTeamIds == ["team-chip-1"])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func prepareOutgoingSendDeadMentionDoesNotMutateComposerOrLeakExtras() async {
    let fake = FakeChatService()
    let teams = FakeTeamService(seed: [rainTeam()])
    let vm = makeViewModel(fake: fake, appState: signedInState(), teams: teams)
    await vm.loadMentionTeams()

    let original = "Ask @notateam about rain"
    vm.composerText = original
    vm.extraMentionedTeamIds = ["stale-extra"]
    vm.prepareOutgoingSend = { message in
      ("Regarding Garchomp.\n\n" + message, ["team-chip-1"])
    }

    vm.send()
    #expect(fake.sendCount == 0)
    #expect(vm.composerText == original)
    #expect(vm.extraMentionedTeamIds.isEmpty)
    #expect(!vm.composerText.contains("Regarding Garchomp.\n\nRegarding"))

    vm.send()
    #expect(fake.sendCount == 0)
    #expect(vm.composerText == original)
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func prepareOutgoingSendSuccessUsesMappedTextOnceAndClearsExtras() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "What item?"
    vm.prepareOutgoingSend = { message in
      ("Regarding Garchomp.\n\n" + message, ["team-chip-1"])
    }
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMessage == "Regarding Garchomp.\n\nWhat item?")
    #expect(fake.lastMentionedTeamIds == ["team-chip-1"])
    #expect(vm.composerText.isEmpty)
    #expect(vm.extraMentionedTeamIds.isEmpty)
    if case let .user(text, _) = vm.turns.first?.content {
      #expect(text == "Regarding Garchomp.\n\nWhat item?")
    } else {
      #expect(Bool(false), "expected a user turn with mapped text")
    }
  }

  @Test
  func emptyComposerCanSendWhenMappedChipTextIsNonEmpty() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    let prompt = "Explain this damage estimate."
    vm.prepareOutgoingSend = { message in
      message.isEmpty ? (prompt, nil) : (prompt + "\n\n" + message, nil)
    }

    #expect(vm.composerText.isEmpty)
    #expect(vm.canSend)
    vm.send()

    #expect(fake.sendCount == 1)
    #expect(fake.lastMessage == prompt)
    #expect(fake.lastMentionedTeamIds == nil || fake.lastMentionedTeamIds == [])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }

  @Test
  func isEditingLastSkipsChipMapping() {
    let fake = FakeChatService()
    let vm = makeViewModel(fake: fake)
    vm.composerText = "first"
    vm.send()
    #expect(fake.sendCount == 1)

    vm.beginEditLast()
    vm.prepareOutgoingSend = { message in
      ("Regarding Garchomp.\n\n" + message, ["team-chip-1"])
    }
    vm.composerText = "edited"
    vm.send()

    #expect(fake.sendCount == 2)
    #expect(fake.lastMessage == "edited")
    #expect(fake.lastMentionedTeamIds == nil || fake.lastMentionedTeamIds == [])
    #expect(vm.extraMentionedTeamIds.isEmpty)
  }
}
