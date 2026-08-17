import SwiftUI

/// One incoming answer plate: unsigned red type-light while the turn is live
/// and no tokens have arrived (status + sunken bars), then streamed markdown
/// once `streamingText` is non-empty. Glow and border latch back to neutral
/// when prose arrives.
struct IncomingAnswerPlate: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let phase: ChatViewModel.StreamingPhase
  let activities: [ChatViewModel.ToolActivity]
  var reconnecting: Bool = false
  let streamingText: String

  private var awaitingTokens: Bool { streamingText.isEmpty }

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
      if awaitingTokens {
        StreamingStatusView(
          phase: phase,
          activities: activities,
          reconnecting: reconnecting
        )
        AnswerSkeleton()
      } else {
        MarkdownBlockView(streamingText)
          .font(Theme.body(.body))
          .foregroundStyle(Theme.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Theme.Spacing.lg)
    .incomingPlateChrome(live: awaitingTokens, isDark: colorScheme == .dark)
    .animation(reduceMotion ? nil : Theme.Motion.latch, value: awaitingTokens)
  }
}

/// Sunken incoming-plate bars: lead ~68% (taller, dilute red wash), then
/// 100% / 92% / 48%. A red write-sheen travels L→R, staggered per bar.
/// Decorative — VoiceOver reads the status line instead (M-AC-UI9.3).
struct AnswerSkeleton: View {
  /// Unused (kept so existing call sites compile).
  var washType: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      IncomingSkeletonBar(widthFraction: 0.68, height: 18, washed: true, stagger: 0)
      IncomingSkeletonBar(widthFraction: 1.00, height: 10, washed: false, stagger: 0.14)
      IncomingSkeletonBar(widthFraction: 0.92, height: 10, washed: false, stagger: 0.28)
      IncomingSkeletonBar(widthFraction: 0.48, height: 10, washed: false, stagger: 0.42)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityHidden(true)
  }
}

// MARK: - Bar

private struct IncomingSkeletonBar: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let widthFraction: CGFloat
  let height: CGFloat
  let washed: Bool
  let stagger: Double

  var body: some View {
    GeometryReader { geo in
      let width = max(0, geo.size.width * widthFraction)
      let shape = RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
      shape
        .fill(Theme.surfaceSunken)
        .overlay {
          if washed {
            shape.fill(Theme.accent.opacity(0.10))
          }
        }
        .overlay {
          if !reduceMotion {
            TimelineView(.periodic(from: .now, by: 1.0 / 30.0)) { context in
              let cycle = 1.55
              let t = context.date.timeIntervalSinceReferenceDate + stagger
              let phase = t.truncatingRemainder(dividingBy: cycle) / cycle
              let sheenWidth = max(28, width * 0.36)
              LinearGradient(
                colors: [
                  .clear,
                  Theme.accent.opacity(0.28),
                  .clear,
                ],
                startPoint: .leading,
                endPoint: .trailing
              )
              .frame(width: sheenWidth)
              .offset(x: phase * (width + sheenWidth) - sheenWidth)
            }
          }
        }
        .clipShape(shape)
        .frame(width: width, height: height, alignment: .leading)
    }
    .frame(height: height)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Unsigned incoming chrome

private extension View {
  /// Surface-raised plate with a faint poke-red radial + 18% accent hairline
  /// while waiting; neutral separator once tokens arrive.
  func incomingPlateChrome(live: Bool, isDark: Bool) -> some View {
    let shape = RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
    return self
      .background {
        ZStack {
          Theme.surfaceRaised
          if live {
            RadialGradient(
              colors: [
                Theme.accent.opacity(isDark ? 0.16 : 0.10),
                .clear,
              ],
              center: UnitPoint(x: 0.92, y: 0.08),
              startRadius: 4,
              endRadius: 200
            )
          }
        }
      }
      .overlay {
        shape.strokeBorder(
          live ? Theme.accent.opacity(0.18) : Theme.separator,
          lineWidth: 1
        )
      }
      .clipShape(shape)
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

#Preview("Answer skeleton") {
  AnswerSkeleton()
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.canvas)
}
#endif
