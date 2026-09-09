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

/// Shown-set table tools (TBL-US-1–4). Sort / filter / row-pin / TSV operate
/// only on the currently shown rows — they never fetch the hidden remainder
/// (TBL-BR-1). `N` of `M` stays honest after sort.
///
/// Expected API (`CandidatesTableState` owned by `CandidatesTableView`):
///   `init(candidates:)`, `sort(by:)`, `filter(type:)`, `search(name:)`,
///   `pinRow(named:)`, `unpinRow(named:)`, `clearFilters()`
///   `visibleRows`, `shownCount` (N), `totalCount` (M), `tsv`
///
/// Requirement refs: TBL-US-1, TBL-US-2, TBL-US-3, TBL-US-4, TBL-AC-1.2,
/// TBL-AC-2.3, TBL-AC-3.1, TBL-BR-1.
struct CandidatesTableStateTests {

  private func row(
    _ name: String,
    types: [String],
    spe: Int,
    ability: String? = nil
  ) -> CandidateRow {
    CandidateRow(
      name: name,
      dexNumber: nil,
      spriteUrl: nil,
      types: types,
      baseStats: BaseStats(hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: spe),
      keyStats: nil,
      ability: ability
    )
  }

  private func shownSet() -> Candidates {
    Candidates(
      totalCount: 40,
      truncated: true,
      sort: nil,
      shown: [
        row("Garchomp", types: ["dragon", "ground"], spe: 102, ability: "rough-skin"),
        row("Dragapult", types: ["dragon", "ghost"], spe: 142),
        row("Tyranitar", types: ["rock", "dark"], spe: 61),
        row("Excadrill", types: ["ground", "steel"], spe: 88),
      ]
    )
  }

  @Test
  func sortReordersOnlyTheShownRowsAndKeepsNofMHonest() {
    var state = CandidatesTableState(candidates: shownSet())
    state.sort(by: .spe)

    #expect(state.visibleRows.map(\.name) == ["Dragapult", "Garchomp", "Excadrill", "Tyranitar"])
    #expect(state.shownCount == 4)
    #expect(state.totalCount == 40)
    #expect(state.visibleRows.count == 4)
  }

  @Test
  func typeFilterDoesNotFetchTheHiddenRemainder() {
    var state = CandidatesTableState(candidates: shownSet())
    state.filter(type: "dragon")

    #expect(Set(state.visibleRows.map(\.name)) == ["Garchomp", "Dragapult"])
    #expect(state.shownCount == 4)
    #expect(state.totalCount == 40)
  }

  @Test
  func nameSearchAndTypeFilterComposeWithAND() {
    var state = CandidatesTableState(candidates: shownSet())
    state.filter(type: "dragon")
    state.search(name: "garch")

    #expect(state.visibleRows.map(\.name) == ["Garchomp"])
  }

  @Test
  func clearingFiltersRestoresTheShownSetNotM() {
    var state = CandidatesTableState(candidates: shownSet())
    state.filter(type: "dragon")
    state.search(name: "garch")
    state.clearFilters()

    #expect(state.visibleRows.map(\.name) == ["Garchomp", "Dragapult", "Tyranitar", "Excadrill"])
    #expect(state.totalCount == 40)
  }

  @Test
  func aPinnedRowStaysVisibleWhenTheFilterWouldHideIt() {
    var state = CandidatesTableState(candidates: shownSet())
    state.pinRow(named: "Garchomp")
    state.filter(type: "steel")

    #expect(state.visibleRows.first?.name == "Garchomp")
    #expect(state.visibleRows.map(\.name).contains("Excadrill"))
    #expect(!state.visibleRows.map(\.name).contains("Dragapult"))
  }

  @Test
  func tsvIsTheCurrentlyVisibleRowsIncludingPinned() {
    var state = CandidatesTableState(candidates: shownSet())
    state.pinRow(named: "Garchomp")
    state.filter(type: "steel")

    let tsv = state.tsv
    #expect(tsv == candidatesToTsv(state.visibleRows))
    #expect(tsv.contains("Garchomp"))
    #expect(tsv.contains("Excadrill"))
    #expect(!tsv.contains("Dragapult"))
  }

  @Test
  func emptyFilteredSetCopiesNothingUseful() {
    var state = CandidatesTableState(candidates: shownSet())
    state.search(name: "zzzz")

    #expect(state.visibleRows.isEmpty)
    #expect(state.tsv.isEmpty)
  }
}
