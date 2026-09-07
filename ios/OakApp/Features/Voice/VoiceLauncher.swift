import SwiftUI

/// The host-side glue for voice mode (T5): owns one ``VoiceSession`` for the
/// lifetime of its presentation, wires it from the live seams (the realtime
/// WebSocket + AVFoundation audio landed in T4), presents ``VoiceOverlayView``,
/// and guarantees the session tears down on every dismissal path.
///
/// Presented by ``ChatView`` via `.fullScreenCover(isPresented:)`; a fresh
/// `VoiceLauncher` — and a fresh `VoiceSession` — is built each time the cover
/// opens. `ChatView` observes the presentation binding and refreshes the thread
/// once it flips back to closed (the server appended the voice turns during the
/// session), so this view has no refresh responsibility of its own — only
/// starting and, above all, ending the session.
@MainActor
struct VoiceLauncher: View {
  let sessionId: String
  let format: Format

  @Environment(\.services) private var services
  @Environment(\.dismiss) private var dismiss

  @State private var session: VoiceSession?
  /// Guards ``finish()`` so a second call (End button, then the resulting
  /// `.onDisappear`, or vice versa) never re-enters teardown.
  @State private var finished = false

  var body: some View {
    Group {
      if let session {
        VoiceOverlayView(session: session, onEnd: finish)
      } else {
        // First frame only, before the `.task` below builds the session.
        Theme.canvas.ignoresSafeArea()
      }
    }
    .task {
      guard session == nil else { return }
      let built = makeSession()
      session = built
      await built.start()
    }
    // Belt-and-braces: whatever caused this view to go away — the End button's
    // `dismiss()`, a future interactive-dismiss affordance, or anything else —
    // the session must not outlive the screen. `finish()` is idempotent.
    .onDisappear { finish() }
  }

  /// Builds one live ``VoiceSession``: the audio IO is constructed first so its
  /// `onInterruption` can be wired to the session's `end()` right after — a
  /// phone-call (or similar) interruption must end the voice session, not just
  /// silently stop capturing.
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

  /// Ends the session (idempotent) and dismisses the cover. Called from the End
  /// button and from `.onDisappear`; the `finished` guard makes running it twice
  /// harmless.
  private func finish() {
    guard !finished else { return }
    finished = true
    session?.end()
    dismiss()
  }
}
