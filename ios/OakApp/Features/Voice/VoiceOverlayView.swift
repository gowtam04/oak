import SwiftUI

/// The full-screen voice surface (T5) — presented via `.fullScreenCover` from
/// ``VoiceLauncher``. A native restyling of the web `VoiceOverlay`
/// (`web/src/components/voice/VoiceOverlay.tsx`): the orb, a phase status line,
/// live captions, the tool-activity ticker, an elapsed timer, and an End button.
///
/// **Dumb/renderable:** it does not construct or start the ``VoiceSession`` and
/// does not call `start()` — the host (``VoiceLauncher``) owns that lifecycle
/// and hands the session in already wired. `onEnd` fires on the user's explicit
/// End tap; the host is responsible for actually tearing the session down
/// (belt-and-braces — ``VoiceSession/end()`` is idempotent).
struct VoiceOverlayView: View {
  let session: VoiceSession
  let onEnd: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(spacing: 24) {
      Spacer(minLength: 12)

      VoiceOrbView(phase: session.phase, label: phaseLabel)

      Text(phaseLabel)
        .font(Theme.display(.title3))
        .foregroundStyle(session.phase == .error ? Theme.danger : Theme.textPrimary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .contentTransition(.opacity)
        .animation(reduceMotion ? nil : Theme.Motion.smooth, value: session.phase)

      captions

      if !session.toolActivities.isEmpty {
        toolTicker
      }

      Spacer(minLength: 12)

      timer

      endButton
    }
    .padding(.vertical, 32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // Opaque paper canvas — no material, no blur.
    .background(Theme.canvas.ignoresSafeArea())
  }

  private var phaseLabel: String {
    VoiceOverlayHelpers.phaseLabel(for: session.phase, errorMessage: session.errorMessage)
  }

  // MARK: Captions

  @ViewBuilder
  private var captions: some View {
    if !session.caption.user.isEmpty || !session.caption.assistant.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        if !session.caption.user.isEmpty {
          captionRow(who: "You", text: session.caption.user, isPrimary: false)
        }
        if !session.caption.assistant.isEmpty {
          captionRow(who: "Oak", text: session.caption.assistant, isPrimary: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(16)
      .oakCard(radius: Theme.Radius.md)
      .padding(.horizontal, 24)
    }
  }

  private func captionRow(who: String, text: String, isPrimary: Bool) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(who)
        .font(Theme.body(.caption, weight: .semibold))
        .foregroundStyle(Theme.textMuted)
      Text(text)
        .font(Theme.body(.body))
        .foregroundStyle(isPrimary ? Theme.textPrimary : Theme.textSecondary)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(who): \(text)")
  }

  // MARK: Tool ticker

  private var toolTicker: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: Theme.Spacing.sm) {
        ForEach(session.toolActivities) { activity in
          Text(VoiceOverlayHelpers.stripLeadingEmoji(activity.label))
            .instrumentLabel()
            .foregroundStyle(Theme.textSecondary)
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, Theme.Spacing.xs)
            .background(Theme.surface, in: Capsule())
            .transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))
        }
      }
      .padding(.horizontal, Theme.Spacing.xl)
      .animation(reduceMotion ? nil : Theme.Motion.snappy, value: session.toolActivities.count)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Tools used: \(session.toolActivities.map(\.label).joined(separator: ", "))")
  }

  // MARK: Timer

  @ViewBuilder
  private var timer: some View {
    if let startedAt = session.startedAt {
      TimelineView(.periodic(from: startedAt, by: 1)) { context in
        let elapsed = VoiceOverlayHelpers.formatElapsed(context.date.timeIntervalSince(startedAt))
        Text(elapsed)
          .font(Theme.mono(.footnote))
          .foregroundStyle(Theme.textMuted)
          .accessibilityLabel("Elapsed time \(elapsed)")
      }
    }
  }

  // MARK: End button

  private var endButton: some View {
    Button {
      Haptics.tap()
      onEnd()
    } label: {
      Text("End")
        .font(Theme.display(.headline))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Theme.danger, in: Capsule())
    }
    .buttonStyle(OakPressableButtonStyle())
    .padding(.horizontal, 32)
    .accessibilityLabel("End voice mode")
  }
}

// MARK: - Pure helpers (Swift-Testing covered, VoiceOverlayHelpersTests)

/// Pure presentation logic factored out of ``VoiceOverlayView`` so it is
/// unit-testable without standing up a real ``VoiceSession``.
enum VoiceOverlayHelpers {
  /// The status line for a phase, mirroring web's `PHASE_LABEL`
  /// (`VoiceOverlay.tsx`). `idle` reads the same as `connecting` — the overlay
  /// is only ever shown once a session is starting, so there is no meaningful
  /// "not yet connecting" state to distinguish. `error` prefers the session's
  /// own message, falling back to a generic one when none was set.
  static func phaseLabel(for phase: VoicePhase, errorMessage: String?) -> String {
    switch phase {
    case .idle, .connecting: return "Connecting…"
    case .listening: return "Listening…"
    case .thinking: return "Checking my data…"
    case .speaking: return "Speaking"
    case .ended: return "Ended"
    case .error: return errorMessage ?? "Voice unavailable"
    }
  }

  /// Formats an elapsed duration as `m:ss`, floored to the second and clamped
  /// at zero (a clock skew must never render a negative timer).
  static func formatElapsed(_ interval: TimeInterval) -> String {
    let total = max(0, Int(interval.rounded(.down)))
    let minutes = total / 60
    let seconds = total % 60
    return String(format: "%d:%02d", minutes, seconds)
  }

  /// Strips one or more leading emoji/pictograph Unicode scalars from `text` so the
  /// server's web-oriented labels (`"🤔 Reasoning…"`) render as clean instrument caps
  /// without the double-icon clash of emoji beside an SF symbol. Whitespace between
  /// the stripped emoji and the remaining text is trimmed. Non-emoji strings are
  /// returned unchanged.
  static func stripLeadingEmoji(_ text: String) -> String {
    var result = text[...]
    while let first = result.unicodeScalars.first,
          first.properties.isEmoji && first.value > 0x007E {
      result = result[result.index(after: result.startIndex)...]
    }
    return result.trimmingCharacters(in: .whitespaces)
  }
}
