import Foundation
import Testing

@testable import OakApp

/// Phase 7 lockstep oracle — human-readable copy projection.
///
/// Clones `web/src/lib/oak-answer-human-md.test.ts`. Do not drift the BASE
/// shape or the required/forbidden strings without updating web + Android.
///
/// Fails to compile until `OakAnswerHumanMarkdown` exists
/// (`ios/OakApp/Features/Chat/AnswerCard/OakAnswerHumanMarkdown.swift`).
/// Expected API (mirrors ``OakAnswerAgentMarkdown``):
///   `OakAnswerHumanMarkdown.build(_ answer: OakAnswer) -> String`
///
/// Requirement refs: COPY-US-1, COPY-AC-1.1, COPY-AC-1.2, COPY-AC-1.3,
/// COPY-BR-1, COPY-BR-2. ADR-9.
struct OakAnswerHumanMarkdownTests {

  // MARK: Lockstep fixtures (web oak-answer-human-md.test.ts)

  private var base: OakAnswer {
    makeAnswer(
      answerMarkdown: "Garchomp is a Dragon/Ground pseudo-legendary.",
      reasoningMarkdown: "Looked up Garchomp base stats and typing.",
      citations: [
        Citation(
          source: "pokemon/garchomp",
          detail: "base speed: 102",
          endpointUrl: "https://example.test/garchomp"
        ),
      ],
      inferences: [
        Inference(
          claim: "Outspeeds most Ground threats.",
          confidence: .high,
          note: "Base 102 Speed."
        ),
      ],
      generationBasis: GenerationBasis(
        generation: "gen-9",
        fallback: false,
        note: nil
      ),
      subjects: [
        Subject(
          name: "Garchomp",
          dexNumber: 445,
          spriteUrl: "https://example.test/garchomp.png",
          types: ["dragon", "ground"],
          isFallback: false,
          sourceGeneration: nil
        ),
      ],
      uncertaintyFlags: ["Competitive usage may shift monthly."]
    )
  }

  private var garchompSet: TeamMember {
    TeamMember(
      species: "garchomp",
      ability: "rough-skin",
      item: "life-orb",
      moves: ["earthquake", "dragon-claw", "stone-edge", "swords-dance"],
      nature: "jolly",
      evs: StatSpread(hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252),
      ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
      teraType: "ground",
      level: 50,
      nickname: nil,
      gender: nil,
      shiny: nil
    )
  }

  private var dragoniteSet: TeamMember {
    TeamMember(
      species: "dragonite",
      ability: "multiscale",
      item: nil,
      moves: ["extreme-speed", "earthquake"],
      nature: "adamant",
      evs: StatSpread(hp: 248, atk: 252, def: 0, spa: 0, spd: 8, spe: 0),
      ivs: StatSpread(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31),
      teraType: "normal",
      level: 50,
      nickname: nil,
      gender: nil,
      shiny: nil
    )
  }

  /// Full lockstep card: prose + candidate fact table + caveats + proposed team.
  private var full: OakAnswer {
    makeAnswer(
      answerMarkdown: "Garchomp is a Dragon/Ground pseudo-legendary.",
      reasoningMarkdown: "Looked up Garchomp base stats and typing.",
      citations: [
        Citation(
          source: "pokemon/garchomp",
          detail: "base speed: 102",
          endpointUrl: "https://example.test/garchomp"
        ),
      ],
      inferences: [
        Inference(
          claim: "Outspeeds most Ground threats.",
          confidence: .high,
          note: "Base 102 Speed."
        ),
      ],
      generationBasis: GenerationBasis(
        generation: "gen-9",
        fallback: false,
        note: nil
      ),
      subjects: [
        Subject(
          name: "Garchomp",
          dexNumber: 445,
          spriteUrl: "https://example.test/garchomp.png",
          types: ["dragon", "ground"],
          isFallback: false,
          sourceGeneration: nil
        ),
      ],
      candidates: Candidates(
        totalCount: 2,
        truncated: false,
        sort: "speed desc",
        shown: [
          CandidateRow(
            name: "Garchomp",
            dexNumber: 445,
            spriteUrl: nil,
            types: ["dragon", "ground"],
            baseStats: BaseStats(
              hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102
            ),
            keyStats: nil,
            ability: nil
          ),
          CandidateRow(
            name: "Dragonite",
            dexNumber: 149,
            spriteUrl: nil,
            types: ["dragon", "flying"],
            baseStats: BaseStats(
              hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80
            ),
            keyStats: nil,
            ability: nil
          ),
        ]
      ),
      uncertaintyFlags: ["Competitive usage may shift monthly."],
      proposedTeam: ProposedTeam(
        name: "Rain Offense",
        format: .scarletViolet,
        members: [garchompSet, dragoniteSet]
      )
    )
  }

  private func makeAnswer(
    status: OakAnswer.Status = .answered,
    answerMarkdown: String = "Garchomp is a Dragon/Ground pseudo-legendary.",
    reasoningMarkdown: String = "Looked up Garchomp base stats and typing.",
    citations: [Citation] = [],
    inferences: [Inference] = [],
    generationBasis: GenerationBasis = GenerationBasis(
      generation: "gen-9",
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

  private func matches(_ md: String, _ pattern: String) -> Bool {
    md.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
  }

  private func hasLeadingPipe(_ md: String) -> Bool {
    md.split(separator: "\n", omittingEmptySubsequences: false).contains { line in
      line.trimmingCharacters(in: .whitespaces).hasPrefix("|")
    }
  }

  // MARK: COPY-AC-1.1 — inclusions

  @Test
  func includesTheUserFacingProse() {
    let md = OakAnswerHumanMarkdown.build(base)
    #expect(md.contains("Garchomp is a Dragon/Ground pseudo-legendary."))
  }

  @Test
  func includesAReadableFactTableFromCandidates() {
    let md = OakAnswerHumanMarkdown.build(full)
    #expect(md.contains("|"))
    #expect(md.contains("Garchomp"))
    #expect(md.contains("Dragonite"))
    #expect(md.contains("108"))
    #expect(md.contains("130"))
    #expect(md.contains("102"))
    #expect(md.contains("91"))
    #expect(md.contains("134"))
    #expect(md.contains("80"))
  }

  @Test
  func rendersKeyStatsWhenACandidateHasNoBaseStats() {
    let md = OakAnswerHumanMarkdown.build(
      makeAnswer(
        citations: base.citations,
        inferences: base.inferences,
        generationBasis: base.generationBasis,
        subjects: base.subjects,
        candidates: Candidates(
          totalCount: 1,
          truncated: false,
          sort: nil,
          shown: [
            CandidateRow(
              name: "Garchomp",
              dexNumber: 445,
              spriteUrl: nil,
              types: ["dragon", "ground"],
              baseStats: nil,
              keyStats: ["speed": .int(102), "attack": .int(130)],
              ability: nil
            ),
          ]
        ),
        uncertaintyFlags: base.uncertaintyFlags
      )
    )
    #expect(md.contains("|"))
    #expect(md.contains("Garchomp"))
    #expect(md.contains("102"))
    #expect(md.contains("130"))
  }

  @Test
  func emitsANameTypesFactTableWhenShownRowsHaveNoStats() {
    let md = OakAnswerHumanMarkdown.build(
      makeAnswer(
        citations: base.citations,
        inferences: base.inferences,
        generationBasis: base.generationBasis,
        subjects: base.subjects,
        candidates: Candidates(
          totalCount: 2,
          truncated: false,
          sort: nil,
          shown: [
            CandidateRow(
              name: "Garchomp",
              dexNumber: nil,
              spriteUrl: nil,
              types: ["dragon", "ground"],
              baseStats: nil,
              keyStats: nil,
              ability: nil
            ),
            CandidateRow(
              name: "Dragonite",
              dexNumber: nil,
              spriteUrl: nil,
              types: ["dragon", "flying"],
              baseStats: nil,
              keyStats: nil,
              ability: nil
            ),
          ]
        ),
        uncertaintyFlags: base.uncertaintyFlags
      )
    )
    #expect(md.contains("|"))
    #expect(md.contains("Garchomp"))
    #expect(md.contains("Dragonite"))
  }

  @Test
  func omitsAFactTableWhenThereIsNoCandidatesShown() {
    let md = OakAnswerHumanMarkdown.build(
      makeAnswer(
        answerMarkdown: "Yes, Garchomp can learn Earthquake.",
        citations: base.citations,
        inferences: base.inferences,
        generationBasis: base.generationBasis,
        subjects: base.subjects,
        uncertaintyFlags: base.uncertaintyFlags
      )
    )
    #expect(md.contains("Yes, Garchomp can learn Earthquake."))
    #expect(!hasLeadingPipe(md))
  }

  @Test
  func includesUserFacingUncertaintyCaveats() {
    let md = OakAnswerHumanMarkdown.build(full)
    #expect(md.contains("Competitive usage may shift monthly."))
  }

  @Test
  func mapsInternalUncertaintyCodesToUserFacingLabels() {
    let md = OakAnswerHumanMarkdown.build(
      makeAnswer(
        citations: base.citations,
        inferences: base.inferences,
        generationBasis: base.generationBasis,
        subjects: base.subjects,
        uncertaintyFlags: ["max_iterations_reached"]
      )
    )
    #expect(md.contains("Couldn't complete this answer"))
    #expect(!md.contains("max_iterations_reached"))
  }

  @Test
  func includesTheGenerationFallbackNoteWhenFallbackIsTrue() {
    let md = OakAnswerHumanMarkdown.build(
      makeAnswer(
        citations: base.citations,
        inferences: base.inferences,
        generationBasis: GenerationBasis(
          generation: "gen-8",
          fallback: true,
          note: "Not in Scarlet/Violet roster."
        ),
        subjects: base.subjects,
        uncertaintyFlags: base.uncertaintyFlags
      )
    )
    #expect(md.contains("Not in Scarlet/Violet roster."))
    #expect(!md.contains("generation_basis"))
  }

  @Test
  func includesTheDefaultGenerationFallbackSentenceWhenNoteIsAbsent() {
    let md = OakAnswerHumanMarkdown.build(
      makeAnswer(
        citations: base.citations,
        inferences: base.inferences,
        generationBasis: GenerationBasis(
          generation: "gen-8",
          fallback: true,
          note: nil
        ),
        subjects: base.subjects,
        uncertaintyFlags: base.uncertaintyFlags
      )
    )
    #expect(md.contains("Based on gen-8 data — this Pokémon is not in Gen 9."))
    #expect(!md.contains("generation_basis"))
  }

  @Test
  func includesAShowdownPasteWhenProposedTeamIsPresent() {
    let md = OakAnswerHumanMarkdown.build(full)
    #expect(matches(md, "garchomp"))
    #expect(matches(md, "life-orb|Life Orb"))
    #expect(matches(md, "rough-skin|Rough Skin"))
    #expect(matches(md, "earthquake"))
    #expect(matches(md, "dragon-claw|Dragon Claw"))
    #expect(matches(md, "stone-edge|Stone Edge"))
    #expect(matches(md, "swords-dance|Swords Dance"))
    #expect(matches(md, "jolly"))
    #expect(matches(md, #"Level:\s*50"#))
    #expect(md.contains("252"))
    #expect(matches(md, "dragonite"))
    #expect(matches(md, "multiscale|Multiscale"))
    #expect(matches(md, "extreme-speed|Extreme Speed"))
    #expect(md.contains("Rain Offense"))
  }

  @Test
  func omitsAShowdownPasteWhenThereIsNoProposedTeam() {
    let md = OakAnswerHumanMarkdown.build(base)
    #expect(!matches(md, "Ability:"))
    #expect(!matches(md, #"Level:\s*\d+"#))
    #expect(!matches(md, #"@\s*life-orb"#))
  }

  // MARK: COPY-AC-1.2 — exclusions

  @Test
  func doesNotDumpCitationSchemaEndpointsOrAgentHeadings() {
    let md = OakAnswerHumanMarkdown.build(full)
    #expect(!md.contains("# Oak answer"))
    #expect(!md.contains("## Citations"))
    #expect(!md.contains("## Reasoning"))
    #expect(!md.contains("## Subjects"))
    #expect(!md.contains("## Inferences"))
    #expect(!md.contains("## Uncertainty flags"))
    #expect(!md.contains("**Status:**"))
    #expect(!md.contains("`pokemon/garchomp`"))
    #expect(!md.contains("pokemon/garchomp"))
    #expect(!md.contains("https://example.test/garchomp"))
    #expect(!md.contains("endpoint_url"))
    #expect(!md.contains("reasoning_markdown"))
    #expect(!md.contains("generation_basis"))
    #expect(!md.contains("tool_activity"))
    #expect(!md.contains("tool-activity"))
  }

  @Test
  func doesNotIncludeTheInternalReasoningDump() {
    let md = OakAnswerHumanMarkdown.build(full)
    #expect(!md.contains("Looked up Garchomp base stats and typing."))
  }

  // MARK: COPY-AC-1.3 / COPY-BR-2 — distinct from agent copy

  @Test
  func staysDistinctFromCopyForAgents() {
    let human = OakAnswerHumanMarkdown.build(full)
    let agent = OakAnswerAgentMarkdown.build(full)
    #expect(human != agent)
    #expect(agent.contains("# Oak answer"))
    // iOS agent strip uses "## Sources"; web uses "## Citations". Either heading
    // marks the machine surface — human copy must have neither.
    #expect(agent.contains("## Sources") || agent.contains("## Citations"))
    #expect(agent.contains("pokemon/garchomp"))
    #expect(agent.contains("## Reasoning"))
    #expect(!human.contains("# Oak answer"))
    #expect(!human.contains("## Citations"))
    #expect(!human.contains("## Sources"))
  }

  @Test
  func isAPureProjectionOfTheGivenAnswer() {
    let snapshot = full
    let md = OakAnswerHumanMarkdown.build(full)
    #expect(full == snapshot)
    #expect(!md.isEmpty)
  }
}
