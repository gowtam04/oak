import SwiftUI

/// Oak's in-app brand tile — coral rounded square + white O ring, matching
/// `docs/design/prototypes/red-top-bar-assets/oak-mark.svg` (32×32, rx 7,
/// circle r 7.7, stroke 4.6 white).
///
/// This is the **lid / wordmark tile**, not the home-screen glyph (that is a
/// full-bleed 1024 square). Do not mount this on the chat empty landing.
///
/// **Accessibility:** the mark is decorative — the surrounding view carries
/// the meaning — so it's hidden from VoiceOver (M-AC-UI9.3).
struct OakBrandMark: View {
  /// The overall box in points (default 32 — the lid tile).
  var size: CGFloat = 32

  var body: some View {
    let corner = size * 7 / 32
    let ringDiameter = size * 7.7 / 16
    let stroke = size * 4.6 / 32
    ZStack {
      RoundedRectangle(cornerRadius: corner, style: .continuous)
        .fill(Theme.accent)
      Circle()
        .strokeBorder(Theme.onRed, lineWidth: stroke)
        .frame(width: ringDiameter, height: ringDiameter)
    }
    .frame(width: size, height: size)
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
