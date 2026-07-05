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

  /// Fires once voice mode is actually clear to start: signed in AND the
  /// microphone permission gate passed. The mic button itself always renders
  /// (mirrors the attach button); a `nil` closure just makes a successful tap a
  /// no-op, which previews rely on.
  var onVoice: (() -> Void)? = nil
  /// Whether voice mode is available (signed in). Tunes the mic tap: ready taps
  /// run the permission gate; not-ready taps show the sign-in nudge.
  var voiceReady: Bool = false
  /// Presents the sign-in flow, invoked from the nudge alert's "Sign In" button.
  /// `nil` (a pushed signed-in thread, where `voiceReady` is always true and this
  /// path is unreachable) collapses the nudge alert to a single "OK".
  var onSignInNudge: (() -> Void)? = nil
  /// A toggle whose *change* fires one send-button scale pulse — bumped by an
  /// example-chip tap so the eye lands on the action (§4.01). Ignored under Reduce
  /// Motion (the caller only toggles it when motion is allowed).
  var sendPulse: Bool = false

  @FocusState private var isInputFocused: Bool

  /// Drives the one-shot send-button scale pulse, flipped on for a beat when
  /// ``sendPulse`` changes and released by ``Theme/Motion/snappy``.
  @State private var isPulsing = false

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

  // MARK: Voice local state

  /// Drives the "microphone access is off" alert when permission is denied.
  @State private var showMicDeniedAlert = false
  /// Drives the "sign in to use voice mode" nudge for a signed-out tap.
  @State private var showVoiceSignInAlert = false

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 8) {
      if let attachNote {
        Text(attachNote)
          .font(Theme.body(.caption))
          .foregroundStyle(Theme.textMuted)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel(attachNote)
      }

      thumbnailRow(model: model)

      HStack(alignment: .bottom, spacing: 8) {
        attachControls(model: model)
        if Self.showsVoiceControl {
          voiceControl(model: model)
        }

        TextField("Ask Oak a Pokémon question…", text: $model.composerText, axis: .vertical)
          .font(Theme.body(.body))
          .lineLimit(1...5)
          .textFieldStyle(.plain)
          .focused($isInputFocused)
          .padding(.horizontal, Theme.Spacing.md)
          .padding(.vertical, Theme.Spacing.sm)
          .background(Theme.surfaceSunken, in: RoundedRectangle(cornerRadius: Theme.Radius.lg))
          // Focus grammar (§4.2): the border + soft glow turn **azure** while
          // focused (interaction), and **red** while a turn streams (the live
          // state) — so red stays meaningful. Color changes, kept under Reduce
          // Motion.
          .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.lg)
              .strokeBorder(fieldBorderColor, lineWidth: fieldBorderWidth)
          }
          .shadow(color: fieldGlowColor, radius: 6)
          .animation(Theme.Motion.snappy, value: isInputFocused)
          .animation(Theme.Motion.snappy, value: model.isStreaming)

        sendButton
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    // A frosted bar lifted off the thread: the keyboard blur (`.ultraThinMaterial`)
    // tinted toward Oak's **canvas** so it reads warm paper, not cool system gray,
    // against the cream thread (§4.2). A themed hairline top edge and (light mode
    // only) a faint upward shadow; dark mode leans on the hairline alone.
    .background {
      Rectangle()
        .fill(.ultraThinMaterial)
        .overlay(Theme.canvas.opacity(0.7))
        .overlay(alignment: .top) {
          Rectangle().fill(Theme.separator).frame(height: 1)
        }
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
    .alert("Microphone access is off", isPresented: $showMicDeniedAlert) {
      Button("Open Settings") { openSettings() }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("Enable microphone access in Settings to use voice mode.")
    }
    .alert("Sign in required", isPresented: $showVoiceSignInAlert) {
      if let onSignInNudge {
        Button("Sign In") { onSignInNudge() }
        Button("Cancel", role: .cancel) {}
      } else {
        Button("OK", role: .cancel) {}
      }
    } message: {
      Text("Sign in to use voice mode.")
    }
  }

  // MARK: Composer field focus grammar (§4.2)

  /// Red while streaming (the live state), azure while focused (interaction),
  /// hairline otherwise. Red is never the focus color.
  private var fieldBorderColor: Color {
    if model.isStreaming { return Theme.accent }
    if isInputFocused { return Theme.azure }
    return Theme.separator
  }

  private var fieldBorderWidth: CGFloat {
    model.isStreaming || isInputFocused ? 1.5 : 1
  }

  /// The soft focus/live glow — azure when focused, red when streaming, none at rest.
  private var fieldGlowColor: Color {
    if model.isStreaming { return Theme.accent.opacity(0.28) }
    if isInputFocused { return Theme.azure.opacity(0.28) }
    return .clear
  }

  // MARK: Derived attach state

  private var remainingSlots: Int {
    max(0, ChatViewModel.maxAttachedImages - model.pendingImages.count)
  }

  /// Whether more images may be attached: under the cap and not mid-stream.
  private var canAttachMore: Bool {
    remainingSlots > 0 && !model.isStreaming
  }

  /// Voice mode is temporarily hidden from the composer (kept implemented); flip to
  /// re-show. Everything downstream (``voiceControl(model:)``, ``handleMicTap()``,
  /// the mic/sign-in alerts, `onVoice`/`voiceReady`/`onSignInNudge`) stays wired and
  /// compiled — this is the single gate.
  private static let showsVoiceControl = false

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
        .frame(width: 38, height: 38)
    }
    .tint(Theme.accent)
    .disabled(!canAttachMore)
    .accessibilityLabel("Attach image")
  }

  // MARK: Voice control (mic button)

  /// The mic button: always visible (matches the attach control), disabled only
  /// mid-stream. A tap runs ``handleMicTap()``, which branches on sign-in state
  /// and then the microphone permission before ever calling ``onVoice``.
  @ViewBuilder
  private func voiceControl(model: ChatViewModel) -> some View {
    Button {
      Haptics.tap()
      handleMicTap()
    } label: {
      Image(systemName: "mic.fill")
        .font(Theme.body(.title3))
        .symbolRenderingMode(.hierarchical)
    }
    // At rest the mic is quiet `textSecondary` — red is reserved for *live* recording,
    // which happens in the voice overlay, not here (§4.02: red = live, not "audio
    // exists").
    .tint(Theme.textSecondary)
    .disabled(model.isStreaming)
    .accessibilityLabel(voiceReady ? "Start voice mode" : "Sign in to use voice mode")
  }

  /// Signed-out taps show the sign-in nudge; signed-in taps run the same
  /// permission-gate shape as ``presentCamera()`` but for the microphone
  /// (`AVAudioApplication`, iOS 17+): granted fires ``onVoice`` immediately,
  /// undetermined requests permission and fires ``onVoice`` only if granted, and
  /// denied shows the "enable in Settings" alert.
  private func handleMicTap() {
    guard voiceReady else {
      showVoiceSignInAlert = true
      return
    }
    switch AVAudioApplication.shared.recordPermission {
    case .granted:
      onVoice?()
    case .undetermined:
      AVAudioApplication.requestRecordPermission { granted in
        Task { @MainActor in
          if granted { onVoice?() }
        }
      }
    case .denied:
      showMicDeniedAlert = true
    @unknown default:
      showMicDeniedAlert = true
    }
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

  /// Whether the send disc is in its filled-coral active state: a turn is
  /// streaming (tap = stop) or there's something to send.
  private var discActive: Bool {
    model.isStreaming || model.canSend
  }

  @ViewBuilder
  private var sendButton: some View {
    Button {
      Haptics.tap()
      if model.isStreaming {
        // Stop the in-flight turn (quick-stop restores this text; a later stop keeps
        // the answer-less turn) — see `ChatViewModel.stopStreaming()`.
        model.stopStreaming()
      } else {
        isInputFocused = false
        attachNote = nil
        model.send()
      }
    } label: {
      // The 44pt send disc (§4.2). Active (has text, or streaming so a tap stops
      // the turn) → coral fill, white glyph, full size. Empty → the disc shrinks
      // to 0.85 and fills `surfaceSunken` with a faint glyph, reading as "nothing
      // to send yet." The glyph morphs to `stop.fill` while a turn streams.
      Image(systemName: model.isStreaming ? "stop.fill" : "arrow.up")
        .font(.system(.headline, design: .rounded).weight(.semibold))
        .foregroundStyle(discActive ? Color.white : Theme.textMuted)
        .frame(width: 44, height: 44)
        .background(discActive ? Theme.accent : Theme.surfaceSunken, in: Circle())
        .contentTransition(.symbolEffect(.replace))
        // One-shot pulse when an example chip fills the composer (§4.01); otherwise
        // full size when active, 0.85 when empty.
        .scaleEffect(isPulsing ? 1.18 : (discActive ? 1 : 0.85))
    }
    .buttonStyle(OakPressableButtonStyle())
    .disabled(!model.isStreaming && !model.canSend)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.isStreaming)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: model.canSend)
    .animation(reduceMotion ? nil : Theme.Motion.snappy, value: isPulsing)
    // A chip tap toggles `sendPulse`; bump the scale on, then release it a beat later
    // so the button springs once. Skipped entirely under Reduce Motion.
    .onChange(of: sendPulse) { _, _ in
      guard !reduceMotion else { return }
      isPulsing = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { isPulsing = false }
    }
    .accessibilityLabel(model.isStreaming ? "Stop" : "Send")
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
