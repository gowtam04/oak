import SwiftUI

/// Compact jump list of pinned assistant cards (PIN-US-1). Hidden when empty.
struct PinStripView: View {
  let pins: [PinItem]
  let onJump: (String) -> Void
  let onUnpin: (String) -> Void

  struct PinItem: Identifiable, Equatable {
    var id: String { messageId }
    let messageId: String
    let title: String
  }

  var body: some View {
    if !pins.isEmpty {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: Theme.Spacing.sm) {
          ForEach(pins) { pin in
            HStack(spacing: 4) {
              Button {
                onJump(pin.messageId)
              } label: {
                Text(pin.title)
                  .font(Theme.body(.caption, weight: .medium))
                  .foregroundStyle(Theme.textStrong)
                  .lineLimit(1)
              }
              .accessibilityLabel("Jump to \(pin.title)")
              Button {
                onUnpin(pin.messageId)
              } label: {
                Image(systemName: "xmark")
                  .font(.system(size: 9, weight: .bold))
                  .foregroundStyle(Theme.textMuted)
              }
              .accessibilityLabel("Unpin \(pin.title)")
            }
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, 6)
            .background(Theme.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.separator, lineWidth: 1))
          }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.vertical, Theme.Spacing.xs)
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Pinned turns")
    }
  }
}
