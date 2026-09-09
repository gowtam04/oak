import SwiftUI

/// Live turn chrome: expandable thinking trace, then a neutral answer plate
/// once `streamingText` is non-empty. The trace stays visible (collapsed to
/// "Thought for N seconds") above the plate.
struct IncomingAnswerPlate: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  var reconnecting: Bool = false
  let streamingText: String
  var startedAt: Date? = nil

  private var awaitingTokens: Bool { streamingText.isEmpty }

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
      if phase != .idle {
        StreamingStatusView(
          phase: phase,
          activities: activities,
          reconnecting: reconnecting,
          startedAt: startedAt,
          settled: !awaitingTokens
        )
      }
      if !awaitingTokens {
        MarkdownBlockView(streamingText)
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(Theme.Spacing.lg)
          .background(Theme.surface, in: plateShape)
          .overlay {
            plateShape.strokeBorder(Theme.separator, lineWidth: 1)
          }
          .clipShape(plateShape)
          .transition(
            .asymmetric(
              insertion: .opacity.combined(with: .offset(y: 8)),
              removal: .opacity
            )
          )
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.bottom, Theme.Spacing.md)
    .animation(reduceMotion ? nil : Theme.Motion.enter, value: awaitingTokens)
  }

  private var plateShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
  }
}

#if DEBUG
#Preview("Incoming plate") {
  VStack(spacing: 24) {
    IncomingAnswerPlate(
      phase: .thinking,
      activities: [],
      streamingText: "",
      startedAt: Date()
    )
    IncomingAnswerPlate(
      phase: .usingTools,
      activities: [
        .init(tool: "get_pokemon", label: "Looking up Dragapult…"),
      ],
      streamingText: "",
      startedAt: Date().addingTimeInterval(-3)
    )
    IncomingAnswerPlate(
      phase: .answering,
      activities: [
        .init(tool: "get_pokemon", label: "Looking up Dragapult…"),
      ],
      streamingText: "**Dragapult** is a Dragon/Ghost glass cannon.",
      startedAt: Date().addingTimeInterval(-4)
    )
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  .background(Theme.canvas)
}
#endif
