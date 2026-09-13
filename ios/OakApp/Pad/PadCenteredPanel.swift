import SwiftUI

/// Where an artifact is shown on iPad (ADR-P5, P-CHAT-BR-3/4).
enum PadArtifactSurface: Equatable, Sendable {
  /// Chat destination trailing inspector.
  case inspector
  /// Companion artifacts outside Chat — centered over the workspace.
  case centered
}

/// Raised card over a workspace (companion artifacts, later auth/import).
/// Companion stays visible; destination switch dismisses via
/// ``PadShellModel/dismissCenteredPanels()`` (P-SHELL-AC-4.5, P-SHELL-AC-6.1).
struct PadCenteredPanel<Content: View>: View {
  var onDismiss: () -> Void
  var content: Content

  init(onDismiss: @escaping () -> Void, @ViewBuilder content: () -> Content) {
    self.onDismiss = onDismiss
    self.content = content()
  }

  var body: some View {
    ZStack {
      Theme.scrim
        .ignoresSafeArea()
        .onTapGesture(perform: onDismiss)
        .accessibilityLabel("Dismiss panel")
        .accessibilityAddTraits(.isButton)
      content
        .frame(maxWidth: PadLayout.readableProseWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .oakShadow(.raised)
        .padding(Theme.Spacing.xl)
        .accessibilityIdentifier("pad-centered-panel")
    }
    .accessibilityElement(children: .contain)
  }
}

extension View {
  /// Presents ``PadCenteredPanel`` while `item` is non-nil.
  func padCenteredPanel<Item: Identifiable, PanelContent: View>(
    item: Binding<Item?>,
    @ViewBuilder content: @escaping (Item) -> PanelContent
  ) -> some View {
    overlay {
      if let value = item.wrappedValue {
        PadCenteredPanel(onDismiss: { item.wrappedValue = nil }) {
          content(value)
        }
      }
    }
  }
}
