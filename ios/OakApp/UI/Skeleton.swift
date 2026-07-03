import SwiftUI

/// Loading-placeholder primitives — the shimmering gray shapes that stand in for
/// content while a list, artifact, or profile loads, instead of a bare spinner.
///
/// Both are purely decorative and carry no information, so they're hidden from
/// VoiceOver (`accessibilityHidden`) — the surrounding view announces the loading
/// state (M-AC-UI9.3). Under Reduce Motion the shimmer stops (see `Shimmer.swift`)
/// and the blocks sit at a steady 60% opacity so they still read as placeholders
/// without motion (constraint 2).

/// A single rounded placeholder bar. Width is optional so it can either size to a
/// fixed measure or stretch to fill its container.
struct SkeletonBlock: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var width: CGFloat?
  var height: CGFloat

  init(width: CGFloat? = nil, height: CGFloat = 12) {
    self.width = width
    self.height = height
  }

  var body: some View {
    RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
      .fill(Theme.textPrimary.opacity(0.08))
      .frame(width: width, height: height)
      .opacity(reduceMotion ? 0.6 : 1)
      .shimmer()
      .accessibilityHidden(true)
  }
}

/// A list-row-shaped placeholder: a leading avatar circle and two stacked bars —
/// used while conversation and team lists load their first page.
struct SkeletonListRow: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    HStack(spacing: 12) {
      Circle()
        .fill(Theme.textPrimary.opacity(0.08))
        .frame(width: 40, height: 40)
        .opacity(reduceMotion ? 0.6 : 1)
        .shimmer()
      VStack(alignment: .leading, spacing: 6) {
        SkeletonBlock(width: 180, height: 12)
        SkeletonBlock(width: 110, height: 10)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 6)
    .accessibilityHidden(true)
  }
}

#Preview("Skeletons") {
  VStack(alignment: .leading, spacing: 16) {
    SkeletonBlock(width: 220, height: 16)
    SkeletonBlock(height: 12)
    Divider()
    ForEach(0..<3, id: \.self) { _ in
      SkeletonListRow()
    }
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.background)
}
