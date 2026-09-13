import SwiftUI

/// Draggable split between workspace and companion. Clamps to `PadLayout`
/// min/max fractions (P-SHELL-AC-4.3). Not a system split view.
struct PadSplitHandle: View {
  enum Role {
    /// Vertical bar; `fraction` is the trailing companion width share.
    case trailingCompanion
    /// Horizontal bar; `fraction` is the top workspace height share.
    case stackedWorkspace
  }

  var role: Role
  var span: CGFloat
  @Binding var fraction: CGFloat

  @State private var dragOrigin: CGFloat?

  private var range: ClosedRange<CGFloat> {
    switch role {
    case .trailingCompanion:
      PadLayout.companionMinFraction...PadLayout.companionMaxFraction
    case .stackedWorkspace:
      PadLayout.stackedWorkspaceMinFraction...(1 - PadLayout.companionMinFraction)
    }
  }

  private var isVerticalBar: Bool {
    switch role {
    case .trailingCompanion: true
    case .stackedWorkspace: false
    }
  }

  var body: some View {
    ZStack {
      Rectangle()
        .fill(Theme.separator)
        .frame(width: isVerticalBar ? 1 : nil, height: isVerticalBar ? nil : 1)
      Capsule()
        .fill(Theme.borderStrong)
        .frame(width: isVerticalBar ? 4 : 32, height: isVerticalBar ? 32 : 4)
    }
    .frame(width: isVerticalBar ? 12 : nil, height: isVerticalBar ? nil : 12)
    .frame(maxWidth: isVerticalBar ? 12 : .infinity, maxHeight: isVerticalBar ? .infinity : 12)
    .contentShape(Rectangle())
    .gesture(drag)
    .accessibilityLabel("Resize panes")
    .accessibilityValue(percentValue)
    .accessibilityAdjustableAction { direction in
      let step: CGFloat = 0.02
      switch direction {
      case .increment:
        fraction = clamp(fraction + step)
      case .decrement:
        fraction = clamp(fraction - step)
      @unknown default:
        break
      }
    }
  }

  private var percentValue: String {
    "\(Int((fraction * 100).rounded())) percent"
  }

  private var drag: some Gesture {
    DragGesture(minimumDistance: 1)
      .onChanged { value in
        if dragOrigin == nil { dragOrigin = fraction }
        let origin = dragOrigin ?? fraction
        let axisDelta: CGFloat
        switch role {
        case .trailingCompanion:
          axisDelta = -value.translation.width / max(span, 1)
        case .stackedWorkspace:
          axisDelta = value.translation.height / max(span, 1)
        }
        fraction = clamp(origin + axisDelta)
      }
      .onEnded { _ in
        dragOrigin = nil
      }
  }

  private func clamp(_ value: CGFloat) -> CGFloat {
    min(max(value, range.lowerBound), range.upperBound)
  }
}
