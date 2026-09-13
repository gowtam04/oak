import Foundation
import Testing
import UIKit
import UniformTypeIdentifiers

@testable import OakApp

/// Pins `PadImageDrop` drop-preflight (api-design.md drag-and-drop; P-SHELL-AC-7.3–7.4).
/// Pure helper the implementer must add in `PadComposerHost.swift` or
/// `ios/OakApp/Pad/Chat/PadImageDrop.swift`.
///
/// Expected API:
///   `enum PadImageDrop {`
///     `enum Rejection: Equatable { case tooMany, notImage }`
///     `static func validate(incomingCount: Int, alreadyAttached: Int,`
///       `maxAttached: Int = ChatViewModel.maxAttachedImages) -> Rejection?`
///     `static func isImageType(uti: String) -> Bool`
///   `}`
/// `validate` nil = accept (caller still uses `ChatViewModel.attachImages`).
/// Fifth image / a drop that would exceed 4 → `.tooMany`. Non-image UTI →
/// `isImageType` false; host maps that to `.notImage` (P-SHELL-AC-7.4).
///
/// Not encoded here:
///   P-CHAT-AC-4.1 library/camera chrome — existing `ComposerView` (unchanged)
///   P-CHAT-AC-4.2 thumbnail remove UI
///   P-CHAT-AC-4.3 permission-on-use copy — iPhone attach path
///
/// Requirement refs: P-CHAT-US-4, P-CHAT-AC-4.1–4.4, P-SHELL-AC-7.3,
/// P-WF-US-7, P-WF-AC-7.1–7.2.
@MainActor
struct PadImageDropTests {

  // MARK: Helpers

  private func makeViewModel() -> ChatViewModel {
    ChatViewModel(chat: FakeChatService(), appState: AppState(), usesBackgroundGrace: false)
  }

  private func sampleImage() -> UIImage {
    UIImage(systemName: "photo") ?? UIImage()
  }

  // MARK: Cap (P-CHAT-AC-4.3, P-SHELL-AC-7.3–7.4, P-WF-AC-7.1–7.2)

  @Test
  func maxAttachedImagesIsFour() {
    #expect(ChatViewModel.maxAttachedImages == 4)
  }

  @Test
  func oneIncomingOnEmptyComposerIsAccepted() {
    #expect(PadImageDrop.validate(incomingCount: 1, alreadyAttached: 0) == nil)
  }

  @Test
  func fifthImageIsRejectedAsTooMany() {
    #expect(
      PadImageDrop.validate(incomingCount: 1, alreadyAttached: 4) == .tooMany)
  }

  @Test
  func twoIncomingWhenThreeAttachedIsRejectedAsTooMany() {
    #expect(
      PadImageDrop.validate(incomingCount: 2, alreadyAttached: 3) == .tooMany)
  }

  @Test
  func fillingTheRemainingSlotIsAccepted() {
    #expect(PadImageDrop.validate(incomingCount: 1, alreadyAttached: 3) == nil)
    #expect(PadImageDrop.validate(incomingCount: 4, alreadyAttached: 0) == nil)
  }

  @Test
  func fiveIncomingOnEmptyComposerIsRejectedAsTooMany() {
    #expect(
      PadImageDrop.validate(incomingCount: 5, alreadyAttached: 0) == .tooMany)
  }

  @Test
  func rejectionCasesAreDistinct() {
    #expect(PadImageDrop.Rejection.tooMany != .notImage)
  }

  // MARK: Type (P-SHELL-AC-7.4 non-image → .notImage)

  @Test
  func publicImageIdentifiersAreAccepted() {
    #expect(PadImageDrop.isImageType(uti: UTType.image.identifier))
    #expect(PadImageDrop.isImageType(uti: UTType.jpeg.identifier))
    #expect(PadImageDrop.isImageType(uti: UTType.png.identifier))
  }

  @Test
  func plainTextAndPdfAreNotImageTypes() {
    #expect(PadImageDrop.isImageType(uti: "public.plain-text") == false)
    #expect(PadImageDrop.isImageType(uti: "public.pdf") == false)
  }

  // MARK: Attach path (nil validate → existing ChatViewModel.attachImages)

  @Test
  func acceptedDropAttachesThroughViewModel() {
    let vm = makeViewModel()
    #expect(
      PadImageDrop.validate(
        incomingCount: 1, alreadyAttached: vm.pendingImages.count) == nil)
    #expect(vm.attachImages([sampleImage()]) == 1)
    #expect(vm.pendingImages.count == 1)
  }

  @Test
  func rejectedFifthImageDoesNotAttach() {
    let vm = makeViewModel()
    let four = (0..<ChatViewModel.maxAttachedImages).map { _ in sampleImage() }
    #expect(vm.attachImages(four) == ChatViewModel.maxAttachedImages)
    #expect(
      PadImageDrop.validate(
        incomingCount: 1, alreadyAttached: vm.pendingImages.count) == .tooMany)
    #expect(vm.attachImages([sampleImage()]) == 0)
    #expect(vm.pendingImages.count == ChatViewModel.maxAttachedImages)
  }

  // MARK: Partial load (P-SHELL-AC-7.4 mixed JPEG+PDF file URLs attach nothing)

  @Test
  func partialLoadMustNotAttach() {
    let vm = makeViewModel()
    // One JPEG loaded, one PDF file URL did not — 2 providers, 1 image.
    let loadedJpeg = [sampleImage()]
    #expect(
      PadImageDrop.rejectionAfterLoad(loadedCount: loadedJpeg.count, providerCount: 2)
        == .notImage)
    #expect(
      PadImageDrop.applyLoadedImages(loadedJpeg, providerCount: 2, to: vm) == .notImage)
    #expect(vm.pendingImages.isEmpty)
  }

  @Test
  func completeLoadAttachesEveryImage() {
    let vm = makeViewModel()
    let loaded = [sampleImage(), sampleImage()]
    #expect(PadImageDrop.rejectionAfterLoad(loadedCount: 2, providerCount: 2) == nil)
    #expect(PadImageDrop.applyLoadedImages(loaded, providerCount: 2, to: vm) == nil)
    #expect(vm.pendingImages.count == 2)
  }
}
