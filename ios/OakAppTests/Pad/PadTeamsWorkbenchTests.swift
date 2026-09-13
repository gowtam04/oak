import Foundation
import Testing

@testable import OakApp

/// Pins Pad Teams workbench contracts for Phase 7 (library | six-slot canvas |
/// slot inspector; guest unlock; Assistant = companion).
///
/// `PadTeamsChrome` is a small pure helper the Phase 7 implementer **must add**
/// under `ios/OakApp/Pad/Teams/` (`PadTeamsWorkbench.swift` or a sibling).
/// Missing type / method is the red compile.
///
/// Expected API:
/// ```
/// enum PadTeamsChrome {
///   /// Guests see the sign-in unlock, not a library list (P-TEAM-AC-1.1).
///   static func showsUnlock(isSignedIn: Bool) -> Bool
///   /// Canvas slots (P-TEAM-AC-2.1). Empty slots are selectable.
///   static let slotCount = 6
///   /// Assistant control reveals companion chat — not `TeamsAssistantSheet`
///   /// and not `TeamsAssistantViewModel` (P-TEAM-BR-5, ADR-P4).
///   static func assistantOpensCompanion() -> Bool // true
/// }
/// ```
///
/// Slot selection is stored on `PadDestination.teams(teamId:slotIndex:)`
/// (`data-model.md`: `slotIndex` 0...5). `PadShellModel.select` is the
/// chrome write path. `PadDestination.teams(slotIndex: 3)` must round-trip.
///
/// Not encoded here:
///   P-TEAM-AC-2.3 portrait collapse / canvas-above-inspector layout — UI
///   P-TEAM-AC-2.6–2.7 set completeness + warn-but-allow — `TeamEditorViewModelTests`
///   P-TEAM-AC-3.* import / export / add-to-team panels — later host wiring
///   P-TEAM-AC-5 analysis section reachability — existing editor analysis tests
///   Teams Assistant patch/undo / `TeamsAssistantViewModel` / `TeamsAssistantSheet`
///     — iPhone-only (ADR-P4). Do not invent a Pad patch stack.
///
/// Requirement refs: P-TEAM-US-1, P-TEAM-US-2, P-TEAM-US-4, P-TEAM-AC-1.1–1.2,
/// P-TEAM-AC-2.1–2.2, P-TEAM-AC-2.4, P-TEAM-AC-4.1–4.4, P-TEAM-BR-1,
/// P-TEAM-BR-5, ADR-P4, P-WF-US-3.
@MainActor
struct PadTeamsWorkbenchTests {

  private func makeShell() -> PadShellModel {
    PadShellModel()
  }

  // MARK: Guest unlock (P-TEAM-US-1, P-TEAM-AC-1.1–1.2, P-TEAM-BR-1)

  @Test
  func guestSeesUnlockNotALibraryList() {
    #expect(PadTeamsChrome.showsUnlock(isSignedIn: false) == true)
  }

  @Test
  func signedInDoesNotShowUnlock() {
    #expect(PadTeamsChrome.showsUnlock(isSignedIn: true) == false)
  }

  // MARK: Six-slot canvas (P-TEAM-US-2, P-TEAM-AC-2.1)

  @Test
  func canvasHasSixSlots() {
    #expect(PadTeamsChrome.slotCount == 6)
  }

  @Test
  func editorMemberCapMatchesCanvasSlotCount() {
    let vm = TeamEditorViewModel(teamService: FakeTeamService(), format: .champions)
    for _ in 0..<10 { vm.addMember() }
    #expect(vm.members.count == PadTeamsChrome.slotCount)
    #expect(vm.canAddMember == false)
  }

  // MARK: Destination slot selection (P-TEAM-AC-2.2, data-model.md)

  @Test
  func teamsSlotIndex3RoundTrips() {
    let dest = PadDestination.teams(slotIndex: 3)
    #expect(dest == .teams(teamId: nil, slotIndex: 3))
    guard case .teams(let teamId, let slotIndex) = dest else {
      Issue.record("expected .teams")
      return
    }
    #expect(teamId == nil)
    #expect(slotIndex == 3)
  }

  @Test
  func teamsTeamIdAndSlotIndexRoundTripTogether() {
    let dest = PadDestination.teams(teamId: "team-rain-1", slotIndex: 2)
    #expect(dest == .teams(teamId: "team-rain-1", slotIndex: 2))
    guard case .teams(let teamId, let slotIndex) = dest else {
      Issue.record("expected .teams")
      return
    }
    #expect(teamId == "team-rain-1")
    #expect(slotIndex == 2)
  }

  @Test
  func everyCanvasSlotIndexRoundTripsOnDestination() {
    for index in 0..<PadTeamsChrome.slotCount {
      let dest = PadDestination.teams(teamId: "t1", slotIndex: index)
      #expect(dest == .teams(teamId: "t1", slotIndex: index))
      guard case .teams(_, let slotIndex) = dest else {
        Issue.record("expected .teams for slot \(index)")
        continue
      }
      #expect(slotIndex == index)
    }
  }

  @Test
  func emptySlotIndexIsSelectableOnAnOpenTeam() {
    // P-TEAM-AC-2.2 — empty slots are selectable so the user can fill them.
    // Destination does not require a filled member at that index.
    let dest = PadDestination.teams(teamId: "t1", slotIndex: 0)
    #expect(dest == .teams(teamId: "t1", slotIndex: 0))
    guard case .teams(let teamId, let slotIndex) = dest else {
      Issue.record("expected .teams")
      return
    }
    #expect(teamId == "t1")
    #expect(slotIndex == 0)
  }

  @Test
  func newTeamDestinationHasNoTeamIdOrSlot() {
    // P-TEAM-AC-2.4 — new team opens an empty canvas in the same workbench.
    let dest = PadDestination.teams()
    #expect(dest == .teams(teamId: nil, slotIndex: nil))
  }

  @Test
  func libraryRowWithoutSlotKeepsSlotIndexNil() {
    let dest = PadDestination.teams(teamId: "t1")
    #expect(dest == .teams(teamId: "t1", slotIndex: nil))
  }

  @Test
  func differentSlotIndexesAreNotEqual() {
    #expect(
      PadDestination.teams(teamId: "t1", slotIndex: 0)
        != .teams(teamId: "t1", slotIndex: 3)
    )
    #expect(PadDestination.teams(slotIndex: 3) != .teams())
  }

  // MARK: PadShellModel stores the selected slot (P-TEAM-AC-2.2)

  @Test
  func selectStoresTeamIdAndSlotIndexOnDestination() {
    let shell = makeShell()
    shell.select(.teams(teamId: "team-rain-1", slotIndex: 3))
    #expect(shell.destination == .teams(teamId: "team-rain-1", slotIndex: 3))
  }

  @Test
  func selectingAnotherSlotUpdatesTheStoredIndex() {
    let shell = makeShell()
    shell.select(.teams(teamId: "t1", slotIndex: 0))
    shell.select(.teams(teamId: "t1", slotIndex: 5))
    #expect(shell.destination == .teams(teamId: "t1", slotIndex: 5))
  }

  @Test
  func everyCanvasSlotCanBeSelectedOnTheShell() {
    let shell = makeShell()
    for index in 0..<PadTeamsChrome.slotCount {
      shell.select(.teams(teamId: "t1", slotIndex: index))
      #expect(shell.destination == .teams(teamId: "t1", slotIndex: index))
    }
  }

  @Test
  func reselectingTheSameSlotDoesNotDismissCenteredPanels() {
    let shell = makeShell()
    shell.select(.teams(teamId: "t1", slotIndex: 3))
    shell.centeredPanelPresented = true
    shell.select(.teams(teamId: "t1", slotIndex: 3))
    #expect(shell.centeredPanelPresented == true)
    #expect(shell.destination == .teams(teamId: "t1", slotIndex: 3))
  }

  @Test
  func changingSlotDoesNotDismissCenteredPanels() {
    let shell = makeShell()
    shell.select(.teams(teamId: "t1", slotIndex: 0))
    shell.centeredPanelPresented = true
    shell.selectSlot(5)
    #expect(shell.centeredPanelPresented == true)
    #expect(shell.destination == .teams(teamId: "t1", slotIndex: 5))
  }

  @Test
  func selectingANewTeamOpensEmptyCanvasWithoutLeavingTeams() {
    let shell = makeShell()
    shell.select(.teams(teamId: "t1", slotIndex: 2))
    shell.select(.teams())
    #expect(shell.destination == .teams(teamId: nil, slotIndex: nil))
    guard case .teams = shell.destination else {
      Issue.record("new team must stay on the Teams destination")
      return
    }
  }

  // MARK: Assistant = companion (P-TEAM-US-4, P-TEAM-AC-4.1–4.4, P-TEAM-BR-5, ADR-P4)

  @Test
  func assistantOpensCompanionNotASheet() {
    #expect(PadTeamsChrome.assistantOpensCompanion() == true)
  }

  @Test
  func assistantControlRevealsCompanionWithTheOpenTeamChip() {
    #expect(PadTeamsChrome.assistantOpensCompanion())
    let shell = makeShell()
    shell.select(.teams(teamId: "team-rain-1", slotIndex: 0))
    shell.revealCompanion()
    let chip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: "Garchomp @ Choice Scarf"
    )
    shell.setContextChip(chip)
    #expect(shell.companionOpen == true)
    #expect(shell.contextChip == chip)
    #expect(shell.destination == .teams(teamId: "team-rain-1", slotIndex: 0))
  }

  @Test
  func companionAlreadyOpenKeepsTheThreadAndSwitchesTheTeamChip() {
    // P-TEAM-AC-4.3 / AC-4.4 — companion is the Chat destination's current
    // thread (not a per-team hidden thread). Entering the editor must not
    // reset companionOpen; the chip switches to the open team.
    let shell = makeShell()
    shell.select(.dex())
    shell.revealCompanion()
    shell.setContextChip(.pokemon(slug: "garchomp", name: "Garchomp"))
    #expect(shell.companionOpen == true)

    shell.select(.teams(teamId: "team-rain-1", slotIndex: 1))
    #expect(shell.companionOpen == true)
    #expect(shell.destination == .teams(teamId: "team-rain-1", slotIndex: 1))

    let teamChip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: ""
    )
    shell.setContextChip(teamChip)
    #expect(shell.contextChip == teamChip)
    #expect(shell.companionOpen == true)
  }
}
