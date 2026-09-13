import SwiftUI
import UniformTypeIdentifiers
import UIKit

/// Wraps iPhone ``ComposerView`` with drag-and-drop image attach
/// (P-CHAT-US-4, P-SHELL-AC-7.3–7.4). Library and camera stay in
/// ``ComposerView`` — this host does not add iPad-only chrome there.
struct PadComposerHost: View {
  let model: ChatViewModel
  var onVoice: (() -> Void)? = nil
  var voiceReady: Bool = false
  var onSignInNudge: (() -> Void)? = nil
  var sendPulse: Bool = false
  var contextChip: PadContextChip? = nil
  var onDismissChip: (() -> Void)? = nil
  @FocusState.Binding var isInputFocused: Bool

  /// Visible drop rejection (fifth image / non-image). Uses the existing
  /// ``ChatViewModel/imageRejectedMessage(_:)`` copy.
  @State private var dropNote: String?
  @State private var chipSend = ChipSendCoordinator()

  var body: some View {
    VStack(spacing: 0) {
      if let dropNote {
        Text(dropNote)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.warning)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 12)
          .padding(.top, 8)
          .accessibilityLabel(dropNote)
      }
      if let contextChip {
        PadContextChipView(chip: contextChip, onDismiss: dismissChip)
          .padding(.horizontal, Theme.Spacing.md)
          .padding(.top, Theme.Spacing.sm)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      ComposerView(
        model: model,
        onVoice: onVoice,
        voiceReady: voiceReady,
        onSignInNudge: onSignInNudge,
        sendPulse: sendPulse,
        isInputFocused: $isInputFocused
      )
    }
    .background(Theme.canvas)
    .onDrop(of: [UTType.image, UTType.fileURL], isTargeted: nil, perform: handleDrop)
    .onChange(of: model.pendingImages.count) { _, _ in
      dropNote = nil
    }
    .onAppear { bindChipSend() }
    .onChange(of: contextChip) { _, chip in
      chipSend.chip = chip
      if chip == nil {
        model.extraMentionedTeamIds = []
      }
    }
  }

  /// Pure mapping: ``ChatViewModel/send()`` applies this to a local copy and
  /// commits extras only if the stream starts.
  private func bindChipSend() {
    chipSend.chip = contextChip
    model.prepareOutgoingSend = { [chipSend] message in
      chipSend.mapped(from: message)
    }
  }

  private func dismissChip() {
    model.extraMentionedTeamIds = []
    onDismissChip?()
  }

  /// Preflight, then load + ``ChatViewModel/attachImages``. Rejects the whole
  /// drop when any item is a known non-image or the cap would be exceeded —
  /// nothing is silently attached (P-SHELL-AC-7.4).
  private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
    guard !providers.isEmpty, !model.isStreaming else { return false }
    if providers.contains(where: { PadImageDrop.isKnownNonImage($0) }) {
      dropNote = PadImageDrop.message(for: .notImage)
      return true
    }
    if let rejection = PadImageDrop.validate(
      incomingCount: providers.count,
      alreadyAttached: model.pendingImages.count
    ) {
      dropNote = PadImageDrop.message(for: rejection)
      return true
    }
    Task { await ingest(providers) }
    return true
  }

  @MainActor
  private func ingest(_ providers: [NSItemProvider]) async {
    let images = await loadImages(from: providers)
    if let rejection = PadImageDrop.applyLoadedImages(
      images, providerCount: providers.count, to: model
    ) {
      dropNote = PadImageDrop.message(for: rejection)
      return
    }
    dropNote = nil
  }

  private func loadImages(from providers: [NSItemProvider]) async -> [UIImage] {
    var images: [UIImage] = []
    images.reserveCapacity(providers.count)
    for provider in providers {
      if let image = await loadImage(from: provider) {
        images.append(image)
      }
    }
    return images
  }

  private func loadImage(from provider: NSItemProvider) async -> UIImage? {
    if provider.canLoadObject(ofClass: UIImage.self) {
      return await withCheckedContinuation { continuation in
        _ = provider.loadObject(ofClass: UIImage.self) { object, _ in
          continuation.resume(returning: object as? UIImage)
        }
      }
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      return await withCheckedContinuation { continuation in
        provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
          continuation.resume(returning: data.flatMap(UIImage.init(data:)))
        }
      }
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
      return await loadImage(fromFileURLProvider: provider)
    }
    return nil
  }

  private func loadImage(fromFileURLProvider provider: NSItemProvider) async -> UIImage? {
    await withCheckedContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
        let url: URL?
        if let itemURL = item as? URL {
          url = itemURL
        } else if let data = item as? Data {
          url = URL(dataRepresentation: data, relativeTo: nil)
        } else {
          url = nil
        }
        guard let url else {
          continuation.resume(returning: nil)
          return
        }
        let accessed = url.startAccessingSecurityScopedResource()
        defer {
          if accessed { url.stopAccessingSecurityScopedResource() }
        }
        if let type = UTType(filenameExtension: url.pathExtension),
          !PadImageDrop.isImageType(uti: type.identifier)
        {
          continuation.resume(returning: nil)
          return
        }
        let image = (try? Data(contentsOf: url)).flatMap(UIImage.init(data:))
        continuation.resume(returning: image)
      }
    }
  }
}

/// Holds the live chip so ``ChatViewModel/send()`` can map a local copy
/// without capturing the view or mutating composer state.
@MainActor
private final class ChipSendCoordinator {
  var chip: PadContextChip?

  func mapped(from message: String) -> (text: String, mentionedTeamIds: [String]?) {
    chip.apply(to: message)
  }
}
