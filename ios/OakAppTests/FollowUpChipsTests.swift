import Foundation
import Testing

@testable import OakApp

/// Phase 7 lockstep oracle — follow-up chips derived from OakAnswer + turn context.
///
/// Clones `web/src/lib/chat/follow-up-chips.test.ts`. Do not drift kind/label/
/// target/cap assertions without updating web + Android.
///
/// Fails to compile until `FollowUpChips` exists
/// (`ios/OakApp/Features/Chat/FollowUpChips.swift`).
///
/// Expected API (web `deriveFollowUpChips`):
///   `FollowUpChips.derive(answer:impliedFormat:mentionedTeam:) -> [FollowUpChip]`
///   `FollowUpChip { kind: Kind, label: String, target: String }`
///   `FollowUpChip.Kind` = `scope` | `dex` | `team`
///   `mentionedTeam` = `{ id, name }` (`FollowUpChips.MentionedTeam`)
///
/// Labels:
///   scope → `Switch to ${impliedFormat.rawValue}.`
///   dex   → `Open ${subject.name} in Dex`
///   team  → `Open ${teamName}`
///
/// Caps: ≤1 scope, ≤3 Dex, ≤1 team. No empty-row filler chips.
/// Never calc / compare / add-to-team / "Open this calc" / "tell me more".
/// No new OakAnswer field — chips are a client projection (CHIP-BR-3).
///
/// Requirement refs: CHIP-US-1, CHIP-AC-1.1..1.5, CHIP-BR-1, CHIP-BR-2,
/// CHIP-BR-3. ADR-9.
struct FollowUpChipsTests {

  // MARK: Lockstep fixtures (web follow-up-chips.test.ts)

  private var member: TeamMember {
    TeamMember(
      species: "garchomp",
      ability: "rough-skin",
      item: "life-orb",
      moves: ["earthquake"],
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

  private var base: OakAnswer {
    makeAnswer(
      subjects: [
        subject("Garchomp", dex: 445, types: ["dragon", "ground"]),
      ]
    )
  }

  private func subject(_ name: String, dex: Int, types: [String]) -> Subject {
    Subject(
      name: name,
      dexNumber: dex,
      spriteUrl: "https://example.test/\(name.lowercased()).png",
      types: types,
      isFallback: false,
      sourceGeneration: nil
    )
  }

  private func makeAnswer(
    subjects: [Subject]? = nil,
    candidates: Candidates? = nil,
    damageCalc: DamageCalc? = nil,
    suggestions: [String]? = nil,
    proposedTeam: ProposedTeam? = nil,
    savedTeam: SavedTeamRef? = nil
  ) -> OakAnswer {
    OakAnswer(
      status: .answered,
      answerMarkdown: "Garchomp is a Dragon/Ground pseudo-legendary.",
      reasoningMarkdown: "Looked up Garchomp base stats and typing.",
      citations: [
        Citation(
          source: "pokemon/garchomp",
          detail: "base speed: 102",
          endpointUrl: "https://example.test/garchomp"
        ),
      ],
      inferences: [],
      generationBasis: GenerationBasis(
        generation: "champions",
        fallback: false,
        note: nil
      ),
      subjects: subjects,
      candidates: candidates,
      damageCalc: damageCalc,
      suggestions: suggestions,
      question: nil,
      uncertaintyFlags: nil,
      proposedTeam: proposedTeam,
      savedTeam: savedTeam,
      proposedTeamWarnings: nil
    )
  }

  /// Web `FORBIDDEN_CHIP` — calc / compare / add-to-team / tell-me-more.
  private func isForbiddenLabel(_ label: String) -> Bool {
    label.range(
      of: #"calc|compare|add .+ to a team|open this calc|tell me more"#,
      options: [.regularExpression, .caseInsensitive]
    ) != nil
  }

  // MARK: CHIP-AC-1.1 — scope

  @Test
  func emitsOneScopeChipWhenADifferentFormatIsImplied() {
    let chips = FollowUpChips.derive(
      answer: base,
      impliedFormat: .scarletViolet
    )
    let scope = chips.filter { $0.kind == .scope }
    #expect(scope.count == 1)
    #expect(
      scope.first
        == FollowUpChip(
          kind: .scope,
          label: "Switch to scarlet-violet.",
          target: "scarlet-violet"
        )
    )
  }

  @Test
  func emitsNoScopeChipWhenImpliedFormatIsOmitted() {
    let chips = FollowUpChips.derive(answer: base)
    #expect(chips.filter { $0.kind == .scope }.isEmpty)
  }

  // MARK: CHIP-AC-1.2 — Dex

  @Test
  func emitsDexChipsForPrimarySubjectsCappedAt3() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(
        subjects: [
          subject("Garchomp", dex: 445, types: ["dragon", "ground"]),
          subject("Dragonite", dex: 149, types: ["dragon", "flying"]),
          subject("Salamence", dex: 373, types: ["dragon", "flying"]),
          subject("Hydreigon", dex: 635, types: ["dark", "dragon"]),
          subject("Goodra", dex: 706, types: ["dragon"]),
        ]
      )
    )
    let dex = chips.filter { $0.kind == .dex }
    #expect(dex.count == 3)
    #expect(dex.map(\.label) == [
      "Open Garchomp in Dex",
      "Open Dragonite in Dex",
      "Open Salamence in Dex",
    ])
    #expect(dex.map(\.target) == [
      "Garchomp",
      "Dragonite",
      "Salamence",
    ])
    #expect(!dex.contains { $0.target == "Hydreigon" })
    #expect(!dex.contains { $0.target == "Goodra" })
  }

  @Test
  func emitsNoDexChipsWhenThereAreNoSubjects() {
    let chips = FollowUpChips.derive(answer: makeAnswer(subjects: nil))
    #expect(chips.filter { $0.kind == .dex }.isEmpty)
  }

  // MARK: CHIP-AC-1.3 — team

  @Test
  func emitsOneTeamChipFromMentionedTeam() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(subjects: nil),
      mentionedTeam: FollowUpChips.MentionedTeam(id: "team-rain-1", name: "Rain Offense")
    )
    let team = chips.filter { $0.kind == .team }
    #expect(team.count == 1)
    #expect(
      team.first
        == FollowUpChip(
          kind: .team,
          label: "Open Rain Offense",
          target: "team-rain-1"
        )
    )
  }

  @Test
  func emitsOneTeamChipFromSavedTeamWhenNoMentionIsBound() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(
        subjects: nil,
        savedTeam: SavedTeamRef(
          id: "team-saved-9",
          name: "Balance Core",
          format: .scarletViolet
        )
      )
    )
    let team = chips.filter { $0.kind == .team }
    #expect(team.count == 1)
    #expect(
      team.first
        == FollowUpChip(
          kind: .team,
          label: "Open Balance Core",
          target: "team-saved-9"
        )
    )
  }

  @Test
  func capsTeamChipsAtOneAndPrefersMentionedTeamOverSavedTeam() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(
        subjects: nil,
        savedTeam: SavedTeamRef(
          id: "team-saved-9",
          name: "Balance Core",
          format: .scarletViolet
        )
      ),
      mentionedTeam: FollowUpChips.MentionedTeam(id: "team-rain-1", name: "Rain Offense")
    )
    let team = chips.filter { $0.kind == .team }
    #expect(team.count == 1)
    #expect(team.first?.target == "team-rain-1")
    #expect(team.first?.label == "Open Rain Offense")
  }

  // MARK: CHIP-AC-1.4 / CHIP-BR-1 — no invented hops

  @Test
  func doesNotTurnProposedTeamIntoAnAddToTeamChip() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(
        subjects: nil,
        proposedTeam: ProposedTeam(
          name: "Rain Offense",
          format: .scarletViolet,
          members: [member]
        )
      )
    )
    #expect(chips.filter { $0.kind == .team }.isEmpty)
    let joined = chips.map(\.label).joined(separator: "\n")
    #expect(!isForbiddenLabel(joined))
  }

  @Test
  func neverEmitsCalcCompareAddToTeamOrTellMeMoreChips() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(
        subjects: [
          subject("Garchomp", dex: 445, types: ["dragon", "ground"]),
          subject("Dragonite", dex: 149, types: ["dragon", "flying"]),
        ],
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
        damageCalc: DamageCalc(
          assumptions: [
            "attacker": .string("Garchomp"),
            "move": .string("earthquake"),
          ],
          result: [
            "min_damage": .int(142),
            "max_damage": .int(168),
          ],
          isEstimate: true,
          breakdown: "floor((2*50/5+2)*100*120/65)"
        ),
        suggestions: ["Garchomp", "Garchomp (Mega)", "tell me more"],
        proposedTeam: ProposedTeam(
          name: "Rain Offense",
          format: .scarletViolet,
          members: [member]
        )
      ),
      impliedFormat: .scarletViolet,
      mentionedTeam: FollowUpChips.MentionedTeam(id: "team-rain-1", name: "Rain Offense")
    )

    #expect(chips.allSatisfy { [.scope, .dex, .team].contains($0.kind) })
    for chip in chips {
      #expect(!isForbiddenLabel(chip.label))
      #expect(!chip.label.lowercased().contains("/calc"))
      #expect(!chip.label.lowercased().contains("add garchomp to a team"))
      #expect(!chip.label.lowercased().contains("open this calc"))
    }
    #expect(chips.contains { $0.kind == .scope })
    #expect(chips.filter { $0.kind == .dex }.count <= 3)
    #expect(chips.filter { $0.kind == .team }.count == 1)
  }

  // MARK: CHIP-AC-1.5 / CHIP-BR-2 — empty + caps

  @Test
  func returnsAnEmptyListWhenThereIsNothingToHopTo() {
    let chips = FollowUpChips.derive(answer: makeAnswer(subjects: nil))
    #expect(chips.isEmpty)
  }

  @Test
  func doesNotInventASuggestionsFieldOnOakAnswer() {
    let answer = base
    let labels = Mirror(reflecting: answer).children.compactMap(\.label)
    #expect(!labels.contains("followUpChips"))
    #expect(!labels.contains("follow_up_chips"))
    let snapshot = answer
    _ = FollowUpChips.derive(answer: answer, impliedFormat: .gen1)
    #expect(answer == snapshot)
    let after = Mirror(reflecting: answer).children.compactMap(\.label)
    #expect(!after.contains("followUpChips"))
    #expect(!after.contains("follow_up_chips"))
  }

  @Test
  func respectsCombinedCapsOneScopeThreeDexOneTeam() {
    let chips = FollowUpChips.derive(
      answer: makeAnswer(
        subjects: [
          subject("Garchomp", dex: 445, types: ["dragon", "ground"]),
          subject("Dragonite", dex: 149, types: ["dragon", "flying"]),
          subject("Salamence", dex: 373, types: ["dragon", "flying"]),
          subject("Hydreigon", dex: 635, types: ["dark", "dragon"]),
        ],
        savedTeam: SavedTeamRef(
          id: "team-saved-9",
          name: "Balance Core",
          format: .scarletViolet
        )
      ),
      impliedFormat: .scarletViolet,
      mentionedTeam: FollowUpChips.MentionedTeam(id: "team-rain-1", name: "Rain Offense")
    )
    #expect(chips.filter { $0.kind == .scope }.count == 1)
    #expect(chips.filter { $0.kind == .dex }.count == 3)
    #expect(chips.filter { $0.kind == .team }.count == 1)
    #expect(chips.count == 5)
  }
}
