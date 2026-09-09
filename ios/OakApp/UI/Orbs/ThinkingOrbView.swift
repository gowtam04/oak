import SwiftUI

/// 20pt (or 64pt) dotted thinking mark. Geometry from ``OrbEngine``.
struct ThinkingOrbView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let state: OrbState
  var size: OrbSize = .px20
  var paused: Bool = false
  var live: Bool = true

  var body: some View {
    let side = CGFloat(size.rawValue)
    TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: paused || reduceMotion)) { context in
      let resolved = OrbEngine.resolve(state, size: size)
      let t = reduceMotion
        ? 0.6
        : context.date.timeIntervalSinceReferenceDate * resolved.speed
      Canvas { gc, _ in
        let frame = OrbEngine.frame(state: state, size: size, t: t)
        OrbCore.paint(frame, tint: Theme.accent, in: &gc)
      }
    }
    .frame(width: side, height: side)
    .opacity(live ? 1 : 0.55)
    .accessibilityHidden(true)
  }
}

#if DEBUG
#Preview("breathing") {
  ThinkingOrbView(state: .breathing)
    .padding(40)
    .background(Theme.background)
}
#endif
