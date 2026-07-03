import SwiftUI

/// The animated voice orb — the focal element of ``VoiceOverlayView``, expressing
/// ``VoicePhase`` through motion and color instead of a bare spinner. A layered
/// gradient circle (the same "no Pokéball" language as ``OakBrandMark`` — no
/// bisecting band, no center button) with a mic glyph at its center.
///
/// Motion per phase: `connecting` spins the outer ring and shimmers the core;
/// `listening` breathes with a slow, gentle pulse; `thinking` shimmers (still,
/// no ring spin); `speaking` pulses faster and stronger; `ended`/`error` are
/// static, tinted to read as a terminal state.
///
/// **Accessibility (constraint 2):** every looping animation is gated on
/// `@Environment(\.accessibilityReduceMotion)` — Reduce Motion holds a static,
/// still-color-coded pose per phase. The orb is otherwise decorative (the
/// surrounding phase text carries the same information as prose), except it
/// carries `label` as its own accessibility label so VoiceOver announces the
/// phase at the orb itself, not only the text row beneath it.
struct VoiceOrbView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let phase: VoicePhase
  /// The current phase's user-facing label (shared with the overlay's status
  /// text via ``VoiceOverlayHelpers``), read here for VoiceOver.
  let label: String
  var size: CGFloat = 160

  @State private var pulse = false
  @State private var spin = false

  var body: some View {
    ZStack {
      Circle()
        .fill(
          RadialGradient(
            colors: [tintColor.opacity(glowOpacity), .clear],
            center: .center, startRadius: 0, endRadius: size * 0.62
          )
        )
        .frame(width: size * 1.24, height: size * 1.24)

      Circle()
        .strokeBorder(tintColor.opacity(0.35), lineWidth: 2)
        .frame(width: size * 0.86, height: size * 0.86)
        .rotationEffect(.degrees(spin ? 360 : 0))

      ZStack {
        Circle()
          .fill(
            LinearGradient(
              colors: [tintColor, tintColor.opacity(0.7)],
              startPoint: .topLeading, endPoint: .bottomTrailing
            )
          )
          .frame(width: size * 0.62, height: size * 0.62)
          .oakShadow(Theme.Shadow.glow(tintColor))

        Image(systemName: glyphName)
          .font(.system(size: size * 0.22, weight: .semibold))
          .foregroundStyle(.white)
      }
      .scaleEffect(pulse ? pulseScale : 1)
      .shimmer(active: shimmers && !reduceMotion)
    }
    .frame(width: size, height: size)
    .onAppear { restartAnimations() }
    .onChange(of: phase) { _, _ in restartAnimations() }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityAddTraits(.updatesFrequently)
  }

  // MARK: Phase → appearance

  private var tintColor: Color {
    switch phase {
    case .idle, .connecting, .listening: return Theme.accent
    case .thinking: return Theme.azure
    case .speaking: return Theme.accentActive
    case .ended: return Theme.textMuted
    case .error: return Theme.danger
    }
  }

  private var glyphName: String {
    switch phase {
    case .ended: return "mic.slash.fill"
    case .error: return "exclamationmark.triangle.fill"
    default: return "mic.fill"
    }
  }

  private var glowOpacity: Double {
    switch phase {
    case .ended: return 0.06
    case .error: return 0.18
    default: return 0.22
    }
  }

  private var pulseScale: CGFloat {
    switch phase {
    case .speaking: return 1.14
    case .listening: return 1.06
    default: return 1.0
    }
  }

  private var shimmers: Bool {
    phase == .connecting || phase == .thinking
  }

  // MARK: Motion

  /// Resets both loop flags synchronously (an un-animated snap back to rest),
  /// then re-arms whichever repeating animation the new phase calls for. The
  /// reset-then-rearm two-step is what lets a `repeatForever` animation restart
  /// cleanly on every phase change (a plain re-assignment mid-loop is a no-op).
  private func restartAnimations() {
    spin = false
    pulse = false
    guard !reduceMotion else { return }
    switch phase {
    case .connecting:
      withAnimation(.linear(duration: 2.2).repeatForever(autoreverses: false)) { spin = true }
    case .listening:
      withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { pulse = true }
    case .speaking:
      withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { pulse = true }
    case .idle, .thinking, .ended, .error:
      break
    }
  }
}

#if DEBUG
#Preview("Connecting") {
  VoiceOrbView(phase: .connecting, label: "Connecting…")
    .padding(40)
    .background(Theme.background)
}

#Preview("Listening") {
  VoiceOrbView(phase: .listening, label: "Listening…")
    .padding(40)
    .background(Theme.background)
}

#Preview("Thinking") {
  VoiceOrbView(phase: .thinking, label: "Checking my data…")
    .padding(40)
    .background(Theme.background)
}

#Preview("Speaking") {
  VoiceOrbView(phase: .speaking, label: "Speaking")
    .padding(40)
    .background(Theme.background)
}

#Preview("Ended") {
  VoiceOrbView(phase: .ended, label: "Ended")
    .padding(40)
    .background(Theme.background)
}

#Preview("Error") {
  VoiceOrbView(phase: .error, label: "Voice unavailable")
    .padding(40)
    .background(Theme.background)
}
#endif
