import Foundation
import Testing

@testable import OakApp

/// `AnswerCardView` — the field-by-field orchestrator (component-design.md "AnswerCard
/// tree"; chat-experience.md M-AC-1.2/1.4, M-BR-CHAT-5; ui-and-experience.md
/// M-UI-US-1/9). It must render each leaf subview **only when its field is present**
/// (render-if-present) and represent every field the web AnswerCard renders.
///
/// SwiftUI view bodies can't be introspected without a third-party view-inspection
/// package, which ADR-5 forbids. So the orchestration is tested through the card's
/// pure ``AnswerCardView/sections`` list — the single source of truth that `body`
/// renders verbatim (`ForEach(sections)`). A section present ⇒ that subview is
/// invoked; a section absent ⇒ the subview is never constructed, i.e. it renders
/// nothing. Each `Section` case maps 1:1 to a subview, so per-section assertions are
/// the per-subview "field present vs absent" structure tests.
///
/// `@MainActor` because `View` members are main-actor isolated (reading `sections`
/// off a `View` value is main-actor work).
@MainActor
struct AnswerCardViewTests {

  // MARK: Builders

  /// A minimal `OakAnswer`: an `answered` turn with only the always-present answer
  /// body and every optional/structured field empty/absent. Each presence test adds
  /// exactly one field on top of this base.
  private func makeAnswer(
    status: OakAnswer.Status = .answered,
    answerMarkdown: String = "Garchomp is a Dragon/Ground pseudo-legendary.",
    reasoningMarkdown: String = "",
    citations: [Citation] = [],
    inferences: [Inference] = [],
    generationBasis: GenerationBasis = GenerationBasis(generation: "", fallback: false, note: nil),
    subjects: [Subject]? = nil,
    candidates: Candidates? = nil,
    damageCalc: DamageCalc? = nil,
    suggestions: [String]? = nil,
    question: ClarifyQuestion? = nil,
    uncertaintyFlags: [String]? = nil,
    proposedTeam: ProposedTeam? = nil,
    savedTeam: SavedTeamRef? = nil,
    proposedTeamWarnings: [TeamWarning]? = nil
  ) -> OakAnswer {
    OakAnswer(
      status: status,
      answerMarkdown: answerMarkdown,
      reasoningMarkdown: reasoningMarkdown,
      citations: citations,
      inferences: inferences,
      generationBasis: generationBasis,
      subjects: subjects,
      candidates: candidates,
      damageCalc: damageCalc,
      suggestions: suggestions,
      question: question,
      uncertaintyFlags: uncertaintyFlags,
      proposedTeam: proposedTeam,
      savedTeam: savedTeam,
      proposedTeamWarnings: proposedTeamWarnings
    )
  }

  private func sections(_ answer: OakAnswer) -> [AnswerCardView.Section] {
    AnswerCardView(answer: answer).sections
  }

  // Reusable non-empty sub-values.
  private let sampleSubject = Subject(
    name: "Garchomp",
    dexNumber: 445,
    spriteUrl: "https://example.invalid/garchomp.png",
    types: ["dragon", "ground"],
    isFallback: false,
    sourceGeneration: nil
  )
  private let sampleCandidates = Candidates(
    totalCount: 1,
    truncated: false,
    sort: nil,
    shown: [
      CandidateRow(
        name: "Dragapult",
        dexNumber: 887,
        spriteUrl: nil,
        types: ["dragon", "ghost"],
        baseStats: nil,
        keyStats: nil,
        ability: nil
      )
    ]
  )
  private let sampleDamage = DamageCalc(
    assumptions: [:],
    result: ["min_damage": .int(40)],
    isEstimate: true,
    breakdown: nil
  )
  private let sampleQuestion = ClarifyQuestion(options: [
    ClarifyOption(label: "Singles", description: nil)
  ])
  private let sampleProposedTeam = ProposedTeam(
    name: "Sun Offense",
    format: .scarletViolet,
    members: []
  )
  private let sampleSavedTeam = SavedTeamRef(
    id: "team_1",
    name: "Sun Offense",
    format: .scarletViolet
  )

  // MARK: Base — only the always-present answer body renders

  @Test
  func minimalAnswerRendersOnlyTheAnswerBody() {
    #expect(sections(makeAnswer()) == [.answer])
  }

  // MARK: Status badge (non-`answered` outcomes only)

  @Test
  func statusBadgeAbsentForAnsweredPresentOtherwise() {
    #expect(!sections(makeAnswer(status: .answered)).contains(.status))
    #expect(sections(makeAnswer(status: .clarificationNeeded)).contains(.status))
    #expect(sections(makeAnswer(status: .resolutionFailed)).contains(.status))
    #expect(sections(makeAnswer(status: .insufficientData)).contains(.status))
  }

  // MARK: Subjects

  @Test
  func subjectsPresentWhenNonEmptyAbsentOtherwise() {
    #expect(!sections(makeAnswer(subjects: nil)).contains(.subjects))
    #expect(!sections(makeAnswer(subjects: [])).contains(.subjects))
    #expect(sections(makeAnswer(subjects: [sampleSubject])).contains(.subjects))
  }

  // MARK: Clarify question

  @Test
  func questionPresentOnlyWithOptions() {
    #expect(!sections(makeAnswer(question: nil)).contains(.question))
    #expect(!sections(makeAnswer(question: ClarifyQuestion(options: []))).contains(.question))
    #expect(sections(makeAnswer(question: sampleQuestion)).contains(.question))
  }

  // MARK: Candidates

  @Test
  func candidatesPresentOnlyWithShownRows() {
    #expect(!sections(makeAnswer(candidates: nil)).contains(.candidates))
    let empty = Candidates(totalCount: 0, truncated: false, sort: nil, shown: [])
    #expect(!sections(makeAnswer(candidates: empty)).contains(.candidates))
    #expect(sections(makeAnswer(candidates: sampleCandidates)).contains(.candidates))
  }

  // MARK: Damage calc

  @Test
  func damageCalcPresentWhenSet() {
    #expect(!sections(makeAnswer(damageCalc: nil)).contains(.damageCalc))
    #expect(sections(makeAnswer(damageCalc: sampleDamage)).contains(.damageCalc))
  }

  // MARK: Team blocks (proposed and/or saved)

  @Test
  func teamsPresentForProposedOrSaved() {
    #expect(!sections(makeAnswer(proposedTeam: nil, savedTeam: nil)).contains(.teams))
    #expect(sections(makeAnswer(proposedTeam: sampleProposedTeam)).contains(.teams))
    #expect(sections(makeAnswer(savedTeam: sampleSavedTeam)).contains(.teams))
  }

  // MARK: Suggestions (blank-only collapses to nothing)

  @Test
  func suggestionsPresentOnlyWhenNonBlank() {
    #expect(!sections(makeAnswer(suggestions: nil)).contains(.suggestions))
    #expect(!sections(makeAnswer(suggestions: ["", "   "])).contains(.suggestions))
    #expect(sections(makeAnswer(suggestions: ["Gible"])).contains(.suggestions))
  }

  // MARK: Reasoning

  @Test
  func reasoningPresentOnlyWhenNonBlank() {
    #expect(!sections(makeAnswer(reasoningMarkdown: "")).contains(.reasoning))
    #expect(!sections(makeAnswer(reasoningMarkdown: "   \n ")).contains(.reasoning))
    #expect(sections(makeAnswer(reasoningMarkdown: "Compared Speed.")).contains(.reasoning))
  }

  // MARK: Citations

  @Test
  func citationsPresentWhenNonEmpty() {
    #expect(!sections(makeAnswer(citations: [])).contains(.citations))
    let citation = Citation(source: "PokeAPI", detail: "Base stats", endpointUrl: nil)
    #expect(sections(makeAnswer(citations: [citation])).contains(.citations))
  }

  // MARK: Inferences

  @Test
  func inferencesPresentWhenNonEmpty() {
    #expect(!sections(makeAnswer(inferences: [])).contains(.inferences))
    let inference = Inference(claim: "Outspeeds Tyranitar.", confidence: .high, note: nil)
    #expect(sections(makeAnswer(inferences: [inference])).contains(.inferences))
  }

  // MARK: Scope tag (always-on when the generation string is non-blank)

  @Test
  func scopeTagPresentWhenGenerationNonBlank() {
    // Blank generation → no scope tag (even if fallback → still a caveat, no tag).
    let blank = GenerationBasis(generation: "  ", fallback: false, note: nil)
    #expect(!sections(makeAnswer(generationBasis: blank)).contains(.scope))

    let named = GenerationBasis(generation: "Gen 9 (Scarlet/Violet)", fallback: false, note: nil)
    #expect(sections(makeAnswer(generationBasis: named)).contains(.scope))

    // A fallback still shows the (neutral) scope tag when the generation is named;
    // the caveat strip carries the fallback note separately.
    let fallbackNamed = GenerationBasis(generation: "Gen 8 (Sword/Shield)", fallback: true, note: nil)
    #expect(sections(makeAnswer(generationBasis: fallbackNamed)).contains(.scope))

    let fallbackBlank = GenerationBasis(generation: "  ", fallback: true, note: nil)
    #expect(!sections(makeAnswer(generationBasis: fallbackBlank)).contains(.scope))
  }

  // MARK: Caveat strip (fallback OR any non-blank uncertainty flag — the web
  // `CaveatStrip` `hasFallback || hasFlags` guard, merged into one top block)

  @Test
  func caveatPresentWhenFallbackOrNonBlankFlags() {
    let clean = GenerationBasis(generation: "Gen 9 (Scarlet/Violet)", fallback: false, note: nil)
    // Clean generation, no flags → no caveat.
    #expect(!sections(makeAnswer(generationBasis: clean)).contains(.caveat))
    // Blank-only flags collapse to nothing.
    #expect(!sections(makeAnswer(generationBasis: clean, uncertaintyFlags: ["", " "])).contains(.caveat))
    // A genuine flag → caveat.
    #expect(sections(makeAnswer(generationBasis: clean, uncertaintyFlags: ["Estimate only."])).contains(.caveat))
    // A fallback alone (no flags) → caveat.
    let fallback = GenerationBasis(generation: "Gen 8 (Sword/Shield)", fallback: true, note: nil)
    #expect(sections(makeAnswer(generationBasis: fallback)).contains(.caveat))
  }

  // MARK: Full answer — every block, in reading order, composes without crashing

  @Test
  func everyFieldPresentComposesInReadingOrder() {
    let answer = makeAnswer(
      status: .clarificationNeeded,
      reasoningMarkdown: "Compared Speed across the set.",
      citations: [Citation(source: "PokeAPI", detail: "Base stats", endpointUrl: nil)],
      inferences: [Inference(claim: "Outspeeds Tyranitar.", confidence: .high, note: nil)],
      generationBasis: GenerationBasis(generation: "Gen 9 (Scarlet/Violet)", fallback: false, note: nil),
      subjects: [sampleSubject],
      candidates: sampleCandidates,
      damageCalc: sampleDamage,
      suggestions: ["Show its best moveset"],
      question: sampleQuestion,
      uncertaintyFlags: ["Speed assumes a neutral nature."],
      proposedTeam: sampleProposedTeam,
      savedTeam: sampleSavedTeam,
      proposedTeamWarnings: [
        TeamWarning(code: .incomplete, message: "Partial team.", slot: nil, field: nil)
      ]
    )

    #expect(
      sections(answer) == [
        .status,
        .scope,
        .caveat,
        .answer,
        .subjects,
        .question,
        .candidates,
        .damageCalc,
        .teams,
        .suggestions,
        .reasoning,
        .citations,
        .inferences,
      ]
    )
  }

  // MARK: Over the committed status fixtures (contract-real payloads)

  @Test
  func answeredFullFixtureFansOutEveryBlock() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_answered_full.json")
    // `answered` ⇒ no status badge. The fixture carries a named (non-fallback)
    // generation → scope tag, and one uncertainty flag → caveat; both lifted to top.
    #expect(
      sections(answer) == [
        .scope,
        .caveat,
        .answer,
        .subjects,
        .question,
        .candidates,
        .damageCalc,
        .teams,
        .suggestions,
        .reasoning,
        .citations,
        .inferences,
      ]
    )
  }

  @Test
  func clarificationFixtureShowsStatusScopeAnswerQuestionReasoning() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_clarification.json")
    // Named generation, no fallback, no flags → scope tag but no caveat.
    #expect(
      sections(answer) == [.status, .scope, .answer, .question, .reasoning]
    )
  }

  @Test
  func resolutionFailedFixtureShowsStatusScopeAnswerSuggestionsReasoning() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_resolution_failed.json")
    #expect(
      sections(answer) == [.status, .scope, .answer, .suggestions, .reasoning]
    )
  }

  @Test
  func insufficientDataFixtureShowsStatusScopeCaveatAnswerReasoningCitations() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_insufficient_data.json")
    // The fixture is a generation fallback with a flag → caveat present at top.
    #expect(
      sections(answer) == [.status, .scope, .caveat, .answer, .reasoning, .citations]
    )
  }

  // MARK: In-domain failures render as answers (M-AC-1.3) — the answer body is
  // always present even for non-`answered` statuses.

  @Test
  func nonAnsweredStatusesStillRenderTheAnswerBody() {
    for status in [
      OakAnswer.Status.clarificationNeeded,
      .resolutionFailed,
      .insufficientData,
    ] {
      let blocks = sections(makeAnswer(status: status))
      #expect(blocks.contains(.answer))
      #expect(blocks.first == .status)  // status badge leads a non-answered card
    }
  }
}
