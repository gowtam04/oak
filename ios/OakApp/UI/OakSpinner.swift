import SwiftUI

/// Oak's brand progress indicator — an abstract "scanner" of two concentric arcs
/// (accent + azure, unequal sweeps) rotating in opposite directions around a
/// small center dot. Replaces the bare `ProgressView` in streaming/loading
/// contexts.
///
/// **Trademark (constraint 1):** deliberately NOT a Pokéball — there is no
/// horizontal bisecting band and no center ring-button. It's two open arcs and a
/// dot, reading as instrumentation, not a game object.
///
/// **Accessibility (constraint 2):** the rotation loops forever, so under Reduce
/// Motion it falls back to a static `ProgressView`. Either way the view is
/// labeled "Loading" so VoiceOver announces the busy state (M-AC-UI9.3).
struct OakSpinner: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// The overall diameter in points (default 20).
  var size: CGFloat = 20

  @State private var spin = false

  var body: some View {
    Group {
      if reduceMotion {
        ProgressView()
      } else {
        ZStack {
          // Outer arc — accent, longer sweep, clockwise.
          Circle()
            .trim(from: 0, to: 0.65)
            .stroke(Theme.accent, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round))
            .rotationEffect(.degrees(spin ? 360 : 0))
          // Inner arc — azure, shorter sweep, counter-clockwise.
          Circle()
            .trim(from: 0, to: 0.35)
            .stroke(Theme.azure, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round))
            .frame(width: size * 0.6, height: size * 0.6)
            .rotationEffect(.degrees(spin ? -360 : 0))
          // Center dot.
          Circle()
            .fill(Theme.accent)
            .frame(width: size * 0.16, height: size * 0.16)
        }
        .frame(width: size, height: size)
        .onAppear {
          withAnimation(.linear(duration: 1.1).repeatForever(autoreverses: false)) {
            spin = true
          }
        }
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Text("Loading"))
    .accessibilityAddTraits(.updatesFrequently)
  }
}

#Preview("OakSpinner") {
  HStack(spacing: 28) {
    OakSpinner()
    OakSpinner(size: 32)
    OakSpinner(size: 48)
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.background)
}
