import Foundation
import Testing

@testable import OakApp

/// Sequential `/calc` slash slots — lockstep oracle (SD-US-10).
/// Clones `web/src/lib/chat/slash-calc.test.ts`.
struct SlashCalcTests {
  private let garchomp = DexNameRow(kind: .pokemon, slug: "garchomp", displayName: "Garchomp")
  private let gholdengo = DexNameRow(kind: .pokemon, slug: "gholdengo", displayName: "Gholdengo")
  private let ironBundle = DexNameRow(kind: .pokemon, slug: "ironbundle", displayName: "Iron Bundle")
  private let flutterMane = DexNameRow(kind: .pokemon, slug: "fluttermane", displayName: "Flutter Mane")
  private let earthquake = DexNameRow(kind: .move, slug: "earthquake", displayName: "Earthquake")
  private let playRough = DexNameRow(kind: .move, slug: "playrough", displayName: "Play Rough")

  private var search: @Sendable (DexNameRow.Kind, String) async -> [DexNameRow] {
    let roster = [garchomp, gholdengo, ironBundle, flutterMane, earthquake, playRough]
    return { kind, query in
      let needle = query.lowercased()
      return roster.filter {
        $0.kind == kind
          && ($0.displayName.lowercased() == needle || $0.slug.lowercased() == needle)
      }
    }
  }

  @Test
  func exportsSlotCaptionsSkipMoveAndEmptyLines() {
    #expect(SlashCalc.captionAttacker == "Pick attacker · or Send to open empty")
    #expect(SlashCalc.captionMove == "Pick move · or Send")
    #expect(SlashCalc.captionDefender == "Pick defender · or Send")
    #expect(SlashCalc.caption(for: .attacker) == SlashCalc.captionAttacker)
    #expect(SlashCalc.skipMove == "vs …")
    #expect(SlashCalc.emptySpecies == "No Pokémon matches")
    #expect(SlashCalc.emptyMove == "No move matches")
    #expect(SlashCalc.showSkipMove(slot: .move, query: "") == true)
    #expect(SlashCalc.showSkipMove(slot: .move, query: "earth") == false)
    #expect(SlashCalc.showSkipMove(slot: .attacker, query: "") == false)
  }

  @Test
  func splitRestHandlesVsVersusAndTrailingVs() {
    #expect(
      SlashCalc.splitRest("garchomp earthquake vs gholdengo")
        == SlashCalc.RestSplit(left: "garchomp earthquake", right: "gholdengo", vsPresent: true)
    )
    #expect(
      SlashCalc.splitRest("garchomp earthquake vs. gholdengo")
        == SlashCalc.RestSplit(left: "garchomp earthquake", right: "gholdengo", vsPresent: true)
    )
    #expect(
      SlashCalc.splitRest("garchomp versus gholdengo")
        == SlashCalc.RestSplit(left: "garchomp", right: "gholdengo", vsPresent: true)
    )
    #expect(SlashCalc.splitRest("Garchomp vs") == SlashCalc.RestSplit(left: "Garchomp", right: "", vsPresent: true))
    #expect(
      SlashCalc.splitRest("garchomp earthquake")
        == SlashCalc.RestSplit(left: "garchomp earthquake", right: nil, vsPresent: false)
    )
  }

  @Test
  func insertHelpersBuildSlotStrings() {
    #expect(SlashCalc.insertAttacker("Garchomp") == "/calc Garchomp ")
    #expect(SlashCalc.insertMove(attacker: "Garchomp", move: "Earthquake") == "/calc Garchomp Earthquake vs ")
    #expect(SlashCalc.insertSkipMove(attacker: "Garchomp") == "/calc Garchomp vs ")
    #expect(
      SlashCalc.insertDefender(attacker: "Garchomp", move: "Earthquake", defender: "Gholdengo")
        == "/calc Garchomp Earthquake vs Gholdengo"
    )
    #expect(
      SlashCalc.insertDefender(attacker: "Garchomp", move: nil, defender: "Gholdengo")
        == "/calc Garchomp vs Gholdengo"
    )
  }

  @Test
  func pickerStateWalksAttackerMoveDefenderSlots() {
    #expect(
      SlashCalc.pickerState(rest: "", bind: nil)
        == SlashCalc.PickerState(slot: .attacker, query: "", bind: CalcBind(), vsPresent: false)
    )
    #expect(
      SlashCalc.pickerState(rest: "Gar", bind: nil)
        == SlashCalc.PickerState(slot: .attacker, query: "Gar", bind: CalcBind(), vsPresent: false)
    )
    let attackerBind = CalcBind(attacker: garchomp)
    #expect(
      SlashCalc.pickerState(rest: "Garchomp", bind: attackerBind)
        == SlashCalc.PickerState(slot: .move, query: "", bind: attackerBind, vsPresent: false)
    )
    #expect(
      SlashCalc.pickerState(rest: "Garchomp Earth", bind: attackerBind)
        == SlashCalc.PickerState(slot: .move, query: "Earth", bind: attackerBind, vsPresent: false)
    )
    #expect(
      SlashCalc.pickerState(rest: "Garchomp vs Ghol", bind: attackerBind)
        == SlashCalc.PickerState(slot: .defender, query: "Ghol", bind: attackerBind, vsPresent: true)
    )
  }

  @Test
  func pickerStateCascadeDropsLaterBindsWhenAttackerIsEdited() {
    let bind = CalcBind(attacker: garchomp, move: earthquake, defender: gholdengo)
    let edited = SlashCalc.pickerState(rest: "Garchom Earthquake vs Gholdengo", bind: bind)
    #expect(edited.slot == .attacker)
    #expect(edited.bind == CalcBind())
    let moveEdited = SlashCalc.pickerState(rest: "Garchomp Earth vs Gholdengo", bind: bind)
    #expect(moveEdited.slot == .defender)
    #expect(moveEdited.bind == CalcBind(attacker: garchomp, defender: gholdengo))
  }

  @Test
  func resolveUsesBindSlugsAndLongestPrefixForTypedNames() async {
    let bound = await SlashCalc.resolveScenario(
      rest: "Garchomp Earthquake vs Gholdengo",
      bind: CalcBind(attacker: garchomp, move: earthquake, defender: gholdengo),
      search: search
    )
    #expect(bound.attacker.species == "garchomp")
    #expect(bound.defender.species == "gholdengo")
    #expect(bound.move.slug == "earthquake")

    let typed = await SlashCalc.resolveScenario(
      rest: "garchomp earthquake vs gholdengo",
      bind: nil,
      search: search
    )
    #expect(typed.attacker.species == "garchomp")
    #expect(typed.move.slug == "earthquake")
    #expect(typed.defender.species == "gholdengo")

    let multi = await SlashCalc.resolveScenario(
      rest: "iron bundle play rough vs flutter mane",
      bind: nil,
      search: search
    )
    #expect(multi.attacker.species == "ironbundle")
    #expect(multi.move.slug == "playrough")
    #expect(multi.defender.species == "fluttermane")

    let unresolved = await SlashCalc.resolveScenario(
      rest: "not-a-species vs also-fake",
      bind: nil,
      search: search
    )
    #expect(unresolved.attacker.species == nil)
    #expect(unresolved.defender.species == nil)
    #expect(unresolved.move.slug == nil)
  }
}
