import SwiftUI

/// Press style for Oak's enamel floating-action disc (Chat new-chat, Teams add-team).
/// 0.94 scale while held, springing with `Theme.Motion.snappy`. Scale is dropped
/// under Reduce Motion; the opacity dim still fires.
struct FloatingActionButtonStyle: ButtonStyle {
  let reduceMotion: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.94 : 1)
      .opacity(configuration.isPressed ? 0.92 : 1)
      .animation(Theme.Motion.snappy, value: configuration.isPressed)
  }
}
