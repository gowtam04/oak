import Foundation
import Testing

@testable import OakApp

/// Unit tests for `VoiceOverlayHelpers` — the pure presentation logic factored
/// out of `VoiceOverlayView` (phase → status-line copy, and the m:ss elapsed
/// formatter driving its `TimelineView` timer).
struct VoiceOverlayHelpersTests {

  // MARK: phaseLabel

  @Test
  func idleAndConnectingShareTheConnectingLabel() {
    #expect(VoiceOverlayHelpers.phaseLabel(for: .idle, errorMessage: nil) == "Connecting…")
    #expect(VoiceOverlayHelpers.phaseLabel(for: .connecting, errorMessage: nil) == "Connecting…")
  }

  @Test
  func eachLivePhaseHasItsOwnLabel() {
    #expect(VoiceOverlayHelpers.phaseLabel(for: .listening, errorMessage: nil) == "Listening…")
    #expect(VoiceOverlayHelpers.phaseLabel(for: .thinking, errorMessage: nil) == "Checking my data…")
    #expect(VoiceOverlayHelpers.phaseLabel(for: .speaking, errorMessage: nil) == "Speaking")
    #expect(VoiceOverlayHelpers.phaseLabel(for: .ended, errorMessage: nil) == "Ended")
  }

  @Test
  func errorPhasePrefersTheSessionsOwnMessage() {
    #expect(
      VoiceOverlayHelpers.phaseLabel(for: .error, errorMessage: "Sign in to use voice mode.")
        == "Sign in to use voice mode."
    )
  }

  @Test
  func errorPhaseFallsBackToAGenericMessageWhenNoneIsSet() {
    #expect(VoiceOverlayHelpers.phaseLabel(for: .error, errorMessage: nil) == "Voice unavailable")
  }

  // MARK: formatElapsed

  @Test
  func formatElapsedFloorsToTheSecond() {
    #expect(VoiceOverlayHelpers.formatElapsed(0) == "0:00")
    #expect(VoiceOverlayHelpers.formatElapsed(5.9) == "0:05")
    #expect(VoiceOverlayHelpers.formatElapsed(59.999) == "0:59")
  }

  @Test
  func formatElapsedRollsMinutesAndZeroPadsSeconds() {
    #expect(VoiceOverlayHelpers.formatElapsed(60) == "1:00")
    #expect(VoiceOverlayHelpers.formatElapsed(65) == "1:05")
    #expect(VoiceOverlayHelpers.formatElapsed(3600) == "60:00")
  }

  @Test
  func formatElapsedClampsAClockSkewToZeroRatherThanGoingNegative() {
    #expect(VoiceOverlayHelpers.formatElapsed(-4) == "0:00")
  }

  // MARK: stripLeadingEmoji

  @Test
  func stripLeadingEmojiRemovesSingleLeadingEmoji() {
    // The server sends labels like "🤔 Reasoning…" — strip the emoji and whitespace.
    #expect(VoiceOverlayHelpers.stripLeadingEmoji("🤔 Reasoning…") == "Reasoning…")
  }

  @Test
  func stripLeadingEmojiRemovesMultipleLeadingEmoji() {
    #expect(VoiceOverlayHelpers.stripLeadingEmoji("🔍🗂 Lookup") == "Lookup")
  }

  @Test
  func stripLeadingEmojiLeavesPlainTextUnchanged() {
    // Non-emoji labels (e.g. already-clean server output) pass through verbatim.
    #expect(VoiceOverlayHelpers.stripLeadingEmoji("GET_POKEMON · GARCHOMP") == "GET_POKEMON · GARCHOMP")
  }

  @Test
  func stripLeadingEmojiHandlesEmptyString() {
    #expect(VoiceOverlayHelpers.stripLeadingEmoji("") == "")
  }

  @Test
  func stripLeadingEmojiLeavesTrailingEmojiIntact() {
    // Only leading emoji are stripped; interior/trailing emoji stay.
    #expect(VoiceOverlayHelpers.stripLeadingEmoji("Thinking 🧠") == "Thinking 🧠")
  }
}
