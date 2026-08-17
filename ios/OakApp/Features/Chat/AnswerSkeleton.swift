import SwiftUI

/// The answer's landing zone, held from the moment of send until the first answer
/// token arrives: one lead bar plus two prose lines, built from ``SkeletonBlock``
/// so they inherit the soft shimmer and the Reduce-Motion static dimming. Sized
/// to sit flush where the real answer prose lands.
///
/// Surface + 12pt radius + hairline — the same plate chrome as a finalized
/// answer. Purely decorative and hidden from VoiceOver — the streaming status
/// view announces the working state (M-AC-UI9.3).
struct AnswerSkeleton: View {
  /// Unused (kept so existing call sites compile). Signal streaming no longer
  /// washes the skeleton with a type color.
  var washType: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
      SkeletonBlock(width: 220, height: 20)
      VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
        SkeletonBlock(height: 12)
        SkeletonBlock(width: 180, height: 12)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Theme.Spacing.lg)
    .background(
      Theme.surface,
      in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
        .strokeBorder(Theme.separator, lineWidth: 1)
    }
    .accessibilityHidden(true)
  }
}

#if DEBUG
#Preview("Answer skeleton") {
  VStack(spacing: 24) {
    AnswerSkeleton()
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  .background(Theme.canvas)
}
#endif
