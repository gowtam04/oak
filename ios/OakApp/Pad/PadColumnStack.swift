import SwiftUI

/// Custom measured columns (ADR-P2). Width → `PadLayout.mode`; tall geometry
/// (`stacksCompanion`) places later panes below. Not `NavigationSplitView`.
struct PadColumnStack<Primary: View, Companion: View>: View {
  /// Full-window size used for mode and companion stacking (not remaining
  /// width after the sidebar).
  var containerSize: CGSize
  var companionOpen: Bool
  @Binding var companionFraction: CGFloat
  @Binding var stackedWorkspaceFraction: CGFloat
  var primary: Primary
  var companion: Companion

  init(
    containerSize: CGSize,
    companionOpen: Bool,
    companionFraction: Binding<CGFloat>,
    stackedWorkspaceFraction: Binding<CGFloat>,
    @ViewBuilder primary: () -> Primary,
    @ViewBuilder companion: () -> Companion
  ) {
    self.containerSize = containerSize
    self.companionOpen = companionOpen
    self._companionFraction = companionFraction
    self._stackedWorkspaceFraction = stackedWorkspaceFraction
    self.primary = primary()
    self.companion = companion()
  }

  private var mode: PadLayoutMode {
    PadLayout.mode(for: containerSize.width)
  }

  /// Compact always stacks; otherwise stack when the window is taller than wide.
  private var stacksLaterPanes: Bool {
    mode == .compact || PadLayout.stacksCompanion(
      width: containerSize.width,
      height: containerSize.height
    )
  }

  var body: some View {
    GeometryReader { geo in
      let size = geo.size
      if companionOpen && stacksLaterPanes {
        stacked(size: size)
      } else if companionOpen {
        sideBySide(size: size)
      } else {
        primary
          .frame(width: size.width, height: size.height)
      }
    }
  }

  private func sideBySide(size: CGSize) -> some View {
    let share = clampCompanion(companionFraction)
    let companionWidth = size.width * share
    return HStack(spacing: 0) {
      primary
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      PadSplitHandle(
        role: .trailingCompanion,
        span: size.width,
        fraction: $companionFraction
      )
      companion
        .frame(width: companionWidth)
        .frame(maxHeight: .infinity)
    }
  }

  private func stacked(size: CGSize) -> some View {
    let share = clampWorkspace(stackedWorkspaceFraction)
    let workspaceHeight = size.height * share
    return VStack(spacing: 0) {
      primary
        .frame(height: workspaceHeight)
        .frame(maxWidth: .infinity)
      PadSplitHandle(
        role: .stackedWorkspace,
        span: size.height,
        fraction: $stackedWorkspaceFraction
      )
      companion
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func clampCompanion(_ value: CGFloat) -> CGFloat {
    min(max(value, PadLayout.companionMinFraction), PadLayout.companionMaxFraction)
  }

  private func clampWorkspace(_ value: CGFloat) -> CGFloat {
    let upper = 1 - PadLayout.companionMinFraction
    return min(max(value, PadLayout.stackedWorkspaceMinFraction), upper)
  }
}
