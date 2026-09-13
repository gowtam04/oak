import SwiftUI

/// Destination canvas. Chat, Teams, Dex, Usage, Calc, and Settings are live.
struct PadDestinationHost: View {
  var destination: PadDestination
  var chatModel: ChatViewModel
  var shell: PadShellModel
  /// Window-level mode from ``PadRootView`` (not destination-pane remaining width).
  var layoutMode: PadLayoutMode
  var onSignIn: () -> Void
  var onCloseCalc: (() -> Void)?
  var onStartVoice: () -> Void = {}
  var isVoicePresented: Bool = false
  var onEndVoice: () -> Void = {}
  var voiceSession: Binding<VoiceSession?> = .constant(nil)

  var body: some View {
    Group {
      switch destination {
      case .chat:
        PadChatDestination(
          model: chatModel,
          shell: shell,
          layoutMode: layoutMode,
          onSignIn: onSignIn,
          onStartVoice: onStartVoice,
          isVoicePresented: isVoicePresented,
          onEndVoice: onEndVoice,
          voiceSession: voiceSession
        )
      case .teams:
        PadTeamsWorkbench(
          shell: shell,
          layoutMode: layoutMode
        )
      case .dex:
        PadDexSplit(
          shell: shell,
          layoutMode: layoutMode
        )
      case .usage:
        PadUsageSplit(
          shell: shell,
          layoutMode: layoutMode
        )
      case .settings:
        PadSettingsSplit(
          shell: shell,
          layoutMode: layoutMode,
          onSignIn: onSignIn
        )
      case .calc(let scenario):
        PadCalcWorkspace(
          shell: shell,
          chatModel: chatModel,
          layoutMode: layoutMode,
          scenario: scenario,
          onClose: { onCloseCalc?() }
        )
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("pad-destination")
  }
}
