import UIKit

/// Thin, stateless wrapper over UIKit's feedback generators — Oak's single entry
/// point for tactile feedback.
///
/// Haptics are a **redundant** channel: every moment that fires one (send,
/// answer arrival, save success, auth error) also has a visible/audible cue, so
/// removing haptics never removes meaning (M-AC-UI9.3). The generators are
/// `@MainActor`-bound (constraint 4), so the whole enum is `@MainActor`.
///
/// No stored state — each call constructs a generator, prepares, and fires. That
/// costs a touch of latency versus a warmed singleton, but keeps this trivially
/// safe under strict concurrency and avoids retaining generators. In SwiftUI
/// previews the calls are skipped (`XCODE_RUNNING_FOR_PREVIEWS`) so canvas
/// interaction stays silent.
@MainActor
enum Haptics {
  /// A light selection/confirmation tap — sending a message, selecting a chip.
  static func tap() {
    guard isEnabled else { return }
    let generator = UIImpactFeedbackGenerator(style: .light)
    generator.prepare()
    generator.impactOccurred()
  }

  /// A positive "it worked" pattern — answer arrived, team saved, signed in.
  static func success() { notify(.success) }

  /// A cautionary pattern — a destructive confirmation opening, a legality warning.
  static func warning() { notify(.warning) }

  /// A failure pattern — a wrong OTP code, a submission error.
  static func error() { notify(.error) }

  private static func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
    guard isEnabled else { return }
    let generator = UINotificationFeedbackGenerator()
    generator.prepare()
    generator.notificationOccurred(type)
  }

  /// False inside the SwiftUI preview canvas, where firing haptics is pointless
  /// and noisy.
  private static var isEnabled: Bool {
    ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == nil
  }
}
