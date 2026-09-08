import AVFoundation
import Foundation
import Testing

@testable import OakApp

/// Pure gate for the composer mic button — sign-in and permission decide the
/// action; the view resigns keyboard focus before acting on `.start`.
struct VoiceMicGateTests {

  @Test
  func signedOutAlwaysNudgeSignInRegardlessOfPermission() {
    #expect(
      VoiceMicGate.action(voiceReady: false, permission: .granted) == .signIn
    )
    #expect(
      VoiceMicGate.action(voiceReady: false, permission: .denied) == .signIn
    )
    #expect(
      VoiceMicGate.action(voiceReady: false, permission: .undetermined) == .signIn
    )
  }

  @Test
  func signedInGrantedStartsVoice() {
    #expect(
      VoiceMicGate.action(voiceReady: true, permission: .granted) == .start
    )
  }

  @Test
  func signedInUndeterminedRequestsPermission() {
    #expect(
      VoiceMicGate.action(voiceReady: true, permission: .undetermined)
        == .requestPermission
    )
  }

  @Test
  func signedInDeniedOpensSettings() {
    #expect(
      VoiceMicGate.action(voiceReady: true, permission: .denied) == .openSettings
    )
  }
}
