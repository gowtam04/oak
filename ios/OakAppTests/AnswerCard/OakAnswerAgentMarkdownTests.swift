import Foundation
import Testing

@testable import OakApp

/// Pure-function tests for ``OakAnswerAgentMarkdown`` (soul.md Phase 3.2 —
/// "Copy for agents"). Distilled markdown is the contract; the UI only pastes it.
struct OakAnswerAgentMarkdownTests {

  private func makeAnswer(
    status: OakAnswer.Status = .answered,
    answerMarkdown: String = "Garchomp is a Dragon/Ground pseudo-legendary.",
    reasoningMarkdown: String = "",
    citations: [Citation] = [],
    inferences: [Inference] = [],
    generationBasis: GenerationBasis = GenerationBasis(
      generation: "Gen 9 (Scarlet/Violet)",
      fallback: false,
      note: nil
    ),
    subjects: [Subject]? = nil,
    candidates: Candidates? = nil,
    damageCalc: DamageCalc? = nil,
    suggestions: [String]? = nil,
    uncertaintyFlags: [String]? = nil,
    proposedTeam: ProposedTeam? = nil,
    savedTeam: SavedTeamRef? = nil
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
      question: nil,
      uncertaintyFlags: uncertaintyFlags,
      proposedTeam: proposedTeam,
      savedTeam: savedTeam,
      proposedTeamWarnings: nil
    )
  }

  @Test
  func minimalAnswerIncludesStatusScopeAndBody() {
    let md = OakAnswerAgentMarkdown.build(makeAnswer())
    #expect(md.contains("# Oak answer"))
    #expect(md.contains("**Status:** answered"))
    #expect(md.contains("**Scope:** Gen 9 (Scarlet/Violet)"))
    #expect(md.contains("## Answer"))
    #expect(md.contains("Garchomp is a Dragon/Ground pseudo-legendary."))
    // Empty optional sections are omitted.
    #expect(!md.contains("## Subjects"))
    #expect(!md.contains("## Sources"))
    #expect(!md.contains("## Reasoning"))
  }

  @Test
  func subjectsAndCitationsAndReasoningRender() {
    let answer = makeAnswer(
      reasoningMarkdown: "Looked up base stats and typing.",
      citations: [
        Citation(source: "pokemon/garchomp", detail: "Base stats.", endpointUrl: nil),
      ],
      subjects: [
        Subject(
          name: "Garchomp",
          dexNumber: 445,
          spriteUrl: "https://example.invalid/g.png",
          types: ["dragon", "ground"],
          isFallback: false,
          sourceGeneration: nil
        ),
      ]
    )
    let md = OakAnswerAgentMarkdown.build(answer)
    #expect(md.contains("## Subjects"))
    #expect(md.contains("Garchomp (#0445) — Dragon / Ground"))
    #expect(md.contains("## Sources"))
    #expect(md.contains("1. pokemon/garchomp — Base stats."))
    #expect(md.contains("## Reasoning"))
    #expect(md.contains("Looked up base stats and typing."))
  }

  @Test
  func mapsInternalUncertaintyFlagsToFriendlyLabels() {
    let md = OakAnswerAgentMarkdown.build(
      makeAnswer(uncertaintyFlags: ["max_iterations_reached", "custom model caveat"])
    )
    #expect(md.contains("## Uncertainty"))
    #expect(md.contains("Couldn't complete this answer"))
    #expect(md.contains("custom model caveat"))
    #expect(!md.contains("max_iterations_reached"))
  }

  @Test
  func fallbackNoteAndInferences() {
    let md = OakAnswerAgentMarkdown.build(
      makeAnswer(
        inferences: [
          Inference(
            claim: "Sand Force boosts Ground moves in sand.",
            confidence: .high,
            note: "From ability effect text."
          ),
        ],
        generationBasis: GenerationBasis(
          generation: "Gen 8",
          fallback: true,
          note: "Using Gen 8 data."
        )
      )
    )
    #expect(md.contains("**Fallback:** Using Gen 8 data."))
    #expect(md.contains("## Inferences"))
    #expect(md.contains("[high] Sand Force boosts Ground moves in sand."))
    #expect(md.contains("From ability effect text."))
  }

  @Test
  func fixtureAnswerBuildsNonEmptyMarkdown() throws {
    let data = try Fixtures.load("oakanswer_answered_full.json")
    let answer = try JSONDecoder().decode(OakAnswer.self, from: data)
    let md = OakAnswerAgentMarkdown.build(answer)
    #expect(md.hasPrefix("# Oak answer"))
    #expect(md.contains("## Answer"))
    #expect(md.contains("**Status:**"))
  }
}
