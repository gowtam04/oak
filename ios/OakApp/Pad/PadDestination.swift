import Foundation

/// iPad shell destination (P-SHELL-US-1, P-SHELL-BR-5).
///
/// Sidebar items are chat, teams, usage, dex, and settings. Calculator is a
/// workspace opened from existing entry points, not a sidebar row. Associated
/// values hold session drill-in state for later phases.
///
/// `Equatable`/`Sendable` only: ``CalcScenario`` is not `Hashable`.
enum PadDestination: Equatable, Sendable {
  case chat
  case teams(teamId: String? = nil, slotIndex: Int? = nil)
  case usage(slug: String? = nil)
  case dex(DexEntityRoute? = nil)
  case settings
  case calc(CalcScenario? = nil)
}
