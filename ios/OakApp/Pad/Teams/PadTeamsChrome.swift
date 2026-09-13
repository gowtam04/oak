import CoreGraphics
import Foundation

/// Pure Teams-workbench policy (P-TEAM-AC-1.1, P-TEAM-AC-2.1, P-TEAM-BR-5, ADR-P4).
enum PadTeamsChrome {
  /// Guests see the sign-in unlock, not a library list (P-TEAM-AC-1.1).
  static func showsUnlock(isSignedIn: Bool) -> Bool { !isSignedIn }

  /// Canvas slots (P-TEAM-AC-2.1). Empty slots are selectable.
  static let slotCount = 6

  /// PadRootView overlay controls are 44pt + `Theme.Spacing.sm`; Chat leaves 56pt.
  static let overlayControlInset: CGFloat = 56

  /// Assistant control reveals companion chat — not `TeamsAssistantSheet`
  /// and not `TeamsAssistantViewModel` (P-TEAM-BR-5, ADR-P4).
  static func assistantOpensCompanion() -> Bool { true }

  /// Wide landscape keeps the library column; portrait/compact collapse it.
  static func showsLibraryColumn(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    mode == .regular && !isPortrait
  }

  /// Portrait and compact stack the canvas above the slot inspector.
  static func stacksCanvasAboveInspector(mode: PadLayoutMode, isPortrait: Bool) -> Bool {
    isPortrait || mode == .compact
  }

  /// Live Showdown of the on-screen draft for the team context chip (ADR-P4).
  @MainActor
  static func liveShowdown(from editor: TeamEditorViewModel) -> String {
    let members = editor.draftWireMembers()
    guard members.contains(where: { ($0.species ?? "").isEmpty == false }) else {
      return ""
    }
    let name = editor.name.trimmingCharacters(in: .whitespacesAndNewlines)
    return proposedTeamToShowdownPaste(
      ProposedTeam(
        name: name.isEmpty ? (editor.savedTeam?.name ?? "Team") : name,
        format: editor.format,
        members: members
      )
    )
  }
}
