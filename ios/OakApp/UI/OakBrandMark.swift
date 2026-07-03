import SwiftUI

/// Oak's hero/empty-state mark — a soft radial-gradient disc with Oak's
/// wordmark glyph (a bold "O" ring, drawn natively) at its center and two thin
/// concentric rings. The glyph mirrors the app icon's own "O" (`icon.svg`),
/// so the mark reads as the same brand across surfaces. Empty states and the
/// auth/account headers layer their own sparkles and labels around it.
///
/// **Trademark (constraint 1):** no Pokéball geometry — no bisecting band, no
/// center button; just an O ring inside faint rings.
///
/// **Accessibility (constraint 2):** the slow 6s breathing scale (1.0 ↔ 1.04)
/// loops forever, so it's disabled under `@Environment(\.accessibilityReduceMotion)`.
/// The mark is decorative — the surrounding view carries the meaning — so it's
/// hidden from VoiceOver (M-AC-UI9.3).
struct OakBrandMark: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// The overall diameter in points (default 96).
  var size: CGFloat = 96

  @State private var breathe = false

  var body: some View {
    ZStack {
      Circle()
        .fill(
          RadialGradient(
            colors: [Theme.accent.opacity(0.18), .clear],
            center: .center,
            startRadius: 0,
            endRadius: size * 0.5
          )
        )
      Circle()
        .strokeBorder(Theme.separator, lineWidth: 1)
        .frame(width: size * 0.78, height: size * 0.78)
      Circle()
        .strokeBorder(Theme.separator, lineWidth: 1)
        .frame(width: size * 0.54, height: size * 0.54)
      // Mirrors the app icon's "O" (icon.svg: outer diameter 20/32 of its
      // canvas, stroke 4.6/20 of that diameter). The leaf's old footprint
      // (font-size 0.3 * size) is the glyph area here, so the diameter
      // keeps that footprint while the stroke keeps the icon's ~23% ratio.
      let oDiameter = size * 0.3
      Circle()
        .strokeBorder(Theme.accent, lineWidth: oDiameter * 0.23)
        .frame(width: oDiameter, height: oDiameter)
    }
    .frame(width: size, height: size)
    .scaleEffect(breathe ? 1.04 : 1.0)
    .onAppear {
      guard !reduceMotion else { return }
      // 3s each way, autoreversing → a 6s breathing cycle.
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
