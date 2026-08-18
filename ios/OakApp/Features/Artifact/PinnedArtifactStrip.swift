import SwiftUI
import Observation

/// Conversation pin strip (PIN-US-1–3). Hidden when empty or guest.
@MainActor
@Observable
final class PinnedArtifactStripViewModel {
  private(set) var pins: [PinnedArtifactSummary] = []

  var isVisible: Bool { isSignedIn && !pins.isEmpty }

  private let service: any ArtifactPinService
  private let isSignedIn: Bool
  private let conversationId: String

  init(
    pins: any ArtifactPinService,
    isSignedIn: Bool,
    conversationId: String
  ) {
    self.service = pins
    self.isSignedIn = isSignedIn
    self.conversationId = conversationId
  }

  func load() async {
    guard isSignedIn else {
      pins = []
      return
    }
    pins = await service.list(conversationId: conversationId)
  }

  func open(id: String) async -> Artifact? {
    await service.get(conversationId: conversationId, pinId: id)
  }

  func unpin(id: String) async {
    pins = await service.delete(conversationId: conversationId, pinId: id)
  }
}

struct PinnedArtifactStrip: View {
  @Bindable var model: PinnedArtifactStripViewModel
  var onOpen: (Artifact) -> Void

  var body: some View {
    if model.isVisible {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: Theme.Spacing.sm) {
          ForEach(model.pins) { pin in
            HStack(spacing: 4) {
              Button {
                Task {
                  if let artifact = await model.open(id: pin.id) {
                    onOpen(artifact)
                  }
                }
              } label: {
                Text(pin.title)
                  .font(Theme.body(.caption, weight: .medium))
                  .foregroundStyle(Theme.textStrong)
                  .lineLimit(1)
              }
              .accessibilityLabel(pin.title)
              Button {
                Task { await model.unpin(id: pin.id) }
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
      .accessibilityLabel("Pinned artifacts")
    }
  }
}
