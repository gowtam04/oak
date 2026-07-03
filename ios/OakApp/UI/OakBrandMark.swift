import SwiftUI

/// Oak's hero/empty-state mark — a soft radial-gradient disc with a `leaf.fill`
/// SF Symbol at its center and two thin concentric rings. The botanical/scholarly
/// motif is Oak's own brand (constraint 1): a growing sprig, not any trademarked
/// game imagery. Empty states and the auth/account headers layer their own
/// sparkles and labels around it.
///
/// **Trademark (constraint 1):** no Pokéball geometry — no bisecting band, no
/// center button; just a leaf inside faint rings.
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
      Image(systemName: "leaf.fill")
        .font(.system(size: size * 0.3))
        .foregroundStyle(Theme.accent)
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
