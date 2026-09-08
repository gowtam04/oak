import AVFoundation
import Foundation

/// Kill switch for starting a realtime voice session from the composer.
/// Capture is off on iOS until the overlay is reliable; voice-origin answer
/// chrome (mic glyph, hydrate retry) stays so web-spoken turns still render.
enum VoiceCapture {
  static let isEnabled = false
}

/// The composer's mic-button decision, factored out of ``ComposerView`` so the
/// sign-in / permission / start branches are unit-testable without standing up
/// the composer or `AVAudioApplication`.
enum VoiceMicAction: Equatable, Sendable {
  /// Signed in and the microphone is granted — start voice mode.
  case start
  /// Signed-out tap — show the sign-in nudge.
  case signIn
  /// Microphone denied (or unknown) — send the user to Settings.
  case openSettings
  /// Permission has never been asked — request it, then start only if granted.
  case requestPermission
}

enum VoiceMicGate {
  /// Decide what a mic tap should do given sign-in state and the current
  /// record-permission. The composer resigns keyboard focus before acting on
  /// this, so a `.start` never presents the voice cover over a live first
  /// responder (which SwiftUI's `.fullScreenCover` will immediately tear down).
  static func action(
    voiceReady: Bool,
    permission: AVAudioApplication.recordPermission
  ) -> VoiceMicAction {
    guard voiceReady else { return .signIn }
    switch permission {
    case .granted: return .start
    case .undetermined: return .requestPermission
    case .denied: return .openSettings
    @unknown default: return .openSettings
    }
  }
}
