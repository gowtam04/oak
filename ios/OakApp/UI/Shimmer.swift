import SwiftUI

/// A repeating diagonal light sweep, masked to the content it modifies — the
/// "something is working / loading" shimmer used on the streaming status label
/// and on skeleton placeholders.
///
/// Accessibility (constraint 2): the sweep is a looping animation, so it stops
/// entirely under `@Environment(\.accessibilityReduceMotion)` — and it's a
/// no-op when `active` is false. In both cases the content renders untouched.
/// Skeletons pair this with their own static dimming for the reduced state (see
/// `Skeleton.swift`).
struct ShimmerModifier: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Whether the shimmer should animate. Kept as a parameter so callers can bind
  /// it to a "is streaming / is loading" flag without adding/removing the modifier.
  var active: Bool

  @State private var sweep = false

  func body(content: Content) -> some View {
    if active && !reduceMotion {
      content
        .overlay {
          GeometryReader { geo in
            let width = geo.size.width
            LinearGradient(
              stops: [
                .init(color: .clear, location: 0),
                .init(color: .white.opacity(0.6), location: 0.5),
                .init(color: .clear, location: 1),
              ],
              startPoint: .leading,
              endPoint: .trailing
            )
            .frame(width: width * 0.7)
            .offset(x: sweep ? width : -width * 0.7)
            .blendMode(.plusLighter)
          }
          .allowsHitTesting(false)
        }
        // Constrain the sweep to the content's silhouette (text glyphs, skeleton shape).
        .mask(content)
        .onAppear {
          withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) {
            sweep = true
          }
        }
    } else {
      content
    }
  }
}

extension View {
  /// Sweeps a repeating diagonal highlight across the view (≈1.6s cycle) while
  /// `active`. No-op when `active` is false or Reduce Motion is on.
  func shimmer(active: Bool = true) -> some View {
    modifier(ShimmerModifier(active: active))
  }
}

#Preview("Shimmer") {
  VStack(alignment: .leading, spacing: 20) {
    Text("Consulting the Pokédex…")
      .font(Theme.body(.headline))
      .shimmer()
    RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
      .fill(Theme.textPrimary.opacity(0.08))
      .frame(height: 44)
      .shimmer()
  }
  .padding()
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.background)
}
