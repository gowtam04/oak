import SwiftUI

/// The answer's landing zone, held from the moment of send until the first answer
/// token arrives (fable-ui-strategy-ios.md §4.03): one masthead bar (the verdict's
/// place) plus two prose lines, built from ``SkeletonBlock`` so they inherit the soft
/// shimmer and the Reduce-Motion static dimming. Sized to sit flush where the real
/// answer prose lands, so there's no layout jump when streamed text replaces it.
///
/// Purely decorative and hidden from VoiceOver — the streaming status view announces
/// the working state (M-AC-UI9.3).
struct AnswerSkeleton: View {
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
    .accessibilityHidden(true)
  }
}

#if DEBUG
#Preview("Answer skeleton") {
  AnswerSkeleton()
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Theme.canvas)
}
#endif
