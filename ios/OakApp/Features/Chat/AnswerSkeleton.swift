import SwiftUI

/// The answer's landing zone, held from the moment of send until the first answer
/// token arrives (specimen desk / soul.md streaming field notes): one masthead bar (the verdict's
/// place) plus two prose lines, built from ``SkeletonBlock`` so they inherit the soft
/// shimmer and the Reduce-Motion static dimming. Sized to sit flush where the real
/// answer prose lands, so there's no layout jump when streamed text replaces it.
///
/// Soft desk tint (and optional mild type wash from a safe tool-label heuristic)
/// previews the specimen plate while the agent works (soul.md Phase 2.3).
///
/// Purely decorative and hidden from VoiceOver — the streaming status view announces
/// the working state (M-AC-UI9.3).
struct AnswerSkeleton: View {
  /// Optional type slug for a mild wash (from ``Theme.streamingWashType``). When
  /// `nil`, the skeleton uses a quiet sunken desk tint only.
  var washType: String? = nil

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
      // Masthead bar — stands in for the verdict (answerLead), wider + taller.
      SkeletonBlock(width: 220, height: 20)
      // Two prose lines — the reading column, one full-width and one short.
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        SkeletonBlock(height: 12)
        SkeletonBlock(width: 180, height: 12)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Theme.Spacing.lg)
    .background {
      ZStack {
        Theme.surfaceSunken.opacity(colorScheme == .dark ? 0.55 : 0.75)
        if let washType {
          // Mild type wash — well under a finalized plate's mix so it only hints.
          LinearGradient(
            colors: [
              Theme.type(washType).opacity(colorScheme == .dark ? 0.12 : 0.06),
              .clear,
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        }
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
        .strokeBorder(
          washType.map { Theme.type($0).opacity(colorScheme == .dark ? 0.22 : 0.16) }
            ?? Theme.border.opacity(0.9),
          lineWidth: 1
        )
    }
    .accessibilityHidden(true)
  }
}

#if DEBUG
#Preview("Answer skeleton") {
  VStack(spacing: 24) {
    AnswerSkeleton()
    AnswerSkeleton(washType: "dragon")
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  .background(Theme.canvas)
}
#endif
