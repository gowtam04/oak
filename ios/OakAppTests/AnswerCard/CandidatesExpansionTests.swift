import Foundation
import Testing

@testable import OakApp

/// The local-expansion seam for the candidates table (`Candidates.canExpandLocally`
/// / `allRows`), which decides whether "Show all N" expands the list in place
/// (server shipped `hidden_rows`) or falls back to a follow-up chat turn.
///
/// `CandidatesTableView`'s own body can't be introspected (ADR-5 forbids a
/// view-inspection package), so the branch decision lives on the pure model where
/// it is directly testable; the view renders `displayedRows` verbatim from these.
struct CandidatesExpansionTests {

  private func row(_ name: String) -> CandidateRow {
    CandidateRow(
      name: name,
      dexNumber: nil,
      spriteUrl: nil,
      types: ["steel"],
      baseStats: nil,
      keyStats: nil,
      ability: nil
    )
  }

  // MARK: canExpandLocally

  @Test
  func expandsLocallyOnlyWhenHiddenRowsShipped() {
    // Hidden rows present → local expand.
    let withHidden = Candidates(
      totalCount: 3,
      truncated: true,
      sort: nil,
      shown: [row("Kartana")],
      hiddenRows: [row("Excadrill"), row("Metagross")]
    )
    #expect(withHidden.canExpandLocally == true)

    // Field absent (old answers / >200-row sets) → follow-up fallback.
    let noField = Candidates(totalCount: 3, truncated: true, sort: nil, shown: [row("Kartana")])
    #expect(noField.canExpandLocally == false)

    // Present-but-empty is treated as absent (nothing to reveal).
    let emptyHidden = Candidates(
      totalCount: 1,
      truncated: true,
      sort: nil,
      shown: [row("Kartana")],
      hiddenRows: []
    )
    #expect(emptyHidden.canExpandLocally == false)
  }

  // MARK: allRows

  @Test
  func allRowsConcatenatesShownThenHidden() {
    let candidates = Candidates(
      totalCount: 3,
      truncated: true,
      sort: nil,
      shown: [row("Kartana")],
      hiddenRows: [row("Excadrill"), row("Metagross")]
    )
    #expect(candidates.allRows.map(\.name) == ["Kartana", "Excadrill", "Metagross"])
    // Fully reconstructs the set the server counted.
    #expect(candidates.allRows.count == candidates.totalCount)
  }

  @Test
  func allRowsIsJustShownWhenNoHiddenRows() {
    let candidates = Candidates(totalCount: 1, truncated: false, sort: nil, shown: [row("Kartana")])
    #expect(candidates.allRows.map(\.name) == ["Kartana"])
  }

  // MARK: over the committed fixture

  @Test
  func fixtureExpandsToTheFullSet() throws {
    let answer = try Fixtures.decode(OakAnswer.self, from: "oakanswer_candidates_hidden.json")
    let candidates = try #require(answer.candidates)
    #expect(candidates.canExpandLocally)
    #expect(candidates.allRows.map(\.name) == ["Kartana", "Bisharp", "Excadrill", "Metagross"])
    #expect(candidates.allRows.count == candidates.totalCount)
  }
}
