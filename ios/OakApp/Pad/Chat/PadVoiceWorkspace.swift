import SwiftUI

/// Voice takes over the Chat destination **thread canvas** (P-CHAT-US-5,
/// P-CHAT-AC-5.1). Same session/orb product as iPhone ``VoiceLauncher`` /
/// ``VoiceOverlayView``; not a `.fullScreenCover`, so the conversation list
/// may remain on wide layouts. Companion is not a Voice surface
/// (P-CHAT-AC-5.3). Guest gate stays signed-in only (P-CHAT-AC-5.4,
/// P-CHAT-BR-6).
///
/// The host owns ``VoiceSession`` in a `Binding` so rotation cannot tear the
/// session down. This view never ends the session on `.onDisappear`. End
/// happens on the End button (`onEnd`) or when the host leaves Chat / drops
/// presentation.
@MainActor
struct PadVoiceWorkspace: View {
  let sessionId: String
  let format: Format
  @Binding var session: VoiceSession?
  let onEnd: () -> Void

  @Environment(\.services) private var services

  var body: some View {
    Group {
      if let session {
        VoiceOverlayView(session: session, onEnd: onEnd)
      } else {
        Theme.canvas
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .clipped()
    .task {
      guard session == nil else { return }
      let built = makeSession()
      session = built
      await built.start()
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-voice-workspace")
  }

  /// Same live seams as ``VoiceLauncher/makeSession()``.
  private func makeSession() -> VoiceSession {
    let audio = LiveVoiceAudioIO()
    let newSession = VoiceSession(
      service: services.voice,
      connect: { url, subprotocol in LiveVoiceRealtimeConnection(url: url, subprotocol: subprotocol) },
      audio: audio,
      clock: LiveVoiceClock(),
      sessionId: sessionId,
      format: format
    )
    audio.onInterruption = { [weak newSession] in newSession?.end() }
    return newSession
  }
}
