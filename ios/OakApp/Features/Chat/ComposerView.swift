import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

/// The chat composer (chat-experience.md M-CHAT-US-1/5): a growing text field, a
/// send button, and (P8) image attach — the photo library (`PhotosPicker`) or the
/// camera (``CameraPicker``) behind one attach menu — with thumbnail/remove UI and
/// permission handling. Scope is no longer set here: the header scope chip
/// (`ChatView`) is the sole scope control (the Champions pill was removed).
///
/// It reads and writes the feature's ``ChatViewModel`` directly (a sibling view in
/// the same feature). All chat/turn logic lives in the view model; this view is
/// layout + bindings plus the local picker presentation state. Dynamic-Type styles
/// and semantic colors adapt to text size and light/dark.
struct ComposerView: View {
  let model: ChatViewModel

  @FocusState private var isInputFocused: Bool

  /// Drives the light-mode-only upward lift shadow (dark mode leans on the divider).
  @Environment(\.colorScheme) private var colorScheme
  /// Gates the focus/toggle/thumbnail motion (constraint 2).
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  // MARK: Image-attach local state (presentation only; staged images live on the VM)

  /// Selections from the SwiftUI photo-library picker, loaded into `UIImage`s and
  /// staged onto the view model, then cleared.
  @State private var photoSelections: [PhotosPickerItem] = []
  /// Drives the photo-library picker, opened from the attach menu's "Photo Library".
  @State private var isPhotosPickerPresented = false
  /// Presents the camera (``CameraPicker``) over the composer.
  @State private var isCameraPresented = false
  /// Receives the camera's captured photo, then staged onto the view model.
  @State private var cameraImage: UIImage?
  /// Drives the "camera access is off" alert (M-AC-5.6) when permission is denied.
  @State private var showCameraDeniedAlert = false
  /// A transient inline note, e.g. when the 4-image cap is reached (M-AC-5.2).
  @State private var attachNote: String?

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 8) {
      controlsRow(model: model)

      if let attachNote {
        Text(attachNote)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textMuted)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel(attachNote)
      }

      thumbnailRow(model: model)

      HStack(alignment: .bottom, spacing: 8) {
        TextField("Ask Oak a Pokémon question…", text: $model.composerText, axis: .vertical)
          .font(Theme.body(.body))
          .lineLimit(1...5)
          .textFieldStyle(.plain)
          .focused($isInputFocused)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.lg))
          // The border brightens to accent while focused (a color change, so it's kept
          // under Reduce Motion) — a subtle "you're typing here" cue.
          .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.lg)
              .strokeBorder(
                isInputFocused ? Theme.accent.opacity(0.4) : Theme.separator,
                lineWidth: 1
              )
          }
          .animation(Theme.Motion.snappy, value: isInputFocused)

        sendButton
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    // A frosted bar lifted off the thread with a hairline top divider and (light mode
    // only) a faint upward shadow; dark mode leans on the divider alone (constraint 6).
    .background {
      Rectangle()
        .fill(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
        .shadow(
          color: colorScheme == .dark ? .clear : .black.opacity(0.05),
          radius: 8, y: -3
        )
        .ignoresSafeArea(edges: .bottom)
    }
    .onChange(of: photoSelections) { _, items in
      guard !items.isEmpty else { return }
      Task { @MainActor in await stagePicked(items) }
    }
    .onChange(of: cameraImage) { _, image in
      guard let image else { return }
      let added = model.attachImages([image])
      attachNote = added == 0 ? Self.capReachedNote : nil
      cameraImage = nil
    }
    .photosPicker(
      isPresented: $isPhotosPickerPresented,
      selection: $photoSelections,
      maxSelectionCount: max(1, remainingSlots),
      matching: .images,
      photoLibrary: .shared()
    )
    .fullScreenCover(isPresented: $isCameraPresented) {
      CameraPicker(image: $cameraImage)
        .ignoresSafeArea()
    }
    .alert("Camera access is off", isPresented: $showCameraDeniedAlert) {
      Button("Open Settings") { openSettings() }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text(
        "Enable camera access in Settings to take a photo. You can still attach images from your photo library."
      )
    }
  }

  // MARK: Derived attach state

  private var remainingSlots: Int {
    max(0, ChatViewModel.maxAttachedImages - model.pendingImages.count)
  }

  /// Whether more images may be attached: under the cap and not mid-stream.
  private var canAttachMore: Bool {
    remainingSlots > 0 && !model.isStreaming
  }

  // MARK: Controls row — image attach

  @ViewBuilder
  private func controlsRow(model: ChatViewModel) -> some View {
    HStack(spacing: 12) {
      Spacer(minLength: 0)

      attachControls(model: model)
    }
  }

  // MARK: Image attach control (one menu → photo library / camera)

  /// A single attach affordance: a paperclip that fans out a menu with "Photo Library"
  /// and (on devices with a camera) "Take Photo". The library item opens the
  /// `.photosPicker(isPresented:)` modifier on the composer; the camera item runs the
  /// permission-gated ``presentCamera()``. Disabled at the 4-image cap / mid-stream.
  @ViewBuilder
  private func attachControls(model: ChatViewModel) -> some View {
    Menu {
      Button {
        isPhotosPickerPresented = true
      } label: {
        Label("Photo Library", systemImage: "photo.on.rectangle")
      }

      // Camera — only when the device has one (hidden on the Simulator).
      if UIImagePickerController.isSourceTypeAvailable(.camera) {
        Button {
          presentCamera()
        } label: {
          Label("Take Photo", systemImage: "camera")
        }
      }
    } label: {
      Image(systemName: "paperclip")
        .font(Theme.body(.title3))
        .symbolRenderingMode(.hierarchical)
    }
    .tint(Theme.accent)
    .disabled(!canAttachMore)
    .accessibilityLabel("Attach image")
  }

  // MARK: Attached-image thumbnails (with per-image remove)

  @ViewBuilder
  private func thumbnailRow(model: ChatViewModel) -> some View {
    if !model.pendingImages.isEmpty {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(Array(model.pendingImages.enumerated()), id: \.offset) { index, image in
            thumbnail(image: image, index: index, total: model.pendingImages.count, model: model)
              .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
          }
        }
        .padding(.vertical, 2)
        // Staged thumbnails pop in / out as they're attached or removed.
        .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.pendingImages.count)
      }
    }
  }

  private func thumbnail(
    image: UIImage,
    index: Int,
    total: Int,
    model: ChatViewModel
  ) -> some View {
    Image(uiImage: image)
      .resizable()
      .scaledToFill()
      .frame(width: 56, height: 56)
      .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
      .overlay(alignment: .topTrailing) {
        Button {
          model.removeImage(at: index)
          attachNote = nil
        } label: {
          Image(systemName: "xmark.circle.fill")
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, .black.opacity(0.55))
            .font(Theme.body(.body))
            .padding(2)
        }
        .accessibilityLabel("Remove attached image \(index + 1)")
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Attached image \(index + 1) of \(total)")
  }

  // MARK: Send

  @ViewBuilder
  private var sendButton: some View {
    Button {
      isInputFocused = false
      attachNote = nil
      Haptics.tap()
      model.send()
    } label: {
      // A filled accent disc. The glyph morphs to `stop.fill` while a turn streams —
      // a purely visual state cue; the button stays disabled (canSend is false), so
      // there is no cancel affordance, matching the VM contract.
      Image(systemName: model.isStreaming ? "stop.fill" : "arrow.up")
        .font(.system(.headline, design: .rounded).weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: 38, height: 38)
        .background(Theme.accent, in: Circle())
        .contentTransition(.symbolEffect(.replace))
        .opacity(model.canSend ? 1 : 0.4)
    }
    .buttonStyle(OakPressableButtonStyle())
    .disabled(!model.canSend)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.isStreaming)
    .accessibilityLabel("Send")
  }

  // MARK: Attach actions

  /// Loads picked library items into `UIImage`s and stages them on the view model,
  /// noting when some were dropped because the cap was reached (M-AC-5.2/5.3).
  @MainActor
  private func stagePicked(_ items: [PhotosPickerItem]) async {
    var images: [UIImage] = []
    for item in items {
      if let data = try? await item.loadTransferable(type: Data.self),
        let image = UIImage(data: data)
      {
        images.append(image)
      }
    }
    let added = model.attachImages(images)
    attachNote = added < images.count ? Self.capReachedNote : nil
    photoSelections = []
  }

  /// Presents the camera, requesting permission only on this explicit action
  /// (M-AC-5.6). When access is denied/restricted, surfaces the "enable in Settings"
  /// alert instead of a black capture screen; the library path stays available.
  private func presentCamera() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized, .notDetermined:
      // `.notDetermined` triggers the system permission prompt on first capture.
      isCameraPresented = true
    case .denied, .restricted:
      showCameraDeniedAlert = true
    @unknown default:
      showCameraDeniedAlert = true
    }
  }

  private func openSettings() {
    if let url = URL(string: UIApplication.openSettingsURLString) {
      UIApplication.shared.open(url)
    }
  }

  private static let capReachedNote =
    "You can attach up to \(ChatViewModel.maxAttachedImages) images."
}

#if DEBUG
#Preview("Composer") {
  VStack {
    Spacer()
    ComposerView(model: ChatViewModel(chat: PreviewChatService(), appState: AppState()))
  }
}
#endif
