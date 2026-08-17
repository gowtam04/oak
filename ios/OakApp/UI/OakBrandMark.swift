import SwiftUI

/// Oak's empty-state mark — the daylight `O.` lockup (ink oval + red period).
/// Geometry matches the app icon (`web/public/oak-app-icon.svg`): no concentric
/// rings, no Pokéball seam, no tile.
///
/// **Accessibility:** the slow 6s breathing scale (1.0 ↔ 1.04) loops forever,
/// so it's disabled under `@Environment(\.accessibilityReduceMotion)`.
/// The mark is decorative — the surrounding view carries the meaning — so it's
/// hidden from VoiceOver (M-AC-UI9.3).
struct OakBrandMark: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// The overall box in points (default 96).
  var size: CGFloat = 96

  @State private var breathe = false

  var body: some View {
    Canvas { context, canvasSize in
      let s = min(canvasSize.width, canvasSize.height)
      func rect(cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat) -> CGRect {
        CGRect(
          x: (cx - rx) * s,
          y: (cy - ry) * s,
          width: rx * 2 * s,
          height: ry * 2 * s
        )
      }
      // Normalized from the 1024 icon: O center (440, 512), outer 195×240,
      // stroke 92, period (753, 674) r 70.
      var donut = Path()
      donut.addEllipse(in: rect(cx: 440 / 1024, cy: 512 / 1024, rx: 195 / 1024, ry: 240 / 1024))
      donut.addEllipse(in: rect(cx: 440 / 1024, cy: 512 / 1024, rx: 103 / 1024, ry: 148 / 1024))
      context.fill(donut, with: .color(Theme.textStrong), style: FillStyle(eoFill: true))
      context.fill(
        Path(ellipseIn: rect(cx: 753 / 1024, cy: 674 / 1024, rx: 70 / 1024, ry: 70 / 1024)),
        with: .color(Theme.accent)
      )
    }
    .frame(width: size, height: size)
    .scaleEffect(breathe ? 1.04 : 1.0)
    .onAppear {
      guard !reduceMotion else { return }
      withAnimation(.easeInOut(duration: 3).repeatForever(autoreverses: true)) {
        breathe = true
      }
    }
    .accessibilityHidden(true)
  }
}

#Preview("OakBrandMark — light & dark") {
  func demo(_ scheme: ColorScheme) -> some View {
    VStack(spacing: 24) {
      OakBrandMark()
      OakBrandMark(size: 64)
    }
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.background)
    .environment(\.colorScheme, scheme)
  }
  return HStack(spacing: 0) {
    demo(.light)
    demo(.dark)
  }
}
