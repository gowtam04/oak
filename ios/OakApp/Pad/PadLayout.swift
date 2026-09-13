import CoreGraphics

/// Width → column mode for the iPad shell (P-SHELL-US-5, ADR-P2).
///
/// Mode is chosen from **container width**, not `horizontalSizeClass`. Idiom
/// selects `PadRootView`; this type only collapses columns inside it.
enum PadLayoutMode: Equatable, Sendable {
  case regular
  case medium
  case compact
}

/// Named layout constants and pure width/geometry rules (api-design.md).
enum PadLayout {
  static let regularMinWidth: CGFloat = 1100
  static let mediumMinWidth: CGFloat = 700
  static let sidebarWidth: CGFloat = 220
  static let sidebarRailWidth: CGFloat = 72
  static let chatListMinWidth: CGFloat = 260
  static let inspectorMinWidth: CGFloat = 320
  static let companionMinWidth: CGFloat = 320
  static let readableProseWidth: CGFloat = 720
  static let companionDefaultFraction: CGFloat = 0.38
  static let companionMinFraction: CGFloat = 0.28
  static let companionMaxFraction: CGFloat = 0.48
  static let stackedWorkspaceMinFraction: CGFloat = 0.52

  static func mode(for width: CGFloat) -> PadLayoutMode {
    if width >= regularMinWidth { return .regular }
    if width >= mediumMinWidth { return .medium }
    return .compact
  }

  /// Companion stacks (workspace above, chat below) iff the container is taller
  /// than it is wide — portrait and tall Split View, even when `mode(for:)` is
  /// medium or regular.
  static func stacksCompanion(width: CGFloat, height: CGFloat) -> Bool {
    height > width
  }
}
