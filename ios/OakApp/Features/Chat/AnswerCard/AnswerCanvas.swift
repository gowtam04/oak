import SwiftUI

/// Readable-prose vs wide-data layout for an answer card (P-CHAT-US-2).
///
/// Default / iPhone: `proseMaxWidth` nil (use the container) and
/// `dataUsesFullWidth` false — today's full-width stack. Pad thread sets
/// ``padThread`` so answer/reasoning prose caps at
/// ``PadLayout/readableProseWidth`` while tables, calcs, type charts,
/// candidates, and team sheets expand to the column.
struct AnswerCanvas: Equatable {
  /// Cap for direct answer text and reasoning. `nil` = use the container.
  var proseMaxWidth: CGFloat?
  /// When true, data blocks expand to the thread column's full width.
  var dataUsesFullWidth: Bool

  init(proseMaxWidth: CGFloat? = nil, dataUsesFullWidth: Bool = false) {
    self.proseMaxWidth = proseMaxWidth
    self.dataUsesFullWidth = dataUsesFullWidth
  }

  /// iPhone / unset canvas — no visual change from today's stack.
  static let phone = AnswerCanvas()

  /// Pad thread: readable prose, wide data (P-CHAT-AC-2.1–2.2).
  static let padThread = AnswerCanvas(
    proseMaxWidth: PadLayout.readableProseWidth,
    dataUsesFullWidth: true
  )
}

private struct AnswerCanvasKey: EnvironmentKey {
  static let defaultValue = AnswerCanvas.phone
}

extension EnvironmentValues {
  var answerCanvas: AnswerCanvas {
    get { self[AnswerCanvasKey.self] }
    set { self[AnswerCanvasKey.self] = newValue }
  }
}
