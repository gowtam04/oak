import Foundation
import Testing

@testable import OakApp

/// Pins `AnswerCanvas` (component-design.md environment keys; P-CHAT-US-2).
/// Production type lives in `ios/OakApp/Features/Chat/AnswerCard/AnswerCanvas.swift`
/// and does not exist until Phase 4 implementation.
///
/// Expected API (`docs/features/ipad-app/architecture/component-design.md`):
///   `struct AnswerCanvas: Equatable {`
///     `var proseMaxWidth: CGFloat? // nil = use container (iPhone)`
///     `var dataUsesFullWidth: Bool  // true on Pad thread`
///   `}`
///   Named helpers (implementer should add; no extra layout math):
///     `static let phone` / `static let padThread`
/// Default / iPhone: `proseMaxWidth` nil, `dataUsesFullWidth` false.
/// Pad thread: `proseMaxWidth == PadLayout.readableProseWidth` (720),
/// `dataUsesFullWidth` true.
///
/// Empty workbench (P-CHAT-US-3, P-CHAT-AC-3.1–3.2, P-UI-AC-3.1): example
/// prompt **strings** stay `ExamplePrompts.filedPool` (Battle / Dex / Rules /
/// Meta). `ExamplePromptsTests` already pins a non-empty pool and all four
/// categories — not duplicated here. This suite does not require a
/// `PadEmptyWorkbench` type (that would force view testing).
///
/// Not encoded here:
///   P-CHAT-AC-2.3 receipts stay stacked with the answer — AnswerCardView honor
///     (P4 implementer; this suite does not inspect that view)
///   P-UI-AC-4.1 two Chat columns on 13-inch landscape — `PadChatSessionTests`
///   P-CHAT-US-4 / drop — `PadImageDropTests`
///
/// Requirement refs: P-CHAT-US-2, P-CHAT-AC-2.1–2.3, P-CHAT-US-3,
/// P-CHAT-AC-3.1–3.2, P-UI-AC-3.1, P-UI-AC-4.1.
struct PadAnswerCanvasTests {

  // MARK: Default / iPhone (unset canvas = today’s full-width stack)

  @Test
  func defaultCanvasIsPhoneLayout() {
    let canvas = AnswerCanvas()
    #expect(canvas.proseMaxWidth == nil)
    #expect(canvas.dataUsesFullWidth == false)
  }

  @Test
  func phoneHelperMatchesDefaultCanvas() {
    #expect(AnswerCanvas.phone.proseMaxWidth == nil)
    #expect(AnswerCanvas.phone.dataUsesFullWidth == false)
    #expect(AnswerCanvas.phone == AnswerCanvas())
  }

  // MARK: Pad thread (P-CHAT-AC-2.1 prose cap, P-CHAT-AC-2.2 wide data)

  @Test
  func padThreadCapsProseAtReadableWidthAndExpandsData() {
    #expect(AnswerCanvas.padThread.proseMaxWidth == PadLayout.readableProseWidth)
    #expect(AnswerCanvas.padThread.dataUsesFullWidth == true)
  }

  @Test
  func phoneAndPadThreadCanvasesAreDistinctAndEquatable() {
    #expect(AnswerCanvas.phone == AnswerCanvas.phone)
    #expect(AnswerCanvas.padThread == AnswerCanvas.padThread)
    #expect(AnswerCanvas.phone != AnswerCanvas.padThread)
  }
}
