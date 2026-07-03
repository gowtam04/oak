import Foundation
import Testing

@testable import OakApp

/// `TeamsAssistantViewModel` — the builder-assistant SSE reducer — against
/// `FakeTeamsAssistantService` and a live `TeamEditorViewModel` for the draft bridge.
/// Coverage mirrors the web hook + panel: streaming deltas, terminal-answer commit, the
/// live draft riding each turn, transport-fault + rate-limit banners with Retry, and the
/// Apply/Undo round-trip against the editor's unsaved draft (never the DB).
///
/// The view model is `@MainActor`, so the suite is too.
@MainActor
struct TeamsAssistantViewModelTests {

  // MARK: Helpers

  private func makeEditor(members: [EditableMember]? = nil) -> TeamEditorViewModel {
    let editor = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)
    if let members { editor.members = members }
    return editor
  }

  private func makeModel(
    fake: FakeTeamsAssistantService,
    editor: TeamEditorViewModel
  ) -> TeamsAssistantViewModel {
    TeamsAssistantViewModel(service: fake, editor: editor)
  }

  private func namedMember(_ species: String) -> EditableMember {
    var m = EditableMember()
    m.species = species
    return m
  }

  // MARK: Streaming

  @Test
  func sendAppendsUserTurnAndStreamsToTerminalAnswer() async throws {
    let answer = try Fixtures.decode(
      BuilderAnswer.self, from: "teams_assistant_answer_advice.json")
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [
      .toolActivity(tool: "get_learnset", label: "Checking the learnset…"),
      .answerStart,
      .answerDelta(text: "Your coverage "),
      .answerDelta(text: "looks solid."),
      .answer(answer),
    ]
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("Check my coverage")
    await vm.streamTask?.value

    #expect(vm.turns.count == 1)
    #expect(vm.turns.first?.user == "Check my coverage")
    #expect(vm.turns.first?.answer == answer)
    #expect(vm.status == .idle)
    #expect(vm.streamingMarkdown.isEmpty)
    #expect(vm.activity == nil)
    #expect(fake.sendCount == 1)
  }

  @Test
  func answerStartResetsBufferAndDeltasAppend() async {
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [
      .answerDelta(text: "stale draft"),
      .answerStart,
      .answerDelta(text: "fresh "),
      .answerDelta(text: "answer"),
      .answer(BuilderAnswer(answerMarkdown: "fresh answer", teamPatch: nil)),
    ]
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("hi")
    await vm.streamTask?.value

    #expect(vm.turns.first?.answer?.answerMarkdown == "fresh answer")
    #expect(vm.streamingMarkdown.isEmpty)
  }

  @Test
  func theLiveDraftRidesEveryTurn() async {
    let editor = makeEditor(members: [namedMember("koraidon"), namedMember("miraidon")])
    editor.name = "Box Legends"
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [.answer(BuilderAnswer(answerMarkdown: "ok", teamPatch: nil))]
    let vm = makeModel(fake: fake, editor: editor)

    vm.send("Rate this")
    await vm.streamTask?.value

    let draft = fake.lastDraft
    #expect(draft?.name == "Box Legends")
    #expect(draft?.format == .champions)
    #expect(draft?.members.map(\.species) == ["koraidon", "miraidon"])
  }

  @Test
  func sendIsANoOpWhileThinkingOrBlank() async {
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = []  // never finishes with an answer → stays "thinking" briefly
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("   ")  // blank → ignored
    #expect(vm.turns.isEmpty)
    #expect(fake.sendCount == 0)
  }

  // MARK: Transport faults + rate limit

  @Test
  func aThrownTransportFaultDropsTheTurnAndRaisesABanner() async {
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [.answerStart, .answerDelta(text: "half")]
    fake.thrownError = .transport(underlying: "URLError.-1005")
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("Fix my spread")
    await vm.streamTask?.value

    #expect(vm.turns.isEmpty)  // half-finished turn dropped so Retry re-sends cleanly
    #expect(vm.status == .error)
    #expect(vm.errorMessage == TeamEditorViewModel.connectionMessage)
    #expect(vm.streamingMarkdown.isEmpty)
  }

  @Test
  func aRateLimitSurfacesTheFriendlyBanner() async {
    let fake = FakeTeamsAssistantService()
    fake.thrownError = .rateLimited(retryAfter: 30)
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("go")
    await vm.streamTask?.value

    #expect(vm.status == .error)
    #expect(vm.errorMessage == TeamEditorViewModel.message(for: .rateLimited(retryAfter: 30)))
  }

  @Test
  func anInbandErrorEventWithoutAnAnswerRaisesABanner() async {
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [
      .error(code: "model_provider_error", message: "Grok is unavailable right now.", status: 503)
    ]
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("go")
    await vm.streamTask?.value

    #expect(vm.status == .error)
    #expect(vm.errorMessage == "Grok is unavailable right now.")
    #expect(vm.turns.isEmpty)
  }

  @Test
  func retryReSendsTheLastMessage() async {
    let fake = FakeTeamsAssistantService()
    fake.thrownError = .transport(underlying: "URLError.-1005")
    let vm = makeModel(fake: fake, editor: makeEditor())

    vm.send("Fill slot 3")
    await vm.streamTask?.value
    #expect(vm.status == .error)

    // Recover on the retry: clear the fault, script a clean answer.
    fake.thrownError = nil
    fake.scriptedEvents = [.answer(BuilderAnswer(answerMarkdown: "Done.", teamPatch: nil))]
    vm.retry()
    await vm.streamTask?.value

    #expect(fake.sendCount == 2)
    #expect(fake.lastMessage == "Fill slot 3")
    #expect(vm.status == .idle)
    #expect(vm.turns.last?.answer?.answerMarkdown == "Done.")
  }

  // MARK: Apply / Undo round-trip on the editor draft

  @Test
  func applyMutatesTheEditorDraftAndUndoRestoresIt() async throws {
    let editor = makeEditor(members: [namedMember("landorus-therian")])
    editor.name = "Original"
    let answer = try Fixtures.decode(
      BuilderAnswer.self, from: "teams_assistant_answer_patch.json")
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [.answer(answer)]
    let vm = makeModel(fake: fake, editor: editor)

    vm.send("Fill slot 3")
    await vm.streamTask?.value
    let turn = try #require(vm.turns.first)

    // Before Apply: the draft is the single original member.
    #expect(editor.members.map(\.species) == ["landorus-therian"])

    vm.apply(turn)
    // The patch pads slot 1 (blank) and drops Great Tusk into slot 2 (0-indexed).
    #expect(editor.members.count == 3)
    #expect(editor.members[0].species == "landorus-therian")
    #expect(editor.members[1].species == "")  // padded blank slot
    #expect(editor.members[2].species == "great-tusk")
    #expect(vm.appliedTurnIds.contains(turn.id))
    #expect(vm.lastApplied?.turnId == turn.id)

    vm.undo()
    #expect(editor.members.map(\.species) == ["landorus-therian"])
    #expect(editor.name == "Original")
    #expect(vm.appliedTurnIds.contains(turn.id) == false)
    #expect(vm.lastApplied == nil)
  }

  @Test
  func applyIsANoOpForAnAdviceOnlyAnswer() async throws {
    let editor = makeEditor(members: [namedMember("garchomp")])
    let answer = try Fixtures.decode(
      BuilderAnswer.self, from: "teams_assistant_answer_advice.json")
    let fake = FakeTeamsAssistantService()
    fake.scriptedEvents = [.answer(answer)]
    let vm = makeModel(fake: fake, editor: editor)

    vm.send("Check coverage")
    await vm.streamTask?.value
    let turn = try #require(vm.turns.first)

    vm.apply(turn)  // no team_patch → nothing to apply
    #expect(editor.members.map(\.species) == ["garchomp"])
    #expect(vm.appliedTurnIds.isEmpty)
  }
}
