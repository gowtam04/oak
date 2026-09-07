import Foundation

/// Root tab catalogue (Champions-first P7, ADR-6).
///
/// Display order: Chat / Teams / Usage / Dex / Settings. Calc stays a cover,
/// not a tab.
enum AppTab: String, CaseIterable, Hashable, Sendable {
  case chat
  case teams
  case usage
  case dex
  case settings
}
