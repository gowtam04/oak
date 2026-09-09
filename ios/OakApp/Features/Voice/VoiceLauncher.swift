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
  /// Guards ``endAndDismiss()`` so End + the resulting `.onDisappear` cannot
  /// `dismiss()` twice. Does **not** gate ``endSession()`` — a spurious
  /// disappear before `.task` assigns `session` must not lock out `start()`.
  @State private var dismissed = false

  var body: some View {
    Group {
      if let session {
        VoiceOverlayView(session: session, onEnd: endAndDismiss)
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
    // The session must not outlive the screen, but `.onDisappear` must NOT
    // dismiss the cover. SwiftUI fires disappear spuriously while presenting
    // `.fullScreenCover` (especially with the keyboard still up); calling
    // `dismiss()` there flips `isVoicePresented` back to false and the overlay
    // never stays up.
    .onDisappear { endSession() }
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

  /// Ends the realtime session if one exists. Idempotent at the session
  /// (`VoiceSession.end()`). Does not dismiss the cover — `.onDisappear` uses
  /// this so a spurious disappear cannot pop the overlay.
  private func endSession() {
    session?.end()
  }

  /// End button: tear the session down, then dismiss the cover. The
  /// `.onDisappear` that follows calls ``endSession()`` again, which is a no-op
  /// on an already-ended session.
  private func endAndDismiss() {
    guard !dismissed else { return }
    dismissed = true
    endSession()
    dismiss()
  }
}
