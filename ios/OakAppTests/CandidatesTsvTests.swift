import Foundation
import Testing

@testable import OakApp

/// Phase 5 lockstep oracle — visible candidate rows → TSV (TBL-US-4).
///
/// Clones `web/src/lib/candidates-tsv.ts`. Fails to compile until
/// `CandidatesTsv.swift` exists (`ios/OakApp/Features/Chat/CandidatesTsv.swift`).
///
/// Expected API:
///   `candidatesToTsv(_ visibleRows: [CandidateRow]) -> String`
///
/// The helper serializes the **already-visible** set only (after sort / filter
/// / in-table pin). It does not fetch hidden remainder (`N` of `M` stays
/// honest — TBL-BR-1). Empty input → empty string (UI explains; TBL-AC-4.4).
///
/// Portable column contract (spreadsheet paste, TBL-AC-4.1):
///   `Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe[\tAbility]`
/// Types join with `/`. Ability column is present only when any visible row
/// names an ability. `\n` line endings. Header first, then one line per row
/// in the given order.
///
/// Requirement refs: TBL-US-4, TBL-AC-4.1, TBL-AC-4.4, TBL-BR-1, TBL-BR-3.
struct CandidatesTsvTests {

  private func row(
    _ name: String,
    types: [String] = ["dragon"],
    stats: BaseStats? = nil,
    ability: String? = nil
  ) -> CandidateRow {
    CandidateRow(
      name: name,
      dexNumber: nil,
      spriteUrl: nil,
      types: types,
      baseStats: stats,
      keyStats: nil,
      ability: ability
    )
  }

  private var garchompStats: BaseStats {
    BaseStats(hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102)
  }

  private var dragoniteStats: BaseStats {
    BaseStats(hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80)
  }

  // MARK: TBL-US-4 / TBL-AC-4.1 — visible rows only

  @Test
  func serializesOnlyTheRowsItIsGiven() {
    let visible = [
      row("Garchomp", types: ["dragon", "ground"], stats: garchompStats, ability: "rough-skin"),
      row("Dragonite", types: ["dragon", "flying"], stats: dragoniteStats, ability: "multiscale"),
    ]
    let tsv = candidatesToTsv(visible)
    #expect(tsv.contains("Garchomp"))
    #expect(tsv.contains("Dragonite"))
    #expect(!tsv.contains("Excadrill"))
    #expect(!tsv.contains("Metagross"))
  }

  @Test
  func preservesTheGivenVisibleOrderIncludingAPinnedRow() {
    // Caller already applied sort/filter/pin. Pin-in-table stays at the top
    // of `visibleRows` (TBL-AC-3.1 / TBL-AC-4.1).
    let visible = [
      row("Garchomp", types: ["dragon", "ground"], stats: garchompStats),
      row("Dragonite", types: ["dragon", "flying"], stats: dragoniteStats),
    ]
    let lines = candidatesToTsv(visible).split(whereSeparator: \.isNewline).map(String.init)
    #expect(lines.count >= 3)
    #expect(lines[1].contains("Garchomp"))
    #expect(lines[2].contains("Dragonite"))
  }

  // MARK: TBL-AC-4.1 — tab-separated columns

  @Test
  func emitsAHeaderAndTabSeparatedStatColumns() {
    let tsv = candidatesToTsv([
      row("Garchomp", types: ["dragon", "ground"], stats: garchompStats, ability: "rough-skin")
    ])
    let lines = tsv.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    #expect(lines.first == "Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe\tAbility")
    #expect(lines.contains("Garchomp\tdragon/ground\t108\t130\t95\t80\t85\t102\trough-skin"))
    #expect(tsv.contains("\t"))
    #expect(!tsv.contains(","))
  }

  @Test
  func omitsTheAbilityColumnWhenNoVisibleRowNamesOne() {
    let tsv = candidatesToTsv([
      row("Garchomp", types: ["dragon", "ground"], stats: garchompStats)
    ])
    let header = tsv.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init)
    #expect(header == "Name\tTypes\tHP\tAtk\tDef\tSpA\tSpD\tSpe")
    #expect(!(header ?? "").contains("Ability"))
  }

  // MARK: TBL-AC-4.4 — empty visible set

  @Test
  func emptyVisibleSetIsAnEmptyString() {
    #expect(candidatesToTsv([]) == "")
  }

  // MARK: TBL-BR-1 — hidden remainder is not the helper's input

  @Test
  func doesNotInventHiddenRemainderRows() {
    // Even when a `Candidates` payload has hidden rows, TSV is built from the
    // shown/filtered slice the caller passes — never `allRows`.
    let shown = [row("Kartana", types: ["steel", "grass"])]
    let tsv = candidatesToTsv(shown)
    #expect(tsv.contains("Kartana"))
    #expect(!tsv.contains("Bisharp"))
    #expect(!tsv.contains("Excadrill"))
  }
}
