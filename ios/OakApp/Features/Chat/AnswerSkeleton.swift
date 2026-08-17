import SwiftUI

/// Live turn chrome: a quiet status sentence while no tokens have arrived,
/// then a neutral answer plate once `streamingText` is non-empty.
struct IncomingAnswerPlate: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  var reconnecting: Bool = false
  let streamingText: String

  private var awaitingTokens: Bool { streamingText.isEmpty }

  var body: some View {
    Group {
      if awaitingTokens {
        StreamingStatusView(
          phase: phase,
          activities: activities,
          reconnecting: reconnecting
        )
      } else {
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
      streamingText: ""
    )
    IncomingAnswerPlate(
      phase: .usingTools,
      activities: [
        .init(tool: "get_pokemon", label: "Looking up Dragapult…"),
      ],
      streamingText: ""
    )
    IncomingAnswerPlate(
      phase: .answering,
      activities: [],
      streamingText: "**Dragapult** is a Dragon/Ghost glass cannon."
    )
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  .background(Theme.canvas)
}
#endif
