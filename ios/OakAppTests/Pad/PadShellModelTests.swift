import Foundation
import Testing

@testable import OakApp

/// Pins `PadShellModel` chrome state (destination, calc previous, companion
/// flags, centered-panel dismiss). Production type lives in
/// `ios/OakApp/Pad/PadShellModel.swift` and does not exist until Phase 2.
///
/// Expected API (`docs/features/ipad-app/architecture/api-design.md`):
///   `@MainActor @Observable final class PadShellModel`
///   `destination` default `.chat` (P-SHELL-AC-1.2, P-SHELL-BR-1)
///   `companionOpen` default `false`
///   `companionFraction` default `PadLayout.companionDefaultFraction`
///   `previousDestination` default `.chat` (`private(set)`)
///   `select(_:)`, `openCalc(scenario:)`, `closeCalc()`,
///   `revealCompanion()`, `hideCompanion()`, `dismissCenteredPanels()`
///   `setContextChip(_:)` — Teams / Dex / Usage / Calc only; no-op on Chat
///   `var contextChip: PadContextChip? = nil`
///   Test hook: `var centeredPanelPresented = false` — `dismissCenteredPanels()`
///   sets it false; `select` to a **different** destination calls
///   `dismissCenteredPanels()` (P-SHELL-AC-6.1). Architecture does not name
///   this flag; it is the Phase 2 testable seam (no panel UI yet).
///
/// Sidebar destinations are Chat / Teams / Usage / Dex / Settings.
/// Calculator is a workspace via `openCalc`, not a sidebar `select`
/// (P-SHELL-AC-1.3, P-SHELL-BR-5, P-UI-AC-4.3).
///
/// Companion (P-SHELL-US-2, P-SHELL-BR-2–3, ADR-P3): default closed;
/// reveal/hide; remembered among Teams/Usage/Dex/Calc (and through Chat);
/// selecting Chat does not open a duplicate pane. Context chip is session
/// chrome (ADR-P7), replaced when the open object changes (P-SHELL-AC-3.4),
/// cleared on dismiss / companion close / Chat destination.
///
/// Requirement refs: P-SHELL-US-1, P-SHELL-AC-1.1–1.4, P-SHELL-BR-1,
/// P-SHELL-BR-5, P-SHELL-US-2–4, P-SHELL-AC-2.1–2.4, P-SHELL-AC-3.3–3.4,
/// P-SHELL-BR-2–3, P-SHELL-US-5, P-SHELL-AC-5.1–5.3, P-SHELL-AC-6.1,
/// P-UI-AC-4.3, ADR-P2, ADR-P3, ADR-P7.
@MainActor
struct PadShellModelTests {

  private func makeShell() -> PadShellModel {
    PadShellModel()
  }

  // MARK: Defaults

  @Test
  func defaultsMatchApiDesign() {
    let shell = makeShell()
    #expect(shell.destination == .chat)
    #expect(shell.companionOpen == false)
    #expect(shell.companionFraction == PadLayout.companionDefaultFraction)
    #expect(shell.previousDestination == .chat)
    #expect(shell.stackedWorkspaceFraction == 0.62)
    #expect(shell.sidebarOverlayPresented == false)
    #expect(shell.centeredPanelPresented == false)
    #expect(shell.contextChip == nil)
  }

  // MARK: Sidebar select (P-SHELL-US-1, P-SHELL-AC-1.1, P-SHELL-BR-1)

  @Test
  func selectChangesDestination() {
    let shell = makeShell()
    shell.select(.teams())
    #expect(shell.destination == .teams())
  }

  @Test
  func selectMovesAmongTheFiveSidebarDestinations() {
    let shell = makeShell()
    shell.select(.teams())
    #expect(shell.destination == .teams())
    shell.select(.usage())
    #expect(shell.destination == .usage())
    shell.select(.dex())
    #expect(shell.destination == .dex())
    shell.select(.settings)
    #expect(shell.destination == .settings)
    shell.select(.chat)
    #expect(shell.destination == .chat)
  }

  // MARK: Calc workspace (P-SHELL-AC-1.3, P-SHELL-BR-5)

  @Test
  func openCalcStoresPreviousDestinationAndCloseReturns() {
    let shell = makeShell()
    shell.select(.teams())
    shell.openCalc(scenario: nil)
    #expect(shell.destination == .calc())
    #expect(shell.previousDestination == .teams())

    shell.closeCalc()
    #expect(shell.destination == .teams())
  }

  @Test
  func openCalcFromDefaultChatReturnsToChatOnClose() {
    let shell = makeShell()
    #expect(shell.destination == .chat)
    shell.openCalc(scenario: nil)
    #expect(shell.destination == .calc())
    #expect(shell.previousDestination == .chat)

    shell.closeCalc()
    #expect(shell.destination == .chat)
  }

  @Test
  func openCalcFromSettingsRemembersSettings() {
    let shell = makeShell()
    shell.select(.settings)
    shell.openCalc(scenario: nil)
    #expect(shell.previousDestination == .settings)
    shell.closeCalc()
    #expect(shell.destination == .settings)
  }

  // MARK: Centered panels (P-SHELL-AC-6.1; method exists even if no panel yet)

  @Test
  func dismissCenteredPanelsClearsPresentedFlag() {
    let shell = makeShell()
    shell.centeredPanelPresented = true
    shell.dismissCenteredPanels()
    #expect(shell.centeredPanelPresented == false)
  }

  @Test
  func selectAwayFromCurrentDismissesCenteredPanels() {
    let shell = makeShell()
    shell.centeredPanelPresented = true
    shell.select(.teams())
    #expect(shell.destination == .teams())
    #expect(shell.centeredPanelPresented == false)
  }

  @Test
  func selectSameDestinationDoesNotDismissCenteredPanels() {
    let shell = makeShell()
    shell.centeredPanelPresented = true
    shell.select(.chat)
    #expect(shell.destination == .chat)
    #expect(shell.centeredPanelPresented == true)
  }

  @Test
  func openCalcDismissesCenteredPanels() {
    let shell = makeShell()
    shell.centeredPanelPresented = true
    shell.openCalc(scenario: nil)
    #expect(shell.centeredPanelPresented == false)
  }

  @Test
  func dismissCenteredPanelsDoesNotResetCompanionOpen() {
    let shell = makeShell()
    shell.select(.teams())
    shell.revealCompanion()
    shell.centeredPanelPresented = true
    shell.dismissCenteredPanels()
    #expect(shell.centeredPanelPresented == false)
    #expect(shell.companionOpen == true)
  }

  // MARK: Companion flags (P-SHELL-AC-2.1, P-SHELL-AC-2.3, P-SHELL-BR-3)
  // Companion remember/close across workspaces is the P2 stub of P6 behavior.

  @Test
  func revealAndHideCompanionToggleFlag() {
    let shell = makeShell()
    #expect(shell.companionOpen == false)
    shell.revealCompanion()
    #expect(shell.companionOpen == true)
    shell.hideCompanion()
    #expect(shell.companionOpen == false)
  }

  @Test
  func selectingChatDoesNotOpenCompanion() {
    let shell = makeShell()
    #expect(shell.companionOpen == false)
    shell.select(.chat)
    #expect(shell.companionOpen == false)
  }

  @Test
  func firstLandingOnWorkspaceLeavesCompanionClosed() {
    let shell = makeShell()
    shell.select(.teams())
    #expect(shell.companionOpen == false)
    shell.select(.dex())
    #expect(shell.companionOpen == false)
    shell.select(.usage())
    #expect(shell.companionOpen == false)
    shell.openCalc(scenario: nil)
    #expect(shell.companionOpen == false)
  }

  @Test
  func companionOpenPersistsAmongTeamsUsageDexCalc() {
    let shell = makeShell()
    shell.select(.teams())
    shell.revealCompanion()
    #expect(shell.companionOpen == true)

    shell.select(.usage())
    #expect(shell.companionOpen == true)
    shell.select(.dex())
    #expect(shell.companionOpen == true)
    shell.openCalc(scenario: nil)
    #expect(shell.companionOpen == true)
    shell.closeCalc()
    #expect(shell.companionOpen == true)
    #expect(shell.destination == .dex())

    shell.hideCompanion()
    shell.select(.teams())
    #expect(shell.companionOpen == false)
    shell.select(.settings)
    #expect(shell.companionOpen == false)
  }

  @Test
  func selectAwayDoesNotResetCompanionOpen() {
    let shell = makeShell()
    shell.select(.teams())
    shell.revealCompanion()
    shell.centeredPanelPresented = true
    shell.select(.usage())
    #expect(shell.centeredPanelPresented == false)
    #expect(shell.companionOpen == true)
  }

  @Test
  func companionOpenSurvivesVisitingChatThenReturningToAWorkspace() {
    // P-SHELL-BR-3 / AC-2.3: open/closed is remembered across workspaces.
    // Chat is the same live thread (P-SHELL-BR-2, AC-2.4) — visiting it must
    // not reset the flag, or returning to Dex would re-close companion.
    let shell = makeShell()
    shell.select(.dex())
    shell.revealCompanion()
    shell.select(.chat)
    #expect(shell.destination == .chat)
    #expect(shell.companionOpen == true)

    shell.select(.teams())
    #expect(shell.companionOpen == true)
  }

  @Test
  func revealCompanionDoesNotChangeDestination() {
    let shell = makeShell()
    shell.select(.usage())
    shell.revealCompanion()
    #expect(shell.destination == .usage())
    #expect(shell.companionOpen == true)
  }

  // MARK: Context chip (P-SHELL-US-3, P-SHELL-AC-3.3–3.4)

  @Test
  func setContextChipOnWorkspaceStoresTheChip() {
    let shell = makeShell()
    shell.select(.teams())
    let chip = PadContextChip.team(
      id: "team-rain-1",
      name: "Rain Offense",
      liveShowdown: ""
    )
    shell.setContextChip(chip)
    #expect(shell.contextChip == chip)
  }

  @Test
  func setContextChipOnChatIsNoOp() {
    let shell = makeShell()
    #expect(shell.destination == .chat)
    shell.setContextChip(
      .pokemon(slug: "garchomp", name: "Garchomp")
    )
    #expect(shell.contextChip == nil)
  }

  @Test
  func setContextChipReplacesRatherThanStartingANewConversation() {
    // P-SHELL-AC-3.4 — switching the open object replaces the chip.
    let shell = makeShell()
    shell.select(.dex())
    shell.setContextChip(.pokemon(slug: "garchomp", name: "Garchomp"))
    shell.setContextChip(.move(slug: "earthquake", name: "Earthquake"))
    #expect(shell.contextChip == .move(slug: "earthquake", name: "Earthquake"))
    #expect(shell.destination == .dex())
  }

  @Test
  func setContextChipNilDismissesTheChip() {
    let shell = makeShell()
    shell.select(.usage())
    shell.setContextChip(.usageSpecies(slug: "garchomp", name: "Garchomp"))
    shell.setContextChip(nil)
    #expect(shell.contextChip == nil)
    #expect(shell.destination == .usage())
  }

  @Test
  func hideCompanionClearsTheContextChip() {
    let shell = makeShell()
    shell.select(.teams())
    shell.revealCompanion()
    shell.setContextChip(
      .team(id: "team-1", name: "Rain Offense", liveShowdown: "")
    )
    shell.hideCompanion()
    #expect(shell.companionOpen == false)
    #expect(shell.contextChip == nil)
  }

  @Test
  func selectChatClearsTheContextChip() {
    let shell = makeShell()
    shell.select(.teams())
    shell.setContextChip(
      .team(id: "team-1", name: "Rain Offense", liveShowdown: "")
    )
    shell.select(.chat)
    #expect(shell.destination == .chat)
    #expect(shell.contextChip == nil)
  }

  @Test
  func revealCompanionDoesNotInventAContextChip() {
    let shell = makeShell()
    shell.select(.dex())
    shell.revealCompanion()
    #expect(shell.contextChip == nil)
  }

  @Test
  func dismissCenteredPanelsDoesNotClearTheContextChip() {
    let shell = makeShell()
    shell.select(.teams())
    shell.revealCompanion()
    let chip = PadContextChip.team(
      id: "team-1",
      name: "Rain Offense",
      liveShowdown: ""
    )
    shell.setContextChip(chip)
    shell.centeredPanelPresented = true
    shell.dismissCenteredPanels()
    #expect(shell.centeredPanelPresented == false)
    #expect(shell.companionOpen == true)
    #expect(shell.contextChip == chip)
  }

  @Test
  func setContextChipWorksOnUsageDexAndCalc() {
    let shell = makeShell()
    shell.select(.usage())
    shell.setContextChip(.usageSpecies(slug: "garchomp", name: "Garchomp"))
    #expect(shell.contextChip == .usageSpecies(slug: "garchomp", name: "Garchomp"))

    shell.select(.dex())
    shell.setContextChip(.ability(slug: "rough-skin", name: "Rough Skin"))
    #expect(shell.contextChip == .ability(slug: "rough-skin", name: "Rough Skin"))

    shell.openCalc(scenario: nil)
    shell.setContextChip(.calc(explainPrompt: "Explain this damage estimate."))
    #expect(shell.contextChip == .calc(explainPrompt: "Explain this damage estimate."))
  }
}
