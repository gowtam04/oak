import Foundation
import Observation

/// iPad chrome state (destination, companion, split fractions). Process-memory
/// only (ADR-P7) — not merged into `AppState`.
@MainActor
@Observable
final class PadShellModel {
  var destination: PadDestination = .chat
  var companionOpen: Bool = false
  var companionFraction: CGFloat = PadLayout.companionDefaultFraction
  var stackedWorkspaceFraction: CGFloat = 0.62
  var sidebarOverlayPresented: Bool = false
  /// Teams / Dex / Usage / Calc companion send context. Nil on Chat, after
  /// dismiss, and after companion close (P-SHELL-AC-3.3–3.4, ADR-P7).
  var contextChip: PadContextChip? = nil
  private(set) var previousDestination: PadDestination = .chat

  /// Testable seam for P-SHELL-AC-6.1. `select` to a different destination
  /// calls `dismissCenteredPanels()`; companion open/closed is unchanged.
  var centeredPanelPresented: Bool = false

  func select(_ destination: PadDestination) {
    guard destination != self.destination else { return }
    dismissCenteredPanels()
    self.destination = destination
    if case .chat = destination {
      contextChip = nil
    }
  }

  /// Updates the Teams canvas slot without a destination switch — does **not**
  /// dismiss centered panels (import/export stay up while picking a slot).
  func selectSlot(_ slotIndex: Int?) {
    guard case .teams(let teamId, let current) = destination else { return }
    guard current != slotIndex else { return }
    destination = .teams(teamId: teamId, slotIndex: slotIndex)
  }

  /// Calc workspace; stores `previousDestination` for Done (P-SHELL-BR-5).
  func openCalc(scenario: CalcScenario?) {
    dismissCenteredPanels()
    if case .calc = destination {
      destination = .calc(scenario)
      return
    }
    previousDestination = destination
    destination = .calc(scenario)
  }

  func closeCalc() {
    guard case .calc = destination else { return }
    dismissCenteredPanels()
    destination = previousDestination
  }

  func revealCompanion() {
    companionOpen = true
  }

  func hideCompanion() {
    companionOpen = false
    contextChip = nil
  }

  /// Teams / Dex / Usage / Calc only. No-op on Chat (and Settings).
  func setContextChip(_ chip: PadContextChip?) {
    switch destination {
    case .teams, .usage, .dex, .calc:
      contextChip = chip
    case .chat, .settings:
      break
    }
  }

  func dismissCenteredPanels() {
    centeredPanelPresented = false
  }
}
